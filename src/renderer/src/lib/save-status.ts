export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function resolveSaveStatus(
  completedRequestId: number,
  latestRequestId: number,
  didSave: boolean,
): SaveStatus | null {
  if (completedRequestId !== latestRequestId) return null;
  return didSave ? "saved" : "error";
}
