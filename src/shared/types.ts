import type { AppCommand } from "./app-commands";

export type Theme = "light" | "dark" | "system";
export type Locale = "en" | "pl";
export type NoteSort = "updated-desc" | "updated-asc" | "created-desc" | "title-asc";

export type Tag = {
  id: string;
  name: string;
};

export type NotePreview = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  isPinned: boolean;
};

export type Note = NotePreview & {
  content: Record<string, unknown>;
};

export type TrashedNotePreview = NotePreview & {
  trashedAt: string;
};

export type ArchivedNotePreview = NotePreview & {
  archivedAt: string;
};

export type NoteDraft = Pick<Note, "id" | "title" | "content" | "isPinned">;

export type LocalImage = {
  id: string;
  src: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  byteSize: number;
};

export type LocalImageDetails = {
  id: string;
  mimeType: LocalImage["mimeType"];
  byteSize: number;
  createdAt: string;
};

export type ImportImagePayload = {
  bytes: Uint8Array;
  mimeType?: string;
  fileName?: string;
};

export type ArchiveExportOptions = {
  noteIds?: string[];
  password: string;
};

export type ArchiveImportResult = {
  importedCount: number;
  firstNoteId?: string;
};

export type NotesApi = {
  list: (tagIds?: string[]) => Promise<NotePreview[]>;
  listArchived: (tagIds?: string[]) => Promise<ArchivedNotePreview[]>;
  listTrash: () => Promise<TrashedNotePreview[]>;
  get: (id: string) => Promise<Note | null>;
  create: () => Promise<Note>;
  save: (draft: NoteDraft) => Promise<Note | null>;
  moveToTrash: (id: string) => Promise<void>;
  setPinned: (id: string, isPinned: boolean) => Promise<Note | null>;
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<Note | null>;
  restoreFromTrash: (id: string) => Promise<Note | null>;
  permanentlyDelete: (id: string) => Promise<void>;
  getSort: () => Promise<NoteSort>;
  setSort: (sort: NoteSort) => Promise<void>;
  listTags: () => Promise<Tag[]>;
  getTags: (noteId: string) => Promise<Tag[]>;
  setTags: (noteId: string, names: string[]) => Promise<Tag[]>;
  getTheme: () => Promise<Theme>;
  setTheme: (theme: Theme) => Promise<void>;
  getLocale: () => Promise<Locale>;
  setLocale: (locale: Locale) => Promise<void>;
  importImage: (payload: ImportImagePayload) => Promise<LocalImage>;
  pickImage: () => Promise<LocalImage | null>;
  copyImage: (id: string) => Promise<void>;
  exportImage: (id: string) => Promise<boolean>;
  getImageDetails: (id: string) => Promise<LocalImageDetails | null>;
  exportArchive: (options: ArchiveExportOptions) => Promise<boolean>;
  importArchive: (password: string) => Promise<ArchiveImportResult | null>;
  onAppCommand: (callback: (command: AppCommand) => void) => () => void;
};
