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
import { EmptyGenAiImageError, withGenAiRetry } from "./genai-retry";
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
            text: `Analyze this pose reference image as a HIGH-END FASHION EDITORIAL POSE.
IMPORTANT:
Do NOT reduce the pose into only dry skeletal coordinates.
Read it like a fashion photographer for a luxury brand (Lemaire, The Row style).

You must preserve:
- Body attitude: The specific energy (nonchalant, tense, slouchy, elegant).
- Narrative tension: The relationship between the subject and the negative space.
- Weight distribution and torso lean.
- Hand placement feeling: The "accidental" yet precise touch.
- Facial mood: Subdued gaze, chin angle, fatigue or alertness.
- Camera relation: The psychological distance (voyeuristic, intimate, formal).

You must IGNORE / PURGE:
- All original background/architecture.
- All original clothing/textures/logos.
- All accessories (sunglasses, bags, jewelry).

Return ONLY raw JSON:
{
  "pose_core": "precise body posture using editorial photography terms",
  "body_attitude": "detailed energy reading: weight balance, lean, slouch, psychological tension",
  "arm_and_hand_behavior": "narrative reading of hands/arms relationship to the model's presence",
  "expression_and_gaze": "subtle facial mood, gaze direction, and emotional vibe",
  "framing_and_scale": "STRICT CROP LEVEL (Choose one: Extreme Close-up / Bust / Waist-up / Knee-up / Full-body) AND photographic framing logic",
  "camera_relation": "lens feel, camera height, and the specific angle to the subject",
  "pose_purge_notes": "items that MUST be erased from the source"
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

  return JSON.parse(text);
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
  outfitBase64s: string[];
  backgroundBase64s?: string[];
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
}): Promise<{ base64: string; summary: string }> {
  const {
    faceBase64s,
    outfitBase64s,
    backgroundBase64s = [],
    poseBlueprint,
    targetLocationText,
    bgDNA,
    backgroundMode = "creative",
    bodySpecs,
    isMixMode = false,
    mixCaptions = [],
    lockedVibe,
    shootingMode = "default",
    customPrompt,
    outputRatio = "4:5",
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

  const finalBackground = lockedVibe?.background || targetLocationText;
  const backgroundModeContext =
    backgroundMode === "extract"
      ? `- Mode: Extract. Preserve the BACKGROUND REFERENCE scene with near-identical fidelity.
- Keep the same visible environment, camera viewpoint, depth layout, major surfaces, lighting direction, color palette, and crop logic.
- Only allow subtle time-flow, exposure, shadow, and minimal camera crop changes required for a natural fashion image.
- If the BACKGROUND REFERENCE contains any person/model/body/clothing, remove it completely and inpaint the environment behind it.
- Do not invent a different location. Do not import any background from FACE or OUTFIT references. Do not copy any person or garment from the BACKGROUND REFERENCE.`
      : `- Mode: Creative. Use the background DNA as a flexible world reference and create a natural fashion-editorial variation.`;
  
  const poseCore = lockedVibe?.pose || poseBlueprint?.pose_core || "Relaxed natural stance.";
  const poseExpression = lockedVibe?.expression || poseBlueprint?.expression_and_gaze || "Natural editorial gaze.";
  const cameraFeel = lockedVibe?.camera_angle_and_crop || poseBlueprint?.framing_and_scale || bgDNA?.camera_feel || "Editorial framing.";
  const poseAttitude = poseBlueprint?.body_attitude || "Nonchalant and natural.";
  const handsArms = poseBlueprint?.arm_and_hand_behavior || "Natural placement.";
  const cameraRelation = poseBlueprint?.camera_relation || "Natural photographic angle.";
  const purgeNotes = poseBlueprint?.pose_purge_notes || "All original background, clothing, and accessories.";

  // 🚨 [낮에 바꿨던 감도 핵심 프롬프트 복구]
  const prompt = `
Task: Create a premium FUSION fashion editorial image.

[REFERENCE ROLE SEPARATION]
Every uploaded reference has one assigned job:
- FACE references define only the final model identity, face, hair, age impression, and skin tone.
- OUTFIT references define only the garment identity and construction.
- BACKGROUND DNA / LOCATION defines the environment, lighting world, color atmosphere, and spatial setting.
- POSE blueprint defines body posture, crop/framing, camera relation, and attitude.
The highest priority is preserving the exact face identity and faithful garment design without importing the source context from the wrong reference.
Final integration must feel like one natural photograph: adapt fabric drape, wrinkles, scale, shadows, and lighting to the selected pose and background.

[FACE IDENTITY LOCK]
- Maintain exact identity from face references.
- Preserve face shape, facial proportions, age impression, and hair silhouette.

[OUTFIT LOCK (CRITICAL PRIORITY)]
- INSTRUCTION: Reconstruct the visible garment design from the uploaded outfit images with faithful fidelity, but do not reconstruct the outfit source scene.
- PRESERVE: Exact garment category, silhouette, sleeve length, collar shape, fabric texture, color, pattern, pockets, stitching, layering order, and clothing-specific logos/prints.
- DETAIL PRIORITY: Preserve the garment's local hue, saturation, contrast, material behavior, fit tension, hem length, seam placement, button/zipper placement, print scale, and distinctive construction details with maximum fidelity.
- COLOR DISCIPLINE: Do not recolor the garment to match the background color grade. Let scene lighting affect highlights and shadows naturally while keeping the garment's original local color identity.
- PROHIBITION: Do NOT alter the clothes to fit the pose. If the pose causes the clothes to distort, prioritize the clothes' structural integrity over the pose.
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
- Texture/Color: ${textureAndColor}
${backgroundModeContext}

[POSE & ATTITUDE - PHOTOGRAPHIC READING]
- Core: ${poseCore}.
- Energy: ${poseAttitude}.
- Hands/Arms: ${handsArms}.
- Face/Gaze: ${poseExpression}.
- Angle: ${cameraRelation}.
- CRITICAL VIBE: The model's posture MUST feel fluid, organic, and effortlessly natural. AVOID stiff, robotic, mannequin-like rigidity. Let the body weight shift naturally.

[CRITICAL CAMERA CROP LOCK]
- Framing directive: ${cameraFeel}
- ⚠️ STRICT RULE: You MUST replicate the exact crop level from the pose reference.
- If the framing directive implies waist-up or half-body, DO NOT generate legs.
- If the framing is a close-up, DO NOT show the full torso. 
- DO NOT widen the frame or zoom out just to show more of the background. The background must adapt to the camera crop, not vice versa.
- Purge from pose reference: ${purgeNotes}

[OUTPUT RULE]
- Render as a premium fashion editorial photograph.
- ${outputRatio} composition.
- ${defaultImageSize} quality.
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
