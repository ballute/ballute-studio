import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import { generateLookbookWeb } from "@/lib/gemini-web";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const projectName = formData.get("projectName") as string;
    const projectType = formData.get("projectType") as string;

    const face = formData.get("face") as File;
    const outfit = formData.get("outfit") as File;
    const bg = formData.get("bg") as File | null;
    const pose = formData.get("pose") as File | null;

    if (!face || !outfit) {
      return NextResponse.json(
        { error: "필수 이미지 누락" },
        { status: 400 }
      );
    }

    // 👉 base64 변환
    const faceBase64 = await fileToBase64(face);
    const outfitBase64 = await fileToBase64(outfit);
    const bgBase64 = bg ? await fileToBase64(bg) : null;
    const poseBase64 = pose ? await fileToBase64(pose) : null;

    // 👉 프롬프트
    const prompt = `
You are a high-end fashion photographer.

Create a professional fashion lookbook image.

[Project]
Name: ${projectName}
Type: ${projectType}

[Instructions]
- Use the face image as identity
- Use outfit image as exact clothing reference
- Use background if provided
- Apply pose if provided
- Ultra realistic
- Fashion editorial lighting
- Clean composition
- 8K quality
`;

    // 👉 Gemini 호출
    const imageBase64 = await generateLookbookWeb({
      prompt,
      faceBase64,
      outfitBase64,
      bgBase64,
      poseBase64,
    });

    return NextResponse.json({
      success: true,
      image: imageBase64,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "이미지 생성 실패" },
      { status: 500 }
    );
  }
}