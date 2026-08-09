import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Download, FilePlus, FileText, Save, Trash2 } from "lucide-react";
import { useI18n } from "@/components/locale-provider";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { NoteSearchResult } from "../../../shared/types";

export type CommandPaletteAction = "new-note" | "save-note" | "export-note" | "move-to-trash";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: Array<{ id: CommandPaletteAction; disabled?: boolean }>;
  onAction: (action: CommandPaletteAction) => void;
  onSelectNote: (result: NoteSearchResult) => void;
};

export function CommandPalette({ open, onOpenChange, actions, onAction, onSelectNote }: CommandPaletteProps) {
  const { text } = useI18n();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<NoteSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    if (open) return;
    requestVersion.current += 1;
    setQuery("");
    setResults([]);
    setIsSearching(false);
  }, [open]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const normalizedDeferredQuery = deferredQuery.trim();

    if (!open || !normalizedQuery) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    if (normalizedDeferredQuery !== normalizedQuery) {
      setIsSearching(true);
      return;
    }

    const version = ++requestVersion.current;
    let cancelled = false;
    setIsSearching(true);

    void window.notes.search(normalizedDeferredQuery).then(
      (nextResults) => {
        if (!cancelled && version === requestVersion.current) setResults(nextResults);
      },
      () => {
        if (!cancelled && version === requestVersion.current) setResults([]);
      },
    ).finally(() => {
      if (!cancelled && version === requestVersion.current) setIsSearching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, open, query]);

  const handleQueryChange = (nextQuery: string) => {
    requestVersion.current += 1;
    setQuery(nextQuery);
    setResults([]);
  };

  const actionDefinitions = {
    "new-note": { icon: FilePlus, label: text.newNote },
    "save-note": { icon: Save, label: text.saveNow },
    "export-note": { icon: Download, label: text.exportCurrentNote },
    "move-to-trash": { icon: Trash2, label: text.moveToTrash },
  } satisfies Record<CommandPaletteAction, { icon: typeof FileText; label: string }>;

  const runAction = (action: CommandPaletteAction) => {
    onOpenChange(false);
    onAction(action);
  };

  const selectNote = (result: NoteSearchResult) => {
    onOpenChange(false);
    onSelectNote(result);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={text.commandPalette}
      description={text.commandPaletteDescription}
      className="max-w-lg"
    >
      <Command shouldFilter={false} loop label={text.commandPalette}>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={handleQueryChange}
          placeholder={text.searchPlaceholder}
        />
        <CommandList>
          {!query.trim() ? (
            <CommandGroup heading={text.commandActions}>
              {actions.map((action) => {
                const definition = actionDefinitions[action.id];
                const Icon = definition.icon;
                return (
                  <CommandItem key={action.id} value={action.id} disabled={action.disabled} onSelect={() => runAction(action.id)}>
                    <Icon />
                    {definition.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : isSearching ? (
            <CommandEmpty>{text.searching}</CommandEmpty>
          ) : results.length === 0 ? (
            <CommandEmpty>{text.searchNoResults}</CommandEmpty>
          ) : (
            <CommandGroup heading={text.searchNotes}>
              {results.map((result) => (
                <CommandItem key={result.id} value={result.id} onSelect={() => selectNote(result)}>
                  <FileText />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">{result.title || text.untitled}</span>
                    {result.excerpt && <span className="truncate text-muted-foreground">{result.excerpt}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
