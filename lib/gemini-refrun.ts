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
import { buildFaceDescriptionText, type FaceBlueprint } from "./gemini-fusion";

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

  const systemPrompt = `Analyze the provided reference fashion photograph meticulously.
Extract the exact visual structure, aesthetic, and mood.

CRITICAL RULES (NEGATIVE CONSTRAINTS):
- Ignore all details regarding clothing or accessories worn by the model.
- Do NOT describe the model's face shape, facial features, age, ethnicity, hair style, hair color, skin tone, or any identifying physical characteristics. The model in the final image will be a DIFFERENT person.

Return ONLY raw JSON with:
{
  "background": "describe the environment and set design",
  "pose": "describe ONLY the body posture and limb positioning — weight distribution, arm angle, leg stance, head tilt angle. Do NOT describe the face, expression, or any facial features.",
  "expression": "describe ONLY the emotional state — eye direction (where they are looking), eyelid state (wide/relaxed/droopy), mouth state (closed/parted/tense), and overall mood (bored/confident/serene). Do NOT mention face shape, features, age, ethnicity, hair, or any identifying characteristics.",
  "camera_angle_and_crop": "camera angle and crop",
  "lighting_and_exposure": "lighting setup and exposure character",
  "color_grading_and_texture": "color grading and texture",
  "overall_mood": "overall mood"
}`;

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

  return JSON.parse(text);
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
  } = args;

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

  const faceContext =
    faceBase64s.length === 1
      ? `Use face reference.${skinMode === "natural" ? " Skin rendering: Apply the shooting mode's grain and tonal response to skin surfaces only. Do NOT alter face shape, features, or proportions." : ""}`
      : `3D FACE ID ENGINE ACTIVE to maintain identity.${skinMode === "natural" ? " Skin rendering: Apply the shooting mode's grain and tonal response to skin surfaces only. Do NOT alter face shape, features, or proportions." : ""}`;

  const { fitPromptContext, fitSummarySuffix } =
    buildFitPromptContext(bodySpecs);

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

  let textureAndColor = modeDict.portra;
  if (shootingMode === "custom" && customPrompt) {
    textureAndColor = `Texture & Photography Style: ${customPrompt}`;
  } else if (modeDict[shootingMode]) {
    textureAndColor = modeDict[shootingMode];
  }

  const fitSummary = `${isMixMode ? "🧩 MIX" : "👕 OUTFIT"}${fitSummarySuffix}`;

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
Task: Exact Reference-Run Fashion Editorial Generation.

[FACE IDENTITY LOCK]
- ${faceContext}
- CRITICAL: The face reference image(s) are the SOLE and ABSOLUTE source for the model's face, identity, hair, and skin tone.
- Do NOT blend, merge, or import any facial feature from outfit images or any other source.
- Reconstruct the face reference identity faithfully under the new scene's lighting and shooting mode.

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
- The PERSON in the reference image is NOT the final model.
- The final face must come 100% from [FACE IDENTITY REFERENCE]. The reference person's face shape, eye shape, nose, mouth, jawline, hair, skin tone, age, and ethnicity must have ZERO influence on the result.
- Treat the reference's expression as ABSTRACT MOOD ONLY (e.g. "calm gaze toward camera"), not as facial structure.

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
