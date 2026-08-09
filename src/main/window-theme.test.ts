import { describe, expect, it } from "vitest";
import { backgroundColorForTheme } from "./window-theme";

describe("backgroundColorForTheme", () => {
  it.each([
    ["light", false, "#ffffff"],
    ["light", true, "#ffffff"],
    ["dark", false, "#0a0a0a"],
    ["dark", true, "#0a0a0a"],
    ["system", false, "#ffffff"],
    ["system", true, "#0a0a0a"],
  ] as const)("uses %s window color when system dark mode is %s", (theme, systemPrefersDark, expected) => {
    expect(backgroundColorForTheme(theme, systemPrefersDark)).toBe(expected);
  });
});
