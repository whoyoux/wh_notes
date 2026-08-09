import type { Theme } from "../shared/types";

const LIGHT_WINDOW_BACKGROUND = "#ffffff";
const DARK_WINDOW_BACKGROUND = "#0a0a0a";

export function backgroundColorForTheme(
  theme: Theme,
  systemPrefersDark: boolean,
) {
  return theme === "dark" || (theme === "system" && systemPrefersDark)
    ? DARK_WINDOW_BACKGROUND
    : LIGHT_WINDOW_BACKGROUND;
}
