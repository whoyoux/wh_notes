import { describe, expect, it } from "vitest";
import {
  formatByteSize,
  imageInsertionContent,
  localImageId,
} from "./editor-utils";

describe("editor utilities", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1024 * 1024, "1.0 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatByteSize(bytes)).toBe(expected);
  });

  it("accepts only local image protocol URLs with a UUID", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(localImageId(`notes-media://image/${id}`)).toBe(id);
    expect(localImageId("https://example.com/image.png")).toBeNull();
    expect(localImageId("notes-media://image/not-an-id")).toBeNull();
  });

  it("inserts a paragraph after an image so writing can continue naturally", () => {
    expect(
      imageInsertionContent(
        "notes-media://image/11111111-1111-4111-8111-111111111111",
        "diagram",
      ),
    ).toEqual([
      {
        type: "image",
        attrs: {
          src: "notes-media://image/11111111-1111-4111-8111-111111111111",
          alt: "diagram",
        },
      },
      { type: "paragraph" },
    ]);
  });
});
