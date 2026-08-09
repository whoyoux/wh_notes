import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, protocol, session } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { ArchiveExportOptions, ArchiveImportResult, ImportImagePayload, LocalImage, LocalImageDetails, Locale, Note, NoteDraft, NotePreview, Theme } from "./shared/types";
import { APP_COMMANDS, type AppCommand } from "./shared/app-commands";
import { decryptArchive, encryptArchive, type ArchiveDocument } from "./main/archive-crypto";
import { IMAGE_FORMATS, MAX_IMAGE_BYTES, validateImageBytes, type ImageMimeType } from "./main/media-validation";
import { backgroundColorForTheme } from "./main/window-theme";

let mainWindow: BrowserWindow | null = null;
let database: DatabaseSync;

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };
const ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1000;
type AssetRow = { id: string; file_name: string; mime_type: ImageMimeType; byte_size: number; created_at: string; orphaned_at: string | null };

protocol.registerSchemesAsPrivileged([
  { scheme: "notes-media", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setAppUserModelId("com.whoyoux.wh_notes");

function databasePath() {
  const dataDirectory = path.join(app.getPath("userData"), "notes");
  mkdirSync(dataDirectory, { recursive: true });
  return path.join(dataDirectory, "notes.sqlite");
}

function applicationIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "wh-notes.ico")
    : path.join(app.getAppPath(), "resources", "wh-notes.ico");
}

function assetsDirectory() {
  const directory = path.join(app.getPath("userData"), "assets");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function initializeDatabase() {
  database = new DatabaseSync(databasePath());
  database.exec(`
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

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      orphaned_at TEXT
    ) STRICT;

    CREATE INDEX IF NOT EXISTS assets_sha256_idx ON assets(sha256);
  `);
}

function asBuffer(value: unknown): Buffer | null {
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function imageSource(id: string) {
  return `notes-media://image/${id}`;
}

function assetById(id: string): AssetRow | null {
  if (!validId(id)) return null;
  const asset = database
    .prepare("SELECT id, file_name, mime_type, byte_size, created_at, orphaned_at FROM assets WHERE id = ?")
    .get(id) as AssetRow | undefined;
  if (!asset || !existsSync(path.join(assetsDirectory(), asset.file_name))) return null;
  return asset;
}

function importImage(bytes: Buffer, suppliedMimeType?: unknown): LocalImage {
  const mimeType = validateImageBytes(bytes, suppliedMimeType);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = database
    .prepare("SELECT id, file_name, mime_type, byte_size, created_at, orphaned_at FROM assets WHERE sha256 = ? AND mime_type = ? LIMIT 1")
    .get(sha256, mimeType) as AssetRow | undefined;

  if (existing) {
    database.prepare("UPDATE assets SET orphaned_at = NULL WHERE id = ?").run(existing.id);
    return { id: existing.id, src: imageSource(existing.id), mimeType: existing.mime_type, byteSize: existing.byte_size };
  }

  const id = randomUUID();
  const fileName = `${id}.${IMAGE_FORMATS[mimeType].extension}`;
  const destination = path.join(assetsDirectory(), fileName);
  const temporary = `${destination}.tmp`;
  writeFileSync(temporary, bytes, { flag: "wx" });
  renameSync(temporary, destination);

  try {
    database
      .prepare("INSERT INTO assets (id, file_name, mime_type, byte_size, sha256, created_at, orphaned_at) VALUES (?, ?, ?, ?, ?, ?, NULL)")
      .run(id, fileName, mimeType, bytes.length, sha256, new Date().toISOString());
  } catch (error) {
    if (existsSync(destination)) unlinkSync(destination);
    throw error;
  }

  return { id, src: imageSource(id), mimeType, byteSize: bytes.length };
}

function replaceArchiveImageSources(value: unknown, sources: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceArchiveImageSources(item, sources));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const next = Object.fromEntries(Object.entries(record).map(([key, item]) => [key, replaceArchiveImageSources(item, sources)]));
  if (next.type === "image" && next.attrs && typeof next.attrs === "object") {
    const attrs = next.attrs as Record<string, unknown>;
    const match = typeof attrs.src === "string" ? /^notes-media:\/\/image\/([a-f0-9-]{36})$/i.exec(attrs.src) : null;
    if (match && sources.has(match[1])) next.attrs = { ...attrs, src: sources.get(match[1]) };
  }
  return next;
}

function collectReferencedAssetIds(value: unknown, ids: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferencedAssetIds(item, ids));
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (record.type === "image" && record.attrs && typeof record.attrs === "object") {
    const src = (record.attrs as Record<string, unknown>).src;
    const match = typeof src === "string" ? /^notes-media:\/\/image\/([a-f0-9-]{36})$/i.exec(src) : null;
    if (match) ids.add(match[1]);
  }
  Object.values(record).forEach((item) => collectReferencedAssetIds(item, ids));
}

function collectActiveAssetIds() {
  const ids = new Set<string>();
  const rows = database.prepare("SELECT content_json FROM notes").all() as Array<{ content_json: string }>;
  for (const row of rows) {
    try {
      collectReferencedAssetIds(JSON.parse(row.content_json), ids);
    } catch {
      // A malformed note is handled by parseContent when opened. It must not block media cleanup.
    }
  }
  return ids;
}

function synchronizeAssets() {
  const activeIds = collectActiveAssetIds();
  const assets = database.prepare("SELECT id, file_name, mime_type, byte_size, created_at, orphaned_at FROM assets").all() as AssetRow[];
  const now = Date.now();

  for (const asset of assets) {
    if (activeIds.has(asset.id)) {
      if (asset.orphaned_at) database.prepare("UPDATE assets SET orphaned_at = NULL WHERE id = ?").run(asset.id);
      continue;
    }

    if (!asset.orphaned_at) {
      database.prepare("UPDATE assets SET orphaned_at = ? WHERE id = ?").run(new Date(now).toISOString(), asset.id);
      continue;
    }

    if (now - Date.parse(asset.orphaned_at) < ORPHAN_RETENTION_MS) continue;
    const assetPath = path.join(assetsDirectory(), asset.file_name);
    if (existsSync(assetPath)) unlinkSync(assetPath);
    database.prepare("DELETE FROM assets WHERE id = ?").run(asset.id);
  }
}

function registerMediaProtocol() {
  protocol.handle("notes-media", (request) => {
    const url = new URL(request.url);
    const id = url.hostname === "image" ? url.pathname.slice(1) : "";
    if (!validId(id)) return new Response(null, { status: 404 });

    const asset = assetById(id);
    if (!asset) return new Response(null, { status: 404 });

    const assetPath = path.join(assetsDirectory(), asset.file_name);
    if (!existsSync(assetPath)) return new Response(null, { status: 404 });

    return new Response(readFileSync(assetPath), {
      headers: { "content-type": asset.mime_type, "content-length": String(asset.byte_size) },
    });
  });
}

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

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{36}$/i.test(value);
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  if (event.sender !== mainWindow?.webContents) {
    throw new Error("Nieautoryzowane żądanie IPC.");
  }
}

function getLocale(): Locale {
  const row = database
    .prepare("SELECT value FROM preferences WHERE key = 'locale'")
    .get() as { value?: string } | undefined;
  return row?.value === "pl" ? "pl" : "en";
}

function getTheme(): Theme {
  const row = database
    .prepare("SELECT value FROM preferences WHERE key = 'theme'")
    .get() as { value?: string } | undefined;
  return row?.value === "light" || row?.value === "dark" || row?.value === "system"
    ? row.value
    : "system";
}

function currentWindowBackgroundColor() {
  return backgroundColorForTheme(getTheme(), nativeTheme.shouldUseDarkColors);
}

function createNote(locale = getLocale()): Note {
  const now = new Date().toISOString();
  const note: Note = {
    id: crypto.randomUUID(),
    title: locale === "pl" ? "Bez tytułu" : "Untitled",
    content: EMPTY_DOCUMENT,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  };

  database
    .prepare(
      "INSERT INTO notes (id, title, content_json, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(note.id, note.title, JSON.stringify(note.content), 0, now, now);
  return note;
}

function listNotes(): NotePreview[] {
  const rows = database
    .prepare(
      "SELECT id, title, is_pinned, created_at, updated_at FROM notes ORDER BY is_pinned DESC, updated_at DESC",
    )
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    isPinned: Boolean(row.is_pinned),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

function getNote(id: string): Note | null {
  const row = database
    .prepare("SELECT * FROM notes WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? noteFromRow(row) : null;
}

function notesForArchive(noteIds?: unknown): Note[] {
  if (noteIds === undefined) {
    return (database.prepare("SELECT * FROM notes ORDER BY created_at ASC").all() as Record<string, unknown>[]).map(noteFromRow);
  }
  if (!Array.isArray(noteIds) || noteIds.length === 0 || !noteIds.every(validId)) throw new Error("Invalid notes selection.");
  const ids = [...new Set(noteIds)];
  const placeholders = ids.map(() => "?").join(", ");
  return (database.prepare(`SELECT * FROM notes WHERE id IN (${placeholders}) ORDER BY created_at ASC`).all(...ids) as Record<string, unknown>[]).map(noteFromRow);
}

function createArchive(noteIds?: unknown): ArchiveDocument {
  const notes = notesForArchive(noteIds);
  if (notes.length === 0) throw new Error("There are no notes to export.");

  const assetIds = new Set<string>();
  notes.forEach((note) => collectReferencedAssetIds(note.content, assetIds));
  const assets: ArchiveDocument["assets"] = [];
  for (const id of assetIds) {
    const asset = assetById(id);
    if (!asset) continue;
    assets.push({ id: asset.id, mimeType: asset.mime_type, data: readFileSync(path.join(assetsDirectory(), asset.file_name)).toString("base64") });
  }

  return {
    format: "local-notes-archive",
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
    assets,
  };
}

function importArchiveDocument(archive: ArchiveDocument): ArchiveImportResult {
  const imageSources = new Map<string, string>();
  for (const asset of archive.assets) {
    const image = importImage(Buffer.from(asset.data, "base64"), asset.mimeType);
    imageSources.set(asset.id, image.src);
  }

  const now = new Date().toISOString();
  const importedIds: string[] = [];
  const insert = database.prepare(
    "INSERT INTO notes (id, title, content_json, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const archivedNote of archive.notes) {
    const content = replaceArchiveImageSources(archivedNote.content, imageSources) as Record<string, unknown>;
    const id = randomUUID();
    insert.run(
      id,
      archivedNote.title.trim() || "Untitled",
      JSON.stringify(content),
      Number(archivedNote.isPinned),
      archivedNote.createdAt || now,
      archivedNote.updatedAt || now,
    );
    importedIds.push(id);
  }
  synchronizeAssets();
  return { importedCount: importedIds.length, firstNoteId: importedIds[0] };
}

function saveNote(draft: NoteDraft): Note | null {
  if (
    !validId(draft?.id) ||
    typeof draft.title !== "string" ||
    draft.title.length > 500 ||
    !draft.content ||
    typeof draft.content !== "object"
  ) {
    throw new Error("Nieprawidłowy format notatki.");
  }

  const contentJson = JSON.stringify(draft.content);
  if (contentJson.length > 2_000_000) {
    throw new Error("Notatka jest zbyt duża.");
  }

  const now = new Date().toISOString();
  const result = database
    .prepare(
      "UPDATE notes SET title = ?, content_json = ?, is_pinned = ?, updated_at = ? WHERE id = ?",
    )
    .run(draft.title.trim() || "Bez tytułu", contentJson, Number(draft.isPinned), now, draft.id);

  if (result.changes > 0) synchronizeAssets();
  return result.changes > 0 ? getNote(draft.id) : null;
}

function installIpcHandlers() {
  ipcMain.handle("notes:list", (event) => {
    assertTrustedSender(event);
    return listNotes();
  });
  ipcMain.handle("notes:get", (event, id: unknown) => {
    assertTrustedSender(event);
    return validId(id) ? getNote(id) : null;
  });
  ipcMain.handle("notes:create", (event) => {
    assertTrustedSender(event);
    return createNote();
  });
  ipcMain.handle("notes:save", (event, draft: NoteDraft) => {
    assertTrustedSender(event);
    return saveNote(draft);
  });
  ipcMain.handle("notes:remove", (event, id: unknown) => {
    assertTrustedSender(event);
    if (validId(id)) {
      database.prepare("DELETE FROM notes WHERE id = ?").run(id);
      synchronizeAssets();
    }
  });
  ipcMain.handle("media:import-image", (event, payload: unknown) => {
    assertTrustedSender(event);
    if (!payload || typeof payload !== "object") throw new Error("Invalid image payload.");
    const imagePayload = payload as Partial<ImportImagePayload>;
    const bytes = asBuffer(imagePayload.bytes);
    if (!bytes) throw new Error("Invalid image bytes.");
    return importImage(bytes, imagePayload.mimeType);
  });
  ipcMain.handle("media:pick-image", async (event) => {
    assertTrustedSender(event);
    const dialogOptions: OpenDialogOptions = {
      title: "Insert image",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) return null;

    const sourcePath = result.filePaths[0];
    const sourceSize = statSync(sourcePath).size;
    if (sourceSize > MAX_IMAGE_BYTES) throw new Error("Images can be at most 50 MB.");
    return importImage(readFileSync(sourcePath));
  });
  ipcMain.handle("media:copy-image", (event, id: unknown) => {
    assertTrustedSender(event);
    const asset = typeof id === "string" ? assetById(id) : null;
    if (!asset) throw new Error("Image not found.");

    const image = nativeImage.createFromPath(path.join(assetsDirectory(), asset.file_name));
    if (image.isEmpty()) throw new Error("Image could not be copied.");
    clipboard.writeImage(image);
  });
  ipcMain.handle("media:export-image", async (event, id: unknown) => {
    assertTrustedSender(event);
    const asset = typeof id === "string" ? assetById(id) : null;
    if (!asset) throw new Error("Image not found.");

    const extension = IMAGE_FORMATS[asset.mime_type].extension;
    const dialogOptions: SaveDialogOptions = {
      title: "Save image as",
      defaultPath: `image.${extension}`,
      filters: [{ name: "Image", extensions: [extension] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (result.canceled || !result.filePath) return false;

    copyFileSync(path.join(assetsDirectory(), asset.file_name), result.filePath);
    return true;
  });
  ipcMain.handle("media:get-image-details", (event, id: unknown): LocalImageDetails | null => {
    assertTrustedSender(event);
    const asset = typeof id === "string" ? assetById(id) : null;
    return asset
      ? { id: asset.id, mimeType: asset.mime_type, byteSize: asset.byte_size, createdAt: asset.created_at }
      : null;
  });
  ipcMain.handle("archive:export", async (event, options: ArchiveExportOptions) => {
    assertTrustedSender(event);
    if (!options || typeof options.password !== "string") throw new Error("Invalid archive options.");

    const archive = encryptArchive(createArchive(options.noteIds), options.password);
    const date = new Date().toISOString().slice(0, 10);
    const dialogOptions: SaveDialogOptions = {
      title: "Export encrypted notes",
      defaultPath: `local-notes-${date}.wnotes`,
      filters: [{ name: "wh_notes archive", extensions: ["wnotes"] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, archive, { flag: "w" });
    return true;
  });
  ipcMain.handle("archive:import", async (event, password: unknown): Promise<ArchiveImportResult | null> => {
    assertTrustedSender(event);
    if (typeof password !== "string") throw new Error("Invalid archive password.");

    const dialogOptions: OpenDialogOptions = {
      title: "Import encrypted notes",
      properties: ["openFile"],
      filters: [{ name: "wh_notes archive", extensions: ["wnotes"] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) return null;
    return importArchiveDocument(decryptArchive(readFileSync(result.filePaths[0]), password));
  });
  ipcMain.handle("preferences:get-theme", (event) => {
    assertTrustedSender(event);
    return getTheme();
  });
  ipcMain.handle("preferences:set-theme", (event, theme: unknown) => {
    assertTrustedSender(event);
    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      throw new Error("Nieprawidłowy motyw.");
    }
    database
      .prepare(
        "INSERT INTO preferences (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(theme);
    mainWindow?.setBackgroundColor(
      backgroundColorForTheme(theme, nativeTheme.shouldUseDarkColors),
    );
  });
  ipcMain.handle("preferences:get-locale", (event) => {
    assertTrustedSender(event);
    return getLocale();
  });
  ipcMain.handle("preferences:set-locale", (event, locale: unknown) => {
    assertTrustedSender(event);
    if (locale !== "en" && locale !== "pl") throw new Error("Invalid locale.");
    database
      .prepare(
        "INSERT INTO preferences (key, value) VALUES ('locale', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(locale);
    createApplicationMenu(locale);
    mainWindow?.setTitle("wh_notes");
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 540,
    title: "wh_notes",
    icon: applicationIconPath(),
    backgroundColor: currentWindowBackgroundColor(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => {
    const window = mainWindow;
    if (window && !window.isDestroyed()) window.show();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

function createApplicationMenu(locale: Locale) {
  const pl = locale === "pl";
  const sendAppCommand = (command: AppCommand) => mainWindow?.webContents.send("app-command", command);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: pl ? "Notatka" : "Note",
        submenu: [
          {
            label: pl ? "Nowa notatka" : "New note",
            accelerator: APP_COMMANDS["new-note"].accelerator,
            click: () => sendAppCommand("new-note"),
          },
          {
            label: pl ? "Zapisz teraz" : "Save now",
            accelerator: APP_COMMANDS["save-note"].accelerator,
            click: () => sendAppCommand("save-note"),
          },
          {
            label: pl ? "Eksportuj bieżącą notatkę" : "Export current note",
            accelerator: APP_COMMANDS["export-note"].accelerator,
            click: () => sendAppCommand("export-note"),
          },
          { type: "separator" },
          { role: "quit", label: pl ? "Zakończ" : "Quit" },
        ],
      },
      {
        label: pl ? "Edycja" : "Edit",
        submenu: [
          { role: "undo", label: pl ? "Cofnij" : "Undo" },
          { role: "redo", label: pl ? "Ponów" : "Redo" },
          { type: "separator" },
          { role: "cut", label: pl ? "Wytnij" : "Cut" },
          { role: "copy", label: pl ? "Kopiuj" : "Copy" },
          { role: "paste", label: pl ? "Wklej" : "Paste" },
          { role: "selectAll", label: pl ? "Zaznacz wszystko" : "Select all" },
        ],
      },
      {
        label: pl ? "Widok" : "View",
        submenu: [{ role: "toggleDevTools", label: pl ? "Narzędzia programistyczne" : "Developer tools" }],
      },
    ]),
  );
}

app.whenReady().then(() => {
  initializeDatabase();
  registerMediaProtocol();
  synchronizeAssets();
  installIpcHandlers();
  session.defaultSession.setPermissionRequestHandler((_webContents: WebContents, _permission, callback) => {
    callback(false);
  });
  createApplicationMenu(getLocale());
  createWindow();
  nativeTheme.on("updated", () => {
    if (getTheme() === "system") {
      mainWindow?.setBackgroundColor(currentWindowBackgroundColor());
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
