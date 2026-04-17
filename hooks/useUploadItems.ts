"use client";

import { useState } from "react";
import { uploadTempAssets, type TempAssetKind } from "@/lib/storage";
import type { UploadItem } from "@/lib/types";

const MAX_SIZE = 10 * 1024 * 1024;

export async function uploadItemsToStorage(
  items: UploadItem[],
  kind: TempAssetKind,
  sessionId: string
): Promise<UploadItem[]> {
  if (!sessionId) {
    throw new Error("세션 생성중입니다. 잠시 후 다시 시도해 주세요.");
  }

  const pending = items.filter((item) => !item.uploaded || !item.storagePath);

  if (!pending.length) {
    return items;
  }

  const uploaded = await uploadTempAssets({
    files: pending.map((item) => item.file),
    kind,
    sessionId,
  });

  let uploadIndex = 0;

  return items.map((item) => {
    if (item.uploaded && item.storagePath) {
      return item;
    }

    const asset = uploaded[uploadIndex++];

    return {
      ...item,
      storagePath: asset.path,
      uploaded: true,
      expiresAt: asset.expiresAt,
    };
  });
}

export function useUploadItems() {
  const [items, setItems] = useState<UploadItem[]>([]);

  const appendFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: UploadItem[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        alert("이미지는 10MB 이하만 업로드할 수 있습니다.");
        return;
      }

      newItems.push({
        file,
        preview: URL.createObjectURL(file),
        caption: "",
      });
    }

    setItems((prev) => [...prev, ...newItems]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setItems([]);
  };

  const updateCaption = (index: number, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, caption: value } : item))
    );
  };

  return { items, setItems, appendFiles, removeItem, clearAll, updateCaption };
}
