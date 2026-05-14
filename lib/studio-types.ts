// 클라이언트·서버 양쪽이 안전하게 import 할 수 있는 타입/상수 모음.
// 실제 Gemini 호출 로직(서버 전용)은 gemini-studio.ts 에 있음 — 거기는 클라이언트에서 import하면 안 됨.

export type StudioShot =
  | "front"
  | "45deg"
  | "back"
  | "freepose"
  | "upperbody"
  | "lowerbody";

export type OutputRatio = "3:4" | "1:1" | "2:3" | "9:16" | "4:3";

export type Gender = "male" | "female";

export type OutfitTag = "front" | "fabric" | "back" | "detail";

export const ASPECT_RATIO_OPTIONS: { value: OutputRatio; label: string }[] = [
  { value: "3:4",  label: "3:4 (세로 표준)" },
  { value: "2:3",  label: "2:3 (세로 35mm)" },
  { value: "9:16", label: "9:16 (세로 와이드)" },
  { value: "1:1",  label: "1:1 (정사각)" },
  { value: "4:3",  label: "4:3 (가로)" },
];

export const DEFAULT_ASPECT_RATIO: OutputRatio = "3:4";
