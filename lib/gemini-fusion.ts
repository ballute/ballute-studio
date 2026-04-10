import { HarmCategory, HarmBlockThreshold } from "@google/genai";
import {
  ai,
  defaultImageSize,
  imageGenerateHttpOptions,
} from "./genai-client";
import { toInlineImagePart } from "./image-mime";

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
  detailed_pose_report?: string;
  safe_generation_pose_notes?: string;
  pose_category?: string;
  overall_symmetry?: string;
  head_direction?: string;
  gaze_direction?: string;
  torso_rotation?: string;
  shoulder_tilt?: string;
  left_arm_position?: string;
  right_arm_position?: string;
  left_hand_action?: string;
  right_hand_action?: string;
  garment_interaction?: string;
  hip_shift?: string;
  weight_distribution?: string;
  left_leg_position?: string;
  right_leg_position?: string;
  leg_stance?: string;
  feet_direction?: string;
  body_lean?: string;
  styling_items_to_ignore?: string[];
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

const compactPoseValue = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const buildSafePoseGenerationPrompt = (poseBlueprint: PoseBlueprint) => {
  const lines = [
    compactPoseValue(poseBlueprint.safe_generation_pose_notes),
    compactPoseValue(poseBlueprint.pose),
    compactPoseValue(poseBlueprint.body_attitude),
    compactPoseValue(poseBlueprint.garment_interaction),
    compactPoseValue(poseBlueprint.camera_angle_and_crop),
  ].filter(Boolean);

  return lines.length
    ? lines.map((line) => `- ${line}`).join("\n")
    : "- Preserve the natural attitude, body balance, and hand logic from the pose reference.";
};

export async function analyzeBackgroundDNAFromBase64s(
  bgBase64s: string[]
): Promise<BackgroundDNA> {
  const analyses: any[] = [];

  for (const base64 of bgBase64s) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [
        {
          ...toInlineImagePart(base64),
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
        ] }],
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
    contents: [{ role: "user", parts: [
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
      ] }],
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
    contents: [{ role: "user", parts: [
        {
          ...toInlineImagePart(poseBase64),
        },
        {
          text: `Analyze this pose reference image as a HIGH-END FASHION EDITORIAL POSE.

IMPORTANT:
- Extract BODY POSTURE ONLY.
- Preserve asymmetry, body lean, hand placement, torso rotation, and weight balance.
- Capture any GARMENT-TOUCHING action clearly, such as lightly holding lapels, gripping the front opening, touching the placket, or adjusting the jacket/shirt front.
- If one hand is in a pocket, keep that as pose logic.
- Ignore all accessories and styling contamination from the pose reference.
- Do NOT transfer sunglasses, hats, bags, jewelry, scarves, props, or extra styling items.
- Do NOT describe the outfit itself. Focus on posture, stance, gaze, and crop.
- Produce one detailed natural-language pose report for analysis, then one shorter safe summary for image generation.
- The detailed report should describe weight shift, pelvis/hip balance, torso lean, shoulder line, arm behavior, leg stance, head/gaze, facial tension, and editorial mood in a natural observational way.
- Do NOT invent rigid biomechanical numbers unless the angle or shift is visually obvious.

Return ONLY raw JSON:
{
  "pose": "short overall pose summary",
  "expression": "short facial expression summary",
  "camera_angle_and_crop": "short framing summary",
  "body_attitude": "short editorial body attitude summary",
  "detailed_pose_report": "dense editorial pose analysis in natural language",
  "safe_generation_pose_notes": "short natural-language pose guide safe for image generation",
  "pose_category": "e.g. asymmetrical garment-touch standing pose / relaxed standing pose",
  "overall_symmetry": "asymmetrical / slightly asymmetrical / symmetrical",
  "head_direction": "where the head is turned",
  "gaze_direction": "where the eyes are directed",
  "torso_rotation": "front / 3-quarter / twisted / angled",
  "shoulder_tilt": "level / left lowered / right lowered / etc",
  "left_arm_position": "arm position only",
  "right_arm_position": "arm position only",
  "left_hand_action": "e.g. relaxed, in pocket, touching hip",
  "right_hand_action": "e.g. relaxed, in pocket, touching hip",
  "garment_interaction": "how the hands interact with the garment if applicable",
  "hip_shift": "centered / shifted left / shifted right",
  "weight_distribution": "balanced / left leg / right leg",
  "left_leg_position": "straight / bent / forward / back / crossed / etc",
  "right_leg_position": "straight / bent / forward / back / crossed / etc",
  "leg_stance": "parallel / staggered / one knee bent / etc",
  "feet_direction": "forward / slightly outward / mixed / crossed / etc",
  "body_lean": "upright / slight left lean / slight right lean / etc",
  "styling_items_to_ignore": ["list only non-pose accessory items to ignore"]
}`,
        },
      ] }],
    config: {
      responseMimeType: "application/json",
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
    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
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
  outputRatio?: OutputRatio;
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
    outputRatio = "4:5",
  } = args;

  const parts: any[] = [];

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

  const { fitPromptContext, fitSummarySuffix } =
    buildFitPromptContext(bodySpecs);
  const fitSummary = `${isMixMode ? "🧩 MIX" : "👕 OUTFIT"}${fitSummarySuffix}`;

  const modeDict: Record<string, string> = {
    fuji: "Texture: Fujifilm 400H (Cool greens, cyan shadows, high contrast cinematic film).",
    mono: "Texture: Ilford HP5 Plus (High-end monochrome, heavy grain, deep noir look). FORCE STRICT BLACK AND WHITE. NO COLOR.",
    studio:
      "Texture: Sharp high-key studio lighting. Zero grain, high-end digital clarity.",
    raw: "Texture: Natural raw light. iPhone-style snapshot clarity, zero film simulation.",
    default:
      "Texture: Kodak Portra 400 (Warm skin tones, subtle analog grain, soft cinematic light).",
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
  const finalGarmentInteraction = poseBlueprint?.garment_interaction || "";
  const safePoseGenerationPrompt = buildSafePoseGenerationPrompt(poseBlueprint);
  const stylingItemsToIgnore = (poseBlueprint?.styling_items_to_ignore || [])
    .map((item) => item.trim())
    .filter(Boolean);
  const stylingIgnorePrompt = stylingItemsToIgnore.length
    ? stylingItemsToIgnore.join(", ")
    : "sunglasses, hats, bags, jewelry, scarves, props, and any extra styling accessories";

  const prompt = `
Task: Create a premium FUSION fashion editorial image.

[PRIORITY ORDER]
- 1. Face references define identity.
- 2. Outfit references define wardrobe and styling.
- 3. Pose blueprint defines posture, hand logic, gaze mood, and crop feeling.
- 4. Background/location defines environment, light, and atmosphere.
- Lower-priority inputs must never override higher-priority inputs.

[FACE IDENTITY LOCK]
- Maintain exact identity from face references.
- Preserve face shape, facial proportions, age impression, and hair silhouette from the face references.
- Do NOT borrow face, hair, or styling from outfit, pose, or background signals.

[OUTFIT LOCK]
- Reconstruct the exact visible outfit from the uploaded outfit images.
- Preserve garment category, sleeve length, neckline/collar shape, color blocking, fabric impression, layering order, and visible styling from the outfit references.
- Do NOT invent, replace, or swap garments.
- Do NOT introduce scarves, neckwear, knitwear, jewelry, props, or extra layers unless they are clearly visible in the outfit references.
- ${
    isMixMode
      ? "This is MIX mode. Respect each item detail text exactly."
      : "This is standard outfit mode."
  }

${fitPromptContext}

[BACKGROUND INFLUENCE]
- Environment type: ${bgDNA?.environment_type || ""}
- Architectural language: ${bgDNA?.architectural_language || ""}
- Lighting DNA: ${lightingStyle}
- Color / texture DNA: ${textureAndColor}
- Mood DNA: ${moodStyle}
- Target location: ${finalBackground}
- Use background/location only to construct the environment, light, and atmosphere.
- Background guidance must never change the outfit, identity, or pose logic.
- Do NOT creatively restyle the wardrobe to match the location.

[POSE INFLUENCE]
- Pose: ${finalPose}
- Expression: ${finalExpression}
- Body attitude: ${finalBodyAttitude}
- Garment interaction: ${finalGarmentInteraction}
- Use pose guidance only for body stance, asymmetry, hand placement, weight balance, torso lean, head direction, gaze mood, and crop feeling.
- Pose guidance must not change identity, outfit category, garment styling, or background concept.
- Keep pose natural, relaxed, and editorial.
- ${safePoseGenerationPrompt}

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

[STYLING CONTAMINATION CONTROL]
- Use the pose blueprint for posture only.
- Ignore these non-pose styling items from the pose reference: ${stylingIgnorePrompt}.
- Do NOT introduce any accessory, prop, or styling item from the pose reference unless it already exists in the actual outfit references.

[BACKGROUND CONTROL]
- The location should inherit the background DNA, but literal geometry must not be copied.
- Build a compatible place within the same neighborhood/world.
- Avoid repeating one-off windows, doors, corners, or exact facade layout from the background references.

[OUTPUT RULE]
- Render as a premium fashion editorial photograph.
- Keep the image realistic and luxury-brand ready.
- Avoid generic AI mannequin feel.
- ${outputRatio} composition.
- ${defaultImageSize} quality.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
    config: {
      imageConfig: {
        aspectRatio: outputRatio,
        imageSize: defaultImageSize,
      },
      httpOptions: imageGenerateHttpOptions,
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
