import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_NOTE_SORT, EMPTY_DOCUMENT, NotesRepository } from "./notes-repository";

const databases: DatabaseSync[] = [];

function createRepository() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  let nextId = 1;
  let currentTime = new Date("2026-08-09T10:00:00.000Z");
  const repository = new NotesRepository(database, {
    createId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
    now: () => currentTime,
  });
  repository.initialize();

  return {
    database,
    repository,
    advance(minutes: number) {
      currentTime = new Date(currentTime.getTime() + minutes * 60_000);
    },
  };
}

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
});

describe("NotesRepository", () => {
  it("initializes idempotently and persists local preferences", () => {
    const { database, repository } = createRepository();
    repository.initialize();

    const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC").all() as Array<{ name: string }>)
      .map(({ name }) => name);
    expect(tables).toEqual(["note_tags", "note_trash", "notes", "preferences", "tags"]);

    expect(repository.getLocale()).toBe("en");
    expect(repository.getTheme()).toBe("system");

    repository.setLocale("pl");
    repository.setTheme("dark");

    expect(repository.getLocale()).toBe("pl");
    expect(repository.getTheme()).toBe("dark");
  });

  it("keeps notes and preferences after reopening a local SQLite database", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "wh-notes-repository-"));
    const databasePath = path.join(directory, "notes.sqlite");
    try {
      const firstDatabase = new DatabaseSync(databasePath);
      const firstRepository = new NotesRepository(firstDatabase, {
        createId: () => "00000000-0000-4000-8000-000000000001",
        now: () => new Date("2026-08-09T10:00:00.000Z"),
      });
      firstRepository.initialize();
      const created = firstRepository.create();
      firstRepository.setLocale("pl");
      firstRepository.setTheme("light");
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(databasePath);
      const reopenedRepository = new NotesRepository(reopenedDatabase);
      reopenedRepository.initialize();

      expect(reopenedRepository.get(created.id)).toMatchObject({ title: "Untitled" });
      expect(reopenedRepository.getLocale()).toBe("pl");
      expect(reopenedRepository.getTheme()).toBe("light");
      reopenedDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("creates, saves, and orders pinned notes before recently edited notes", () => {
    const { repository, advance } = createRepository();
    const first = repository.create();
    advance(1);
    const second = repository.create("pl");
    advance(1);
    const savedFirst = repository.save({
      ...first,
      title: "Pinned document",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "private" }] }] },
      isPinned: true,
    });

    expect(savedFirst).toMatchObject({ title: "Pinned document", isPinned: true });
    expect(repository.get(second.id)).toMatchObject({ title: "Bez tytułu", content: EMPTY_DOCUMENT });
    expect(repository.list().map((note) => note.id)).toEqual([first.id, second.id]);
  });

  it("keeps active and trashed notes separate while exporting only active notes", () => {
    const { repository, advance } = createRepository();
    const first = repository.create();
    advance(1);
    const second = repository.create();
    advance(1);
    const third = repository.create();
    repository.moveToTrash(third.id);

    expect(repository.list().map((note) => note.id)).toEqual([second.id, first.id]);
    expect(repository.listTrash()).toMatchObject([{ id: third.id }]);
    expect(repository.forExport().map((note) => note.id)).toEqual([first.id, second.id]);
    expect(repository.forExport([third.id, second.id]).map((note) => note.id)).toEqual([second.id]);
    expect(() => repository.forExport([])).toThrow("Invalid notes selection.");
    expect(() => repository.forExport(["not-an-id"])).toThrow("Invalid notes selection.");
  });

  it("restores a trashed note directly to the active list", () => {
    const { repository } = createRepository();
    const note = repository.create();

    repository.moveToTrash(note.id);
    expect(repository.restoreFromTrash(note.id)).toMatchObject({ id: note.id });
    expect(repository.list().map((item) => item.id)).toEqual([note.id]);
    expect(repository.listTrash()).toEqual([]);
    expect(repository.restoreFromTrash(note.id)).toBeNull();
  });

  it("pins notes durably, keeps them first, and never changes a trashed note", () => {
    const { repository, advance } = createRepository();
    const first = repository.create();
    advance(1);
    const second = repository.create();

    expect(repository.setPinned(first.id, true)).toMatchObject({ id: first.id, isPinned: true });
    expect(repository.list().map((note) => note.id)).toEqual([first.id, second.id]);

    repository.moveToTrash(first.id);
    expect(repository.setPinned(first.id, false)).toBeNull();
    expect(repository.restoreFromTrash(first.id)).toMatchObject({ isPinned: true });
  });

  it("persists only supported local sort choices and keeps pins first", () => {
    const { repository, advance } = createRepository();
    const first = repository.create();
    advance(1);
    const second = repository.create();
    advance(1);
    const third = repository.create();
    repository.save({ ...first, title: "Zulu" });
    repository.save({ ...second, title: "Alpha" });
    repository.save({ ...third, title: "Echo" });

    expect(repository.getSort()).toBe(DEFAULT_NOTE_SORT);
    repository.setSort("updated-asc");
    expect(repository.list().map((note) => note.id)).toEqual([first.id, second.id, third.id]);

    repository.setSort("created-desc");
    expect(repository.list().map((note) => note.id)).toEqual([third.id, second.id, first.id]);

    repository.setSort("title-asc");
    expect(repository.list().map((note) => note.id)).toEqual([second.id, third.id, first.id]);

    repository.setPinned(first.id, true);
    expect(repository.list().map((note) => note.id)).toEqual([first.id, second.id, third.id]);
    expect(() => repository.setSort("not-a-sort" as never)).toThrow("Invalid note sort.");
  });

  it("normalizes local tags, filters with AND semantics, and cleans unused tags", () => {
    const { repository, advance } = createRepository();
    const first = repository.create();
    advance(1);
    const second = repository.create();

    const firstTags = repository.setTags(first.id, ["Work", " work ", "Polish notes"]);
    const secondTags = repository.setTags(second.id, ["work", "Personal"]);
    const work = firstTags.find((tag) => tag.name === "Work");
    const polish = firstTags.find((tag) => tag.name === "Polish notes");
    const personal = secondTags.find((tag) => tag.name === "Personal");

    expect(repository.listTags().map((tag) => tag.name)).toEqual(["Personal", "Polish notes", "Work"]);
    expect(repository.list([work!.id]).map((note) => note.id)).toEqual([second.id, first.id]);
    expect(repository.list([work!.id, polish!.id]).map((note) => note.id)).toEqual([first.id]);

    repository.moveToTrash(first.id);
    expect(() => repository.setTags(first.id, ["Private"])).toThrow("Cannot tag a trashed note.");
    expect(repository.list([work!.id]).map((note) => note.id)).toEqual([second.id]);

    repository.setTags(second.id, []);
    expect(repository.listTags().map((tag) => tag.name)).toEqual(["Polish notes", "Work"]);
    repository.permanentlyDelete(first.id);
    repository.setTags(second.id, []);
    expect(repository.listTags()).toEqual([]);
    expect(personal).toBeDefined();
  });

  it("does not write malformed drafts and moves notes to a recoverable trash", () => {
    const { repository } = createRepository();
    const note = repository.create();

    expect(() => repository.save({ ...note, title: "x".repeat(501) })).toThrow("Invalid note payload.");
    expect(repository.save({ ...note, content: { type: "doc", content: [] }, title: "  " })).toMatchObject({ title: "Bez tytułu" });

    repository.moveToTrash(note.id);
    expect(repository.list()).toEqual([]);
    expect(repository.listTrash()).toMatchObject([{ id: note.id, title: "Bez tytułu" }]);

    expect(repository.restoreFromTrash(note.id)).toMatchObject({ id: note.id, title: "Bez tytułu" });
    expect(repository.list().map((item) => item.id)).toEqual([note.id]);
    expect(repository.listTrash()).toEqual([]);
  });

  it("permanently deletes only trash and purges notes after the 30-day recovery window", () => {
    const { repository } = createRepository();
    const active = repository.create();
    const trashed = repository.create();
    repository.moveToTrash(trashed.id);

    repository.permanentlyDelete(active.id);
    expect(repository.get(active.id)).not.toBeNull();

    repository.purgeExpiredTrash(new Date("2026-09-07T09:59:59.999Z"));
    expect(repository.get(trashed.id)).not.toBeNull();

    repository.purgeExpiredTrash(new Date("2026-09-08T10:00:00.000Z"));
    expect(repository.get(trashed.id)).toBeNull();

    repository.moveToTrash(active.id);
    repository.permanentlyDelete(active.id);
    expect(repository.get(active.id)).toBeNull();
  });
});
