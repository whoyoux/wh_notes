# Testing wh_notes

## Current automated baseline

`npm test` runs focused Vitest tests without Electron or network access. The suite protects the highest-risk local-data boundaries:

| Area                | What is verified                                                                                  | Technology           |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| Image import        | Real PNG/JPEG/GIF/WebP signatures, declared-type mismatch, empty input, and the 50 MB limit       | Vitest / Node        |
| Encrypted archives  | AES-256-GCM round-trip, fresh encryption material, wrong password, tampering, and password policy | Vitest / Node crypto |
| Editor data helpers | Local image URL parsing, image insertion followed by a paragraph, and readable byte labels        | Vitest               |
| Checklists         | Tiptap task-list conversion, checkbox interaction, persisted checked state, and accessible labels | Vitest / happy-dom   |
| Local version history | Snapshot cadence, duplicate suppression, restore safety, 50-version retention, and permanent-delete cleanup | Vitest / node:sqlite |
| Application commands | Native menu / command-palette accelerator registry and the strict allow-list exposed to the renderer | Vitest               |
| Notes repository   | SQLite schema initialization, CRUD, pinned ordering, local FTS5 search, export selection, validation, and preferences | Vitest / node:sqlite |
| Note Trash         | Recovery, permanent deletion, active-note exclusion, and exact 30-day retention boundary            | Vitest / node:sqlite |
| Pinned notes       | Durable pin state, ordering, and protection against changing a note while it is in Trash                 | Vitest / node:sqlite |
| Note sorting       | Validated local preference, all supported sort modes, stable ties, and pinned-note priority               | Vitest / node:sqlite |
| Tags and filters   | Tag normalization, uniqueness, AND filtering, trash protection, and orphan cleanup                        | Vitest / node:sqlite |

Every pull request runs typechecking, the Vitest suite, and a runtime-dependency audit. Every change merged into `main` runs those checks again, builds native Windows and Linux installers, publishes a prerelease, writes SHA-256 checksums, and produces GitHub artifact attestations.

## Recommended next layers

| Priority | Scenario                                     | Approach                                                                                                                           |
| -------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Notes CRUD, ordering, deletion, and autosave | Extract the SQLite repository behind an interface; Vitest integration tests with a temporary `userData` directory                  |
| P0       | IPC trust boundary                           | Vitest with mocked Electron `ipcMain`/`WebContents`; reject untrusted senders and malformed payloads                               |
| P0       | Export/import recovery                       | Encrypted `.wnotes` integration tests with notes plus images; verify imported image source remapping and no plaintext archive content |
| P1       | Theme, language, dialogs, sidebar actions    | Vitest + React Testing Library in JSDOM with a typed mock of `window.notes`                                                        |
| P1       | Rich-text commands, paste, and drag/drop     | Tiptap editor tests with Vitest; keep `shouldRerenderOnTransaction: false` and assert toolbar state through Tiptap state selectors |
| P1       | Full user journey                            | Playwright Electron: start app, create/edit/reopen a note, paste an image, export/import, and verify persistence offline           |
| P1       | Packaged Windows install                     | Windows CI smoke job: install MSI silently in a clean runner, launch once, verify metadata/AppUserModelId, then uninstall          |
| P1       | Linux packages                               | Ubuntu/Fedora containers: inspect `.deb`/`.rpm` metadata, install, launch with a virtual display, then remove                      |
| P2       | Accessibility                                | Playwright + axe-core checks for keyboard navigation, menus, dialogs, and visible labels in English and Polish                     |
| P2       | Regression visuals                           | Playwright screenshots of light/dark editor, sidebar, image menu, and QHD reading width                                            |

## Local commands

```powershell
npm run typecheck
npm test
npm run make
```

The Windows installer is deliberately an MSI package. It does not ship the Squirrel `Update.exe`, `.nupkg`, or `RELEASES` artifacts and the app does not include an auto-update client.
