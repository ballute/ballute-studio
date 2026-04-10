import fs from "fs";
import path from "path";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

function loadEnv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

const env = loadEnv(path.resolve(".env.local"));
process.env.GOOGLE_APPLICATION_CREDENTIALS = env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GOOGLE_CLOUD_PROJECT = env.GOOGLE_CLOUD_PROJECT;
process.env.GOOGLE_CLOUD_LOCATION = env.GOOGLE_CLOUD_LOCATION || "global";

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
});

const imageSize = process.argv[2] || "2K";

function readBase64(filePath) {
  return fs.readFileSync(path.resolve(filePath)).toString("base64");
}

function toInlineImagePart(base64) {
  const sig = base64.slice(0, 32);
  let mimeType = "image/jpeg";
  if (sig.startsWith("iVBORw0KGgo")) mimeType = "image/png";
  if (sig.startsWith("UklGR")) mimeType = "image/webp";
  return { inlineData: { data: base64, mimeType } };
}

const refPrompt = `Analyze the provided reference fashion photograph meticulously.
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

const referenceBase64 = readBase64("./public/refrun-reference.jpg");
const referenceResp = await ai.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: [{ role: "user", parts: [toInlineImagePart(referenceBase64), { text: refPrompt }] }],
});

let referenceText = "";
for (const part of referenceResp.candidates?.[0]?.content?.parts || []) {
  if (part.text) referenceText += part.text;
}

const jsonStart = referenceText.indexOf("{");
const jsonEnd = referenceText.lastIndexOf("}") + 1;
const dir = JSON.parse(referenceText.slice(jsonStart, jsonEnd));

console.log("DIR KEYS", Object.keys(dir));

const prompt = `
Task: Exact Reference-Run Fashion Editorial Generation.

[IDENTITY]
- Use face reference.

- AUTO-FIT MODE: Replicate the garment's silhouette, fit, length, and drape exactly.

[OUTFIT MODE]
- Reconstruct the exact uploaded outfit references.
- Preserve pattern, material read, silhouette, drape, and key construction details.
- Do not invent extra garments.

[REFERENCE STRUCTURE]
- BACKGROUND: ${dir.background}
- POSE: ${dir.pose}
- EXPRESSION: ${dir.expression}
- CAMERA / CROP: ${dir.camera_angle_and_crop}
- LIGHTING / EXPOSURE: ${dir.lighting_and_exposure}
- COLOR / TEXTURE: ${dir.color_grading_and_texture}
- OVERALL MOOD: ${dir.overall_mood}

[TECHNICAL EXECUTION]
- Texture: Kodak Portra 400 (Warm skin tones, subtle analog grain, soft cinematic light).
- Replicate the photographic language of the reference.
- Ignore the original reference clothing and accessories.
- Prioritize atmospheric realism over digital sharpness.
- 4:5 composition.
- Output 2K museum quality.
`;

const faceBase64 = readBase64("./public/refrun-face.jpg");
const outfitBase64 = readBase64("./public/refrun-outfit.jpg");

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const imageResp = await ai.models.generateContent({
  model: "gemini-3.1-flash-image-preview",
  contents: [
    {
      role: "user",
      parts: [toInlineImagePart(faceBase64), toInlineImagePart(outfitBase64), { text: prompt }],
    },
  ],
  config: {
    imageConfig: {
      aspectRatio: "4:5",
      imageSize,
    },
    safetySettings,
  },
});

const summary = (imageResp.candidates?.[0]?.content?.parts || []).map((part) => ({
  text: !!part.text,
  inline: !!part.inlineData,
  thought: !!part.thought,
  mime: part.inlineData?.mimeType || null,
  len: part.inlineData?.data?.length || 0,
}));

console.log("IMAGE_SIZE", imageSize);
console.log(JSON.stringify(summary, null, 2));
