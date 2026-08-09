import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Download, FileText, MoreHorizontal, NotebookPen, Plus, Trash2, Upload } from "lucide-react";
import { useTheme } from "next-themes";
import { NoteEditor } from "@/components/note-editor";
import whNotesIcon from "@/assets/wh-notes-icon.png";
import { ThemeMenu } from "@/components/theme-menu";
import { LanguageMenu } from "@/components/language-menu";
import { useI18n } from "@/components/locale-provider";
import { resolveSaveStatus, type SaveStatus } from "@/lib/save-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import type { Note, NotePreview } from "../../shared/types";

type NotesSidebarProps = {
  notes: NotePreview[];
  activeId?: string;
  labels: ReturnType<typeof useI18n>["text"];
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRequestDelete: (note: NotePreview) => void;
  onExportNote: (id: string) => void;
  onExportAll: () => void;
  onImport: () => void;
};

function NotesSidebar({ notes, activeId, labels, onCreate, onSelect, onRequestDelete, onExportNote, onExportAll, onImport }: NotesSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex h-7 items-center gap-2 px-2">
          <img src={whNotesIcon} alt="" className="size-5 rounded-[5px]" />
          <span className="flex-1 text-xs font-semibold tracking-tight">wh_notes</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={labels.backup}>
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onExportAll} disabled={notes.length === 0}>
                <Download />
                {labels.exportAllNotes}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onImport}>
                <Upload />
                {labels.importNotes}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" onClick={onCreate}>
              <Plus className="size-3.5" />
              <span className="text-xs">{labels.newNote}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent style={{ flex: "1 1 auto" }}>
        <SidebarGroup>
          <SidebarGroupLabel>{labels.notes}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {notes.map((note) => (
                <SidebarMenuItem key={note.id}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={note.id === activeId}
                    onClick={() => onSelect(note.id)}
                  >
                    <FileText className="size-3.5" strokeWidth={1.8} />
                    <span>{note.title || labels.untitled}</span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label={`${labels.deleteNote}: ${note.title || labels.untitled}`}>
                        <MoreHorizontal className="size-3.5" />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuItem onSelect={() => onExportNote(note.id)}>
                        <Download />
                        {labels.archiveNote}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => onRequestDelete(note)}>
                        <Trash2 />
                        {labels.deleteNote}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter style={{ marginTop: "auto", flexDirection: "row" }}>
        <LanguageMenu />
        <ThemeMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

type ArchiveAction =
  | { mode: "export"; noteIds?: string[] }
  | { mode: "import" };

type PendingSave = {
  note: Note;
  revision: number;
  timer: ReturnType<typeof setTimeout> | null;
};

function ArchivePasswordDialog({ action, onClose, onImported }: {
  action: ArchiveAction | null;
  onClose: () => void;
  onImported: (firstNoteId?: string) => Promise<void>;
}) {
  const { text } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    setPassword("");
    setConfirmation("");
    setError(null);
    setIsWorking(false);
  }, [action]);

  const isExport = action?.mode === "export";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action) return;
    if (password.length < 12) {
      setError(text.passwordTooShort);
      return;
    }
    if (isExport && password !== confirmation) {
      setError(text.passwordsDoNotMatch);
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      if (action.mode === "export") {
        await window.notes.exportArchive({ noteIds: action.noteIds, password });
        onClose();
      } else {
        const result = await window.notes.importArchive(password);
        if (result) {
          await onImported(result.firstNoteId);
          onClose();
        }
      }
    } catch {
      setError(text.archiveError);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{isExport ? text.exportArchiveTitle : text.importArchiveTitle}</DialogTitle>
            <DialogDescription>{isExport ? text.exportArchiveDescription : text.importArchiveDescription}</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-3">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={text.password}
              aria-label={text.password}
              autoFocus
            />
            {isExport && (
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={text.confirmPassword}
                aria-label={text.confirmPassword}
              />
            )}
            <p className="text-xs leading-5 text-muted-foreground">{text.passwordHint}</p>
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={onClose} disabled={isWorking}>{text.cancel}</Button>
            <Button type="submit" disabled={isWorking}>{isExport ? text.export : text.import}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ThemeInitializer() {
  const { setTheme } = useTheme();

  useEffect(() => {
    void window.notes.getTheme().then(setTheme);
  }, [setTheme]);

  return null;
}

export function App() {
  const { text } = useI18n();
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteToDelete, setNoteToDelete] = useState<NotePreview | null>(null);
  const [archiveAction, setArchiveAction] = useState<ArchiveAction | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const activeNoteRef = useRef<Note | null>(null);
  const pendingSavesRef = useRef(new Map<string, PendingSave>());
  const saveChainsRef = useRef(new Map<string, Promise<void>>());
  const saveStatusesRef = useRef(new Map<string, SaveStatus>());

  const setNoteSaveStatus = useCallback((noteId: string, nextStatus: SaveStatus) => {
    saveStatusesRef.current.set(noteId, nextStatus);
    if (activeNoteRef.current?.id === noteId) setSaveStatus(nextStatus);
  }, []);

  const selectNote = useCallback(async (id: string) => {
    const note = await window.notes.get(id);
    activeNoteRef.current = note;
    setActiveNote(note);
    setSaveStatus(note ? saveStatusesRef.current.get(note.id) ?? "saved" : "saved");
  }, []);

  const refreshNotes = useCallback(async () => {
    const previews = await window.notes.list();
    setNotes(previews);
    return previews;
  }, []);

  useEffect(() => {
    void refreshNotes().then((previews) => {
      if (previews[0]) void selectNote(previews[0].id);
      setLoading(false);
    });
  }, [refreshNotes, selectNote]);

  const createNote = useCallback(async () => {
    const note = await window.notes.create();
    activeNoteRef.current = note;
    setActiveNote(note);
    setNoteSaveStatus(note.id, "saved");
    await refreshNotes();
  }, [refreshNotes, setNoteSaveStatus]);

  useEffect(() => window.notes.onNewNote(() => void createNote()), [createNote]);

  useEffect(
    () => () => {
      for (const pending of pendingSavesRef.current.values()) {
        if (pending.timer) clearTimeout(pending.timer);
      }
    },
    [],
  );

  const persistQueuedNote = useCallback(
    (noteId: string, note: Note, revision: number) => {
      const previous = saveChainsRef.current.get(noteId) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(async () => {
          const pending = pendingSavesRef.current.get(noteId);
          if (!pending || pending.revision !== revision) return;

          setNoteSaveStatus(noteId, "saving");
          let saved: Note | null = null;
          try {
            saved = await window.notes.save(note);
          } catch {
            // The status below communicates the failure without treating it as saved.
          }

          const latest = pendingSavesRef.current.get(noteId);
          const nextStatus = latest
            ? resolveSaveStatus(revision, latest.revision, Boolean(saved))
            : null;
          if (!nextStatus) return;
          setNoteSaveStatus(noteId, nextStatus);
          if (!saved) return;

          pendingSavesRef.current.delete(noteId);
          setNotes((current) =>
            [
              ...current.filter((item) => item.id !== saved.id),
              { id: saved.id, title: saved.title, isPinned: saved.isPinned, createdAt: saved.createdAt, updatedAt: saved.updatedAt },
            ].toSorted((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt)),
          );
        });

      saveChainsRef.current.set(noteId, next);
      void next.finally(() => {
        if (saveChainsRef.current.get(noteId) === next) {
          saveChainsRef.current.delete(noteId);
        }
      });
      return next;
    },
    [setNoteSaveStatus],
  );

  const queueSave = useCallback((note: Note) => {
    const previous = pendingSavesRef.current.get(note.id);
    if (previous?.timer) clearTimeout(previous.timer);

    const revision = (previous?.revision ?? 0) + 1;
    const pending: PendingSave = { note, revision, timer: null };
    pending.timer = setTimeout(() => {
      const latest = pendingSavesRef.current.get(note.id);
      if (!latest || latest.revision !== revision) return;
      latest.timer = null;
      void persistQueuedNote(note.id, note, revision);
    }, 450);
    pendingSavesRef.current.set(note.id, pending);
    setNoteSaveStatus(note.id, "unsaved");
  }, [persistQueuedNote, setNoteSaveStatus]);

  const updateNote = useCallback(
    (patch: Partial<Pick<Note, "title" | "content">>) => {
      const current = activeNoteRef.current;
      if (!current) return;
      const next = { ...current, ...patch };
      activeNoteRef.current = next;
      setActiveNote(next);
      queueSave(next);
    },
    [queueSave],
  );

  const flushNote = useCallback(async (noteId: string) => {
    while (true) {
      const pending = pendingSavesRef.current.get(noteId);
      if (!pending) return;
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = null;

      const revision = pending.revision;
      await persistQueuedNote(noteId, pending.note, revision);
      const latest = pendingSavesRef.current.get(noteId);
      if (!latest || latest.revision === revision) return;
    }
  }, [persistQueuedNote]);

  const flushActiveNote = useCallback(async () => {
    const current = activeNoteRef.current;
    if (current) await flushNote(current.id);
  }, [flushNote]);

  const deleteNote = useCallback(async () => {
    const target = noteToDelete;
    if (!target) return;

    const pending = pendingSavesRef.current.get(target.id);
    if (pending?.timer) clearTimeout(pending.timer);
    pendingSavesRef.current.delete(target.id);
    saveStatusesRef.current.delete(target.id);
    if (activeNoteRef.current?.id === target.id) setSaveStatus("saved");

    await window.notes.remove(target.id);
    const remaining = await refreshNotes();
    setNoteToDelete(null);

    if (activeNoteRef.current?.id === target.id) {
      const next = remaining[0];
      if (next) {
        await selectNote(next.id);
      } else {
        activeNoteRef.current = null;
        setActiveNote(null);
      }
    }
  }, [noteToDelete, refreshNotes, selectNote]);

  const afterImport = useCallback(async (firstNoteId?: string) => {
    const previews = await refreshNotes();
    const nextId = firstNoteId && previews.some((note) => note.id === firstNoteId) ? firstNoteId : previews[0]?.id;
    if (nextId) await selectNote(nextId);
  }, [refreshNotes, selectNote]);

  const exportNote = useCallback(async (id: string) => {
    if (activeNoteRef.current?.id === id) await flushActiveNote();
    setArchiveAction({ mode: "export", noteIds: [id] });
  }, [flushActiveNote]);

  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "13rem" } as CSSProperties}
    >
      <ThemeInitializer />
      <NotesSidebar
        notes={notes}
        activeId={activeNote?.id}
        labels={text}
        onCreate={() => void createNote()}
        onSelect={(id) => void selectNote(id)}
        onRequestDelete={setNoteToDelete}
        onExportNote={(id) => void exportNote(id)}
        onExportAll={() => void flushActiveNote().then(() => setArchiveAction({ mode: "export" }))}
        onImport={() => setArchiveAction({ mode: "import" })}
      />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        {activeNote ? (
          <NoteEditor
            key={`${activeNote.id}-${text.startWriting}`}
            note={activeNote}
            saveStatus={saveStatus}
            onTitleChange={(title) => updateNote({ title })}
            onContentChange={(content) => updateNote({ content })}
          />
        ) : (
          <section className="empty-workspace">
            <div className="empty-icon"><NotebookPen className="size-5" strokeWidth={1.7} /></div>
            <div>
              <h1>{loading ? text.loading : text.noNotes}</h1>
              <p>{text.noNotesDescription}</p>
            </div>
            {!loading && <Button size="xs" onClick={() => void createNote()}><Plus className="size-3.5" /><span className="text-xs">{text.newNote}</span></Button>}
          </section>
        )}
      </SidebarInset>

      <AlertDialog open={Boolean(noteToDelete)} onOpenChange={(open) => !open && setNoteToDelete(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{text.deleteNoteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {text.deleteNoteDescription.replace("{title}", noteToDelete?.title || text.untitled)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteNote()}>
              {text.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ArchivePasswordDialog action={archiveAction} onClose={() => setArchiveAction(null)} onImported={afterImport} />
    </SidebarProvider>
  );
}
