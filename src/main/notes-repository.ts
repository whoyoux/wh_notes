import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ArchivedNotePreview, Locale, Note, NoteDraft, NotePreview, NoteSort, Tag, Theme, TrashedNotePreview } from "../shared/types";

export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const DEFAULT_NOTE_SORT: NoteSort = "updated-desc";
export const NOTE_SORTS = ["updated-desc", "updated-asc", "created-desc", "title-asc"] as const;

export function isNoteSort(value: unknown): value is NoteSort {
  return typeof value === "string" && (NOTE_SORTS as readonly string[]).includes(value);
}

function orderBy(sort: NoteSort) {
  switch (sort) {
    case "updated-asc":
      return "notes.is_pinned DESC, notes.updated_at ASC, notes.id ASC";
    case "created-desc":
      return "notes.is_pinned DESC, notes.created_at DESC, notes.id ASC";
    case "title-asc":
      return "notes.is_pinned DESC, notes.title COLLATE NOCASE ASC, notes.id ASC";
    default:
      return "notes.is_pinned DESC, notes.updated_at DESC, notes.id ASC";
  }
}

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

function normalizedTagName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("und");
}

function preparedTagNames(names: string[]) {
  if (!Array.isArray(names) || names.length > 12) throw new Error("Invalid tags.");
  const entries = names.map((name) => {
    if (typeof name !== "string") throw new Error("Invalid tags.");
    const displayName = name.normalize("NFKC").trim().replace(/\s+/g, " ");
    const normalizedName = normalizedTagName(name);
    if (!displayName || displayName.length > 50 || !normalizedName) throw new Error("Invalid tags.");
    return { displayName, normalizedName };
  });
  const unique = new Map<string, { displayName: string; normalizedName: string }>();
  for (const entry of entries) {
    if (!unique.has(entry.normalizedName)) unique.set(entry.normalizedName, entry);
  }
  return [...unique.values()];
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

      CREATE TABLE IF NOT EXISTS note_archive (
        note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        archived_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS note_archive_archived_at_idx ON note_archive(archived_at);

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, tag_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS note_tags_tag_id_idx ON note_tags(tag_id);
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

  getSort(): NoteSort {
    const row = this.database
      .prepare("SELECT value FROM preferences WHERE key = 'notes.sort'")
      .get() as { value?: string } | undefined;
    return isNoteSort(row?.value) ? row.value : DEFAULT_NOTE_SORT;
  }

  setSort(sort: NoteSort) {
    if (!isNoteSort(sort)) throw new Error("Invalid note sort.");
    this.database
      .prepare("INSERT INTO preferences (key, value) VALUES ('notes.sort', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(sort);
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

  list(tagIds: string[] = []): NotePreview[] {
    const tagFilter = this.tagFilter(tagIds);
    const rows = this.database
      .prepare(`
        SELECT notes.id, notes.title, notes.is_pinned, notes.created_at, notes.updated_at
        FROM notes
        LEFT JOIN note_trash ON note_trash.note_id = notes.id
        LEFT JOIN note_archive ON note_archive.note_id = notes.id
        WHERE note_trash.note_id IS NULL AND note_archive.note_id IS NULL ${tagFilter.sql}
        ORDER BY ${orderBy(this.getSort())}
      `)
      .all(...tagFilter.params) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      isPinned: Boolean(row.is_pinned),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  listArchived(tagIds: string[] = []): ArchivedNotePreview[] {
    const tagFilter = this.tagFilter(tagIds);
    const rows = this.database
      .prepare(`
        SELECT notes.id, notes.title, notes.is_pinned, notes.created_at, notes.updated_at, note_archive.archived_at
        FROM note_archive
        INNER JOIN notes ON notes.id = note_archive.note_id
        LEFT JOIN note_trash ON note_trash.note_id = notes.id
        WHERE note_trash.note_id IS NULL ${tagFilter.sql}
        ORDER BY ${orderBy(this.getSort())}
      `)
      .all(...tagFilter.params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      isPinned: Boolean(row.is_pinned),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      archivedAt: String(row.archived_at),
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

  listTags(): Tag[] {
    return (this.database.prepare("SELECT id, name FROM tags ORDER BY name COLLATE NOCASE ASC, id ASC").all() as Array<Record<string, unknown>>)
      .map((row) => ({ id: String(row.id), name: String(row.name) }));
  }

  getTags(noteId: string): Tag[] {
    if (!isValidNoteId(noteId)) return [];
    return (this.database.prepare(`
      SELECT tags.id, tags.name FROM note_tags
      INNER JOIN tags ON tags.id = note_tags.tag_id
      WHERE note_tags.note_id = ?
      ORDER BY tags.name COLLATE NOCASE ASC, tags.id ASC
    `).all(noteId) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), name: String(row.name) }));
  }

  setTags(noteId: string, names: string[]): Tag[] {
    if (!isValidNoteId(noteId)) throw new Error("Invalid note.");
    const entries = preparedTagNames(names);
    const isTrashed = this.database.prepare("SELECT 1 FROM note_trash WHERE note_id = ?").get(noteId);
    if (isTrashed) throw new Error("Cannot tag a trashed note.");

    this.database.exec("BEGIN");
    try {
      this.database.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
      const addTag = this.database.prepare("INSERT OR IGNORE INTO tags (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)");
      const findTag = this.database.prepare("SELECT id FROM tags WHERE normalized_name = ?");
      const addRelation = this.database.prepare("INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)");
      for (const entry of entries) {
        addTag.run(randomUUID(), entry.displayName, entry.normalizedName, this.now().toISOString());
        const tag = findTag.get(entry.normalizedName) as { id: string };
        addRelation.run(noteId, tag.id);
      }
      this.removeUnusedTags();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.getTags(noteId);
  }

  private tagFilter(tagIds: string[]) {
    if (!Array.isArray(tagIds) || tagIds.length === 0) return { sql: "", params: [] as Array<string | number> };
    if (!tagIds.every(isValidNoteId)) throw new Error("Invalid tag filter.");
    const ids = [...new Set(tagIds)];
    return {
      sql: `AND notes.id IN (SELECT note_id FROM note_tags WHERE tag_id IN (${ids.map(() => "?").join(", ")}) GROUP BY note_id HAVING COUNT(DISTINCT tag_id) = ?)`,
      params: [...ids, ids.length],
    };
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

  setPinned(id: string, isPinned: boolean): Note | null {
    const result = this.database.prepare(`
      UPDATE notes
      SET is_pinned = ?
      WHERE id = ? AND NOT EXISTS (SELECT 1 FROM note_trash WHERE note_id = notes.id)
    `).run(Number(isPinned), id);
    return result.changes > 0 ? this.get(id) : null;
  }

  archive(id: string) {
    this.database
      .prepare(`
        INSERT INTO note_archive (note_id, archived_at)
        SELECT id, ? FROM notes
        WHERE id = ?
          AND NOT EXISTS (SELECT 1 FROM note_trash WHERE note_id = ?)
          AND NOT EXISTS (SELECT 1 FROM note_archive WHERE note_id = ?)
      `)
      .run(this.now().toISOString(), id, id, id);
  }

  unarchive(id: string): Note | null {
    const result = this.database.prepare("DELETE FROM note_archive WHERE note_id = ?").run(id);
    return result.changes > 0 ? this.get(id) : null;
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
    this.removeUnusedTags();
  }

  purgeExpiredTrash(now = this.now()) {
    const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS).toISOString();
    this.database.prepare(`
      DELETE FROM notes
      WHERE id IN (SELECT note_id FROM note_trash WHERE trashed_at <= ?)
    `).run(cutoff);
    this.removeUnusedTags();
  }

  private removeUnusedTags() {
    this.database.prepare("DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE note_tags.tag_id = tags.id)").run();
  }
}
