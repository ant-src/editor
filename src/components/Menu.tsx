// A menu that opens at a point: a context menu, or the menu under a button. Arrow keys move
// between its items, Escape and a click elsewhere close it, and focus goes back where it was.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export type MenuEntry =
  | {
      label: string;
      onSelect(): void;
      disabled?: boolean;
      /** For an item that deletes something. */
      danger?: boolean;
      /** The key that does the same, shown at the end. */
      shortcut?: string;
    }
  | "separator"
  /** A line of text that is not an item, such as a note at the top. */
  | { caption: string };

export interface MenuProps {
  entries: MenuEntry[];
  /** Where the menu's top left corner goes, in the window. */
  x: number;
  y: number;
  label: string;
  onClose(): void;
}

export function Menu({ entries, x, y, label, onClose }: MenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  const close = useRef(onClose);
  close.current = onClose;

  // The menu stays in the window, and its first item takes the focus.
  useLayoutEffect(() => {
    const el = menu.current!;
    const { width, height } = el.getBoundingClientRect();
    setAt({
      x: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
    items(el)[0]?.focus();
  }, [x, y]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const outside = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close.current();
    };
    const dismiss = () => close.current();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      // the focus was in the menu, which is gone: it goes back to where it was before
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && before?.isConnected) before.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    const all = items(menu.current!);
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => all[(n + all.length) % all.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={menu}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: at.x, top: at.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === "separator" ? (
          <div key={i} className="menu-separator" role="separator" />
        ) : "caption" in entry ? (
          <div key={i} className="menu-caption" role="presentation">
            {entry.caption}
          </div>
        ) : (
          <button
            key={i}
            className={"menu-item" + (entry.danger ? " danger" : "")}
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && <kbd className="menu-shortcut">{entry.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

function items(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)")];
}
