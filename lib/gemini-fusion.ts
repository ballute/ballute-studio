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

type PromptPart = ReturnType<typeof toInlineImagePart> | { text: string };


export type BackgroundDNA = {
  environment_type?: string;
  architectural_language?: string;
  lighting_and_exposure?: string;
  color_grading_and_texture?: string;
  spatial_mood?: string;
  camera_feel?: string;
  source_scene_layout?: string;
  camera_position_and_crop?: string;
  stable_scene_anchors?: string[];
  allowed_micro_variations?: string[];
  do_not_copy?: string[];
};

export type PoseBlueprint = {
  pose_core?: string;
  body_attitude?: string;
  arm_and_hand_behavior?: string;
  expression_and_gaze?: string;
  framing_and_scale?: string;
  camera_relation?: string;
  pose_purge_notes?: string;
};

export type LockedVibe = {
  background?: string;
  pose?: string;
  expression?: string;
  overall_mood?: string;
  camera_angle_and_crop?: string;
  lighting_and_exposure?: string;
  color_grading_and_texture?: string;
};

export type OutputRatio = "4:5" | "2:3" | "16:9";
export type BackgroundMode = "creative" | "extract";

const buildFitPromptContext = (
  bodySpecs?: string
): { fitPromptContext: string; fitSummarySuffix: string } => {
  if (!bodySpecs) {
    return {
      fitPromptContext:
        "- AUTO-FIT MODE: Maintain natural drape, silhouette, and effortless fit of the garment. Prioritize garment integrity.",
      fitSummarySuffix: "",
    };
  }

  const specMatch = bodySpecs.match(/(\d+)\/(\d+)\s+(\d+)\/(\d+)/);
  if (!specMatch) {
    return {
      fitPromptContext:
        "- AUTO-FIT MODE: Maintain natural drape, silhouette, and effortless fit of the garment.",
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

  if (hDiff >= 4) hDesc = "taller frame";
  else if (hDiff <= -4) hDesc = "shorter frame";

  if (wDiff >= 4) wDesc = "broader build";
  else if (wDiff <= -4) wDesc = "slimmer build";

  let bodyChange = [hDesc, wDesc].filter(Boolean).join(" and ");
  if (!bodyChange) {
    bodyChange = "similar proportions";
  }

  return {
    fitPromptContext: `
- FIT CALIBRATION (ORGANIC ADAPTATION):
  * Adjust the garment to fit a ${bodyChange}.
  * CRITICAL: Focus on realistic fabric drape, gravity, and fluid movement. 
  * NEVER distort the garment's fundamental design, pockets, or texture to force a pose. Garment structural integrity is the highest priority.
`,
    fitSummarySuffix: ` + 📏 핏 보정: ${bodyChange}`,
  };
};

export async function analyzeBackgroundDNAFromBase64s(
  bgBase64s: string[],
  backgroundMode: BackgroundMode = "creative"
): Promise<BackgroundDNA> {
  const analyses: BackgroundDNA[] = [];

  for (const base64 of bgBase64s) {
    const prompt =
      backgroundMode === "extract"
        ? `Analyze this location/environment image for faithful background extraction in a fashion lookbook engine.

CRITICAL:
- Extract ONLY the environment/background.
- If a person, model, mannequin, face, hair, skin, clothing, shoes, hands, legs, or body appears in the image, treat it as a temporary foreground occluder, NOT as part of the background.
- Do not include any human/model/garment information in the reusable background description.
- Infer the environment behind occluders as a plausible continuation of the visible scene.

Return ONLY raw JSON with:
{
  "environment_type": "what kind of place this is",
  "architectural_language": "materials, shapes, structural language",
  "lighting_and_exposure": "light quality, direction, time-of-day, and exposure character",
  "color_grading_and_texture": "color cast, grain, texture, surface feeling",
  "spatial_mood": "psychological feel of the place",
  "camera_feel": "framing, lens feel, distance, and crop logic",
  "source_scene_layout": "near-literal description of the visible non-human spatial layout, horizon, depth, foreground/background relationship, and major planes",
  "camera_position_and_crop": "camera height, viewpoint, lens distance, crop boundaries, and perspective compression",
  "stable_scene_anchors": ["major visible non-human environment anchors that should remain stable"],
  "allowed_micro_variations": ["tiny time-flow, exposure, shadow, or crop changes that may vary naturally"],
  "do_not_copy": ["all people/models/mannequins", "faces/hair/skin/body parts", "all clothing/shoes/accessories", "temporary foreground blockers", "irrelevant artifacts that are not part of the environment"]
}

Focus on preserving the source environment as a reusable scene reference. Do not generalize it into a new neighborhood. No people, no clothes.`
        : `Analyze this location/environment image for fashion lookbook worldbuilding.

Return ONLY raw JSON with:
{
  "environment_type": "what kind of place this is",
  "architectural_language": "materials, shapes, structural language",
  "lighting_and_exposure": "light quality and exposure character",
  "color_grading_and_texture": "color cast, grain, texture, surface feeling",
  "spatial_mood": "psychological feel of the place",
  "camera_feel": "what kind of framing / distance this world suggests",
  "key_non_repeatable_elements": ["specific one-off details that should NOT be copied literally"]
}

Focus on environmental DNA only. No people, no clothes.`;

    const response = await withGenAiRetry(
      () =>
        ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: "user", parts: [
          {
            ...toInlineImagePart(base64),
          },
            {
              text: prompt,
            },
          ] }],
          config: {
            safetySettings,
          },
        }),
      { label: "FUSION background analysis" }
    );

    let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}") + 1;

    if (jsonStart !== -1 && jsonEnd !== -1) {
      text = text.substring(jsonStart, jsonEnd);
    }

    analyses.push(JSON.parse(text));
  }

  const summaryResp = await withGenAiRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [
          {
            text:
              backgroundMode === "extract"
                ? `You are merging environment analyses into one faithful background extraction for a fashion lookbook engine.

Input analyses:
${JSON.stringify(analyses, null, 2)}

Return ONLY raw JSON:
{
  "environment_type": "...",
  "architectural_language": "...",
  "lighting_and_exposure": "...",
  "color_grading_and_texture": "...",
  "spatial_mood": "...",
  "camera_feel": "...",
  "source_scene_layout": "...",
  "camera_position_and_crop": "...",
  "stable_scene_anchors": ["..."],
  "allowed_micro_variations": ["..."],
  "do_not_copy": ["..."]
}

Goal:
- preserve the source scene as faithfully as possible
- keep the same non-human environment geometry, camera viewpoint, material surfaces, depth layout, and color atmosphere
- allow only subtle time-flow, exposure, shadow, and crop changes
- remove all people/models/mannequins, faces, hair, skin, body parts, clothing, shoes, and accessories from the background profile
- treat any human or garment in the source as an occluder and infer the background behind it
- do not invent a new location or replace the scene with a generalized background`
                : `You are merging multiple environment analyses into one unified background DNA for a fashion lookbook engine.

Input analyses:
${JSON.stringify(analyses, null, 2)}

Return ONLY raw JSON:
{
  "environment_type": "...",
  "architectural_language": "...",
  "lighting_and_exposure": "...",
  "color_grading_and_texture": "...",
  "spatial_mood": "...",
  "camera_feel": "...",
  "do_not_copy": ["specific literal geometry/details to avoid repeating"]
}

Goal:
- keep shared DNA
- remove one-off literal geometry
- produce a reusable neighborhood/world description`,
          },
        ] }],
        config: {
          safetySettings,
        },
      }),
    { label: "FUSION background merge" }
  );

  let summaryText =
    summaryResp.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const sumStart = summaryText.indexOf("{");
  const sumEnd = summaryText.lastIndexOf("}") + 1;

  if (sumStart !== -1 && sumEnd !== -1) {
    summaryText = summaryText.substring(sumStart, sumEnd);
  }

  return JSON.parse(summaryText);
}

export type FaceBlueprint = {
  face_shape?: string;
  eyes?: string;
  nose?: string;
  mouth_and_lips?: string;
  eyebrows?: string;
  skin?: string;
  hair?: string;
  age_impression?: string;
  distinctive_features?: string;
};

export function buildFaceDescriptionText(faceBlueprint?: FaceBlueprint): string {
  if (!faceBlueprint || Object.keys(faceBlueprint).length === 0) return "";
  return `\n⚠️ MANDATORY FACE STRUCTURE — the generated face MUST match ALL of these STRUCTURAL features. Expression/mood comes from the pose/direction reference, not here:
- Face shape: ${faceBlueprint.face_shape || "N/A"}
- Eyes: ${faceBlueprint.eyes || "N/A"}
- Nose: ${faceBlueprint.nose || "N/A"}
- Mouth/Lips: ${faceBlueprint.mouth_and_lips || "N/A"}
- Eyebrows: ${faceBlueprint.eyebrows || "N/A"}
- Skin: ${faceBlueprint.skin || "N/A"}
- Hair: ${faceBlueprint.hair || "N/A"}
- Age: ${faceBlueprint.age_impression || "N/A"}
- Distinctive features: ${faceBlueprint.distinctive_features || "N/A"}`;
}

export async function analyzeFaceBlueprintFromBase64(
  faceBase64: string
): Promise<FaceBlueprint> {
  const response = await withGenAiRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [
          {
            ...toInlineImagePart(faceBase64),
          },
          {
            text: `Analyze this face reference image for PRECISE IDENTITY REPLICATION.
You are a portrait artist. Describe every physical facial feature so another artist can recreate this exact face without seeing the original.

[FACIAL STRUCTURE — BE EXTREMELY SPECIFIC]
- Face shape: oval / round / square / heart / oblong, width-to-height ratio
- Eyes: size (small/medium/large relative to face), shape (monolid/double eyelid/hooded), spacing (close-set/wide-set), eye corner angle (upturned/downturned/straight)
- Nose: bridge height (flat/low/medium/high), width, tip shape (rounded/pointed/bulbous), nostril visibility
- Mouth & lips: lip thickness (thin/medium/full), lip shape, mouth width, philtrum definition
- Eyebrows: thickness, shape (straight/arched/angled), spacing from eyes, density
- Skin: tone (specific shade description), texture, any visible marks or features
- Hair: style, length, color, texture, parting, volume
- Age impression: approximate perceived age range
- Distinctive features: anything unique that makes this face recognizable (moles, dimples, asymmetry, bone structure)

[RULES]
- Describe ONLY permanent physical STRUCTURE. No ethnicity labels, no beauty judgments.
- Do NOT describe any expression, mood, gaze direction, or emotional state. These will come from a separate pose reference.
- Do NOT describe mouth openness, smile, frown, or any transient facial state.
- Be precise enough that two different AI models reading your description would generate the same face.
- Focus on PROPORTIONS and RELATIONSHIPS between features (e.g. "eyes spaced wider than average, occupying ~45% of face width").

Return ONLY raw JSON:
{
  "face_shape": "precise shape with proportions",
  "eyes": "size, shape, lid type, spacing, corner angle, iris color",
  "nose": "bridge height, width, tip shape, nostril visibility",
  "mouth_and_lips": "lip thickness, shape, mouth width relative to face",
  "eyebrows": "thickness, shape, arch position, density",
  "skin": "tone description, texture, visible marks",
  "hair": "style, length, color, texture, parting",
  "age_impression": "perceived age range",
  "distinctive_features": "unique identifying characteristics"
}`,
          },
        ] }],
        config: {
          responseMimeType: "application/json",
          safetySettings,
        },
      }),
    { label: "FUSION face analysis" }
  );

  let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}") + 1;

  if (jsonStart !== -1 && jsonEnd !== -1) {
    text = text.substring(jsonStart, jsonEnd);
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function analyzePoseBlueprintFromBase64(
  poseBase64: string
): Promise<PoseBlueprint> {
  const response = await withGenAiRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [
          {
            ...toInlineImagePart(poseBase64),
          },
          {
            text: `Analyze this pose reference image for PRECISE PHYSICAL REPLICATION.
You are a fashion photography director. Extract every physical detail so another photographer can recreate this exact pose without seeing the original image.

[PHYSICAL POSE — BE EXTREMELY SPECIFIC]
- Standing or sitting state
- Weight distribution: which foot carries more weight (e.g. "60% left foot"), lean direction and degree
- Torso: upright / leaning forward / leaning back, rotation angle (e.g. "torso turned 15° left")
- Shoulder asymmetry: which shoulder is higher, by how much
- Hip position: tilted or level, pushed to which side
- Left arm: exact position (e.g. "left hand inserted in front pants pocket up to knuckles, elbow bent ~100°")
- Right arm: exact position (e.g. "right hand gripping jacket lapel, elbow at side")
- Leg stance: spacing between feet, knee bend, foot direction
- Head tilt: direction and degree (e.g. "chin tilted down ~5°, head turned 10° right")
- Spine curvature: straight / slight S-curve / slouched

[EXPRESSION & GAZE — MOOD ONLY, NOT IDENTITY]
- Eye direction: where exactly are they looking (camera, ground, left, distant)
- Eyelid state: wide open / relaxed / slightly droopy
- Mouth: closed neutral / slightly parted / subtle tension
- Overall facial energy: bored, confident, fatigued, defiant, serene, etc.
- Do NOT describe face shape, features, skin, hair, or age.

[CAMERA ANGLE — PRECISE]
- Camera height relative to subject's eyes (e.g. "camera 10cm above eye level", "camera at waist height looking up")
- Camera distance feeling: intimate (close), mid-range, far
- Lens perspective: any visible wide-angle distortion or telephoto compression

[MUST IGNORE — DO NOT MENTION THESE]
- Face identity, hair style/color, skin tone, age, ethnicity
- Specific clothing items, brands, textures, colors, logos
- Accessories (sunglasses, bags, jewelry, watches, hats)
- Background, architecture, location, furniture
- Lighting setup, color grading

Return ONLY raw JSON:
{
  "pose_core": "complete physical body position with angles and percentages",
  "body_attitude": "the energy/vibe: weight balance, lean, slouch, tension level — editorial feel",
  "arm_and_hand_behavior": "EXACT left arm and right arm positions with joint angles and contact points. No accessories.",
  "expression_and_gaze": "precise eye direction, eyelid state, mouth state, and emotional energy. No face identity.",
  "framing_and_scale": "STRICT CROP LEVEL (Extreme Close-up / Bust / Waist-up / Knee-up / Full-body) AND subject's position in frame (centered, left-third, etc.)",
  "camera_relation": "camera height in cm relative to eye level, distance feel, lens compression",
  "pose_purge_notes": "items from the source that must NOT appear in the final image (specific clothing, accessories, background elements)"
}`,
          },
        ] }],
        config: {
          responseMimeType: "application/json",
          safetySettings,
        },
      }),
    { label: "FUSION pose analysis" }
  );

  let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}") + 1;

  if (jsonStart !== -1 && jsonEnd !== -1) {
    text = text.substring(jsonStart, jsonEnd);
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function searchLocationPrompts(
  bgDNA: BackgroundDNA,
  count: number,
  backgroundMode: BackgroundMode = "creative"
): Promise<string[]> {
  const systemPrompt =
    backgroundMode === "extract"
      ? `Background Extraction Profile:
${JSON.stringify(bgDNA, null, 2)}

TASK:
Generate EXACTLY ${count} location directives for a faithful background extraction mode.

RULES:
- Preserve the same source environment, camera viewpoint, major geometry, material surfaces, depth layout, horizon, crop logic, lighting direction, and color atmosphere.
- Preserve only the non-human environment. If the source contains a person/model/garment, erase it conceptually and continue the background behind it.
- Each directive should describe the same place with near-identical scene fidelity.
- Allow only tiny natural variations: slight time-flow, exposure, shadow softness, atmospheric change, or minimal crop adjustment required by the selected pose.
- Do not invent a new location, new architecture, new props, or a different neighborhood.
- Do not include any source person, clothing, body part, face, hair, skin, shoes, or accessory in the directive.

Return ONLY a valid JSON array of strings containing EXACTLY ${count} elements.
Format: ["faithful location directive 1", "faithful location directive 2", ...]`
      : `Background DNA (Material & Lighting World):
${JSON.stringify(bgDNA, null, 2)}

TASK:
Generate EXACTLY ${count} spatially distinct location prompts based strictly on the provided Background DNA.

CRITICAL DIVERSITY RULE:
If generating multiple locations, each prompt must focus on a DIFFERENT structural element or camera perspective while keeping the core DNA identical.

Return ONLY a valid JSON array of strings containing EXACTLY ${count} elements.
Format: ["location description 1", "location description 2", ...]`;

  const response = await withGenAiRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: {
          safetySettings,
        },
      }),
    { label: "FUSION location prompts" }
  );

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  const jsonStart = rawText.indexOf("[");
  const jsonEnd = rawText.lastIndexOf("]") + 1;

  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error("로케이션 프롬프트 JSON 파싱 실패");
  }

  const result = JSON.parse(rawText.substring(jsonStart, jsonEnd));
  return Array.isArray(result) ? result.slice(0, count) : [];
}

export async function generateFusionImageWeb(args: {
  faceBase64s: string[];
  faceBlueprint?: FaceBlueprint;
  outfitBase64s: string[];
  backgroundBase64s?: string[];
  poseBase64?: string;
  poseBlueprint: PoseBlueprint;
  targetLocationText: string;
  bgDNA: BackgroundDNA;
  backgroundMode?: BackgroundMode;
  bodySpecs?: string;
  isMixMode?: boolean;
  mixCaptions?: string[];
  lockedVibe?: LockedVibe | null;
  shootingMode?: string;
  customPrompt?: string;
  outputRatio?: OutputRatio;
  skinMode?: "clean" | "natural";
}): Promise<{ base64: string; summary: string }> {
  const {
    faceBase64s,
    faceBlueprint,
    outfitBase64s,
    backgroundBase64s = [],
    poseBase64,
    poseBlueprint,
    targetLocationText,
    bgDNA,
    backgroundMode = "creative",
    bodySpecs,
    isMixMode = false,
    mixCaptions = [],
    lockedVibe,
    shootingMode = "portra",
    customPrompt,
    outputRatio = "4:5",
    skinMode = "clean",
  } = args;

  const parts: PromptPart[] = [];

  if (backgroundMode === "extract") {
    backgroundBase64s.forEach((backgroundBase64, index) => {
      parts.push({
        text: `[BACKGROUND REFERENCE ${index + 1} - SCENE EXTRACT]
Use this image only as the environment source for the final background.
Preserve only the non-human visible space, camera viewpoint, crop boundaries, depth layout, major surfaces, lighting direction, color atmosphere, and texture with near-identical fidelity.
Allow only tiny time-flow, exposure, shadow, or crop adjustments needed to integrate the model naturally.
If this background image contains a person, model, mannequin, face, hair, skin, clothing, shoes, hands, legs, or body parts, erase them completely and reconstruct the environment behind them.
Do not use face or outfit references as background sources. Do not preserve any person or garment from the background reference.`,
      });
      parts.push(toInlineImagePart(backgroundBase64));
    });
  }

  const faceDescriptionText = buildFaceDescriptionText(faceBlueprint);

  faceBase64s.forEach((faceBase64, index) => {
    parts.push({
      text: `[FACE IDENTITY REFERENCE ${index + 1} — This is the SOLE source for the model's face, identity, and skin tone. No other image may influence the face.]${faceDescriptionText}`,
    });
    parts.push(toInlineImagePart(faceBase64));
  });

  outfitBase64s.forEach((outfitBase64, index) => {
    parts.push({
      text: `[OUTFIT REFERENCE ${index + 1} — GARMENT DESIGN ONLY. STRICTLY IGNORE: face, person identity, hair, skin tone, body, pose, background, lighting, and color cast from this image.]`,
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

  if (poseBase64) {
    parts.push({
      text: `[POSE REFERENCE IMAGE — BODY SKELETON ONLY]
⚠️ CRITICAL: You MUST match the EXACT body posture from this image:
- Same weight distribution and lean direction
- Same arm positions and hand placements (e.g. if hands are in pockets, they MUST be in pockets)
- Same leg stance and spacing
- Same shoulder asymmetry and torso rotation
- Same head tilt angle and gaze direction
- Same camera height and angle relative to the subject

DO NOT simplify, generalize, or "improve" the pose. Copy it physically.

⚠️ CONTAMINATION BLOCK — extract ONLY the body skeleton from this image. COMPLETELY IGNORE everything else:
- FACE: Do NOT use this person's face. The final face must come 100% from [FACE IDENTITY REFERENCE].
- BACKGROUND: Do NOT use this image's background, architecture, walls, floor, sky, or any environment. The background comes from [BACKGROUND WORLD DNA & LOCATION].
- COLOR/GRADING: Do NOT use this image's color grading, color cast, lighting tone, warmth, or film look. Color comes from [SHOOTING MODE].
- CLOTHING: Do NOT use this image's clothing. Garments come from [OUTFIT REFERENCE].
- Think of this as an invisible wireframe skeleton floating in empty space — only the joint positions and body angles matter.`,
    });
    parts.push(toInlineImagePart(poseBase64));
  }

  const { fitPromptContext, fitSummarySuffix } =
    buildFitPromptContext(bodySpecs);
  const fitSummary = `${isMixMode ? "🧩 MIX" : "👕 OUTFIT"}${fitSummarySuffix}`;

  const modeDict: Record<string, string> = {
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

  let textureAndColor = "";
  if (lockedVibe?.color_grading_and_texture) {
    textureAndColor = lockedVibe.color_grading_and_texture;
  } else if (shootingMode === "custom" && customPrompt) {
    textureAndColor = `Texture & Photography Style: ${customPrompt}`;
  } else {
    textureAndColor = modeDict[shootingMode] || modeDict["portra"];
  }

  const lightingStyle =
    lockedVibe?.lighting_and_exposure ||
    bgDNA?.lighting_and_exposure ||
    "Soft editorial natural lighting.";

  const moodStyle =
    lockedVibe?.overall_mood ||
    bgDNA?.spatial_mood ||
    "High-end restrained editorial mood.";

  const finalBackground = lockedVibe?.background || targetLocationText;
  const backgroundModeContext =
    backgroundMode === "extract"
      ? `- Mode: Extract. Preserve the BACKGROUND REFERENCE scene's spatial structure with near-identical fidelity.
- Keep the same visible environment geometry, camera viewpoint, depth layout, major surfaces, architectural elements, and crop logic.
- Only allow subtle time-flow, shadow, and minimal camera crop changes required for a natural fashion image.
- If the BACKGROUND REFERENCE contains any person/model/body/clothing, remove it completely and inpaint the environment behind it.
- Do not invent a different location. Do not import any background from FACE or OUTFIT references. Do not copy any person or garment from the BACKGROUND REFERENCE.`
      : `- Mode: Creative. Use the background DNA as a flexible world reference and create a natural fashion-editorial variation.`;
  
  const poseCore = lockedVibe?.pose || poseBlueprint?.pose_core || "Relaxed natural stance.";
  const poseExpression = lockedVibe?.expression || poseBlueprint?.expression_and_gaze || "Natural editorial gaze.";
  const cameraFeel = lockedVibe?.camera_angle_and_crop || poseBlueprint?.framing_and_scale || bgDNA?.camera_feel || "Editorial framing.";
  const poseAttitude = poseBlueprint?.body_attitude || "Nonchalant and natural.";
  const handsArms = poseBlueprint?.arm_and_hand_behavior || "Natural placement.";
  const cameraRelation = poseBlueprint?.camera_relation || "Natural photographic angle.";
  const purgeNotes = poseBlueprint?.pose_purge_notes || "All original background and accessories from the pose source.";

  // 🚨 [낮에 바꿨던 감도 핵심 프롬프트 복구]
  const prompt = `
Task: Create a premium FUSION fashion editorial image.

[REFERENCE ROLE SEPARATION]
Every uploaded reference has one assigned job:
- FACE references define only the final model identity, face, hair, age impression, and skin tone.
- OUTFIT references define only the garment identity and construction.
- BACKGROUND DNA / LOCATION defines the environment, lighting world, color atmosphere, and spatial setting.
- POSE blueprint defines body posture, limb geometry, hand placement, crop/framing, camera relation, and attitude.
The highest priority is preserving the exact face identity and faithful garment design without importing the source context from the wrong reference.
Final integration must feel like one natural photograph: adapt fabric drape, wrinkles, scale, shadows, and lighting to the selected pose and background.
If an outfit reference visually suggests a different body pose, the POSE blueprint wins. Re-drape the garment onto the selected pose instead of preserving the outfit source posture.

[FACE IDENTITY LOCK]
- Maintain exact identity from face references.
- Preserve face shape, facial proportions, age impression, and hair silhouette.
- Use pose expression only as abstract mood and gaze direction. Never import face structure, facial identity, hair, skin tone, or age from the pose source.
${skinMode === "natural" ? "- Skin rendering: Apply the shooting mode's grain and tonal response to skin surfaces only. Do NOT alter face shape, features, or proportions." : ""}

[OUTFIT LOCK (CRITICAL PRIORITY)]
- INSTRUCTION: Reconstruct the visible garment design from the uploaded outfit images with faithful fidelity, but do not reconstruct the outfit source scene.
- PRESERVE: Exact garment category, silhouette, sleeve length, collar shape, fabric texture, color, pattern, pockets, stitching, layering order, and clothing-specific logos/prints.
- DETAIL PRIORITY: Preserve the garment's local hue, saturation, contrast, material behavior, fit tension, hem length, seam placement, button/zipper placement, print scale, and distinctive construction details with maximum fidelity.
- COLOR DISCIPLINE: Do not recolor the garment to match the background color grade. Let scene lighting affect highlights and shadows naturally while keeping the garment's original local color identity.
- DRAPE DISCIPLINE: Re-drape the clothes naturally onto the selected POSE blueprint while preserving garment construction. Do not keep the outfit source body's stance, hand placement, crop, or camera angle just to protect the garment shape.
- WARDROBE-ONLY SOURCE: Treat uploaded outfit images strictly as garment references, not identity, pose, background, lighting, camera, or location references.
- IGNORE any face, head, hair, skin tone, body identity, age, expression, pose, background, room, wall, furniture, scenery, source lighting, camera angle, or color cast visible in outfit images.
- The final model identity, face, hair, skin tone, and age must come ONLY from the face reference images.
- ${isMixMode ? "This is MIX mode. Respect each item detail text exactly." : "This is standard outfit mode."}

${fitPromptContext}

[BACKGROUND WORLD DNA & LOCATION]
- DNA: ${bgDNA?.environment_type || "Location"}, ${bgDNA?.architectural_language || "Architecture"}.
- Vibe: ${moodStyle}.
- Set/Location: "${finalBackground}"
- Lighting: ${lightingStyle}
${backgroundModeContext}

[SHOOTING MODE]
- ${textureAndColor}

[POSE — PHYSICAL REPLICATION (HIGHEST PRIORITY)]
⚠️ The pose blueprint below contains EXACT physical measurements. You MUST replicate them precisely.
- Body position: ${poseCore}.
- Energy/Attitude: ${poseAttitude}.
- Arms & Hands: ${handsArms}. ← REPLICATE EXACTLY. If hands are in pockets, generate hands in pockets. If arms are crossed, generate crossed arms.
- Expression: ${poseExpression}. ← This defines mood/gaze direction ONLY. Face identity comes from FACE references.
- Camera angle: ${cameraRelation}. ← REPLICATE EXACTLY. If camera is above eye level, shoot from above. If below, shoot from below.
- POSE AUTHORITY: The pose reference image + this blueprint define ALL body positioning. NEVER substitute with a generic standing pose.
- ⚠️ FACE SOURCE REMINDER: The FACE in the final image must come 100% from [FACE IDENTITY REFERENCE] images. The pose reference person's face must have ZERO influence on the result.
- OUTFIT images are garment mannequins only — ignore their body pose, hand placement, camera angle, and expression.
- Keep the pose feeling natural and editorial, but do NOT deviate from the physical positions described above.

[CRITICAL CAMERA CROP LOCK]
- Framing directive: ${cameraFeel}
- ⚠️ STRICT RULE: You MUST replicate the exact crop level from the pose reference.
- If the framing directive implies waist-up or half-body, DO NOT generate legs.
- If the framing is a close-up, DO NOT show the full torso. 
- DO NOT widen the frame or zoom out just to show more of the background. The background must adapt to the camera crop, not vice versa.
- Purge from pose reference: ${purgeNotes}

[FOOTWEAR RULE]
- If no shoes/footwear are provided in the outfit references, generate appropriate shoes that match the outfit's style and the overall editorial mood.
- NEVER generate barefoot unless the scene explicitly requires it (e.g. beach). The model must always wear shoes in urban/street/studio settings.

[OUTPUT RULE]
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
      throw new EmptyGenAiImageError("FUSION");
    }

    return generatedImage;
  }, { label: "FUSION image" });

  return {
    base64: imageBase64,
    summary: `${fitSummary} + BG ${backgroundMode === "extract" ? "Extract" : "Creative"} + FUSION`,
  };
}
