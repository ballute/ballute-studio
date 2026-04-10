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

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
    // @ts-expect-error The SDK supports googleSearch at runtime.
    tools: [{ googleSearch: {} }],
  });

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

export async function generateDigImageWeb(args: {
  faceBase64s: string[];
  outfitBase64s: string[];
  dirSet: DigDirection;
  bodySpecs?: string;
  shootingMode?: string;
  customPrompt?: string;
  lockedVibe?: LockedVibe | null;
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
    lockedVibe,
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

  for (const faceBase64 of faceBase64s) {
    parts.push(toInlineImagePart(faceBase64));
  }

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
      ? "Use the single face reference precisely."
      : "3D FACE ID ENGINE ACTIVE. Maintain the exact identity consistently across all results.";

  const { fitPromptContext, fitSummarySuffix } =
    buildFitPromptContext(bodySpecs);

  const modeDict: Record<string, string> = {
    fuji: "Texture: Fujifilm 400H (cool greens, cyan shadows, high contrast cinematic film).",
    mono: "Texture: Ilford HP5 Plus. Force strict black and white. No color.",
    studio:
      "Texture: clean commercial high-key studio lighting. Zero grain. High-end digital clarity.",
    raw: "Texture: natural raw light. Minimal grading. Realistic exposure.",
    default:
      "Texture: Kodak Portra 400 (warm skin tones, subtle analog grain, soft cinematic light).",
  };

  let textureAndColor = modeDict.default;

  if (lockedVibe?.color_grading_and_texture) {
    textureAndColor = lockedVibe.color_grading_and_texture;
  } else if (shootingMode === "custom" && customPrompt) {
    textureAndColor = `Texture & Photography Style: ${customPrompt}`;
  } else if (shootingMode !== "default" && modeDict[shootingMode]) {
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
- Use only the uploaded outfit items.
- Respect each item instruction exactly.
- Preserve layer order and item hierarchy.
- Do not invent extra garments.
`
    : `
[OUTFIT MODE]
- Reconstruct the exact uploaded outfit references.
- Preserve pattern, material read, silhouette, drape, and key construction details.
- Do not invent extra garments.
`;

  const prompt = `
Task: Exact Aesthetic Replication & High-End Fashion Try-On.

[IDENTITY]
- ${faceContext}

${fitPromptContext}

${outfitInstruction}

[EDITORIAL ART DIRECTION]
- BACKGROUND: ${backgroundText}
- POSE: ${poseText}
- EXPRESSION: ${expressionText}
- OVERALL MOOD: ${moodText}

[TECHNICAL EXECUTION]
- ${textureAndColor}
- CAMERA / PHOTOGRAPHY: ${cameraText}
- LIGHTING: ${lightingText}
- Render as a real premium fashion photograph.
- Avoid generic AI 3D / plastic skin look.
- ${outputRatio} composition.
- Output should feel like a luxury editorial lookbook image.
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
    throw new Error("DIG 이미지 생성 결과가 비어 있다.");
  }

  return {
    base64: imageBase64,
    summary: fitSummary,
  };
}
