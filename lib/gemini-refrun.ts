import { HarmCategory, HarmBlockThreshold } from "@google/genai";
import {
  ai,
  defaultImageSize,
  imageGenerateConfig,
  imageGenerateHttpOptions,
  imageGenerationModel,
} from "./genai-client";
import {
  pickGeneratedInlineImage,
  type GenAiResponsePart,
} from "./genai-response";
import { toInlineImagePart } from "./image-mime";

type PromptPart = ReturnType<typeof toInlineImagePart> | { text: string };

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

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

CRITICAL RULE (NEGATIVE CONSTRAINT):
Ignore all details regarding clothing or accessories worn by the model.

Return ONLY raw JSON with:
{
  "background": "describe the environment and set design",
  "pose": "describe the subject's posture, limb positioning, and attitude",
  "expression": "describe the facial expression and gaze direction",
  "camera_angle_and_crop": "camera angle and crop",
  "lighting_and_exposure": "lighting setup and exposure character",
  "color_grading_and_texture": "color grading and texture",
  "overall_mood": "overall mood"
}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [...parts, { text: systemPrompt }] }],
  });

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
  dirSet: RefRunDirection;
  bodySpecs?: string;
  shootingMode?: string;
  customPrompt?: string;
  isMixMode?: boolean;
  mixCaptions?: string[];
  outputRatio?: OutputRatio;
}): Promise<{ base64: string; summary: string }> {
  const {
    faceBase64s,
    outfitBase64s,
    dirSet,
    bodySpecs,
    shootingMode = "default",
    customPrompt,
    isMixMode = false,
    mixCaptions = [],
    outputRatio = "4:5",
  } = args;

  if (!faceBase64s.length) {
    throw new Error("얼굴 이미지가 없다.");
  }

  if (!outfitBase64s.length) {
    throw new Error("의상 이미지가 없다.");
  }

  const parts: PromptPart[] = [];

  faceBase64s.forEach((faceBase64) => {
    parts.push(toInlineImagePart(faceBase64));
  });

  outfitBase64s.forEach((outfitBase64, index) => {
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
      ? "Use face reference."
      : "3D FACE ID ENGINE ACTIVE to maintain identity.";

  const { fitPromptContext, fitSummarySuffix } =
    buildFitPromptContext(bodySpecs);

  const modeDict: Record<string, string> = {
    fuji: "Texture: Fujifilm 400H (Cool greens, cyan shadows, high contrast cinematic film).",
    mono: "Texture: Ilford HP5 Plus (High-end monochrome, heavy grain, deep noir look). FORCE STRICT BLACK AND WHITE. NO COLOR.",
    studio:
      "Texture: Sharp high-key studio lighting. Zero grain, high-end digital clarity.",
    raw: "Texture: Natural raw light. iPhone-style snapshot clarity, zero film simulation.",
    default:
      "Texture: Kodak Portra 400 (Warm skin tones, subtle analog grain, soft cinematic light).",
  };

  let textureAndColor = modeDict.default;
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

[IDENTITY]
- ${faceContext}

${fitPromptContext}

${outfitInstruction}

[OUTFIT PERSON PURGE]
- Treat uploaded outfit images strictly as wardrobe references, not identity, pose, background, lighting, camera, or location references.
- Ignore any face, head, hair, skin tone, body identity, age, expression, pose, background, room, wall, furniture, scenery, source lighting, camera angle, or color cast visible in outfit images.
- The final model identity, face, hair, skin tone, and age must come ONLY from the face reference images.

[REFERENCE STRUCTURE]
- BACKGROUND: ${dirSet.background}
- POSE: ${dirSet.pose}
- EXPRESSION: ${dirSet.expression}
- CAMERA / CROP: ${dirSet.camera_angle_and_crop}
- LIGHTING / EXPOSURE: ${dirSet.lighting_and_exposure}
- COLOR / TEXTURE: ${dirSet.color_grading_and_texture}
- OVERALL MOOD: ${dirSet.overall_mood}

[TECHNICAL EXECUTION]
- ${textureAndColor}
- Replicate the photographic language of the reference.
- Ignore the original reference clothing and accessories.
- Prioritize atmospheric realism over digital sharpness.
- ${outputRatio} composition.
- Output ${defaultImageSize} museum quality.
`;

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
  const imageBase64 = pickGeneratedInlineImage(responseParts)?.data || null;

  if (!imageBase64) {
    throw new Error("REFRUN 이미지 생성 결과가 비어 있다.");
  }

  return {
    base64: imageBase64,
    summary: fitSummary,
  };
}
