import {
  ai,
  defaultImageSize,
  imageGenerateConfig,
  imageGenerateHttpOptions,
  imageGenerationModel,
  safetySettings,
} from "./genai-client";
import {
  pickGeneratedInlineImage,
  type GenAiResponsePart,
} from "./genai-response";
import { EmptyGenAiImageError, withGenAiRetry } from "./genai-retry";
import { toInlineImagePart } from "./image-mime";
import { buildFaceDescriptionText, buildOutfitReferenceLabel, type FaceBlueprint } from "./gemini-fusion";

type PromptPart = ReturnType<typeof toInlineImagePart> | { text: string };


export type RefRunDirection = {
  background: string;
  pose: string;
  expression: string;
  camera_angle_and_crop: string;
  lighting_and_exposure: string;
  color_grading_and_texture: string;
  overall_mood: string;
};

export type OutputRatio = "4:5" | "2:3" | "16:9";

const buildFitPromptContext = (
  bodySpecs?: string
): { fitPromptContext: string; fitSummarySuffix: string } => {
  if (!bodySpecs) {
    return {
      fitPromptContext:
        "- AUTO-FIT MODE: Replicate the garment's silhouette, fit, length, and drape exactly.",
      fitSummarySuffix: "",
    };
  }

  const specMatch = bodySpecs.match(/(\d+)\/(\d+)\s+(\d+)\/(\d+)/);
  if (!specMatch) {
    return {
      fitPromptContext:
        "- AUTO-FIT MODE: Replicate the garment's silhouette, fit, length, and drape exactly.",
      fitSummarySuffix: "",
    };
  }

  const h1 = parseInt(specMatch[1], 10);
  const w1 = parseInt(specMatch[2], 10);
  const h2 = parseInt(specMatch[3], 10);
  const w2 = parseInt(specMatch[4], 10);

  const hDiff = h2 - h1;
  const wDiff = w2 - w1;

  let hDesc = "";
  let wDesc = "";
  let lengthEffect = "";
  let widthEffect = "";

  if (hDiff >= 4) {
    hDesc = "taller";
    lengthEffect =
      "Because the body is taller, sleeves expose more wrist and the garment sits slightly higher on the body.";
  } else if (hDiff <= -4) {
    hDesc = "shorter";
    lengthEffect =
      "Because the body is shorter, sleeves cover more of the hands and the garment falls lower on the body.";
  }

  if (wDiff >= 4) {
    wDesc = "broader/heavier";
    widthEffect =
      "Because the body is thicker, the fixed garment fits tighter. Fabric stretches closer to the body, reducing drape.";
  } else if (wDiff <= -4) {
    wDesc = "slimmer/lighter";
    widthEffect =
      "Because the body is thinner, the fixed garment fits much looser. More drape, excess fabric, resulting in a baggier silhouette.";
  }

  let bodyChange = [hDesc, wDesc].filter(Boolean).join(" and ");
  if (!bodyChange) {
    bodyChange = "similar proportions";
    lengthEffect = "Maintain exact original vertical fit.";
    widthEffect = "Maintain exact original drape and width.";
  }

  return {
    fitPromptContext: `
- FIT CALIBRATION (FIXED GARMENT PARADIGM):
  * CRITICAL RULE: The physical size, pattern, and design of the garment are 100% FIXED.
  * DO NOT alter, redesign, shrink, or enlarge the clothing item itself.
  * THE BODY CHANGE: The target model inside the clothes is visually ${bodyChange} than the original model.
  * THE VISUAL EFFECT:
    1. ${lengthEffect}
    2. ${widthEffect}
  * DIRECTIVE: Render the natural, physical result of this specific new body wearing the exact same fixed-size garment. Maintain believable human anatomy.
`,
    fitSummarySuffix: ` + 📏 핏 보정: Body ${bodyChange || "유사"}`,
  };
};

export async function analyzeReferenceWeb(
  referenceBase64: string
): Promise<RefRunDirection> {
  const parts = [
    toInlineImagePart(referenceBase64),
  ];

  const systemPrompt = `You are analyzing a reference fashion photograph for a downstream image generation pipeline. The model identity and outfit in the FINAL generated image will come from SEPARATE reference images — NOT from this reference. Therefore your job is to extract ONLY scene-level cues (mood, camera, lighting, background, atmospheric pose intent).

CRITICAL PROTECTION RULES (NEVER VIOLATE):
- ABSOLUTELY DO NOT describe: face shape, facial features, age, ethnicity, hair style, hair color, skin tone, body identity, height, weight, build, or any identifying physical characteristic of the reference model.
- ABSOLUTELY DO NOT describe: clothing items, garment colors, fabric textures, accessories, fit, silhouette, or any outfit details.
- If you accidentally extract identity/outfit details, the downstream pipeline will be corrupted. The face-lock and outfit-lock from other reference images will be violated.

PRECISION REQUIREMENT:
Each JSON value MUST reach the level of precision shown in the EXAMPLE for that key. Use numeric degrees/measurements (angles, percentages, directions) where applicable. If a key's element is not clearly visible/inferable, write "not clearly visible" — do NOT fabricate.

REQUIRED JSON SCHEMA (return ONLY the raw JSON, no prose before/after):
{
  "background": "describe environment, set design, architectural elements, spatial composition, props (if any), depth of scene. EXAMPLE PRECISION: 'Outdoor urban setting. Plain, light-colored wall used as a clean backdrop. Subtle foliage and tree branches visible above the wall, softly out of focus. No props, no visual clutter, no added elements.'",

  "pose": "describe body posture, weight distribution, limb angles, hand/finger position with NUMERIC PRECISION (degrees, body-part angles). NO face/hair/identity. EXAMPLE PRECISION: 'Standing in relaxed unposed stance. Body weight primarily on right leg. Left leg less weight, knee slightly bent (~5-10 degrees). Torso upright with subtle backward lean, not rigid. Both shoulders fully relaxed and dropped. Arms hang naturally along sides. Elbows slightly bent ~5-10 degrees, never locked. Forearms angle subtly inward toward hips. Hands rest near side seams. Fingers loose, gently curved, no tension, no gesture.'",

  "expression": "describe gaze direction, head tilt with NUMERIC PRECISION, neck state, eye/mouth state, emotional tone. NO face shape/features/hair/ethnicity. EXAMPLE PRECISION: 'Head tilted downward approximately 10-15 degrees. Chin lowered naturally, not forced. Neck relaxed, not extended. Gaze directed downward and slightly left of camera frame. Eyes do NOT engage the camera. Expression neutral, calm, introspective — no smile, no frown, no exaggeration.'",

  "camera_angle_and_crop": "describe ONLY camera and framing geometry with maximum precision: (1) framing extent — explicitly state which body parts visible vs cut off (e.g. 'full body head-to-shoes, no cropping' / '3/4 body cut at upper thigh' / 'half body cut at waist' / 'chest crop above sternum' / 'tight face close-up'); (2) subject position in frame — centered / off-center left / off-center right / rule-of-thirds left-third / rule-of-thirds right-third / golden ratio; (3) camera height relative to subject — above eye level / at subject eye level / marginally below eye level / chest level / waist level / low angle / ground level; (4) camera angle — frontal / slight 3/4 left / slight 3/4 right / profile / three-quarter rear; (5) focal length character — wide-angle distortion / normal lens / slight telephoto compression / strong telephoto compression; (6) vertical line behavior — straight / converging upward / converging downward; (7) depth-of-field — deep focus / shallow / bokeh quality. EXAMPLE PRECISION: 'Full body visible from head to shoes. No cropping of limbs or body parts. Subject positioned slightly off-center toward the left side of the frame. Camera placed at eye level or marginally lower. Perspective remains natural with no distortion. Vertical lines remain straight.'",

  "lighting_and_exposure": "describe light direction, quality, source, exposure character, AND distinct shadow systems with maximum precision. If multiple shadow systems exist (e.g. architectural + subject cast), describe each SEPARATELY including edge character, orientation, relationship. EXAMPLE PRECISION: 'Strong, direct natural sunlight coming from the upper left. TWO DISTINCT AND SEPARATE SHADOW SYSTEMS: (1) ARCHITECTURAL / BUILDING SHADOW — a large, solid shadow cast by an off-frame building falls diagonally across the wall, occupying a significant portion of the right side of the frame, hard sharp geometric edge with straight/slightly-angled boundary, dominates the background. (2) MODEL CAST SHADOW — clearly readable human silhouette shadow on the wall, falls toward the left-rear direction consistent with the sunlight angle, thinner and organic, clearly distinguishable from the architectural shadow. The two shadows do NOT merge. Shadow edges are not softened or blurred.'",

  "color_grading_and_texture": "describe color palette, saturation, contrast, grain character, texture rendering, lens response. EXAMPLE PRECISION: 'Natural film-like grain. Muted, realistic color palette. High contrast preserved. No heavy color grading. Slight optical lens response with soft focus character, no digital sharpening or micro-contrast.'",

  "overall_mood": "describe atmospheric character, photographic genre, emotional tone. EXAMPLE PRECISION: 'Quiet, restrained, candid, observational — like an unposed street photograph. Cinematic but understated. Editorial documentary feel without being staged.'"
}

FINAL REMINDERS:
- Output ONLY the raw JSON object.
- Each value MUST match or exceed the EXAMPLE PRECISION level shown above.
- Reference model's face/hair/skin/clothing/accessories → ZERO mentions allowed.
- Numeric measurements (degrees, body-part angles, light direction) are strongly preferred over vague adjectives.`;

  const response = await withGenAiRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [...parts, { text: systemPrompt }] }],
      }),
    { label: "REFRUN reference analysis" }
  );

  let text = "";
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.text) {
      text += part.text;
    }
  }
  if (!text) {
    text = "{}";
  }
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}") + 1;

  if (jsonStart !== -1 && jsonEnd !== -1) {
    text = text.substring(jsonStart, jsonEnd);
  }

  const parsed = JSON.parse(text);
  return parsed;
}

export async function generateRefRunImageWeb(args: {
  faceBase64s: string[];
  outfitBase64s: string[];
  faceBlueprint?: FaceBlueprint;
  dirSet: RefRunDirection;
  bodySpecs?: string;
  shootingMode?: string;
  customPrompt?: string;
  isMixMode?: boolean;
  mixCaptions?: string[];
  outputRatio?: OutputRatio;
  skinMode?: "clean" | "natural";
  referenceBase64?: string;
}): Promise<{ base64: string; summary: string }> {
  const {
    faceBase64s,
    faceBlueprint,
    outfitBase64s,
    dirSet,
    bodySpecs,
    shootingMode = "portra",
    customPrompt,
    isMixMode = false,
    mixCaptions = [],
    outputRatio = "4:5",
    skinMode = "clean",
    referenceBase64,
  } = args;

  const isSnapDriftMode = shootingMode === "snap";
  const isSnapRefMode = shootingMode === "snap-ref";
  const isSnapMode = isSnapDriftMode || isSnapRefMode;

  if (!faceBase64s.length) {
    throw new Error("얼굴 이미지가 없다.");
  }

  if (!outfitBase64s.length) {
    throw new Error("의상 이미지가 없다.");
  }

  const parts: PromptPart[] = [];

  const faceDescriptionText = buildFaceDescriptionText(faceBlueprint);

  faceBase64s.forEach((faceBase64, index) => {
    parts.push({
      text: `[FACE IDENTITY REFERENCE ${index + 1} — This is the SOLE source for the model's face, identity, and skin tone. No other image may influence the face.]${faceDescriptionText}`,
    });
    parts.push(toInlineImagePart(faceBase64));
  });

  outfitBase64s.forEach((outfitBase64, index) => {
    parts.push({
      text: buildOutfitReferenceLabel(index, isMixMode),
    });
    parts.push(toInlineImagePart(outfitBase64));

    if (isMixMode) {
      const caption =
        mixCaptions[index] || "No specific styling instruction provided.";
      parts.push({
        text: `[Mix Item ${index + 1} Instruction: ${caption}]`,
      });
    }
  });

  if (isSnapRefMode && referenceBase64) {
    parts.push({
      text: `[SNAP PHOTOGRAPHIC REFERENCE - DO NOT COPY CONTENT]
Use the next image ONLY for photographic behavior: camera distance, lens feel, framing, exposure, motion timing, casual body tension, environmental realism, smartphone compression/noise, and unposed snapshot quality.
Use the reference background as close phone-photo context, but not as a literal copy. Keep the same broad location type, camera distance, and casual visual rhythm while changing minor objects, exact surface details, and any identifiable layout.
ABSOLUTE BLOCK: Do NOT copy or import the reference person's face, facial features, hair, skin tone, age, body, height, build, clothing, outfit, accessories, bag, graphics, logos, or any identifiable item.
The final person must come ONLY from [FACE IDENTITY REFERENCE]. The final outfit must come ONLY from [OUTFIT MODE]/[MIX MODE].`,
    });
    parts.push(toInlineImagePart(referenceBase64));
  }

  const faceContext =
    faceBase64s.length === 1
      ? `Use face reference.${skinMode === "natural" ? " Skin rendering: Apply the shooting mode's grain and tonal response to skin surfaces only. Do NOT alter face shape, features, or proportions." : ""}`
      : `3D FACE ID ENGINE ACTIVE to maintain identity.${skinMode === "natural" ? " Skin rendering: Apply the shooting mode's grain and tonal response to skin surfaces only. Do NOT alter face shape, features, or proportions." : ""}`;

  const { fitPromptContext, fitSummarySuffix } =
    buildFitPromptContext(bodySpecs);

  const modeDict: Record<string, string> = {
    ref:
      "MOOD: Follow the reference photograph's photographic language EXACTLY as captured. The reference image itself is the single source of mood, tone, and atmosphere. Do NOT substitute any preset aesthetic. | RENDERING: Do NOT impose any preset color, tone, grain, sharpness, or texture style. The reference image's color grading, texture, lighting quality, exposure character, lens character, and overall atmospheric mood must be replicated faithfully as they appear in the reference itself. Apply this color science and rendering character to the entire image uniformly, including all garments — preserve each garment's original local hue and design while letting the reference's tonal response shape brightness and contrast. CRITICAL CLAMP: This reference-replication of TONE/COLOR/LIGHTING must NEVER override [FACE IDENTITY LOCK] or [OUTFIT MODE] garment design — those locks always win on face identity and garment construction.",
    snap:
      "MOOD: Casual phone snapshot / real street snap - unposed, imperfect, believable, not editorial. The image should feel like a quick everyday photo taken by a friend, not a campaign. | RENDERING: Smartphone-like natural daylight, imperfect exposure, slight compression, modest dynamic range, real street texture, no glossy editorial polish, no staged fashion lighting, no studio cleanliness, no beauty retouching, no artificial bokeh. Use the analyzed reference only for camera behavior, exposure, and casual body tension. Do not reproduce the exact reference background; create a neighboring everyday street variation.",
    "snap-ref":
      "MOOD: Close-reference phone snapshot / real street snap - closer to the uploaded reference than SNAP DRIFT, but still protected from copying identity, outfit, accessories, or identifiable items. It should feel like another quick frame from the same casual phone-photo situation, not a campaign. | RENDERING: Smartphone-like natural daylight, imperfect exposure, modest dynamic range, realistic compression, no glossy editorial polish, no staged fashion lighting, no artificial bokeh. Use the reference photo more tightly for camera distance, broad environment, exposure, and casual body rhythm while preserving locked face and outfit sources.",
    portra:
      "MOOD: 90s lifestyle editorial — warm sunlight, Polo/Levi's ad energy, nostalgic magazine feel. Skin tones glow naturally, colors slightly faded. | RENDERING: Lighting: Soft, diffused natural daylight. Low dynamic range. Color: Washed out, faded warm tones. Flattened shadows with zero deep blacks. NO digital micro-contrast, NO sharp edges. The image must look naturally soft and optically imperfect without using heavy grain overlays. APPLY THIS COLOR SCIENCE UNIFORMLY TO THE ENTIRE IMAGE INCLUDING ALL GARMENTS — preserve each garment's original hue but reduce saturation and flatten brightness to match this film palette.",
    fuji:
      "MOOD: Lemaire / Margaret Howell minimalism — overcast city-boy, Popeye magazine energy. Silhouette and tone-on-tone over color. Matte and restrained. | RENDERING: Regardless of scene brightness, pull all colors toward cool, muted, and desaturated. Direct sunlight rendered as flat and grey-toned rather than warm. Lifted matte black levels. Render as a soft, low-contrast matte print. Do not add artificial noise or grain, focus on flat color science. APPLY THIS COLOR SCIENCE UNIFORMLY TO THE ENTIRE IMAGE INCLUDING ALL GARMENTS — preserve each garment's original hue but reduce saturation and flatten brightness to match this film palette.",
    mono:
      "MOOD: Peter Lindbergh / classic film still — form, texture, expression only. No color, pure identity. | RENDERING: Texture: Ilford HP5 Plus (High-end monochrome, heavy grain, deep noir look). FORCE STRICT BLACK AND WHITE. NO COLOR.",
    studio:
      "MOOD: E-commerce / Acronym tech-wear — clean, sharp, detail-forward. Stitching and fabric texture above all. | RENDERING: Texture: Sharp high-key studio lighting. Zero grain, high-end digital clarity. Maximize micro-contrast and edge sharpness to perfectly showcase fabric textures and stitching details.",
    raw:
      "MOOD: Instagram daily snap / iPhone unedited — candid, relatable, no filter. Real-life wearability over editorial. | RENDERING: Texture: Natural raw light. iPhone-style snapshot clarity, zero film simulation.",
    "retro-film":
      "MOOD: Comoli / old Celine — quiet, cinematic, single-source light. Half-stop under, optically soft, understated. Ballute's core aesthetic. | RENDERING: Lighting: Single-direction natural light source, either window or outdoor. Soft highlight rolloff — bright areas gently overexpose without harsh clipping. No fill light, no flash. Preserve natural shadows where direct light creates contrast — do not flatten all shadows. Color: Low saturation, muted and slightly faded. Flat tonal curve — compressed midtones, lifted blacks. Render through an optical lens response: slight softness in focus edges, no digital sharpening. The overall image must feel underexposed by half a stop with a matte, non-glossy finish. APPLY THIS COLOR SCIENCE UNIFORMLY TO THE ENTIRE IMAGE INCLUDING ALL GARMENTS — preserve each garment's original hue but render through this flat, muted film tonal response. Overall rendering: The entire image must feel physically soft throughout — fabric surfaces, skin, and edges should lack digital sharpness. Every surface rendered as if light passed through an imperfect optical lens, not a digital sensor. No edge enhancement, no digital micro-detail on fabric or skin.",
  };

  let textureAndColor = modeDict.portra;
  if (shootingMode === "custom" && customPrompt) {
    textureAndColor = `Texture & Photography Style: ${customPrompt}`;
  } else if (modeDict[shootingMode]) {
    textureAndColor = modeDict[shootingMode];
  }

  const snapSummary = isSnapRefMode
    ? " + SNAP REF"
    : isSnapDriftMode
      ? " + SNAP DRIFT"
      : "";
  const fitSummary = `${isMixMode ? "\uD83E\uDDE9 MIX" : "\uD83D\uDC55 OUTFIT"}${snapSummary}${fitSummarySuffix}`;
  const taskTitle = isSnapMode
    ? "Casual Locked-Identity Phone Snapshot Generation"
    : "Exact Reference-Run Fashion Editorial Generation";

  const outfitInstruction = isMixMode
    ? `
[MIX MODE]
- Use only the uploaded outfit items as wardrobe references.
- Respect each item instruction exactly.
- Preserve each item's garment category, silhouette, fit, local color, material, pattern, construction details, layer order, and hierarchy.
- Do not import source background, lighting, camera, pose, or person identity from outfit images.
- Do not invent extra garments.
`
    : `
[OUTFIT MODE]
- Reconstruct the uploaded outfit's garment design faithfully without reconstructing the outfit source scene.
- Preserve local hue, saturation, contrast, material read, silhouette, fit, drape, pattern scale, hems, seams, pockets, closures, stitching, and key construction details.
- Do not recolor the garment to match the background color grade. Let scene lighting affect highlights and shadows naturally while keeping the garment's original local color identity.
- Do not invent extra garments.
`;

  const prompt = `
Task: ${taskTitle}.

[FACE IDENTITY LOCK]
- ${faceContext}
- CRITICAL: The face reference image(s) are the SOLE and ABSOLUTE source for the model's face, identity, hair, and skin tone.
- Do NOT blend, merge, or import any facial feature from outfit images or any other source.
- Reconstruct the face reference identity faithfully under the new scene's lighting and shooting mode.
- SKIN MARK DISCIPLINE: Do NOT add freckles, acne, extra moles, beauty marks, dark spots, or blemishes unless they are explicitly present in the face identity notes/reference.
- If the face identity notes/reference contain exactly one mole / one visible dot, render exactly ONE at the same location. Never scatter or multiply it across the face.
- Treat reference film grain, pores, compression, and skin texture as surface texture only, not as moles or dots.

${fitPromptContext}

${outfitInstruction}

[OUTFIT PERSON PURGE]
- Treat uploaded outfit images strictly as wardrobe references, not identity, pose, background, lighting, camera, or location references.
- HARD BLOCK: Any face, head, hair, skin tone, or body identity visible in outfit images must be 100% ignored and never imported.
- The final model identity, face, hair, skin tone, and age must come ONLY from the face reference images labeled [FACE IDENTITY REFERENCE].

[REFERENCE STRUCTURE]
- BACKGROUND: ${dirSet.background}
- POSE: ${dirSet.pose}
- EXPRESSION: ${dirSet.expression}
- CAMERA / CROP: ${dirSet.camera_angle_and_crop}
- LIGHTING / EXPOSURE: ${dirSet.lighting_and_exposure}
- COLOR / TEXTURE: ${dirSet.color_grading_and_texture}
- OVERALL MOOD: ${dirSet.overall_mood}

[REFERENCE PERSON CONTAMINATION BLOCK]
- The reference photograph was used ONLY to extract scene structure, pose, expression mood, and photographic language.
- In SNAP mode, the reference image may be provided to the final model ONLY as photographic behavior context. Content copying remains absolutely forbidden.
- The PERSON in the reference image is NOT the final model.
- The final face must come 100% from [FACE IDENTITY REFERENCE]. The reference person's face shape, eye shape, nose, mouth, jawline, hair, skin tone, age, and ethnicity must have ZERO influence on the result.
- Treat the reference's expression as ABSTRACT MOOD ONLY (e.g. "calm gaze toward camera"), not as facial structure.

${isSnapDriftMode ? `
[SNAP DRIFT MODE EXECUTION]
- The final image must feel unposed and casually captured, not directed like a lookbook.
- Preserve minor photographic imperfections: ordinary street texture, slightly imperfect exposure, natural lens/phone compression, non-heroic framing.
- Treat [REFERENCE STRUCTURE] as a loose phone-snap seed, not as a scene blueprint.
- Background must drift into a nearby but different real-life location. Keep only the broad category and daylight behavior; change 60-75% of the setting: wall material, signage, street depth, ground detail, foliage density, color accents, side objects, and pedestrian/background rhythm.
- Do not recreate the exact reference backdrop, exact architecture, exact wall, exact tree/leaf placement, exact peeling paint pattern, exact pavement line, exact railing, exact sidewalk edge, or exact street layout.
- If the reference has a wall, use a different wall type or a nearby storefront/sidewalk edge. If the reference has a plaza, use an adjacent curb/street corner/walkway. If the reference has greenery, change the amount and position so it feels like a different spot.
- Body posture should carry casual human tension from the reference analysis, but never copy the reference body identity or proportions.
- Do not beautify the scene into a clean editorial city background.
- Do not use cinematic bokeh, glossy skin, high-end campaign contrast, or overclean fabric rendering.
` : ""}

${isSnapRefMode ? `
[SNAP REF MODE EXECUTION]
- The final image may stay close to the reference broad setting, camera distance, exposure, and casual phone-photo rhythm.
- Keep the same general environment category and framing logic, but do not copy the exact backdrop as a literal clone.
- Allow a smaller 15-30% background variation: crop shift, nearby angle, different pedestrian rhythm, changed minor objects, slightly different wall, railing, sidewalk, plant, pavement, or signage details.
- Do not copy the reference person, age, face, hair, body, clothing, accessories, logos, bags, or identifiable items.
- The result should feel like a nearby alternate frame, not a pasted outfit swap.
` : ""}

[TECHNICAL EXECUTION]
- ${textureAndColor}
- Replicate the photographic language of the reference.
- Ignore the original reference clothing and accessories.
- Prioritize atmospheric realism over digital sharpness.
- ${outputRatio} composition.
- The final rendering must fully embody the MOOD and RENDERING style defined by the shooting mode above.
`;

  const imageBase64 = await withGenAiRetry(async () => {
    const response = await ai.models.generateContent({
      model: imageGenerationModel,
      contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: outputRatio,
          imageSize: defaultImageSize,
        },
        httpOptions: imageGenerateHttpOptions,
        ...imageGenerateConfig,
        safetySettings,
      },
    });

    const responseParts = (response.candidates?.[0]?.content?.parts ??
      []) as GenAiResponsePart[];
    const generatedImage = pickGeneratedInlineImage(responseParts)?.data || null;

    if (!generatedImage) {
      throw new EmptyGenAiImageError("REFRUN");
    }

    return generatedImage;
  }, { label: "REFRUN image" });

  return {
    base64: imageBase64,
    summary: fitSummary,
  };
}
