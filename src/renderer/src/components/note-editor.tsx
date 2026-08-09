import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import FileHandler from "@tiptap/extension-file-handler";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { NodeViewWrapper, ReactNodeViewRenderer, Tiptap, useEditor, useTiptap, useTiptapState, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import {
  Bold,
  Code2,
  Copy,
  Download,
  Heading1,
  Heading2,
  ImagePlus,
  Info,
  Italic,
  List,
  ListOrdered,
  MoreHorizontal,
  Quote,
  Redo2,
  Strikethrough,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/locale-provider";
import {
  formatByteSize,
  imageInsertionContent,
  localImageId,
  MAX_EDITOR_IMAGE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "@/lib/editor-utils";
import type { SaveStatus } from "@/lib/save-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocalImage, Note } from "../../../shared/types";

const lowlight = createLowlight(common);

type NoteEditorProps = {
  note: Note;
  saveStatus: SaveStatus;
  readOnly?: boolean;
  onTitleChange: (title: string) => void;
  onContentChange: (content: Record<string, unknown>) => void;
};

type ToolbarButtonProps = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ToolbarButton({ label, icon: Icon, active = false, disabled = false, onPress }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          className={active ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
          onClick={onPress}
        >
          <Icon className="size-3.5" strokeWidth={1.8} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />;
}

function ImageNodeView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const { locale, text } = useI18n();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<Awaited<ReturnType<typeof window.notes.getImageDetails>>>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const imageId = localImageId(node.attrs.src);

  const showDetails = useCallback(async () => {
    if (!imageId) return;
    setIsLoadingDetails(true);
    try {
      setDetails(await window.notes.getImageDetails(imageId));
      setDetailsOpen(true);
    } finally {
      setIsLoadingDetails(false);
    }
  }, [imageId]);

  const copyImage = useCallback(async () => {
    if (imageId) await window.notes.copyImage(imageId);
  }, [imageId]);

  const exportImage = useCallback(async () => {
    if (imageId) await window.notes.exportImage(imageId);
  }, [imageId]);

  return (
    <NodeViewWrapper className={`note-image-node ${selected ? "is-selected" : ""}`} contentEditable={false}>
      <img className="note-image" src={node.attrs.src} alt={node.attrs.alt || ""} draggable={false} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="note-image-menu-trigger"
            aria-label={text.imageActions}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem onSelect={() => void copyImage()} disabled={!imageId}>
            <Copy />
            {text.copyImage}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportImage()} disabled={!imageId}>
            <Download />
            {text.saveImageAs}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void showDetails()} disabled={!imageId || isLoadingDetails}>
            <Info />
            {text.imageDetails}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={deleteNode}>
            <Trash2 />
            {text.deleteImage}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{text.imageDetails}</DialogTitle>
            <DialogDescription>{text.imageStoredLocally}</DialogDescription>
          </DialogHeader>
          {details && (
            <dl className="image-details-grid">
              <dt>{text.imageType}</dt><dd>{details.mimeType}</dd>
              <dt>{text.imageSize}</dt><dd>{formatByteSize(details.byteSize)}</dd>
              <dt>{text.imageAdded}</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(details.createdAt))}</dd>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}

function EditorToolbar({ onInsertImage }: { onInsertImage: () => void }) {
  const { editor } = useTiptap();
  const { text } = useI18n();
  const state = useTiptapState((snapshot) => {
    const current = snapshot.editor;
    return {
      canRedo: current.can().redo(),
      canUndo: current.can().undo(),
      isBold: current.isActive("bold"),
      isBulletList: current.isActive("bulletList"),
      isCodeBlock: current.isActive("codeBlock"),
      isHeading1: current.isActive("heading", { level: 1 }),
      isHeading2: current.isActive("heading", { level: 2 }),
      isItalic: current.isActive("italic"),
      isOrderedList: current.isActive("orderedList"),
      isQuote: current.isActive("blockquote"),
      isStrike: current.isActive("strike"),
    };
  });

  if (!editor) return null;

  return (
    <TooltipProvider delayDuration={350}>
      <div className="editor-toolbar" aria-label="Editor toolbar">
        <ToolbarButton label={text.undo} icon={Undo2} disabled={!state.canUndo} onPress={() => editor.chain().focus().undo().run()} />
        <ToolbarButton label={text.redo} icon={Redo2} disabled={!state.canRedo} onPress={() => editor.chain().focus().redo().run()} />
        <ToolbarDivider />
        <ToolbarButton label={text.heading1} icon={Heading1} active={state.isHeading1} onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton label={text.heading2} icon={Heading2} active={state.isHeading2} onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarDivider />
        <ToolbarButton label={text.bold} icon={Bold} active={state.isBold} onPress={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label={text.italic} icon={Italic} active={state.isItalic} onPress={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label={text.strike} icon={Strikethrough} active={state.isStrike} onPress={() => editor.chain().focus().toggleStrike().run()} />
        <ToolbarDivider />
        <ToolbarButton label={text.bulletList} icon={List} active={state.isBulletList} onPress={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label={text.orderedList} icon={ListOrdered} active={state.isOrderedList} onPress={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label={text.quote} icon={Quote} active={state.isQuote} onPress={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton label={text.codeBlock} icon={Code2} active={state.isCodeBlock} onPress={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolbarDivider />
        <ToolbarButton label={text.insertImage} icon={ImagePlus} onPress={onInsertImage} />
      </div>
    </TooltipProvider>
  );
}

function insertImage(editor: Editor, image: LocalImage, position?: number, alt = "") {
  const contentWithParagraph = imageInsertionContent(image.src, alt);
  const chain = editor.chain().focus();
  if (typeof position === "number") chain.insertContentAt(position, contentWithParagraph).run();
  else chain.insertContent(contentWithParagraph).run();
}

export function NoteEditor({ note, saveStatus, readOnly = false, onTitleChange, onContentChange }: NoteEditorProps) {
  const { text } = useI18n();
  const onContentChangeRef = useRef(onContentChange);
  const importImageFilesRef = useRef<(currentEditor: Editor, files: File[], position?: number) => Promise<void>>(async () => undefined);
  const mediaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);

  const showMediaMessage = useCallback((message: string, duration = 2600) => {
    if (mediaTimerRef.current) clearTimeout(mediaTimerRef.current);
    setMediaMessage(message);
    mediaTimerRef.current = duration > 0 ? setTimeout(() => setMediaMessage(null), duration) : null;
  }, []);

  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  useEffect(() => () => {
    if (mediaTimerRef.current) clearTimeout(mediaTimerRef.current);
  }, []);

  const importImageFiles = useCallback(async (currentEditor: Editor, files: File[], position?: number) => {
    const imageFiles = files.filter((file) => SUPPORTED_IMAGE_MIME_TYPES.has(file.type));
    if (imageFiles.length === 0) {
      showMediaMessage(text.imageUnsupported);
      return;
    }

    let insertionPosition = position ?? currentEditor.state.selection.from;
    let insertedCount = 0;

    for (const file of imageFiles) {
      if (file.size > MAX_EDITOR_IMAGE_BYTES) {
        showMediaMessage(text.imageTooLarge);
        continue;
      }

      try {
        showMediaMessage(text.imageImporting, 0);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const image = await window.notes.importImage({ bytes, mimeType: file.type, fileName: file.name });
        if (!currentEditor.isDestroyed) {
          insertImage(currentEditor, image, insertionPosition, file.name);
          insertionPosition += 2;
          insertedCount += 1;
        }
      } catch {
        showMediaMessage(text.imageImportFailed);
      }
    }

    if (insertedCount > 0) showMediaMessage(text.imageImported);
  }, [showMediaMessage, text]);

  useEffect(() => {
    importImageFilesRef.current = importImageFiles;
  }, [importImageFiles]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: text.startWriting }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
        enableTabIndentation: true,
      }),
      Image.extend({
        addNodeView() {
          return ReactNodeViewRenderer(ImageNodeView);
        },
      }).configure({
        HTMLAttributes: { class: "note-image" },
      }),
      FileHandler.configure({
        allowedMimeTypes: [...SUPPORTED_IMAGE_MIME_TYPES],
        consumePasteEvent: true,
        onPaste: (currentEditor, files) => {
          void importImageFilesRef.current(currentEditor, files, currentEditor.state.selection.from);
        },
        onDrop: (currentEditor, files, position) => {
          void importImageFilesRef.current(currentEditor, files, position);
        },
      }),
    ],
    content: note.content,
    editable: !readOnly,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "tiptap prose-editor focus:outline-none" },
    },
    onUpdate: ({ editor: currentEditor }) => {
      queueMicrotask(() => onContentChangeRef.current(currentEditor.getJSON()));
    },
  });

  const pickImage = useCallback(async () => {
    if (!editor) return;
    try {
      showMediaMessage(text.imageImporting, 0);
      const image = await window.notes.pickImage();
      if (!image) {
        setMediaMessage(null);
        return;
      }
      insertImage(editor, image);
      showMediaMessage(text.imageImported);
    } catch {
      showMediaMessage(text.imageImportFailed);
    }
  }, [editor, showMediaMessage, text]);

  const saveStatusLabel =
    saveStatus === "unsaved"
      ? text.unsaved
      : saveStatus === "saving"
      ? text.saving
      : saveStatus === "error"
        ? text.saveFailed
        : text.saved;

  return (
    <section className="editor-workspace">
      <header className="editor-heading">
        <input
          value={note.title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={readOnly}
          className="editor-title"
          aria-label={text.noteTitle}
          placeholder={text.untitled}
        />
        <div className="editor-statuses">
          <span className="editor-status" data-state={saveStatus} aria-live="polite">
            <span className="status-dot" />
            {saveStatusLabel}
          </span>
          {mediaMessage && <span className="editor-media-status" role="status">{mediaMessage}</span>}
        </div>
      </header>
      <Tiptap editor={editor}>
        {!readOnly && <EditorToolbar onInsertImage={pickImage} />}
        <div className="editor-scroll-area">
          <div className="editor-page"><Tiptap.Content /></div>
        </div>
      </Tiptap>
    </section>
  );
}
