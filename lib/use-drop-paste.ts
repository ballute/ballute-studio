"use client";

import { useCallback, useRef, useState } from "react";

// 업로드 영역에 드래그&드롭 + (영역 클릭 후) Ctrl+V 붙여넣기를 붙이는 공용 훅.
// - 이미지 MIME 만 걸러서 기존 onAddFiles(FileList) 콜백에 그대로 흘려보낸다.
// - dragging 상태로 드롭 가능 영역 하이라이트.
// - paste 는 포커스된 요소에서 발생하므로 zoneProps 에 tabIndex 를 넣어
//   영역을 클릭하면 붙여넣기가 그 섹션으로 들어가게 한다 (섹션 여러 개 공존 대응).
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

  const zoneProps = {
    tabIndex: 0,
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
    onPaste: (e: React.ClipboardEvent<HTMLElement>) => {
      if (disabled) return;
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        e.preventDefault();
        emit(files);
      }
    },
  };

  return { dragging, zoneProps };
}
