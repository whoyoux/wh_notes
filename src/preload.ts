import { contextBridge, ipcRenderer } from "electron";
import { isAppCommand } from "./shared/app-commands";
import type { ArchiveExportOptions, ImportImagePayload, Locale, NoteDraft, NotesApi, NoteSort, Theme } from "./shared/types";

const notesApi: NotesApi = {
  list: (tagIds) => ipcRenderer.invoke("notes:list", tagIds),
  listArchived: (tagIds) => ipcRenderer.invoke("notes:list-archived", tagIds),
  listTrash: () => ipcRenderer.invoke("notes:list-trash"),
  get: (id) => ipcRenderer.invoke("notes:get", id),
  create: () => ipcRenderer.invoke("notes:create"),
  save: (draft: NoteDraft) => ipcRenderer.invoke("notes:save", draft),
  moveToTrash: (id) => ipcRenderer.invoke("notes:move-to-trash", id),
  setPinned: (id, isPinned) => ipcRenderer.invoke("notes:set-pinned", id, isPinned),
  archive: (id) => ipcRenderer.invoke("notes:archive", id),
  unarchive: (id) => ipcRenderer.invoke("notes:unarchive", id),
  restoreFromTrash: (id) => ipcRenderer.invoke("notes:restore-from-trash", id),
  permanentlyDelete: (id) => ipcRenderer.invoke("notes:permanently-delete", id),
  getSort: () => ipcRenderer.invoke("preferences:get-note-sort"),
  setSort: (sort: NoteSort) => ipcRenderer.invoke("preferences:set-note-sort", sort),
  listTags: () => ipcRenderer.invoke("tags:list"),
  getTags: (noteId) => ipcRenderer.invoke("tags:get-for-note", noteId),
  setTags: (noteId, names) => ipcRenderer.invoke("tags:set-for-note", noteId, names),
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
