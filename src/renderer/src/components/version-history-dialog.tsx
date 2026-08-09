import { useEffect, useMemo, useState } from "react";
import { History, LoaderCircle, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Note, NoteVersionPreview } from "../../../shared/types";

type VersionHistoryDialogProps = {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (versionId: string) => Promise<boolean>;
};

export function VersionHistoryDialog({ note, open, onOpenChange, onRestore }: VersionHistoryDialogProps) {
  const { locale, text } = useI18n();
  const [versions, setVersions] = useState<NoteVersionPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  useEffect(() => {
    if (!open || !note) {
      setVersions([]);
      setIsLoading(false);
      setRestoringId(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setRestoringId(null);
    setError(null);
    void window.notes.listVersions(note.id).then(
      (nextVersions) => {
        if (!cancelled) setVersions(nextVersions);
      },
      () => {
        if (!cancelled) setError(text.versionHistoryLoadFailed);
      },
    ).finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [note, open, text.versionHistoryLoadFailed]);

  const restore = async (versionId: string) => {
    setRestoringId(versionId);
    setError(null);
    try {
      if (await onRestore(versionId)) onOpenChange(false);
      else setError(text.versionRestoreFailed);
    } catch {
      setError(text.versionRestoreFailed);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="size-4" />{text.versionHistory}</DialogTitle>
          <DialogDescription>{text.versionHistoryDescription}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />{text.loading}</div>
          ) : versions.length ? (
            <div className="divide-y divide-border">
              {versions.map((version) => {
                const isRestoring = restoringId === version.id;
                return (
                  <div key={version.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{version.title || text.untitled}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{dateFormatter.format(new Date(version.createdAt))}</p>
                      {version.excerpt && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{version.excerpt}</p>}
                    </div>
                    <Button type="button" size="xs" variant="outline" className="shrink-0" disabled={Boolean(restoringId)} onClick={() => void restore(version.id)}>
                      {isRestoring ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                      {text.restoreVersion}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : <p className="py-6 text-center text-xs text-muted-foreground">{text.noVersions}</p>}
        </div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button type="button" size="xs" variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(restoringId)}>{text.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
