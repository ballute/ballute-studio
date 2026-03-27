import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

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
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: faceBase64,
      },
    },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: outfitBase64,
      },
    },
  ];

  if (bgBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: bgBase64,
      },
    });
  }

  if (poseBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: poseBase64,
      },
    });
  }

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