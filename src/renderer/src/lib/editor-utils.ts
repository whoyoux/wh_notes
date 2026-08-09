export const MAX_EDITOR_IMAGE_BYTES = 50 * 1024 * 1024;
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function formatByteSize(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

export function localImageId(src: unknown) {
  const match =
    typeof src === "string"
      ? /^notes-media:\/\/image\/([a-f0-9-]{36})$/i.exec(src)
      : null;
  return match?.[1] ?? null;
}

export function imageInsertionContent(src: string, alt = "") {
  return [{ type: "image", attrs: { src, alt } }, { type: "paragraph" }];
}
