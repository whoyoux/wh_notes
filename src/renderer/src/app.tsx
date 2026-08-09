import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Archive, ArrowDownUp, Download, FileText, MoreHorizontal, NotebookPen, Pin, Plus, Tag as TagIcon, Tags, Trash2, Upload, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import type { AppCommand } from "../../shared/app-commands";
import type { ArchivedNotePreview, Note, NotePreview, NoteSort, Tag, TrashedNotePreview } from "../../shared/types";

type NotesSidebarProps = {
  notes: NotePreview[];
  archivedNotes: ArchivedNotePreview[];
  trashNotes: TrashedNotePreview[];
  activeId?: string;
  activeView: "notes" | "archive" | "trash";
  tags: Tag[];
  selectedTagIds: string[];
  labels: ReturnType<typeof useI18n>["text"];
  onCreate: () => void;
  onSetSort: (sort: NoteSort) => void;
  onToggleTagFilter: (tagId: string) => void;
  onShowNotes: () => void;
  onShowArchive: () => void;
  onShowTrash: () => void;
  onSelect: (id: string) => void;
  onRequestMoveToTrash: (note: NotePreview) => void;
  onSetPinned: (id: string, isPinned: boolean) => void;
  onArchiveNote: (id: string) => void;
  onUnarchiveNote: (id: string) => void;
  onRestoreNote: (id: string) => void;
  onRequestPermanentDelete: (note: TrashedNotePreview) => void;
  onExportNote: (id: string) => void;
  onExportAll: () => void;
  onImport: () => void;
};

const compactDropdownMenuClassName = "[&_[data-slot=dropdown-menu-item]]:text-xs [&_[data-slot=dropdown-menu-checkbox-item]]:text-xs [&_[data-slot=dropdown-menu-sub-trigger]]:text-xs";

function NotesSidebar({ notes, archivedNotes, trashNotes, activeId, activeView, tags, selectedTagIds, labels, onCreate, onSetSort, onToggleTagFilter, onShowNotes, onShowArchive, onShowTrash, onSelect, onRequestMoveToTrash, onSetPinned, onArchiveNote, onUnarchiveNote, onRestoreNote, onRequestPermanentDelete, onExportNote, onExportAll, onImport }: NotesSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="sm" aria-label={labels.moreOptions}>
                  <img src={whNotesIcon} alt="" className="size-4 rounded-sm" />
                  <span className="font-medium">wh_notes</span>
                  <MoreHorizontal className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={compactDropdownMenuClassName}>
                <DropdownMenuGroup>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <ArrowDownUp />
                      {labels.sortNotes}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={compactDropdownMenuClassName}>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => onSetSort("updated-desc")}>{labels.sortRecentlyEdited}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onSetSort("updated-asc")}>{labels.sortOldestEdited}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onSetSort("created-desc")}>{labels.sortRecentlyCreated}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onSetSort("title-asc")}>{labels.sortTitle}</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <TagIcon />
                      {labels.filterTags}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={compactDropdownMenuClassName}>
                      <DropdownMenuGroup>
                        {tags.length === 0 ? <DropdownMenuItem disabled>{labels.noTags}</DropdownMenuItem> : tags.map((tag) => (
                          <DropdownMenuCheckboxItem key={tag.id} checked={selectedTagIds.includes(tag.id)} onCheckedChange={() => onToggleTagFilter(tag.id)}>
                            {tag.name}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={onExportAll} disabled={notes.length === 0}>
                    <Download />
                    {labels.exportAllNotes}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onImport}>
                    <Upload />
                    {labels.importNotes}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" onClick={onCreate}>
              <Plus />
              <span>{labels.newNote}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" isActive={activeView === "notes"} onClick={onShowNotes}>
              <FileText />
              <span>{labels.notes}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" isActive={activeView === "archive"} onClick={onShowArchive}>
              <Archive />
              <span>{labels.archive}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" isActive={activeView === "trash"} onClick={onShowTrash}>
              <Trash2 />
              <span>{labels.trash}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{activeView === "notes" ? labels.notes : activeView === "archive" ? labels.archive : labels.trash}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {activeView === "notes" ? notes.map((note) => (
                <SidebarMenuItem key={note.id}>
                  <SidebarMenuButton size="sm" isActive={note.id === activeId} onClick={() => onSelect(note.id)}>
                    <FileText />
                    <span>{note.title || labels.untitled}</span>
                    {note.isPinned && <Pin className="ml-auto" aria-label={labels.pinNote} />}
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label={`${labels.moveToTrash}: ${note.title || labels.untitled}`}>
                        <MoreHorizontal />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className={compactDropdownMenuClassName}>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => onSetPinned(note.id, !note.isPinned)}>
                          <Pin />
                          {note.isPinned ? labels.unpinNote : labels.pinNote}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onArchiveNote(note.id)}>
                          <Archive />
                          {labels.archiveNote}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onExportNote(note.id)}>
                          <Download />
                          {labels.exportNote}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" onSelect={() => onRequestMoveToTrash(note)}>
                          <Trash2 />
                          {labels.moveToTrash}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )) : activeView === "archive" ? archivedNotes.map((note) => (
                <SidebarMenuItem key={note.id}>
                  <SidebarMenuButton size="sm" isActive={note.id === activeId} onClick={() => onSelect(note.id)}>
                    <FileText />
                    <span>{note.title || labels.untitled}</span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label={`${labels.archive}: ${note.title || labels.untitled}`}>
                        <MoreHorizontal />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className={compactDropdownMenuClassName}>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => onUnarchiveNote(note.id)}>
                          <Archive />
                          {labels.unarchive}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onExportNote(note.id)}>
                          <Download />
                          {labels.exportNote}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" onSelect={() => onRequestMoveToTrash(note)}>
                          <Trash2 />
                          {labels.moveToTrash}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )) : trashNotes.map((note) => (
                <SidebarMenuItem key={note.id}>
                  <SidebarMenuButton size="sm" isActive={note.id === activeId} onClick={() => onSelect(note.id)}>
                    <FileText />
                    <span>{note.title || labels.untitled}</span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label={`${labels.trash}: ${note.title || labels.untitled}`}>
                        <MoreHorizontal />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className={compactDropdownMenuClassName}>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => onRestoreNote(note.id)}>
                          <Upload />
                          {labels.restoreNote}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" onSelect={() => onRequestPermanentDelete(note)}>
                          <Trash2 />
                          {labels.deletePermanently}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex-row">
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
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{isExport ? text.exportArchiveTitle : text.importArchiveTitle}</DialogTitle>
            <DialogDescription>{isExport ? text.exportArchiveDescription : text.importArchiveDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
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
          <DialogFooter>
            <Button type="button" size="xs" variant="outline" onClick={onClose} disabled={isWorking}>{text.cancel}</Button>
            <Button type="submit" size="xs" disabled={isWorking}>{isExport ? text.export : text.import}</Button>
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

function TagEditorDialog({ note, tags, open, onOpenChange, onSave }: {
  note: Note | null;
  tags: Tag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (names: string[]) => Promise<void>;
}) {
  const { text } = useI18n();
  const [draft, setDraft] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(tags.map((tag) => tag.name));
      setValue("");
    }
  }, [open, tags]);

  const addTag = () => {
    const next = value.trim();
    if (!next || draft.some((tag) => tag.localeCompare(next, undefined, { sensitivity: "accent" }) === 0)) return;
    setDraft((current) => [...current, next]);
    setValue("");
  };

  const save = async () => {
    if (!note) return;
    setSaving(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.manageTags}</DialogTitle>
          <DialogDescription>{note?.title || text.untitled}</DialogDescription>
        </DialogHeader>
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); addTag(); }}>
          <Input className="flex-1" value={value} onChange={(event) => setValue(event.target.value)} placeholder={text.addTag} maxLength={50} />
          <Button type="submit" variant="outline" className="shrink-0 text-xs">{text.addTag}</Button>
        </form>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{text.tags}</p>
          {draft.length ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.map((tag) => (
                <Badge key={tag} variant="secondary">
                  <span>{tag}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="-my-0.5 -mr-1"
                    aria-label={`${text.delete}: ${tag}`}
                    onClick={() => setDraft((current) => current.filter((item) => item !== tag))}
                  >
                    <X />
                  </Button>
                </Badge>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">{text.noTags}</p>}
        </div>
        <DialogFooter>
          <Button type="button" size="xs" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{text.cancel}</Button>
          <Button type="button" size="xs" onClick={() => void save()} disabled={saving}>{text.saveTags}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function App() {
  const { text } = useI18n();
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [archivedNotes, setArchivedNotes] = useState<ArchivedNotePreview[]>([]);
  const [trashNotes, setTrashNotes] = useState<TrashedNotePreview[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [activeView, setActiveView] = useState<"notes" | "archive" | "trash">("notes");
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteToTrash, setNoteToTrash] = useState<NotePreview | null>(null);
  const [noteToPermanentlyDelete, setNoteToPermanentlyDelete] = useState<TrashedNotePreview | null>(null);
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
    const [note, noteTags] = await Promise.all([window.notes.get(id), window.notes.getTags(id)]);
    activeNoteRef.current = note;
    setActiveNote(note);
    setActiveTags(noteTags);
    setSaveStatus(note ? saveStatusesRef.current.get(note.id) ?? "saved" : "saved");
  }, []);

  const refreshNotes = useCallback(async () => {
    const previews = await window.notes.list(selectedTagIds);
    setNotes(previews);
    return previews;
  }, [selectedTagIds]);

  const refreshArchived = useCallback(async () => {
    const previews = await window.notes.listArchived(selectedTagIds);
    setArchivedNotes(previews);
    return previews;
  }, [selectedTagIds]);

  const refreshTrash = useCallback(async () => {
    const previews = await window.notes.listTrash();
    setTrashNotes(previews);
    return previews;
  }, []);

  const refreshTags = useCallback(async () => {
    const availableTags = await window.notes.listTags();
    setTags(availableTags);
    return availableTags;
  }, []);

  const setNoteSort = useCallback(async (sort: NoteSort) => {
    await window.notes.setSort(sort);
    await Promise.all([refreshNotes(), refreshArchived()]);
  }, [refreshArchived, refreshNotes]);

  useEffect(() => {
    void Promise.all([refreshNotes(), refreshArchived(), refreshTrash(), refreshTags()]).then(([previews]) => {
      if (previews[0]) void selectNote(previews[0].id);
      setLoading(false);
    });
  }, [refreshArchived, refreshNotes, refreshTags, refreshTrash, selectNote]);

  const createNote = useCallback(async () => {
    const note = await window.notes.create();
    setActiveView("notes");
    activeNoteRef.current = note;
    setActiveNote(note);
    setNoteSaveStatus(note.id, "saved");
    await refreshNotes();
  }, [refreshNotes, setNoteSaveStatus]);

  const clearActiveNote = useCallback(() => {
    activeNoteRef.current = null;
    setActiveNote(null);
    setActiveTags([]);
    setSaveStatus("saved");
  }, []);

  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds((current) => current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId]);
  }, []);

  const saveTags = useCallback(async (names: string[]) => {
    const note = activeNoteRef.current;
    if (!note) return;
    const nextTags = await window.notes.setTags(note.id, names);
    setActiveTags(nextTags);
    await Promise.all([refreshTags(), refreshNotes(), refreshArchived()]);
  }, [refreshArchived, refreshNotes, refreshTags]);

  const showNotes = useCallback(async () => {
    setActiveView("notes");
    const previews = await refreshNotes();
    if (activeNoteRef.current && previews.some((note) => note.id === activeNoteRef.current?.id)) return;
    if (previews[0]) await selectNote(previews[0].id);
    else clearActiveNote();
  }, [clearActiveNote, refreshNotes, selectNote]);

  const showTrash = useCallback(async () => {
    setActiveView("trash");
    const previews = await refreshTrash();
    if (activeNoteRef.current && previews.some((note) => note.id === activeNoteRef.current?.id)) return;
    if (previews[0]) await selectNote(previews[0].id);
    else clearActiveNote();
  }, [clearActiveNote, refreshTrash, selectNote]);

  const showArchive = useCallback(async () => {
    setActiveView("archive");
    const previews = await refreshArchived();
    if (activeNoteRef.current && previews.some((note) => note.id === activeNoteRef.current?.id)) return;
    if (previews[0]) await selectNote(previews[0].id);
    else clearActiveNote();
  }, [clearActiveNote, refreshArchived, selectNote]);

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
          await Promise.all([refreshNotes(), refreshArchived()]);
        });

      saveChainsRef.current.set(noteId, next);
      void next.finally(() => {
        if (saveChainsRef.current.get(noteId) === next) {
          saveChainsRef.current.delete(noteId);
        }
      });
      return next;
    },
    [refreshArchived, refreshNotes, setNoteSaveStatus],
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

  const moveNoteToTrash = useCallback(async () => {
    const target = noteToTrash;
    if (!target) return;

    await flushNote(target.id);

    pendingSavesRef.current.delete(target.id);
    saveStatusesRef.current.delete(target.id);
    if (activeNoteRef.current?.id === target.id) setSaveStatus("saved");

    await window.notes.moveToTrash(target.id);
    const [remaining, remainingArchived] = await Promise.all([refreshNotes(), refreshArchived(), refreshTrash()]);
    setNoteToTrash(null);

    if (activeNoteRef.current?.id === target.id) {
      const next = activeView === "archive" ? remainingArchived[0] : remaining[0];
      if (next) {
        await selectNote(next.id);
      } else {
        clearActiveNote();
      }
    }
  }, [activeView, clearActiveNote, flushNote, noteToTrash, refreshArchived, refreshNotes, refreshTrash, selectNote]);

  const restoreNote = useCallback(async (id: string) => {
    const restored = await window.notes.restoreFromTrash(id);
    const [active, archived] = await Promise.all([refreshNotes(), refreshArchived(), refreshTrash()]);
    if (!restored) return;
    setActiveView(archived.some((note) => note.id === id) ? "archive" : "notes");
    activeNoteRef.current = restored;
    setActiveNote(restored);
    setSaveStatus(saveStatusesRef.current.get(restored.id) ?? "saved");
    if (!active.some((note) => note.id === id) && !archived.some((note) => note.id === id)) clearActiveNote();
  }, [clearActiveNote, refreshArchived, refreshNotes, refreshTrash]);

  const permanentlyDeleteNote = useCallback(async () => {
    const target = noteToPermanentlyDelete;
    if (!target) return;

    await window.notes.permanentlyDelete(target.id);
    const [remaining] = await Promise.all([refreshTrash(), refreshArchived()]);
    setNoteToPermanentlyDelete(null);
    saveStatusesRef.current.delete(target.id);

    if (activeNoteRef.current?.id === target.id) {
      const next = remaining[0];
      if (next) await selectNote(next.id);
      else clearActiveNote();
    }
  }, [clearActiveNote, noteToPermanentlyDelete, refreshArchived, refreshTrash, selectNote]);

  const archiveNote = useCallback(async (id: string) => {
    await flushNote(id);
    await window.notes.archive(id);
    const [remaining] = await Promise.all([refreshNotes(), refreshArchived()]);

    if (activeNoteRef.current?.id === id) {
      const next = remaining[0];
      if (next) await selectNote(next.id);
      else clearActiveNote();
    }
  }, [clearActiveNote, flushNote, refreshArchived, refreshNotes, selectNote]);

  const setPinned = useCallback(async (id: string, isPinned: boolean) => {
    await flushNote(id);
    const saved = await window.notes.setPinned(id, isPinned);
    if (!saved) return;
    await refreshNotes();
    if (activeNoteRef.current?.id === id) {
      activeNoteRef.current = saved;
      setActiveNote(saved);
      setSaveStatus(saveStatusesRef.current.get(saved.id) ?? "saved");
    }
  }, [flushNote, refreshNotes]);

  const unarchiveNote = useCallback(async (id: string) => {
    const restored = await window.notes.unarchive(id);
    await Promise.all([refreshNotes(), refreshArchived()]);
    if (!restored) return;
    setActiveView("notes");
    activeNoteRef.current = restored;
    setActiveNote(restored);
    setSaveStatus(saveStatusesRef.current.get(restored.id) ?? "saved");
  }, [refreshArchived, refreshNotes]);

  const afterImport = useCallback(async (firstNoteId?: string) => {
    const previews = await refreshNotes();
    await Promise.all([refreshArchived(), refreshTrash()]);
    const nextId = firstNoteId && previews.some((note) => note.id === firstNoteId) ? firstNoteId : previews[0]?.id;
    if (nextId) await selectNote(nextId);
  }, [refreshArchived, refreshNotes, refreshTrash, selectNote]);

  const exportNote = useCallback(async (id: string) => {
    if (activeNoteRef.current?.id === id) await flushActiveNote();
    setArchiveAction({ mode: "export", noteIds: [id] });
  }, [flushActiveNote]);

  const runAppCommand = useCallback((command: AppCommand) => {
    if (command === "new-note") {
      void createNote();
      return;
    }
    if (command === "save-note") {
      void flushActiveNote();
      return;
    }
    const activeId = activeNoteRef.current?.id;
    if (activeView !== "trash" && activeId) void exportNote(activeId);
  }, [activeView, createNote, exportNote, flushActiveNote]);

  useEffect(() => window.notes.onAppCommand(runAppCommand), [runAppCommand]);

  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "13rem" } as CSSProperties}
    >
      <ThemeInitializer />
      <NotesSidebar
        notes={notes}
        archivedNotes={archivedNotes}
        trashNotes={trashNotes}
        tags={tags}
        selectedTagIds={selectedTagIds}
        activeId={activeNote?.id}
        activeView={activeView}
        labels={text}
        onCreate={() => void createNote()}
        onSetSort={(sort) => void setNoteSort(sort)}
        onToggleTagFilter={toggleTagFilter}
        onShowNotes={() => void showNotes()}
        onShowArchive={() => void showArchive()}
        onShowTrash={() => void showTrash()}
        onSelect={(id) => void selectNote(id)}
        onRequestMoveToTrash={setNoteToTrash}
        onSetPinned={(id, isPinned) => void setPinned(id, isPinned)}
        onArchiveNote={(id) => void archiveNote(id)}
        onUnarchiveNote={(id) => void unarchiveNote(id)}
        onRestoreNote={(id) => void restoreNote(id)}
        onRequestPermanentDelete={setNoteToPermanentlyDelete}
        onExportNote={(id) => void exportNote(id)}
        onExportAll={() => void flushActiveNote().then(() => setArchiveAction({ mode: "export" }))}
        onImport={() => setArchiveAction({ mode: "import" })}
      />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        {activeNote ? (
          <NoteEditor
            key={`${activeNote.id}-${text.startWriting}-${activeView}`}
            note={activeNote}
            saveStatus={saveStatus}
            readOnly={activeView === "trash"}
            tags={activeTags}
            onManageTags={() => setTagEditorOpen(true)}
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

      <AlertDialog open={Boolean(noteToTrash)} onOpenChange={(open) => !open && setNoteToTrash(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{text.moveToTrashTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {text.moveToTrashDescription.replace("{title}", noteToTrash?.title || text.untitled)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void moveNoteToTrash()}>
              {text.moveToTrash}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(noteToPermanentlyDelete)} onOpenChange={(open) => !open && setNoteToPermanentlyDelete(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{text.deletePermanentlyTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {text.deletePermanentlyDescription.replace("{title}", noteToPermanentlyDelete?.title || text.untitled)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void permanentlyDeleteNote()}>
              {text.deletePermanently}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TagEditorDialog note={activeNote} tags={activeTags} open={tagEditorOpen} onOpenChange={setTagEditorOpen} onSave={saveTags} />
      <ArchivePasswordDialog action={archiveAction} onClose={() => setArchiveAction(null)} onImported={afterImport} />
    </SidebarProvider>
  );
}
