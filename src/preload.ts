import { contextBridge, ipcRenderer } from "electron";
import { isAppCommand } from "./shared/app-commands";
import type { ArchiveExportOptions, ImportImagePayload, Locale, NoteDraft, NotesApi, Theme } from "./shared/types";

const notesApi: NotesApi = {
  list: () => ipcRenderer.invoke("notes:list"),
  get: (id) => ipcRenderer.invoke("notes:get", id),
  create: () => ipcRenderer.invoke("notes:create"),
  save: (draft: NoteDraft) => ipcRenderer.invoke("notes:save", draft),
  remove: (id) => ipcRenderer.invoke("notes:remove", id),
  getTheme: () => ipcRenderer.invoke("preferences:get-theme"),
  setTheme: (theme: Theme) => ipcRenderer.invoke("preferences:set-theme", theme),
  getLocale: () => ipcRenderer.invoke("preferences:get-locale"),
  setLocale: (locale: Locale) => ipcRenderer.invoke("preferences:set-locale", locale),
  importImage: (payload: ImportImagePayload) => ipcRenderer.invoke("media:import-image", payload),
  pickImage: () => ipcRenderer.invoke("media:pick-image"),
  copyImage: (id) => ipcRenderer.invoke("media:copy-image", id),
  exportImage: (id) => ipcRenderer.invoke("media:export-image", id),
  getImageDetails: (id) => ipcRenderer.invoke("media:get-image-details", id),
  exportArchive: (options: ArchiveExportOptions) => ipcRenderer.invoke("archive:export", options),
  importArchive: (password) => ipcRenderer.invoke("archive:import", password),
  onAppCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: unknown) => {
      if (isAppCommand(command)) callback(command);
    };
    ipcRenderer.on("app-command", listener);
    return () => ipcRenderer.removeListener("app-command", listener);
  },
};

contextBridge.exposeInMainWorld("notes", notesApi);
