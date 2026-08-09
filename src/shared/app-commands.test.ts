import { describe, expect, it } from "vitest";
import { APP_COMMANDS, isAppCommand } from "./app-commands";

describe("application command registry", () => {
  it("keeps native menu accelerators in one typed registry", () => {
    expect(APP_COMMANDS["new-note"].accelerator).toBe("CmdOrCtrl+N");
    expect(APP_COMMANDS["save-note"].accelerator).toBe("CmdOrCtrl+S");
    expect(APP_COMMANDS["export-note"].accelerator).toBe("CmdOrCtrl+Shift+E");
  });

  it("accepts only explicitly exposed command identifiers", () => {
    expect(isAppCommand("new-note")).toBe(true);
    expect(isAppCommand("save-note")).toBe(true);
    expect(isAppCommand("export-note")).toBe(true);
    expect(isAppCommand("delete-note")).toBe(false);
    expect(isAppCommand({ command: "new-note" })).toBe(false);
  });
});
