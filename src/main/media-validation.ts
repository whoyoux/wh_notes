export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

export const IMAGE_FORMATS = {
  "image/png": {
    extension: "png",
    signature: (bytes: Buffer) =>
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "image/jpeg": {
    extension: "jpg",
    signature: (bytes: Buffer) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  "image/gif": {
    extension: "gif",
    signature: (bytes: Buffer) =>
      bytes.length >= 6 &&
      (bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
        bytes.subarray(0, 6).toString("ascii") === "GIF89a"),
  },
  "image/webp": {
    extension: "webp",
    signature: (bytes: Buffer) =>
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP",
  },
} as const;

export type ImageMimeType = keyof typeof IMAGE_FORMATS;

export function imageMimeTypeFromBytes(bytes: Buffer): ImageMimeType | null {
  for (const [mimeType, format] of Object.entries(IMAGE_FORMATS) as Array<
    [ImageMimeType, (typeof IMAGE_FORMATS)[ImageMimeType]]
  >) {
    if (format.signature(bytes)) return mimeType;
  }
  return null;
}

export function validateImageBytes(
  bytes: Buffer,
  suppliedMimeType?: unknown,
): ImageMimeType {
  if (bytes.length === 0) throw new Error("The image file is empty.");
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new Error("Images can be at most 50 MB.");

  const mimeType = imageMimeTypeFromBytes(bytes);
  if (!mimeType)
    throw new Error("Only PNG, JPEG, GIF, and WebP images are supported.");
  if (
    typeof suppliedMimeType === "string" &&
    suppliedMimeType.length > 0 &&
    suppliedMimeType !== mimeType
  ) {
    throw new Error("The image type does not match its file contents.");
  }
  return mimeType;
}
