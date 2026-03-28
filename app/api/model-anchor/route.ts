import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function POST() {
  try {
    const prompt = `
Create a single high-resolution "Fixed Face Anchor" collage for a virtual fashion model.

STRICT COMPOSITION RULES:
- output must be a 3-panel collage in one single image
- panel 1: FRONT VIEW
- panel 2: 45-DEGREE VIEW
- panel 3: SIDE PROFILE

STRICT CROP RULES:
- head-only portrait
- crop from top of head to base of neck
- no shoulders below clavicle
- no torso
- no chest
- no hands
- face occupies about 80% of each panel
- keep all three panels tightly framed around the face and neck only

AESTHETIC:
- photorealistic
- beauty editorial headshot
- neutral studio lighting
- white seamless background
- ultra clean skin detail
- premium fashion casting reference
- consistent identity across all three views

OUTPUT RULE:
- return only the face anchor collage image
- no text, no labels, no graphic decorations
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        return NextResponse.json({
          image: `data:image/png;base64,${part.inlineData.data}`,
        });
      }
    }

    throw new Error("No image was generated.");
  } catch (error) {
    console.error("model-anchor route error:", error);
    return NextResponse.json(
      { error: "모델 생성 실패" },
      { status: 500 }
    );
  }
}