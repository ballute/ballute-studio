"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 업로드 영역에 드래그&드롭 + Ctrl+V 붙여넣기를 붙이는 공용 훅.
// - 이미지 MIME 만 걸러서 기존 onAddFiles(FileList) 콜백에 그대로 흘려보낸다.
// - dragging 상태로 드롭 가능 영역 하이라이트.
// - 붙여넣기는 "마우스가 올라가 있는 영역"으로 들어간다 (클릭/포커스 불필요 —
//   카드를 클릭하면 파일창이 떠버려서 포커스 방식은 못 씀).
//   아무 영역에도 마우스가 없으면, 페이지에 영역이 딱 하나일 때만 거기로 보낸다.

type Zone = { emit: (files: File[]) => void; disabled: boolean };

const zones = new Set<Zone>();
let hoveredZone: Zone | null = null;

export function useDropPaste(
  onFiles: (files: FileList | null) => void,
  disabled = false
) {
  const [dragging, setDragging] = useState(false);
  // dragenter/leave 는 자식 요소를 지날 때마다 발생해서 깊이 카운터로 깜빡임 방지
  const depth = useRef(0);

  const emit = useCallback(
    (incoming: File[]) => {
      const dt = new DataTransfer();
      for (const f of incoming) {
        if (f.type.startsWith("image/")) dt.items.add(f);
      }
      if (dt.files.length) onFiles(dt.files);
    },
    [onFiles]
  );

  // zone 정체성은 고정하고 emit/disabled 만 매 렌더 최신화
  const zoneRef = useRef<Zone>({ emit, disabled });
  zoneRef.current.emit = emit;
  zoneRef.current.disabled = disabled;

  useEffect(() => {
    const zone = zoneRef.current;
    zones.add(zone);

    const onWindowPaste = (e: ClipboardEvent) => {
      // 마우스가 올라간 영역 우선, 없으면 페이지 유일 영역으로
      const target =
        hoveredZone && zones.has(hoveredZone)
          ? hoveredZone
          : zones.size === 1
            ? [...zones][0]
            : null;
      if (target !== zone || zone.disabled) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        zone.emit(files);
      }
    };
    window.addEventListener("paste", onWindowPaste);

    return () => {
      zones.delete(zone);
      if (hoveredZone === zone) hoveredZone = null;
      window.removeEventListener("paste", onWindowPaste);
    };
  }, []);

  const zoneProps = {
    onMouseEnter: () => {
      hoveredZone = zoneRef.current;
    },
    onMouseLeave: () => {
      if (hoveredZone === zoneRef.current) hoveredZone = null;
    },
    onDragEnter: (e: React.DragEvent<HTMLElement>) => {
      if (disabled) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (disabled) return;
      e.preventDefault();
    },
    onDragLeave: () => {
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setDragging(false);
      }
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      if (disabled) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      emit(Array.from(e.dataTransfer.files));
    },
  };

  return { dragging, zoneProps };
}
