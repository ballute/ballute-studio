import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

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

const buildFitPromptContext = (
  bodySpecs?: string
): { fitPromptContext: string; fitSummarySuffix: string } => {
  if (!bodySpecs) {
    return {
      fitPromptContext:
        "- AUTO-FIT MODE: Replicate the garment's silhouette, fit, length, and drape EXACTLY.",
      fitSummarySuffix: "",
    };
  }

  const specMatch = bodySpecs.match(/(\d+)\/(\d+)\s+(\d+)\/(\d+)/);
  if (!specMatch) {
    return {
      fitPromptContext:
        "- AUTO-FIT MODE: Replicate the garment's silhouette, fit, length, and drape EXACTLY.",
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
      "Because the body is taller/longer, the fixed garment sits naturally higher. Sleeves expose more wrist, and pants break higher above the shoes.";
  } else if (hDiff <= -4) {
    hDesc = "shorter";
    lengthEffect =
      "Because the body is shorter, the fixed garment falls lower. Sleeves cover the hands more, and pants stack heavily on the shoes.";
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
    {
      inlineData: {
        data: referenceBase64,
        mimeType: "image/jpeg",
      },
    },
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
    contents: {
      parts: [...parts, { text: systemPrompt }],
    },
  });

  let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
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
}): Promise<{ base64: string; summary: string }> {
  const {
    faceBase64s,
    outfitBase64s,
    dirSet,
    bodySpecs,
    shootingMode = "default",
    customPrompt,
  } = args;

  if (!faceBase64s.length) {
    throw new Error("얼굴 이미지가 없다.");
  }

  if (!outfitBase64s.length) {
    throw new Error("의상 이미지가 없다.");
  }

  const parts: any[] = [];

  faceBase64s.forEach((faceBase64) => {
    parts.push({
      inlineData: {
        data: faceBase64,
        mimeType: "image/jpeg",
      },
    });
  });

  outfitBase64s.forEach((outfitBase64) => {
    parts.push({
      inlineData: {
        data: outfitBase64,
        mimeType: "image/jpeg",
      },
    });
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
    studio: "Texture: Sharp high-key studio lighting. Zero grain, high-end digital clarity.",
    raw: "Texture: Natural raw light. iPhone-style snapshot clarity, zero film simulation.",
    default: "Texture: Kodak Portra 400 (Warm skin tones, subtle analog grain, soft cinematic light).",
  };

  let textureAndColor = "";
  if (shootingMode === "custom" && customPrompt) {
    textureAndColor = `Texture & Photography Style: ${customPrompt}`;
  } else if (shootingMode === "dig_original") {
    textureAndColor = `Texture & Photography Style: ${dirSet.camera_angle_and_crop}`;
  } else if (shootingMode !== "default") {
    textureAndColor = modeDict[shootingMode];
  } else {
    textureAndColor =
      dirSet.color_grading_and_texture || modeDict["default"];
  }

  const lightingStyle =
    dirSet.lighting_and_exposure || "Natural editorial lighting";
  const finalPhotography =
    dirSet.camera_angle_and_crop || "Editorial framing";

  let fitSummary = "🖼️ REFRUN";
  if (shootingMode === "custom") {
    fitSummary += ` (CUSTOM: ${customPrompt})`;
  } else if (shootingMode === "dig_original") {
    fitSummary += ` (REF 원본 기법)`;
  } else if (shootingMode !== "default") {
    fitSummary += ` (${shootingMode.toUpperCase()})`;
  }
  fitSummary += fitSummarySuffix;

  const prompt = `Task: Exact Aesthetic Replication & High-End Fashion Try-On.
- IDENTITY: ${faceContext}
${fitPromptContext}

[HOLISTIC GARMENT RECOGNITION]
- Reconstruct the exact outfit from the provided garment references.

[EDITORIAL ART DIRECTION]
- ENVIRONMENT: ${dirSet.background}
- POSE & ATTITUDE: ${dirSet.pose}
- EXPRESSION: ${dirSet.expression}
- OVERALL MOOD: ${dirSet.overall_mood}

[TECHNICAL EXECUTION]
- TEXTURE & COLOR: ${textureAndColor}
- CAMERA & CROP: ${finalPhotography}
- LIGHTING: ${lightingStyle}

CRITICAL:
- Replicate the photographic language of the reference.
- Ignore the original reference clothing and accessories.
- Prioritize atmospheric realism over digital sharpness.
- Output 2K museum quality.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: {
      parts: [...parts, { text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "3:4",
        imageSize: "2K",
      },
      safetySettings,
    },
  });

  const imageBase64 =
    response.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData
    )?.inlineData?.data || null;

  if (!imageBase64) {
    throw new Error("REFRUN 이미지 생성 결과가 비어 있다.");
  }

  return {
    base64: imageBase64,
    summary: fitSummary,
  };
}