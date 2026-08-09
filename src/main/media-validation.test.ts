import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  imageMimeTypeFromBytes,
  validateImageBytes,
} from "./media-validation";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const gif = Buffer.from("GIF89a", "ascii");
const webp = Buffer.from("RIFF1234WEBP", "ascii");

describe("image validation", () => {
  it.each([
    [png, "image/png"],
    [jpeg, "image/jpeg"],
    [gif, "image/gif"],
    [webp, "image/webp"],
  ] as const)("recognizes %s bytes as %s", (bytes, mimeType) => {
    expect(imageMimeTypeFromBytes(bytes)).toBe(mimeType);
    expect(validateImageBytes(bytes, mimeType)).toBe(mimeType);
  });

  it("rejects unsupported and empty data", () => {
    expect(() => validateImageBytes(Buffer.alloc(0))).toThrow("empty");
    expect(() => validateImageBytes(Buffer.from("not an image"))).toThrow(
      "Only PNG",
    );
  });

  it("rejects a declared MIME type that does not match the file signature", () => {
    expect(() => validateImageBytes(png, "image/jpeg")).toThrow(
      "does not match",
    );
  });

  it("rejects files over the 50 MB local-storage limit before writing", () => {
    expect(() => validateImageBytes(Buffer.alloc(MAX_IMAGE_BYTES + 1))).toThrow(
      "50 MB",
    );
  });
});
