import { useDeferredValue, useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
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

type SearchNotesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: NoteSearchResult) => void;
};

export function SearchNotesDialog({ open, onOpenChange, onSelect }: SearchNotesDialogProps) {
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

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={text.searchNotes}
      description={text.searchNotesDescription}
      className="max-w-lg"
    >
      <Command shouldFilter={false} loop label={text.searchNotes}>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={handleQueryChange}
          placeholder={text.searchPlaceholder}
        />
        <CommandList>
          {!query.trim() ? (
            <CommandEmpty>{text.searchStart}</CommandEmpty>
          ) : isSearching ? (
            <CommandEmpty>{text.searching}</CommandEmpty>
          ) : results.length === 0 ? (
            <CommandEmpty>{text.searchNoResults}</CommandEmpty>
          ) : (
            <CommandGroup heading={text.searchNotes}>
              {results.map((result) => (
                <CommandItem key={result.id} value={result.id} onSelect={() => onSelect(result)}>
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
