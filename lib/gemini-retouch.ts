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

export type RetouchType = "general" | "garment" | "expression" | "mood";
export type GarmentType = "top" | "bottom";

type PromptPart = ReturnType<typeof toInlineImagePart> | { text: string };

const intensityLabel = (intensity: number): string => {
  if (intensity <= 30) return "subtle — minimal change, keep original feel";
  if (intensity <= 60) return "moderate — clear change but naturally integrated";
  return "strong — significant transformation";
};

export async function retouchGeneral(
  imageBase64: string,
  instruction: string,
  intensity: number = 50,
  styleReferenceBase64?: string
): Promise<string> {
  const parts: PromptPart[] = [toInlineImagePart(imageBase64)];

  if (styleReferenceBase64) {
    parts.push({
      text: `[STYLE REFERENCE]
Extract ONLY the visual style guidance relevant to the edit from the next image.
Use it for direction such as color, material feeling, surface finish, lighting behavior, shape language, or overall styling mood.
Do NOT import the reference image's person, identity, pose, background composition, or unrelated objects.`,
    });
    parts.push(toInlineImagePart(styleReferenceBase64));
  }

  const prompt = `Task: Targeted Image Edit.

Apply this instruction to the source image: "${instruction || "Use the STYLE REFERENCE as the edit direction."}"
${styleReferenceBase64 ? "Use the STYLE REFERENCE image as supporting visual guidance while preserving the source image content." : ""}

Rules:
- Execute the instruction precisely and naturally.
- Preserve everything not mentioned in the instruction exactly as-is.
- Face identity, hair, and skin tone are fixed unless the instruction specifically targets them.
- Do NOT copy unrelated content from the reference image.
- Seamlessly integrate the change — no hard edges, no copy-paste artifacts.
- Intensity: ${intensityLabel(intensity)}.`;

  return withGenAiRetry(async () => {
    const response = await ai.models.generateContent({
      model: imageGenerationModel,
      contents: [{
        role: "user",
        parts: [...parts, { text: prompt }],
      }],
      config: {
        imageConfig: { imageSize: defaultImageSize },
        httpOptions: imageGenerateHttpOptions,
        ...imageGenerateConfig,
        safetySettings,
      },
    });

    const responseParts = (response.candidates?.[0]?.content?.parts ?? []) as GenAiResponsePart[];
    const image = pickGeneratedInlineImage(responseParts)?.data ?? null;
    if (!image) throw new EmptyGenAiImageError("RETOUCH_GENERAL");
    return image;
  }, { label: "RETOUCH general" });
}

export async function retouchGarment(
  imageBase64: string,
  garmentType: GarmentType,
  instruction: string,
  garmentBase64?: string
): Promise<string> {
  const parts: PromptPart[] = [toInlineImagePart(imageBase64)];

  let prompt: string;

  if (garmentBase64) {
    parts.push({
      text: `[NEW GARMENT REFERENCE]
Extract ONLY the garment design from the next image.
Ignore the person, face, hair, skin tone, body identity, pose, background, and lighting in the reference.
Use only the garment's silhouette, color, material, pattern, construction, and styling details.`,
    });
    parts.push(toInlineImagePart(garmentBase64));

    prompt = `Task: ${garmentType === "top" ? "Upper" : "Lower"} Body Garment Replacement.

Replace ONLY the ${garmentType === "top" ? "upper body garment (top/jacket/shirt)" : "lower body garment (pants/skirt/shorts)"} with the design from the NEW GARMENT REFERENCE image.
${instruction ? `Additional styling: ${instruction}` : ""}

Rules:
- Preserve the model's face, hair, skin tone, body pose, and all other garments exactly.
- Preserve the background, lighting, and overall atmosphere exactly.
- Drape the new garment naturally onto the existing pose and body.
- Do NOT import the reference image's person, background, pose, or styling.
- Seamless integration only — no copy-paste artifacts.`;
  } else {
    prompt = `Task: ${garmentType === "top" ? "Upper" : "Lower"} Body Garment Edit.

Modify ONLY the ${garmentType === "top" ? "upper body garment (top/jacket/shirt)" : "lower body garment (pants/skirt/shorts)"} based on this instruction: "${instruction}"

Rules:
- Preserve the model's face, hair, skin tone, body pose, and all other garments exactly.
- Preserve the background, lighting, and overall atmosphere exactly.
- Apply the change naturally and seamlessly.`;
  }

  return withGenAiRetry(async () => {
    const response = await ai.models.generateContent({
      model: imageGenerationModel,
      contents: [{
        role: "user",
        parts: [...parts, { text: prompt }],
      }],
      config: {
        imageConfig: { imageSize: defaultImageSize },
        httpOptions: imageGenerateHttpOptions,
        ...imageGenerateConfig,
        safetySettings,
      },
    });

    const responseParts = (response.candidates?.[0]?.content?.parts ?? []) as GenAiResponsePart[];
    const image = pickGeneratedInlineImage(responseParts)?.data ?? null;
    if (!image) throw new EmptyGenAiImageError("RETOUCH_GARMENT");
    return image;
  }, { label: "RETOUCH garment" });
}

export async function retouchExpression(
  imageBase64: string,
  instruction: string
): Promise<string> {
  const prompt = `Task: Subtle Expression Adjustment.

This is the same person. Adjust only their facial expression/gaze based on this instruction: "${instruction}"

Rules:
- This is NOT a face swap. Do NOT replace or restructure the face.
- Preserve face identity, bone structure, skin tone, and hair 100%.
- Only adjust facial muscle movement — expression, gaze direction, lip, eye tension — naturally.
- Think of it as: the photographer asked the model to slightly adjust their expression in the next shot.
- Preserve the outfit, pose, background, and lighting exactly.`;

  return withGenAiRetry(async () => {
    const response = await ai.models.generateContent({
      model: imageGenerationModel,
      contents: [{
        role: "user",
        parts: [
          toInlineImagePart(imageBase64),
          { text: prompt },
        ],
      }],
      config: {
        imageConfig: { imageSize: defaultImageSize },
        httpOptions: imageGenerateHttpOptions,
        ...imageGenerateConfig,
        safetySettings,
      },
    });

    const parts = (response.candidates?.[0]?.content?.parts ?? []) as GenAiResponsePart[];
    const image = pickGeneratedInlineImage(parts)?.data ?? null;
    if (!image) throw new EmptyGenAiImageError("RETOUCH_EXPRESSION");
    return image;
  }, { label: "RETOUCH expression" });
}

const textureInstruction = (level: number): string => {
  const colorLock = "CRITICAL: Do NOT change any colors, color temperature, color grading, saturation, or hue. Preserve the exact original color palette. Only modify physical texture and sharpness.";

  if (level <= -70) {
    return `[TEXTURE RENDERING: FULL FILM]
${colorLock}
Simulate shooting on 16mm film pushed to ISO 3200. Overlay strong, coarse, organic, non-uniform film grain particles visibly across ALL surfaces — skin, fabric, background, highlights, and shadows equally. The grain must be physically visible individual particles, not a soft blur. Reduce micro-sharpness so that edges and fine details are defined *through* the grain structure, not on top of it. No digital sharpening. Matte surface finish.`;
  }
  if (level <= -30) {
    return `[TEXTURE RENDERING: MODERATE FILM]
${colorLock}
Simulate shooting on 35mm Kodak Portra 800 pushed one stop. Add moderate visible organic film grain particles across all surfaces. Slightly reduce micro-sharpness. Details remain clear but textured through the grain. Matte finish.`;
  }
  if (level < 30) {
    return `[TEXTURE RENDERING: NEUTRAL]
Maintain the source image's existing texture, sharpness, and colors exactly as-is. No added grain, no added sharpening, no color changes.`;
  }
  if (level < 70) {
    return `[TEXTURE RENDERING: MODERATE DIGITAL]
${colorLock}
Remove any existing grain or noise. Increase micro-contrast and edge definition. Surfaces appear clean and sharp.`;
  }
  return `[TEXTURE RENDERING: FULL DIGITAL]
${colorLock}
Remove all grain, noise, and texture overlay completely. Maximum micro-contrast and edge sharpness. Every surface pixel-perfect with clinical digital clarity. No film simulation, no softness.`;
};

export async function retouchMood(
  imageBase64: string,
  moodDescription: string,
  moodReferenceBase64?: string,
  textureLevel: number = 0
): Promise<string> {
  const parts: PromptPart[] = [];

  parts.push({
    text: `[SOURCE IMAGE — preserve all content: person identity, face, garment, pose, and scene composition]`,
  });
  parts.push(toInlineImagePart(imageBase64));

  if (moodReferenceBase64) {
    parts.push({
      text: `[MOOD REFERENCE — extract ONLY the visual atmosphere from this image: color grading, lighting quality, film texture, tonal curve, and overall cinematic feel. Do NOT import the person, garment, pose, background composition, or any content from this reference.]`,
    });
    parts.push(toInlineImagePart(moodReferenceBase64));
  }

  const hasMoodText = moodDescription.trim().length > 0;
  const hasTextureChange = textureLevel !== 0;

  const prompt = `Task: ${hasMoodText ? "Mood & Texture" : "Texture"} Transformation.
${hasMoodText ? `
Transform the visual mood and atmosphere of the source image toward this description:
"${moodDescription}"
${moodReferenceBase64 ? "Use the MOOD REFERENCE image as the visual target for atmosphere and cinematic feel." : ""}` : ""}

${hasTextureChange ? textureInstruction(textureLevel) : ""}

Rules:
- Preserve the model's face identity, skin tone, garment design, pose, and scene composition 100%.
- Do NOT alter the model's facial features.
${hasTextureChange && !hasMoodText ? "- Do NOT change any colors, color temperature, color grading, saturation, or hue. This is a TEXTURE-ONLY edit." : ""}
- Apply all changes uniformly across the entire image.`;

  return withGenAiRetry(async () => {
    const response = await ai.models.generateContent({
      model: imageGenerationModel,
      contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
      config: {
        imageConfig: { imageSize: defaultImageSize },
        httpOptions: imageGenerateHttpOptions,
        ...imageGenerateConfig,
        safetySettings,
      },
    });

    const responseParts = (response.candidates?.[0]?.content?.parts ?? []) as GenAiResponsePart[];
    const image = pickGeneratedInlineImage(responseParts)?.data ?? null;
    if (!image) throw new EmptyGenAiImageError("RETOUCH_MOOD");
    return image;
  }, { label: "RETOUCH mood" });
}
