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
  const parts: PromptPart[] = [
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
    model: imageGenerationModel,
    contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
    config: {
      imageConfig: {
        aspectRatio: "3:4",
        imageSize: defaultImageSize,
      },
      httpOptions: imageGenerateHttpOptions,
      ...imageGenerateConfig,
    },
  });

  const responseParts = (response.candidates?.[0]?.content?.parts ??
    []) as GenAiResponsePart[];
  const imageBase64 = pickGeneratedInlineImage(responseParts)?.data || null;

  if (!imageBase64) {
    throw new Error("생성된 이미지가 없습니다.");
  }

  return imageBase64;
};
