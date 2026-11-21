// How the editor writes its keys: with ⌘ and ⇧ on a Mac, Ctrl+ and Shift+ elsewhere. And the
// keys there are, as the shortcuts panel lists them.

export const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
// as Monaco decides it, for the keys it binds only on Linux: not ChromeOS, whose platform says Linux too
const linux = typeof navigator !== "undefined" && !mac && navigator.userAgent.includes("Linux");

/** The order of modifiers on a Mac: ⌃⌥⇧⌘. */
const order = ["ctrl", "alt", "shift", "mod"];

const macMods: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", mod: "⌘" };
const otherMods: Record<string, string> = { ctrl: "Ctrl+", alt: "Alt+", shift: "Shift+", mod: "Ctrl+" };

const names: Record<string, [mac: string, other: string]> = {
  Enter: ["↵", "Enter"],
  Backspace: ["⌫", "Backspace"],
  Delete: ["⌦", "Del"],
  ArrowLeft: ["←", "←"],
  ArrowRight: ["→", "→"],
  ArrowUp: ["↑", "↑"],
  ArrowDown: ["↓", "↓"],
};

/** key writes a shortcut such as "mod+shift+S" the way this platform does: "mod" is ⌘ on a Mac, Ctrl elsewhere. */
export function key(shortcut: string): string {
  const parts = shortcut.split("+");
  const last = parts.pop()!;
  const name = names[last]?.[mac ? 0 : 1] ?? last;
  if (mac) parts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return parts.map((m) => (mac ? macMods : otherMods)[m] ?? m).join("") + name;
}

/** typesText says whether a key pressed in target goes into text: a field, or the code. */
export function typesText(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .monaco-editor') !== null
  );
}

export interface Shortcut {
  /** The keys, as key takes them: more than one for keys that go together, such as ← and →. */
  keys: string[];
  label: string;
  /** Shown in the empty editor, too. */
  brief?: boolean;
}

/** keymap is every key of the editor, by where it works. */
export const keymap: { group: string; shortcuts: Shortcut[] }[] = [
  {
    group: "Run and debug",
    shortcuts: [
      { keys: ["mod+Enter"], label: "Run", brief: true },
      { keys: ["mod+shift+Enter"], label: "Run the current file", brief: true },
      { keys: ["F5"], label: "Debug, or continue", brief: true },
      { keys: ["shift+F5"], label: "Stop" },
      { keys: ["F10"], label: "Step over" },
      { keys: ["F11"], label: "Step into" },
      { keys: ["shift+F11"], label: "Step out" },
    ],
  },
  {
    group: "Files",
    shortcuts: [
      { keys: ["mod+S"], label: "Save", brief: true },
      { keys: ["mod+shift+S"], label: "Save all" },
    ],
  },
  {
    group: "View",
    shortcuts: [
      { keys: ["mod+B"], label: "Toggle the file tree", brief: true },
      { keys: ["mod+J"], label: "Toggle the panel", brief: true },
      { keys: ["?"], label: "Keyboard shortcuts", brief: true },
    ],
  },
  {
    group: "File tree",
    shortcuts: [
      { keys: ["ArrowUp", "ArrowDown"], label: "Move between files" },
      { keys: ["ArrowLeft", "ArrowRight"], label: "Fold and unfold a folder" },
      { keys: ["F2"], label: "Rename" },
      { keys: [mac ? "mod+Backspace" : "Delete"], label: "Delete" },
    ],
  },
  {
    group: "Code",
    shortcuts: [
      { keys: ["F1"], label: "All commands" },
      { keys: ["mod+F"], label: "Find" },
      { keys: [mac ? "alt+mod+F" : "mod+H"], label: "Replace" },
      { keys: ["ctrl+G"], label: "Go to line" },
      { keys: ["mod+shift+O"], label: "Go to symbol" },
      { keys: ["F12"], label: "Go to definition" },
      { keys: ["shift+F12"], label: "Find references" },
      { keys: ["F2"], label: "Rename symbol" },
      { keys: ["ctrl+Space"], label: "Suggest" },
      { keys: ["mod+."], label: "Quick fix" },
      { keys: ["mod+/"], label: "Toggle line comment" },
      { keys: ["mod+D"], label: "Select the next match" },
      { keys: [linux ? "ctrl+shift+I" : "alt+shift+F"], label: "Format the file" },
    ],
  },
];
