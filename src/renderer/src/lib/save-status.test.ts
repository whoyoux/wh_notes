import { describe, expect, it } from "vitest";
import { resolveSaveStatus } from "./save-status";

describe("resolveSaveStatus", () => {
  it("marks the newest successful save as saved", () => {
    expect(resolveSaveStatus(4, 4, true)).toBe("saved");
  });

  it("marks a failed newest save as an error", () => {
    expect(resolveSaveStatus(4, 4, false)).toBe("error");
  });

  it("ignores stale save completions", () => {
    expect(resolveSaveStatus(3, 4, true)).toBeNull();
    expect(resolveSaveStatus(3, 4, false)).toBeNull();
  });
});
