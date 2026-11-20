// The editor's colors: the system's light or dark, or the one the user picked, which the browser
// remembers. The page's CSS reads data-theme on the root element; Monaco gets its theme by name.

export type Theme = "system" | "light" | "dark";

const key = "ant-editor-theme";
const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
const listeners = new Set<() => void>();
let theme: Theme = read();

function read(): Theme {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return "system";
}

function apply() {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    root.style.colorScheme = "";
  } else {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }
  for (const listener of listeners) listener();
}

export function getTheme(): Theme {
  return theme;
}

export function setTheme(next: Theme) {
  theme = next;
  try {
    if (next === "system") localStorage.removeItem(key);
    else localStorage.setItem(key, next);
  } catch {}
  apply();
}

/** isDark says whether the editor shows dark colors now. */
export function isDark(): boolean {
  return theme === "dark" || (theme === "system" && media?.matches === true);
}

/** subscribe calls listener when the colors change, by the user's pick or the system's. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

media?.addEventListener("change", () => {
  for (const listener of listeners) listener();
});

if (typeof document !== "undefined") apply();
