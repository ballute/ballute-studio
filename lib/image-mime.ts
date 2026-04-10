export function detectMimeTypeFromBase64(
  base64?: string,
  fallback = "image/jpeg"
) {
  if (!base64) return fallback;
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return fallback;
}

export function toInlineImagePart(base64: string, fallback?: string) {
  return {
    inlineData: {
      data: base64,
      mimeType: detectMimeTypeFromBase64(base64, fallback),
    },
  };
}
