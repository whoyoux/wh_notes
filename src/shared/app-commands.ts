export const APP_COMMANDS = {
  "new-note": { accelerator: "CmdOrCtrl+N" },
  "save-note": { accelerator: "CmdOrCtrl+S" },
  "export-note": { accelerator: "CmdOrCtrl+Shift+E" },
} as const;

export type AppCommand = keyof typeof APP_COMMANDS;

export function isAppCommand(value: unknown): value is AppCommand {
  return typeof value === "string" && value in APP_COMMANDS;
}
