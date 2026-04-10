import { ai, defaultImageSize } from "./genai-client";
import { toInlineImagePart } from "./image-mime";

export const generateLookbookWeb = async ({
  prompt,
  faceBase64,
  outfitBase64,
  bgBase64,
  poseBase64,
}: {
  prompt: string;
  faceBase64: string;
  outfitBase64: string;
  bgBase64: string | null;
  poseBase64: string | null;
}) => {
  const parts: any[] = [
    toInlineImagePart(faceBase64),
    toInlineImagePart(outfitBase64),
  ];

  if (bgBase64) {
    parts.push(toInlineImagePart(bgBase64));
  }

  if (poseBase64) {
    parts.push(toInlineImagePart(poseBase64));
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
    config: {
      imageConfig: {
        aspectRatio: "3:4",
        imageSize: defaultImageSize,
      },
    },
  });

  const imageBase64 =
    response.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData
    )?.inlineData?.data || null;

  if (!imageBase64) {
    throw new Error("생성된 이미지가 없습니다.");
  }

  return imageBase64;
};
