// The editor's settings, which the browser remembers: the colors (the system's light or dark, or
// the one the user picked), the size of the code's text, and whether long lines wrap. The page's
// CSS reads data-theme on the root element and --code-size; Monaco gets its theme by name.

export type Theme = "system" | "light" | "dark";

export interface Settings {
  theme: Theme;
  /** The code's text size, in pixels: in the editor and the console. */
  fontSize: number;
  wordWrap: boolean;
}

export const themes: readonly Theme[] = ["system", "light", "dark"];
export const fontSizes: readonly number[] = [12, 13, 14, 16, 18];

const defaults: Settings = { theme: "system", fontSize: 13, wordWrap: false };
const keys: Record<keyof Settings, string> = {
  theme: "ant-editor-theme",
  fontSize: "ant-editor-font-size",
  wordWrap: "ant-editor-word-wrap",
};

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
const listeners = new Set<() => void>();
let settings: Settings = read();

function read(): Settings {
  const stored = (name: keyof Settings) => {
    try {
      return localStorage.getItem(keys[name]);
    } catch {
      return null;
    }
  };
  const theme = stored("theme");
  const fontSize = Number(stored("fontSize"));
  return {
    theme: theme === "light" || theme === "dark" ? theme : defaults.theme,
    fontSize: fontSizes.includes(fontSize) ? fontSize : defaults.fontSize,
    wordWrap: stored("wordWrap") === "on",
  };
}

function apply() {
  const root = document.documentElement;
  if (settings.theme === "system") {
    delete root.dataset.theme;
    root.style.colorScheme = "";
  } else {
    root.dataset.theme = settings.theme;
    root.style.colorScheme = settings.theme;
  }
  root.style.setProperty("--code-size", `${settings.fontSize}px`);
  for (const listener of listeners) listener();
}

export function getSettings(): Settings {
  return settings;
}

/** set changes a setting, and the browser forgets it when it goes back to its default. */
export function set<K extends keyof Settings>(name: K, value: Settings[K]) {
  settings = { ...settings, [name]: value };
  try {
    if (value === defaults[name]) localStorage.removeItem(keys[name]);
    else localStorage.setItem(keys[name], typeof value === "boolean" ? (value ? "on" : "off") : String(value));
  } catch {}
  apply();
}

/** isDark says whether the editor shows dark colors now. */
export function isDark(): boolean {
  return settings.theme === "dark" || (settings.theme === "system" && media?.matches === true);
}

/** lineHeight is the height of a line of code for a text size. */
export function lineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.5);
}

/** subscribe calls listener when a setting changes, or the system's colors do. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

media?.addEventListener("change", () => {
  for (const listener of listeners) listener();
});

if (typeof document !== "undefined") apply();
