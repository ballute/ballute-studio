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

export type BackgroundDNA = {
  environment_type?: string;
  architectural_language?: string;
  lighting_and_exposure?: string;
  color_grading_and_texture?: string;
  spatial_mood?: string;
  camera_feel?: string;
  do_not_copy?: string[];
};

export type PoseBlueprint = {
  pose?: string;
  expression?: string;
  camera_angle_and_crop?: string;
  body_attitude?: string;
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
      "Because the body is taller/longer, the fixed garment sits naturally higher. Sleeves expose more wrist and pants break higher.";
  } else if (hDiff <= -4) {
    hDesc = "shorter";
    lengthEffect =
      "Because the body is shorter, the fixed garment falls lower. Sleeves cover more hands and pants stack more.";
  }

  if (wDiff >= 4) {
    wDesc = "broader/heavier";
    widthEffect =
      "Because the body is thicker, the fixed garment fits tighter with reduced drape.";
  } else if (wDiff <= -4) {
    wDesc = "slimmer/lighter";
    widthEffect =
      "Because the body is thinner, the fixed garment fits looser with more drape.";
  }

  let bodyChange = [hDesc, wDesc].filter(Boolean).join(" and ");
  if (!bodyChange) {
    bodyChange = "similar proportions";
    lengthEffect = "Maintain original vertical fit.";
    widthEffect = "Maintain original width and drape.";
  }

  return {
    fitPromptContext: `
- FIT CALIBRATION (FIXED GARMENT PARADIGM):
  * The garment size and design are fixed.
  * Do NOT redesign or resize the garment itself.
  * The target body is visually ${bodyChange}.
  * Visual effect:
    1. ${lengthEffect}
    2. ${widthEffect}
`,
    fitSummarySuffix: ` + 📏 핏 보정: Body ${bodyChange}`,
  };
};

export async function analyzeBackgroundDNAFromBase64s(
  bgBase64s: string[]
): Promise<BackgroundDNA> {
  const analyses: any[] = [];

  for (const base64 of bgBase64s) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64,
              mimeType: "image/jpeg",
            },
          },
          {
            text: `Analyze this location/environment image for fashion lookbook worldbuilding.

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

Focus on environmental DNA only. No people, no clothes.`,
          },
        ],
      },
      config: {
        safetySettings,
      },
    });

    let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}") + 1;

    if (jsonStart !== -1 && jsonEnd !== -1) {
      text = text.substring(jsonStart, jsonEnd);
    }

    analyses.push(JSON.parse(text));
  }

  const summaryResp = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          text: `You are merging multiple environment analyses into one unified background DNA for a fashion lookbook engine.

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
      ],
    },
    config: {
      safetySettings,
    },
  });

  let summaryText =
    summaryResp.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const sumStart = summaryText.indexOf("{");
  const sumEnd = summaryText.lastIndexOf("}") + 1;

  if (sumStart !== -1 && sumEnd !== -1) {
    summaryText = summaryText.substring(sumStart, sumEnd);
  }

  return JSON.parse(summaryText);
}

export async function analyzePoseBlueprintFromBase64(
  poseBase64: string
): Promise<PoseBlueprint> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            data: poseBase64,
            mimeType: "image/jpeg",
          },
        },
        {
          text: `Analyze this pose reference image as a HIGH-END FASHION EDITORIAL POSE.

IMPORTANT:
Do NOT reduce the pose into only dry skeletal coordinates.
Read it like a fashion photographer for a luxury brand.

Return ONLY raw JSON:
{
  "pose": "body posture, weight balance, arm/leg attitude",
  "expression": "facial expression and gaze direction",
  "camera_angle_and_crop": "camera angle / crop feeling",
  "body_attitude": "editorial attitude / emotion carried by the body"
}`,
        },
      ],
    },
    config: {
      safetySettings,
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

export async function searchLocationPrompts(
  bgDNA: BackgroundDNA,
  count: number
): Promise<string[]> {
  const systemPrompt = `Background DNA (Material & Lighting World):
${JSON.stringify(bgDNA, null, 2)}

TASK:
Generate EXACTLY ${count} spatially distinct location prompts based strictly on the provided Background DNA.

CRITICAL DIVERSITY RULE:
If generating multiple locations, each prompt must focus on a DIFFERENT structural element or camera perspective while keeping the core DNA identical.

Return ONLY a valid JSON array of strings containing EXACTLY ${count} elements.
Format: ["location description 1", "location description 2", ...]`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: [{ text: systemPrompt }] },
    config: {
      safetySettings,
    },
  });

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
  outfitBase64s: string[];
  poseBlueprint: PoseBlueprint;
  targetLocationText: string;
  bgDNA: BackgroundDNA;
  bodySpecs?: string;
  isMixMode?: boolean;
  mixCaptions?: string[];
  lockedVibe?: LockedVibe | null;
  shootingMode?: string;
  customPrompt?: string;
}): Promise<{ base64: string; summary: string }> {
  const {
    faceBase64s,
    outfitBase64s,
    poseBlueprint,
    targetLocationText,
    bgDNA,
    bodySpecs,
    isMixMode = false,
    mixCaptions = [],
    lockedVibe,
    shootingMode = "default",
    customPrompt,
  } = args;

  const parts: any[] = [];

  faceBase64s.forEach((faceBase64) => {
    parts.push({
      inlineData: {
        data: faceBase64,
        mimeType: "image/jpeg",
      },
    });
  });

  outfitBase64s.forEach((outfitBase64, index) => {
    parts.push({
      inlineData: {
        data: outfitBase64,
        mimeType: "image/jpeg",
      },
    });

    if (isMixMode) {
      const itemCaption =
        mixCaptions[index] || "No specific styling instruction provided.";
      parts.push({
        text: `[Outfit Detail ${index + 1}: Extracted based on "${itemCaption}"]`,
      });
    }
  });

  let fitSummary = lockedVibe
    ? `🧬 FUSION [VIBE LOCK]`
    : `🧬 FUSION [${shootingMode.toUpperCase()}]`;

  if (shootingMode === "custom") {
    fitSummary += ` (CUSTOM: ${customPrompt})`;
  }

  const { fitPromptContext, fitSummarySuffix } =
    buildFitPromptContext(bodySpecs);
  fitSummary += fitSummarySuffix;

  const modeDict: Record<string, string> = {
    fuji: "Texture: Fujifilm 400H characteristic (cool greens, cyan shadows, high contrast cinematic feel).",
    mono: "Texture: Ilford HP5 Plus (high-end monochrome, rich blacks, heavy grain). FORCE STRICT BLACK AND WHITE. NO COLOR.",
    studio:
      "Texture: clean commercial high-key studio lighting. Sharp focus, zero grain, high-end digital clarity.",
    raw: "Texture: unprocessed natural raw light. realistic exposure, zero film simulation.",
    default:
      "Texture: Kodak Portra 400 (warm skin tones, subtle analog grain, soft cinematic light).",
  };

  let textureAndColor = "";
  if (lockedVibe?.color_grading_and_texture) {
    textureAndColor = lockedVibe.color_grading_and_texture;
  } else if (shootingMode === "custom" && customPrompt) {
    textureAndColor = `Texture & Photography Style: ${customPrompt}`;
  } else if (shootingMode !== "default") {
    textureAndColor = modeDict[shootingMode];
  } else {
    textureAndColor =
      bgDNA?.color_grading_and_texture || modeDict["default"];
  }

  const lightingStyle =
    lockedVibe?.lighting_and_exposure ||
    bgDNA?.lighting_and_exposure ||
    "Soft editorial natural lighting.";

  const moodStyle =
    lockedVibe?.overall_mood ||
    bgDNA?.spatial_mood ||
    "High-end restrained editorial mood.";

  const cameraFeel =
    lockedVibe?.camera_angle_and_crop ||
    poseBlueprint?.camera_angle_and_crop ||
    bgDNA?.camera_feel ||
    "Editorial framing with natural negative space.";

  const finalPose = lockedVibe?.pose || poseBlueprint?.pose || "";
  const finalExpression =
    lockedVibe?.expression || poseBlueprint?.expression || "";
  const finalBackground = lockedVibe?.background || targetLocationText;
  const finalBodyAttitude = poseBlueprint?.body_attitude || "";

  const prompt = `
Task: Create a premium FUSION fashion editorial image.

[IDENTITY]
- Maintain exact identity from face references.

[OUTFIT]
- Reconstruct the exact outfit from the uploaded outfit images.
- ${
    isMixMode
      ? "This is MIX mode. Respect each item detail text exactly."
      : "This is standard outfit mode."
  }

${fitPromptContext}

[BACKGROUND WORLD]
- Environment type: ${bgDNA?.environment_type || ""}
- Architectural language: ${bgDNA?.architectural_language || ""}
- Lighting DNA: ${lightingStyle}
- Color / texture DNA: ${textureAndColor}
- Mood DNA: ${moodStyle}
- Target location: ${finalBackground}

[POSE / ATTITUDE]
- Pose: ${finalPose}
- Expression: ${finalExpression}
- Body attitude: ${finalBodyAttitude}

[PHOTO GRAMMAR]
- Camera framing / crop: ${cameraFeel}

[CRITICAL CAMERA PRIORITY]
- The camera framing MUST follow the pose reference first.
- Maintain the same crop level and framing feel from the pose reference.
- Do NOT widen the frame just to show more background.
- Background/location is for environmental DNA only, not for deciding crop width.
- If pose reference suggests upper-body, chest-up, waist-up, or medium framing, preserve that exact framing logic.
- If pose reference suggests full-body, preserve full-body.
- Pose reference has higher priority than background camera feel.

[BACKGROUND CONTROL]
- The location should inherit the background DNA, but literal geometry must not be copied.
- Build a different place within the same neighborhood/world.
- Avoid repeating one-off windows, doors, corners, or exact facade layout from the background references.

[OUTPUT RULE]
- Render as a premium fashion editorial photograph.
- Keep the image realistic and luxury-brand ready.
- Avoid generic AI mannequin feel.
- 3:4 vertical composition.
- 2K quality.
`;

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
    throw new Error("FUSION 이미지 생성 결과가 비어 있다.");
  }

  return {
    base64: imageBase64,
    summary: `${fitSummary} + FUSION`,
  };
}