import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Locale, Note, NoteDraft, NotePreview, Theme, TrashedNotePreview } from "../shared/types";

export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const EMPTY_DOCUMENT: Record<string, unknown> = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

type NotesRepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

function parseContent(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : EMPTY_DOCUMENT;
  } catch {
    return EMPTY_DOCUMENT;
  }
}

function noteFromRow(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    title: String(row.title),
    content: parseContent(String(row.content_json)),
    isPinned: Boolean(row.is_pinned),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function isValidNoteId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{36}$/i.test(value);
}

export class NotesRepository {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly database: DatabaseSync,
    options: NotesRepositoryOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  initialize() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        content_json TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS note_trash (
        note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        trashed_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS note_trash_trashed_at_idx ON note_trash(trashed_at);
    `);
  }

  getLocale(): Locale {
    const row = this.database
      .prepare("SELECT value FROM preferences WHERE key = 'locale'")
      .get() as { value?: string } | undefined;
    return row?.value === "pl" ? "pl" : "en";
  }

  setLocale(locale: Locale) {
    this.database
      .prepare("INSERT INTO preferences (key, value) VALUES ('locale', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(locale);
  }

  getTheme(): Theme {
    const row = this.database
      .prepare("SELECT value FROM preferences WHERE key = 'theme'")
      .get() as { value?: string } | undefined;
    return row?.value === "light" || row?.value === "dark" || row?.value === "system"
      ? row.value
      : "system";
  }

  setTheme(theme: Theme) {
    this.database
      .prepare("INSERT INTO preferences (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(theme);
  }

  create(locale = this.getLocale()): Note {
    const timestamp = this.now().toISOString();
    const note: Note = {
      id: this.createId(),
      title: locale === "pl" ? "Bez tytułu" : "Untitled",
      content: EMPTY_DOCUMENT,
      isPinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.database
      .prepare("INSERT INTO notes (id, title, content_json, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(note.id, note.title, JSON.stringify(note.content), 0, timestamp, timestamp);
    return note;
  }

  list(): NotePreview[] {
    const rows = this.database
      .prepare(`
        SELECT notes.id, notes.title, notes.is_pinned, notes.created_at, notes.updated_at
        FROM notes
        LEFT JOIN note_trash ON note_trash.note_id = notes.id
        WHERE note_trash.note_id IS NULL
        ORDER BY notes.is_pinned DESC, notes.updated_at DESC
      `)
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      isPinned: Boolean(row.is_pinned),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  listTrash(): TrashedNotePreview[] {
    const rows = this.database
      .prepare(`
        SELECT notes.id, notes.title, notes.is_pinned, notes.created_at, notes.updated_at, note_trash.trashed_at
        FROM note_trash
        INNER JOIN notes ON notes.id = note_trash.note_id
        ORDER BY note_trash.trashed_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      isPinned: Boolean(row.is_pinned),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      trashedAt: String(row.trashed_at),
    }));
  }

  get(id: string): Note | null {
    const row = this.database
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? noteFromRow(row) : null;
  }

  forArchive(noteIds?: unknown): Note[] {
    if (noteIds === undefined) {
      return (this.database.prepare(`
        SELECT notes.* FROM notes
        LEFT JOIN note_trash ON note_trash.note_id = notes.id
        WHERE note_trash.note_id IS NULL
        ORDER BY notes.created_at ASC
      `).all() as Record<string, unknown>[]).map(noteFromRow);
    }
    if (!Array.isArray(noteIds) || noteIds.length === 0 || !noteIds.every(isValidNoteId)) {
      throw new Error("Invalid notes selection.");
    }
    const ids = [...new Set(noteIds)];
    const placeholders = ids.map(() => "?").join(", ");
    return (this.database.prepare(`
      SELECT notes.* FROM notes
      LEFT JOIN note_trash ON note_trash.note_id = notes.id
      WHERE notes.id IN (${placeholders}) AND note_trash.note_id IS NULL
      ORDER BY notes.created_at ASC
    `).all(...ids) as Record<string, unknown>[]).map(noteFromRow);
  }

  save(draft: NoteDraft): Note | null {
    if (
      !isValidNoteId(draft?.id) ||
      typeof draft.title !== "string" ||
      draft.title.length > 500 ||
      !draft.content ||
      typeof draft.content !== "object"
    ) {
      throw new Error("Invalid note payload.");
    }

    const contentJson = JSON.stringify(draft.content);
    if (contentJson.length > 2_000_000) throw new Error("Note is too large.");

    const result = this.database
      .prepare("UPDATE notes SET title = ?, content_json = ?, is_pinned = ?, updated_at = ? WHERE id = ?")
      .run(draft.title.trim() || "Bez tytułu", contentJson, Number(draft.isPinned), this.now().toISOString(), draft.id);

    return result.changes > 0 ? this.get(draft.id) : null;
  }

  moveToTrash(id: string) {
    const now = this.now().toISOString();
    this.database
      .prepare(`
        INSERT INTO note_trash (note_id, trashed_at)
        SELECT id, ? FROM notes
        WHERE id = ? AND NOT EXISTS (SELECT 1 FROM note_trash WHERE note_id = ?)
      `)
      .run(now, id, id);
  }

  restoreFromTrash(id: string): Note | null {
    const result = this.database.prepare("DELETE FROM note_trash WHERE note_id = ?").run(id);
    return result.changes > 0 ? this.get(id) : null;
  }

  permanentlyDelete(id: string) {
    this.database.prepare(`
      DELETE FROM notes
      WHERE id = ? AND EXISTS (SELECT 1 FROM note_trash WHERE note_id = notes.id)
    `).run(id);
  }

  purgeExpiredTrash(now = this.now()) {
    const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS).toISOString();
    this.database.prepare(`
      DELETE FROM notes
      WHERE id IN (SELECT note_id FROM note_trash WHERE trashed_at <= ?)
    `).run(cutoff);
  }
}
