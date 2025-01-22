import { EditorState, Extension, StateField, RangeSet } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, indentWithTab, history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching } from "@codemirror/language";

const yeshieBackground = Decoration.mark({
  class: "cm-yeshie-response",
  inclusive: true
});

const userBackground = Decoration.mark({
  class: "cm-user-response",
  inclusive: true
});

function getBackgroundRanges(content: string) {
  const ranges = [];
  let currentPos = 0;
  
  const lines = content.split('\n');
  const lastLineIndex = lines.length - 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = currentPos;
    const lineLength = lines[i].length;
    
    if (line.trim() || i === lastLineIndex) {
      const isUserResponse = line.startsWith('> ') || (i === lastLineIndex && line.trim());
      ranges.push({
        from: lineStart,
        to: lineStart + lineLength,
        value: isUserResponse ? userBackground : yeshieBackground
      });
    }
    
    currentPos += lineLength + 1;
  }
  
  return ranges;
}

export function createBackgroundField() {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decorations, tr) {
      if (!tr.docChanged) return decorations;
      return RangeSet.of(getBackgroundRanges(tr.state.doc.toString()));
    },
    provide: f => EditorView.decorations.from(f)
  });
}

const baseExtensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  bracketMatching(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  EditorView.lineWrapping,
  markdown()
];

export function createEditorExtensions(handlers: {
  onSave: () => boolean;
  onEnter: () => boolean;
  onSelectAll: (view: EditorView) => boolean;
  onRegularEnter: (view: EditorView) => boolean;
  theme?: Extension;
}): Extension[] {
  return [
    ...baseExtensions,
    keymap.of([...defaultKeymap, indentWithTab]),
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          console.log("[keymap] Mod-s triggered");
          return handlers.onSave();
        },
      },
      {
        key: "Meta-Enter",
        preventDefault: true,
        run: () => {
          console.log("[keymap] Meta-Enter triggered");
          return handlers.onEnter();
        },
      },
      {
        key: "Ctrl-Enter",
        preventDefault: true,
        run: () => {
          console.log("[keymap] Ctrl-Enter triggered");
          return handlers.onEnter();
        },
      },
      {
        key: "Mod-Shift-s",
        preventDefault: true,
        run: () => {
          console.log("[keymap] Mod-Shift-s triggered");
          return true;
        },
      },
      {
        key: "Mod-a",
        preventDefault: true,
        run: handlers.onSelectAll,
      },
      {
        key: "Enter",
        run: (view) => {
          console.log("[keymap] Enter triggered");
          return handlers.onRegularEnter(view);
        }
      }
    ]),
    createBackgroundField(),
    ...(handlers.theme ? [handlers.theme] : [])
  ];
} 