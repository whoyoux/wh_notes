import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_DOCUMENT, NotesRepository } from "./notes-repository";

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
    const { repository } = createRepository();
    repository.initialize();

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

  it("returns archive selections in their creation order and rejects unsafe selections", () => {
    const { repository } = createRepository();
    const first = repository.create();
    const second = repository.create();
    repository.moveToTrash(first.id);

    expect(repository.forArchive([second.id, first.id]).map((note) => note.id)).toEqual([second.id]);
    expect(() => repository.forArchive([])).toThrow("Invalid notes selection.");
    expect(() => repository.forArchive(["not-an-id"])).toThrow("Invalid notes selection.");
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
