import { NextRequest, NextResponse } from "next/server";
import {
  ai,
  defaultImageSize,
  imageGenerateConfig,
  imageGenerateHttpOptions,
  imageGenerationModel,
} from "@/lib/genai-client";
import {
  buildGenAiErrorLog,
  formatGenAiErrorMessage,
  pickGeneratedInlineImage,
  type GenAiResponsePart,
} from "@/lib/genai-response";
import {
  ApiError,
  authenticateApiRequest,
  ensureUserHasPoints,
  spendUserPoints,
} from "@/lib/server-api";

const MODEL_GENERATE_COST = 30;
export const maxDuration = 300;

function detectMimeType(base64?: string) {
  if (!base64) return "image/jpeg";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  return "image/jpeg";
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function buildHairConstraint(hairStyle: string) {
  const raw = normalizeWhitespace(hairStyle);
  const rules: string[] = [];

  if (/[짧단]은?|short/i.test(raw)) {
    rules.push("short haircut");
  }
  if (/웻|wet/i.test(raw)) {
    rules.push("wet textured finish");
  }
  if (/앞머리.*내|fringe|bang/i.test(raw)) {
    rules.push("fringe falling down toward the forehead");
  }
  if (/가르마|center part|side part/i.test(raw)) {
    rules.push("respect the requested parting");
  }
  if (/볼륨|volume/i.test(raw)) {
    rules.push("respect the requested top and side volume");
  }

  if (!rules.length) {
    return raw || "natural hairstyle";
  }

  return `${raw} / ${rules.join(", ")}`;
}

function buildIdentityConstraint(extraDetails: string) {
  const raw = normalizeWhitespace(extraDetails);
  const rules: string[] = [];

  if (/무쌍/.test(raw)) {
    rules.push(
      "monolid eyelids, no visible double-eyelid crease, do not beautify into a double-eyelid look"
    );
  }
  if (/속쌍/.test(raw)) {
    rules.push("subtle inner eyelid fold only, not a deep or dramatic crease");
  }
  if (/큰눈|large eyes?/i.test(raw)) {
    rules.push("large eyes");
  }
  if (/작은 눈|small eyes?/i.test(raw)) {
    rules.push("smaller eye opening");
  }
  if (/매력점|점|beauty mark|mole/i.test(raw)) {
    rules.push("include the requested beauty mark or mole clearly");
  }
  if (/수염 없음|no facial hair/i.test(raw)) {
    rules.push("no facial hair");
  }
  if (/턱선|jawline/i.test(raw)) {
    rules.push("respect the requested jawline character");
  }

  if (!rules.length) {
    return raw;
  }

  return raw ? `${raw} / ${rules.join(", ")}` : rules.join(", ");
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateApiRequest(req);
    await ensureUserHasPoints(user.id, MODEL_GENERATE_COST);

    const body = await req.json();

    const ethnicity = body.ethnicity || "East Asian";
    const gender = body.gender || "Male";
    const age = body.age || "Early 20s";
    const hairStyle = body.hairStyle || "Short black hair";
    const skinTone = body.skinTone || "Light neutral skin tone";
    const eyeColor = body.eyeColor || "Dark brown";
    const mood = body.mood || "Calm and confident";
    const extraDetails = body.extraDetails || "";

    const hairConstraint = buildHairConstraint(hairStyle);
    const identityConstraint = buildIdentityConstraint(extraDetails);

    const prompt = `
Create a single photorealistic "Fixed Face Anchor" collage for a virtual fashion model.

MODEL PROFILE:
- ethnicity: ${ethnicity}
- gender: ${gender}
- age: ${age}
- hair style: ${hairConstraint}
- skin tone: ${skinTone}
- eye color: ${eyeColor}
- mood: ${mood}
- identity-critical details: ${identityConstraint || "none"}

CORE GOAL:
- produce a reliable face anchor for downstream fashion generation
- preserve identity consistency
- preserve the requested hair style strongly
- preserve identity-critical facial traits strongly
- avoid a bland or overly generic casting face

STRICT COMPOSITION RULES:
- output must be a 2-panel collage in one single image
- panel 1: FRONT VIEW
- panel 2: 45-DEGREE VIEW
- do NOT include a side profile panel

STRICT CROP RULES:
- head-and-neck portrait only
- include the full head shape and full hair silhouette
- include the ears clearly when visible from the angle
- crop from slightly above the hair to slightly below the neck
- no torso
- no chest
- no hands
- keep the framing wide enough to show the full hairstyle, ears, and face structure

STRICT HAIR RULES:
- hair has very high priority
- follow the requested hair style literally and specifically
- preserve length, fringe direction, parting, texture, wet/dry feel, volume, and ear coverage according to the description
- do NOT replace the requested hair with a generic clean short haircut or generic center-part hairstyle unless explicitly requested

STRICT IDENTITY FEATURE RULES:
- identity-critical facial traits have very high priority
- if monolid is requested, preserve monolid eyelids clearly
- do NOT convert monolid eyes into deep double eyelids
- if large eyes are requested, keep the eyes large without changing the eyelid type
- if a beauty mark or mole is requested, keep it visible and natural
- do NOT over-beautify, over-symmetrize, or turn the face into a generic idol-style beauty face unless explicitly requested

IDENTITY RULES:
- maintain the same person across both panels
- keep subtle individuality
- allow small natural asymmetry in facial features
- do NOT make the face look mannequin-like, plastic, or overly standardized
- do NOT make the model look like a generic beauty test face

AESTHETIC:
- photorealistic
- neutral studio lighting
- clean light background
- fashion casting reference feel
- natural skin texture
- sharp enough for reference use, but not excessively retouched

OUTPUT RULE:
- return only the face anchor collage image
- no text
- no labels
- no graphic decorations
`;

    const response = await ai.models.generateContent({
      model: imageGenerationModel,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: defaultImageSize,
        },
        httpOptions: imageGenerateHttpOptions,
        ...imageGenerateConfig,
      },
    });

    const responseParts = (response.candidates?.[0]?.content?.parts ??
      []) as GenAiResponsePart[];
    const inlineImage = pickGeneratedInlineImage(responseParts);

    if (inlineImage?.data) {
      const imageBase64 = inlineImage.data;
      const mimeType = inlineImage.mimeType || detectMimeType(imageBase64);

      await spendUserPoints(user.id, MODEL_GENERATE_COST, "MODEL GENERATE");

      return NextResponse.json({
        imageBase64,
        mimeType,
        chargedPoints: MODEL_GENERATE_COST,
      });
    }

    throw new Error("No image was generated.");
  } catch (error) {
    console.error("model-anchor route error:", buildGenAiErrorLog(error));

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: formatGenAiErrorMessage(error, "모델 생성 실패") },
      { status: 500 }
    );
  }
}
