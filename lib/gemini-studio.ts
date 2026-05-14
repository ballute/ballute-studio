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

// 타입/상수는 클라이언트도 쓸 수 있도록 lib/studio-types.ts 에 모아둠.
// 이 모듈은 genai-client 를 import 하므로 서버 전용 — 클라이언트에서 직접 import 금지.
export type {
  StudioShot,
  OutputRatio,
  Gender,
  OutfitTag,
} from "./studio-types";

import type {
  StudioShot,
  OutputRatio,
  Gender,
  OutfitTag,
} from "./studio-types";

// ─── Professional model standard specs ───────────────────────────────────────
// 출력 모델은 항상 이 스펙으로 고정. 착샷 스펙(sourceSpecs)과 비교해서 핏 보정만 함.

const PROFESSIONAL_STANDARDS: Record<
  Gender,
  { h: number; w: number; description: string }
> = {
  male: {
    h: 184,
    w: 65,
    description:
      "High-fashion professional male model. Tall (184cm), lean (65kg). Long limbs, elongated torso, flat stomach, narrow waist. Broad but angular lean shoulders — the classic 'human hanger' physique built to showcase garment drape and silhouette.",
  },
  female: {
    h: 172,
    w: 50,
    description:
      "Professional editorial female model. 172cm tall, very lean (50kg). Long slender neck, narrow refined shoulders, extremely long and thin limbs. Graceful high-fashion bone structure built for editorial work.",
  },
};

// ─── Pose descriptions per shot ──────────────────────────────────────────────
// 컨템포러리 톤 하나로 통일. 브랜드 카테고리 분기는 제거함.

const poseByShot: Record<StudioShot, string> = {
  front:
    "Relaxed natural stance, arms hanging loosely at sides with a subtle bend at the elbows, slight weight shift to one hip. Sleeves partially cover the wrists (1/3 of the hand), shoulder line dropping exactly as intended in the oversized pattern. Effortless oversized silhouette without stiffness.",
  "45deg":
    "Three-quarter editorial angle, body slightly turned to reveal shoulder volume and side seam. One arm at the side, the other slightly forward. Shows garment depth and layered oversized drape.",
  back:
    "Back view, natural relaxed stance, arms at sides, feet hip-width apart. Full back panel visible — construction details, hem fall, back-seam and patch details with absolute clarity.",
  freepose:
    "Unposed editorial moment — caught mid-thought, weight on one leg, the other relaxed. Hands fall naturally; one might brush hair or hover near pocket. Quiet, contemplative tension.",
  upperbody:
    "Relaxed natural stance, arms hanging loosely at sides with a subtle bend at the elbows, slight weight shift to one hip. Sleeves partially cover the wrists (1/3 of the hand), shoulder line dropping exactly as intended in the oversized pattern. Effortless oversized silhouette without stiffness.",
  lowerbody:
    "Relaxed natural stance, arms hanging loosely at sides with a subtle bend at the elbows, slight weight shift to one hip. Pant hem breaks naturally over the shoe, shoulder line dropping exactly as intended in the oversized pattern. Effortless oversized silhouette without stiffness.",
};

// 디테일컷에서 사용자가 명시적으로 "프리포즈"를 켰을 때만 적용되는 액티브 손동작 포즈.
// 라벨이 비어있고 detailFreepose=false면 위의 정자세 디폴트가 사용됨.
const detailActivePoseByShot: Record<"upperbody" | "lowerbody", string> = {
  upperbody:
    "Captured in a small modeling moment: shoulder lightly rolled, ONE hand actively engaged with the garment — fingers lifting a sleeve cuff edge, gathering a pinch of fabric at the hem, or settling against the collar. Garment breathes — neckline gaping a hair, sleeve drape activated. A worn garment in micro-motion, never a static specimen.",
  lowerbody:
    "A working stance: weight planted on one leg, the other slightly forward at an angle that breaks the hem naturally over the shoe. ONE hand REQUIRED in active garment engagement — thumb hooked into the waistband with palm flat against hip, OR fingers physically lifting/touching the cargo pocket flap, OR knuckles resting inside a pocket with the entry slightly opened. Hand is NEVER hanging straight down at the side. Pocket gapes, washing catches light, full hem visible breaking over the full shoe.",
};

// ─── Framing per shot ─────────────────────────────────────────────────────────

// 비율 명시는 빼두고, 실제 aspectRatio는 별도로 주입 (사용자가 비율 선택 가능하기 때문)
const framingByShot: Record<StudioShot, string> = {
  front:
    "Full body view from chin/jawline to feet. The top of the frame sits just at the lower jaw — chin may be barely visible but NO face, NO eyes, NO nose. Feet and full hem visible at bottom.",
  "45deg":
    "Full body three-quarter angle, chin/jawline to feet. Top of frame at jaw level — no face visible. Full hem and shoes visible.",
  back:
    "Full body back view, neck base to feet. No head or face. Complete back construction, full hem and feet visible.",
  freepose:
    "Full body view, chin/jawline to feet. Top of frame at jaw level — no face. Full hem and shoes visible. Camera angle and crop may shift slightly to follow the natural posture.",
  upperbody:
    "Upper-body view from the waist up to the neck base, no head. The body sits centered in the frame, shoulders and chest filling the composition naturally. Same straight-on framing as a full-body lookbook shot, just cropped closer.",
  lowerbody:
    "Lower-body view including the FULL leg from waist down through the entire pant hem and the FULL shoes — pull the camera back if needed to fit. NO mid-thigh crop, NO knee-cap crop. The hem-over-shoe break must be visible. No torso above the waist. The body sits centered in the frame. Same straight-on framing as a full-body lookbook shot, just cropped closer.",
};

// ─── Detail-cut intent block (upperbody / lowerbody) ─────────────────────────
// 디테일 컷이 평면적인 "잘린 풀바디"가 아니라, 사진가가 의도해서 들어간 매크로 촬영처럼
// 보이도록 하기 위한 강제 지시. 일반 풀바디 샷에는 들어가지 않음.

// 디테일컷의 카메라/구도 의도 — 카메라 거리/렌즈만 명시. lighting은 풀바디와 동일하게 (별도 지시 없음).
const DETAIL_CUT_INTENT_BASE = `
[DETAIL CUT — CAMERA INTENT]
- The camera has physically moved in close — intimate working distance, 50–85mm prime macro feel. Slight, natural shallow-DOF falloff at the extreme edges; sharp on the garment surface.

[ANTI-AI-TELL CHECKLIST — APPLIES TO DETAIL CUTS]
- Skin reads with natural micro-texture: subtle pore variation, slight warmth/coolness in undertone, faint vein hint at the wrist. Avoid airbrushed plastic uniformity.
- Fabric reads as worn cloth: real-world creases, tiny wrinkles where the body bends.
- Photographic grain: subtle film grain present across the frame. Edges are sharp but not CGI-clean.
`;

// 액티브 손동작 — 사용자가 "프리포즈" 토글을 켰을 때만 추가됨.
const DETAIL_CUT_HAND_ENGAGEMENT = `
[DETAIL CUT — HAND ENGAGEMENT MANDATE]
- The model is still performing for camera: subtle micro-motions activate the garment (a hand brushing the hem, weight shifting to break the fabric, shoulder rolling to reveal a seam, fingers grazing a pocket entry). Never a frozen specimen.
- If a hand is in the frame, it MUST physically engage with the garment. Pick ONE of:
  * Fingers actively touching/lifting the pocket flap edge.
  * Thumb hooked into the waistband, palm flat against the hip.
  * Fingers gathering a small pinch of fabric at the hem or seam.
  * Hand resting in a pocket with knuckles visible at the pocket entry.
  * Fingers grazing a sleeve cuff or collar edge.
- A hand hanging straight down at the side, fingers pointed at the floor, NOT touching anything — this is the #1 AI-tell and is FORBIDDEN in this active detail cut.
- Hand anatomy must be precise: 5 clearly defined fingers per hand, natural relaxed curl, visible knuckle definition, no plastic-doll smoothness.
- Pose reads as candid: weight asymmetry visible, breath in the chest implied, no held-statue stillness.
`;

// 디폴트 — 디테일컷도 풀바디 샷과 똑같은 톤/포즈. 디테일컷 전용 추가 지시 없음.
// 단, 만약 풀바디로 찍었다면 동일한 프레임이 그대로 잘려 나오는 식.
const DETAIL_CUT_QUIET_PHOTOGRAPHY = `
[DETAIL CUT — IDENTICAL POSE TO FULL-BODY SHOT]
- The model holds the EXACT same relaxed full-body lookbook pose. The only difference between this shot and a full-body shot is the camera moved closer — the pose, body language, and stance are unchanged.
- If you cropped this image wider, it would look identical to a full-body lookbook frame. There is no "detail-shot pose"; there is only a closer crop.
`;

// ─── Aspect ratios ────────────────────────────────────────────────────────────
// 디폴트는 모든 샷이 3:4. 사용자가 generateStudioShotWeb에 aspectRatio를 넘기면
// 그 값으로 일괄 오버라이드.

export const aspectRatioByShot: Record<StudioShot, OutputRatio> = {
  front:     "3:4",
  "45deg":   "3:4",
  back:      "3:4",
  freepose:  "3:4",
  upperbody: "3:4",
  lowerbody: "3:4",
};

// ─── Fit calibration ──────────────────────────────────────────────────────────

// FIT CALIBRATION — 4단계 bucket으로 길이/너비 차이를 세분화.
// 핵심 패러다임: 옷의 fabric은 절대 변형 안 됨. cuff/hem은 옷에 고정된 점에 머물고,
// 몸이 그 점을 넘거나 못 채울 뿐. AI는 카메라이지 스타일리스트가 아님.

type FitBucket = "negligible" | "slight" | "noticeable" | "significant";

function classifyLengthDiff(absDiff: number): FitBucket {
  if (absDiff <= 3) return "negligible";
  if (absDiff <= 7) return "slight";
  if (absDiff <= 12) return "noticeable";
  return "significant";
}

function classifyWidthDiff(absDiff: number): FitBucket {
  if (absDiff <= 5) return "negligible";
  if (absDiff <= 10) return "slight";
  if (absDiff <= 16) return "noticeable";
  return "significant";
}

// target이 wardrobe 모델보다 더 큰 경우 (taller) — 손목/헴이 옷의 끝을 넘어서 노출.
const lengthEffectsTaller: Record<FitBucket, string> = {
  negligible:
    "The wrist and hem sit at the same positions on the body as in the wardrobe reference — visually unchanged.",
  slight:
    "The wrist barely sits past the cuff; the hem barely sits higher on the body. Subtle, easily missed.",
  noticeable:
    "The wrist clearly sits past the cuff with a small amount of bare forearm visible; the hem clearly sits higher on the body. Visible but not exaggerated.",
  significant:
    "The wrist distinctly sits past the cuff with bare forearm clearly exposed; the hem distinctly higher on the body. The garment reads as small for this taller body — but the garment itself is unchanged.",
};

// target이 wardrobe 모델보다 더 작은 경우 (shorter) — cuff가 손목을 덮고 헴이 더 내려옴.
const lengthEffectsShorter: Record<FitBucket, string> = {
  negligible:
    "The wrist and hem sit at the same positions on the body as in the wardrobe reference — visually unchanged.",
  slight:
    "The cuff barely drops past the wrist; the hem barely falls lower on the body.",
  noticeable:
    "The cuff clearly drops past the wrist, covering a small portion of the hand; the hem clearly falls lower on the body.",
  significant:
    "The cuff distinctly drops past the wrist, covering a noticeable portion of the hand; the hem distinctly falls lower. The garment reads as oversized for this shorter body — but the garment itself is unchanged.",
};

// target이 더 무거움 (heavier) — 옷이 몸에 더 가까이, 드레이프 줄어듦.
const widthEffectsHeavier: Record<FitBucket, string> = {
  negligible:
    "The drape and silhouette read identical to the wardrobe reference.",
  slight:
    "Faintly less drape; the garment sits slightly closer to the body.",
  noticeable:
    "Clearly less drape; the garment sits noticeably closer to the body, fabric resting tighter against the torso.",
  significant:
    "Distinctly less drape; the garment sits markedly closer to the body — pronounced fitted read, minimal excess fabric.",
};

// target이 더 마름 (lighter) — 옷이 헐렁, 드레이프 늘어남.
const widthEffectsLighter: Record<FitBucket, string> = {
  negligible:
    "The drape and silhouette read identical to the wardrobe reference.",
  slight:
    "Faintly more drape; the garment hangs slightly looser on the body.",
  noticeable:
    "Clearly more drape; the garment hangs noticeably looser, with visible excess fabric.",
  significant:
    "Distinctly more drape; the garment hangs markedly looser with deep excess fabric — pronounced oversized read.",
};

function buildFitPromptContext(gender: Gender, sourceSpecs?: string): string {
  const target = PROFESSIONAL_STANDARDS[gender];

  function parseSpec(raw: string): { h: number; w: number } | null {
    const m = raw.match(/(\d+)[^\d]+(\d+)/);
    if (!m) return null;
    return { h: parseInt(m[1], 10), w: parseInt(m[2], 10) };
  }

  const source = sourceSpecs ? parseSpec(sourceSpecs) : null;

  if (!source) {
    return `
- TARGET MODEL:
  * ${target.description}
  * Photograph this professional model wearing the garment naturally. The garment's actual silhouette, sleeve length, hem length, and proportions are preserved exactly as in the wardrobe reference — what changes is only how that real garment falls and drapes on this specific body.
`;
  }

  const hDiff = target.h - source.h;
  const wDiff = target.w - source.w;
  const lengthBucket = classifyLengthDiff(Math.abs(hDiff));
  const widthBucket = classifyWidthDiff(Math.abs(wDiff));
  const taller = hDiff > 0;
  const heavier = wDiff > 0;

  const lengthEffect = taller
    ? lengthEffectsTaller[lengthBucket]
    : lengthEffectsShorter[lengthBucket];
  const widthEffect = heavier
    ? widthEffectsHeavier[widthBucket]
    : widthEffectsLighter[widthBucket];

  return `
- FIT CALIBRATION (PHYSICAL GARMENT, NEW BODY):
  * CORE RULE: Garment dimensions are FIXED. The cuff and hem positions on the fabric NEVER change. The body simply sits at a different position relative to those fixed garment edges. AI is a camera, NOT a stylist.
  * TARGET MODEL: ${target.description}
  * BODY DIFFERENCE: wardrobe reference body ${source.h}cm/${source.w}kg → target body ${target.h}cm/${target.w}kg.
  * LENGTH EFFECT — bucket [${lengthBucket}]: ${lengthEffect}
  * WIDTH EFFECT — bucket [${widthBucket}]: ${widthEffect}
  * STRICTLY FORBIDDEN: rolling sleeves up, pushing sleeves up, folding sleeves, trimming hems, taking in or letting out the garment. The garment's silhouette is preserved 100%.
`;
}

// ─── Main generation function ─────────────────────────────────────────────────

// 샷별 태그 우선순위 — 가장 관련있는 레퍼런스가 parts 배열 앞으로
const TAG_PRIORITY: Record<StudioShot, OutfitTag[]> = {
  front:     ["front", "fabric", "detail", "back"],
  "45deg":   ["front", "fabric", "detail", "back"],
  back:      ["back", "fabric", "detail", "front"],
  freepose:  ["front", "fabric", "detail", "back"],
  upperbody: ["fabric", "detail", "front", "back"],
  lowerbody: ["fabric", "detail", "front", "back"],
};

const TAG_LABEL: Record<OutfitTag, string> = {
  front:  "Front view",
  fabric: "Fabric / texture close-up",
  back:   "Back view",
  detail: "Construction detail",
};

export async function generateStudioShotWeb(args: {
  modelBase64: string;
  outfitBase64s: string[];
  outfitTags?: OutfitTag[];
  shot: StudioShot;
  gender: Gender;
  sourceSpecs?: string;
  label?: string;
  poseRefBase64?: string;
  aspectRatio?: OutputRatio;
  detailFreepose?: boolean;
}): Promise<{ base64: string }> {
  const {
    modelBase64,
    outfitBase64s,
    outfitTags = [],
    shot,
    gender,
    sourceSpecs,
    label,
    poseRefBase64,
    aspectRatio: aspectRatioOverride,
    detailFreepose = false,
  } = args;

  if (!outfitBase64s.length) {
    throw new Error("착샷 이미지가 없습니다.");
  }

  // 샷에 맞게 레퍼런스 우선순위 정렬
  const priority = TAG_PRIORITY[shot];
  const indexed = outfitBase64s.map((b64, i) => ({ b64, tag: outfitTags[i] ?? "front" }));
  indexed.sort((a, b) => {
    const ai = priority.indexOf(a.tag);
    const bi = priority.indexOf(b.tag);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // 이미지 뒤에 태그 캡션 주입 (Mix 방식)
  const outfitParts = indexed.flatMap(({ b64, tag }, i) => [
    toInlineImagePart(b64),
    { text: `[Wardrobe Reference ${i + 1} of ${indexed.length}: ${TAG_LABEL[tag]}]` },
  ]);

  // 프리포즈 + 포즈 레퍼런스 사진 처리
  const trimmedLabel = label?.trim();
  const hasPoseRef = shot === "freepose" && !!poseRefBase64;

  const poseRefParts = hasPoseRef
    ? [
        toInlineImagePart(poseRefBase64!),
        {
          text: `[POSE REFERENCE — BODY POSTURE ONLY]
⚠️ CONTAMINATION BLOCK: This image is used STRICTLY for body posture (limb angles, weight distribution, head tilt, hand position). DO NOT take from this image:
- Face / facial features / facial expression
- Clothing, accessories, shoes
- Background, environment, lighting
- Skin tone, hair, age, gender presentation
Treat the person in this image as a wireframe skeleton — extract only the pose, then drop the rest.`,
        },
      ]
    : [];

  const parts = [
    { text: `[BODY SCALE REFERENCE — STRICT USE]
This image shows a real person to give you ONLY body scale and proportions:
- Limb length ratios, torso length, shoulder width, head-to-body ratio, camera distance, crop logic.

⚠️ CONTAMINATION BLOCK — what to ignore from this image:
- Whatever clothing is on this body (sleeves, t-shirt, shorts, anything) is INVISIBLE to you. The reference body is effectively naked for the purpose of clothing decisions.
- DO NOT carry over the reference's sleeve length to the final shot.
- DO NOT carry over the reference's hem length, neckline, pant length, or any garment edge.
- The reference body might be wearing short sleeves; the final shot might be long sleeves. The reference body might be wearing shorts; the final shot might be long pants. The clothing in the reference body has ZERO influence on the final clothing.

The WARDROBE images (next) are the ONLY source of clothing. Sleeve length, hem length, neckline, color, pattern — ALL of it comes from WARDROBE only.` },
    toInlineImagePart(modelBase64),
    { text: `[WARDROBE (${indexed.length} reference image${indexed.length > 1 ? "s" : ""}) — These photographs show the actual physical garment that the model is wearing in the shot. Read every detail directly from these images: sleeve length and cuff position (long sleeves stay long, NEVER rolled or pushed up), hem length, collar / neckline, color, pattern direction (vertical stays vertical), fabric texture, shoes, socks, accessories. Wardrobe Reference 1 is the primary reference for this shot. The garment is a real worn cloth — gravity, body warmth, breath, and natural light all act on it.]` },
    ...outfitParts,
    ...poseRefParts,
  ];

  const isDetailCut = shot === "upperbody" || shot === "lowerbody";

  // 포즈 텍스트 분기:
  // - freepose 샷: 라벨/레퍼런스 우선
  // - 디테일컷 + detailFreepose ON: 액티브 손동작 포즈 사용 (옷 잡기 등)
  // - 디테일컷 + detailFreepose OFF: 정자세 (디폴트)
  // - 그 외: 샷별 디폴트
  const defaultPose = poseByShot[shot];
  let poseText: string;
  if (shot === "freepose") {
    if (hasPoseRef && trimmedLabel) {
      poseText = `Match the body posture from the POSE REFERENCE image (limb angles, weight distribution, head tilt, hand position) — BUT layer in this user instruction on top: "${trimmedLabel}". Where they conflict, the user instruction wins.`;
    } else if (hasPoseRef) {
      poseText = `Match the body posture from the POSE REFERENCE image precisely (limb angles, weight distribution, head tilt, hand position). Pose only — no other elements from that image.`;
    } else if (trimmedLabel) {
      poseText = `User-directed pose: "${trimmedLabel}". Translate this instruction into a natural, candid editorial posture on the standard model body. Avoid stiffness and avoid mannequin rigidity.`;
    } else {
      poseText = defaultPose;
    }
  } else if (isDetailCut && detailFreepose) {
    poseText = detailActivePoseByShot[shot as "upperbody" | "lowerbody"];
  } else {
    poseText = defaultPose;
  }

  // 디테일컷 INTENT 블록 — 손 모드는 detailFreepose에 따라 결정 (라벨이 있어도 라벨이 우선이므로 디폴트는 정자세 유지)
  const detailIntentBlock = isDetailCut
    ? `${DETAIL_CUT_INTENT_BASE}${detailFreepose ? DETAIL_CUT_HAND_ENGAGEMENT : DETAIL_CUT_QUIET_PHOTOGRAPHY}`
    : "";

  // 라벨이 디테일 컷에 붙은 경우 — 프레이밍/구도 보정 지시로 사용
  const framingExtra =
    isDetailCut && trimmedLabel
      ? `\n- USER FRAMING INSTRUCTION: "${trimmedLabel}". Apply this as an additional framing/composition directive on top of the base crop above. Adjust angle, zoom, or focus area to honor this instruction without breaking the base aspect ratio.`
      : "";

  // 디테일 컷일 때만 헤드 트리밍 멘트 제거 (어차피 머리/얼굴은 프레임 밖)
  const headTrimNote = isDetailCut
    ? ""
    : "\n- Standard contemporary lookbook editorial crop: natural professional framing. The image ends just below the jaw — not a wound, not a severed neck. Simply framed out.";

  // 라이팅은 풀바디/디테일 모두 동일하게 — balanced softbox.
  // (이전엔 디테일컷에 side-rake 오버라이드가 있었으나 톤 통일을 위해 제거)

  const framing = framingByShot[shot];
  const aspectRatio = aspectRatioOverride ?? aspectRatioByShot[shot];
  const fitContext = buildFitPromptContext(gender, sourceSpecs);

  const prompt = `
[Studio System: Photographer Mode Directive]

You are a photographer. The model is already wearing the clothes and standing in front of the camera. Your job is to take the shot — not to composite, not to dress a mannequin. One complete photograph.
${detailIntentBlock}

[1. BODY SCALE REFERENCE]
- The BODY SCALE REFERENCE image is for body proportions and camera framing logic only. Read: limb length ratios, torso length, shoulder width, overall silhouette, camera distance, crop logic.
- The clothing visible on the reference body is INVISIBLE in the final shot. It does not exist. It must not bleed into sleeve length, hem length, neckline, or any garment detail. The wardrobe images are the SOLE source of clothing.

[2. LEMAIRE AESTHETIC & TENSION]
- The model holds a Lemaire-style effortless, nonchalant stance — relaxed, never stiff.
- ${poseText}
- Body weight released naturally. Allow 5–10% subtle weight shift. No attention stance. No mannequin rigidity.
- Gravity acts fully on the fabric — material hangs and falls as it would in real life.

[2A. NATURAL MOTION — MANDATORY ON EVERY SHOT]
- The model is a LIVING photographic subject mid-motion. Never frozen, never a held statue waiting for the shutter.
- A micro-motion is ALWAYS present, regardless of shot type:
  * Breath fills and releases the chest.
  * Weight micro-shifts between the feet (one heel a millimeter higher, ankle relaxed).
  * Fingertips graze a hem, brush a pocket entry, or rest in a relaxed natural curl — never poker-straight at the sides.
  * The head carries a 2–5° natural off-axis tilt or gentle rotation. Never perfectly squared to the lens.
  * Shoulders subtly drop on one side, lift on the other. Asymmetry is the rule.
- The garment responds in real time to this motion — hem breaks where weight shifts, sleeves drape with arm relaxation, neckline gapes a hair where the body breathes, fabric across the back catches a small fold from the shoulder roll.
- Read test: this image must feel like one frame from a continuous shoot — the model was just moving and will keep moving. If it reads as "model held a pose for the camera," the shot has failed.

[3. INTEGRATED RENDERING]
- The clothes are worn by the model, not placed on top of them.
- Light and shadow fall naturally across the fabric surface. Ambient occlusion exists at every skin-to-fabric boundary.
- At the neck opening, wrist cuffs, and waistband — realistic fabric drape and natural micro-wrinkles occur wherever fabric wraps the body.
- One complete photograph. Zero trace of compositing.

[4. PATTERN INTEGRITY]
- Capture the garment's original pattern and details as a camera would — do not reinterpret or reconstruct.
- Vertical stripes stay vertical. Horizontal stripes stay horizontal. Spacing, thickness, and color preserved 100%.
- No forced shape-fitting. The physical identity of the original garment is the highest priority.
- Checks, prints, logos, stitching — all construction details preserved.

[FIT CALIBRATION]
${fitContext}

[FRAMING & CROP]
- Output aspect ratio: ${aspectRatio}. Compose the frame for this exact ratio — do not crop in post.
- ${framing}${framingExtra}${headTrimNote}

[WARDROBE SOURCE RULE]
- Take from WARDROBE image: top garment, bottom garment, shoes, socks, all accessories — every color, texture, pattern, fabric type, silhouette, and detail.
- Ignore from WARDROBE image: the wearer's face, head, skin tone, body shape, background, room, walls, floor, and lighting setup.

[STUDIO ENVIRONMENT]
- Seamless paper background: Pantone Cool Gray 2 C — RGB(210, 210, 208). Light, cool-toned, neutral gray. Not dark, not white, not blue.
- Subtle soft floor reflection at the feet (full body shots only).
- No props, no furniture, pure studio.

[LIGHTING]
- Balanced, even studio lighting. No harsh shadows on the garment.
- Large softboxes on both sides with matched intensity. Uniform illumination across the entire garment surface.
- Patterns, stripes, and fabric texture must read clearly without shadow distortion.
- Slightly underexposed overall — cool, moody tone.

[PHOTOGRAPHIC QUALITY]
- High-end Korean contemporary brand lookbook.
- Sharp focus on garment, fabric texture, and construction.
- ${defaultImageSize} resolution — museum print quality.
- Authentic analog photographic feel, not CGI.
`;

  const imageBase64 = await withGenAiRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: imageGenerationModel,
        contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
        config: {
          imageConfig: {
            aspectRatio,
            imageSize: defaultImageSize,
          },
          httpOptions: imageGenerateHttpOptions,
          ...imageGenerateConfig,
          safetySettings,
        },
      });

      const responseParts = (response.candidates?.[0]?.content?.parts ??
        []) as GenAiResponsePart[];
      const generatedImage =
        pickGeneratedInlineImage(responseParts)?.data || null;

      if (!generatedImage) {
        throw new EmptyGenAiImageError(`STUDIO_${shot.toUpperCase()}`);
      }

      return generatedImage;
    },
    { label: `STUDIO_${shot.toUpperCase()}` }
  );

  return { base64: imageBase64 };
}
