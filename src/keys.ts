// How the editor writes its keys: with ⌘ and ⇧ on a Mac, Ctrl+ and Shift+ elsewhere.

export const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** key writes a shortcut such as "mod+shift+S" the way this platform does. */
export function key(shortcut: string): string {
  const parts = shortcut.split("+");
  const last = parts.pop()!;
  const name = last === "Enter" ? (mac ? "↵" : "Enter") : last === "Backspace" ? (mac ? "⌫" : "Backspace") : last;
  const mods = parts.map((m) =>
    m === "mod"
      ? mac
        ? "⌘"
        : "Ctrl+"
      : m === "shift"
        ? mac
          ? "⇧"
          : "Shift+"
        : m === "alt"
          ? mac
            ? "⌥"
            : "Alt+"
          : m,
  );
  return mods.join("") + name;
}
