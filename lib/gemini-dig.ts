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


export type DigDirection = {
  background: string;
  pose: string;
  expression: string;
  mood: string;
  photography_technique: string;
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
      "Because the body is taller, sleeves expose more wrist and the garment sits naturally higher.";
  } else if (hDiff <= -4) {
    hDesc = "shorter";
    lengthEffect =
      "Because the body is shorter, sleeves cover more of the hands and the garment falls lower.";
  }

  if (wDiff >= 4) {
    wDesc = "broader/heavier";
    widthEffect =
      "Because the body is thicker, the fixed garment fits tighter and drapes less.";
  } else if (wDiff <= -4) {
    wDesc = "slimmer/lighter";
    widthEffect =
      "Because the body is thinner, the fixed garment fits looser and drapes more.";
  }

  let bodyChange = [hDesc, wDesc].filter(Boolean).join(" and ");
  if (!bodyChange) {
    bodyChange = "similar proportions";
    lengthEffect = "Maintain the original vertical fit.";
    widthEffect = "Maintain the original width and drape.";
  }

  return {
    fitPromptContext: `
- FIT CALIBRATION (FIXED GARMENT PARADIGM):
  * CRITICAL RULE: The physical size, pattern, and design of the garment are 100% FIXED.
  * DO NOT redesign, resize, or alter the garment itself.
  * THE BODY CHANGE: The target model is visually ${bodyChange}.
  * THE VISUAL EFFECT:
    1. ${lengthEffect}
    2. ${widthEffect}
  * Render the natural physical result of this new body wearing the exact same fixed-size garment.
`,
    fitSummarySuffix: ` + 📏 핏 보정: Body ${bodyChange}`,
  };
};

export async function generateCreativeDirectionsWeb(
  moodQuery: string,
  count: number
): Promise<DigDirection[]> {
  const systemPrompt = `You are the Creative Director for 'Ballute'.
Research visuals of '${moodQuery}' using Google Search.
Extract ONLY these 5 editorial elements for ${count} photoshoot directions:
1. background
2. pose
3. expression
4. mood
5. photography_technique

CRITICAL RULE:
- Embrace the unpredictability of research.
- Include texture / film / digital look when relevant.
- Return ONLY valid JSON array.
Format:
[
  {
    "background": "...",
    "pose": "...",
    "expression": "...",
    "mood": "...",
    "photography_technique": "..."
  }
]`;

  const response = await withGenAiRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        // @ts-expect-error The SDK supports googleSearch at runtime.
        tools: [{ googleSearch: {} }],
      }),
    { label: "DIG directions" }
  );

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonStart = rawText.indexOf("[");
  const jsonEnd = rawText.lastIndexOf("]") + 1;

  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error("DIG 리서치 결과를 JSON으로 파싱하지 못했다.");
  }

  const parsed = JSON.parse(rawText.substring(jsonStart, jsonEnd));

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("DIG 리서치 결과가 비어 있다.");
  }

  return parsed.slice(0, count);
}

import { buildFaceDescriptionText, type FaceBlueprint } from "./gemini-fusion";

export async function generateDigImageWeb(args: {
  faceBase64s: string[];
  faceBlueprint?: FaceBlueprint;
  outfitBase64s: string[];
  dirSet: DigDirection;
  bodySpecs?: string;
  shootingMode?: string;
  customPrompt?: string;
  lockedVibe?: LockedVibe | null;
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
    lockedVibe,
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
      ? `Use the single face reference precisely.${skinMode === "natural" ? " Skin rendering: Apply the shooting mode's grain and tonal response to skin surfaces only. Do NOT alter face shape, features, or proportions." : ""}`
      : `3D FACE ID ENGINE ACTIVE. Maintain the exact identity consistently across all results.${skinMode === "natural" ? " Skin rendering: Apply the shooting mode's grain and tonal response to skin surfaces only. Do NOT alter face shape, features, or proportions." : ""}`;

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
      "MOOD: Instagram daily snap / iPhone unedited — candid, relatable, no filter. Real-life wearability over editorial. | RENDERING: Texture: Natural raw light. Minimal grading. Realistic exposure. No film simulation.",
    "retro-film":
      "MOOD: Comoli / old Celine — quiet, cinematic, single-source light. Half-stop under, optically soft, understated. Ballute's core aesthetic. | RENDERING: Lighting: Single-direction natural light source, either window or outdoor. Soft highlight rolloff — bright areas gently overexpose without harsh clipping. No fill light, no flash. Preserve natural shadows where direct light creates contrast — do not flatten all shadows. Color: Low saturation, muted and slightly faded. Flat tonal curve — compressed midtones, lifted blacks. Render through an optical lens response: slight softness in focus edges, no digital sharpening. The overall image must feel underexposed by half a stop with a matte, non-glossy finish. APPLY THIS COLOR SCIENCE UNIFORMLY TO THE ENTIRE IMAGE INCLUDING ALL GARMENTS — preserve each garment's original hue but render through this flat, muted film tonal response. Overall rendering: The entire image must feel physically soft throughout — fabric surfaces, skin, and edges should lack digital sharpness. Every surface rendered as if light passed through an imperfect optical lens, not a digital sensor. No edge enhancement, no digital micro-detail on fabric or skin.",
  };

  let textureAndColor = modeDict.portra;

  if (lockedVibe?.color_grading_and_texture) {
    textureAndColor = lockedVibe.color_grading_and_texture;
  } else if (shootingMode === "custom" && customPrompt) {
    textureAndColor = `Texture & Photography Style: ${customPrompt}`;
  } else if (shootingMode !== "portra" && modeDict[shootingMode]) {
    textureAndColor = modeDict[shootingMode];
  }

  const backgroundText = lockedVibe?.background || dirSet.background;
  const poseText = lockedVibe?.pose || dirSet.pose;
  const expressionText = lockedVibe?.expression || dirSet.expression;
  const moodText = lockedVibe?.overall_mood || dirSet.mood;
  const cameraText =
    lockedVibe?.camera_angle_and_crop || dirSet.photography_technique;
  const lightingText =
    lockedVibe?.lighting_and_exposure || dirSet.photography_technique;

  const modeSummary = isMixMode ? "🧩 MIX" : "👕 OUTFIT";
  const vibeSummary = lockedVibe ? " + 🔒 VIBE LOCK" : "";
  const fitSummary = `${modeSummary}${vibeSummary}${fitSummarySuffix}`;

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
Task: Exact Aesthetic Replication & High-End Fashion Try-On.

[IDENTITY]
- ${faceContext}

${fitPromptContext}

${outfitInstruction}

[OUTFIT PERSON PURGE]
- Treat uploaded outfit images strictly as wardrobe references, not identity, pose, background, lighting, camera, or location references.
- Ignore any face, head, hair, skin tone, body identity, age, expression, pose, background, room, wall, furniture, scenery, source lighting, camera angle, or color cast visible in outfit images.
- The final model identity, face, hair, skin tone, and age must come ONLY from the face reference images.

[EDITORIAL ART DIRECTION]
- BACKGROUND: ${backgroundText}
- POSE: ${poseText}
- EXPRESSION: ${expressionText}
- OVERALL MOOD: ${moodText}

[TECHNICAL EXECUTION]
- ${textureAndColor}
- CAMERA / PHOTOGRAPHY: ${cameraText}
- LIGHTING: ${lightingText}
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
      throw new EmptyGenAiImageError("DIG");
    }

    return generatedImage;
  }, { label: "DIG image" });

  return {
    base64: imageBase64,
    summary: fitSummary,
  };
}
