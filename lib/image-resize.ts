// Gemini에 보내기 전 base64 이미지를 용도별 max dimension으로 줄임.
// GCS 원본은 그대로 두고, 모델 전송용 base64만 가볍게.
// fit: "inside" + withoutEnlargement → 비율 유지하면서 둘 중 큰 쪽이 max dimension에 맞춤.
// 작은 이미지는 그대로 유지 (확대 안 함).

import sharp from "sharp";

export type ResizeUseCase = "face" | "outfit" | "pose" | "bg-creative" | "bg-extract";

const MAX_DIMENSION_BY_USE: Record<ResizeUseCase, number> = {
  face: 1024,
  outfit: 1600,
  pose: 1024,
  "bg-creative": 1280,
  "bg-extract": 1600,
};

export async function resizeBase64ForGenAI(
  base64: string,
  useCase: ResizeUseCase
): Promise<string> {
  try {
    const maxDim = MAX_DIMENSION_BY_USE[useCase];
    const buffer = Buffer.from(base64, "base64");

    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    if (w <= maxDim && h <= maxDim) {
      return base64;
    }

    const resized = await sharp(buffer)
      .resize(maxDim, maxDim, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return resized.toString("base64");
  } catch {
    return base64;
  }
}

export async function resizeBase64sForGenAI(
  base64s: string[],
  useCase: ResizeUseCase
): Promise<string[]> {
  return Promise.all(base64s.map((b64) => resizeBase64ForGenAI(b64, useCase)));
}
