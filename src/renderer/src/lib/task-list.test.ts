/** @vitest-environment happy-dom */

import { Editor } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

let editor: Editor | undefined;

function createEditor(content = "<p>Buy milk</p>") {
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({
    element,
    content,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: {
          checkboxLabel: (_node, checked) => (checked ? "Task completed" : "Task not completed"),
        },
      }),
    ],
  });

  return { editor, element };
}

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  document.body.replaceChildren();
});

describe("checklists", () => {
  it("turns selected text into a checklist with an interactive checkbox", () => {
    const { editor: currentEditor, element } = createEditor();

    currentEditor.commands.selectAll();
    expect(currentEditor.commands.toggleTaskList()).toBe(true);
    expect(currentEditor.getJSON().content?.[0]).toMatchObject({
        type: "taskList",
        content: [{
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Buy milk" }] }],
        }],
    });
    currentEditor.commands.setTextSelection(3);
    expect(currentEditor.isActive("taskList")).toBe(true);

    const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox).toHaveProperty("ariaLabel", "Task not completed");

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(currentEditor.getJSON().content?.[0]).toMatchObject({
      type: "taskList",
      content: [{ type: "taskItem", attrs: { checked: true } }],
    });
    expect(checkbox).toHaveProperty("ariaLabel", "Task completed");
  });
});
