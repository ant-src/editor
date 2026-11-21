import { expect, test } from "vitest";
import { key, keymap, mac } from "./keys";

test("keys are written the platform's way", () => {
  if (mac) {
    expect(key("mod+shift+S")).toBe("⇧⌘S");
    expect(key("mod+Enter")).toBe("⌘↵");
  } else {
    expect(key("mod+shift+S")).toBe("Ctrl+Shift+S");
    expect(key("mod+Enter")).toBe("Ctrl+Enter");
  }
  expect(key("F5")).toBe("F5");
});

test("arrows, Delete and Ctrl are written the platform's way", () => {
  expect(key("ArrowLeft")).toBe("←");
  expect(key("Delete")).toBe(mac ? "⌦" : "Del");
  expect(key("alt+mod+F")).toBe(mac ? "⌥⌘F" : "Alt+Ctrl+F");
  expect(key("shift+ctrl+I")).toBe(mac ? "⌃⇧I" : "Shift+Ctrl+I");
});

test("the keymap lists each shortcut once in its group", () => {
  for (const { shortcuts } of keymap) {
    const labels = shortcuts.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(shortcuts.every((s) => s.keys.length > 0)).toBe(true);
  }
});
