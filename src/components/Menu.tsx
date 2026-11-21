// A menu that opens at a point: a context menu, or the menu under a button. Arrow keys move
// between its items, Escape and a click elsewhere close it, and focus goes back where it was.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { CheckIcon, CloseIcon } from "./icons";

export type MenuEntry =
  | {
      label: string;
      onSelect(): void;
      disabled?: boolean;
      /** For an item that deletes something. */
      danger?: boolean;
      /** The key that does the same, shown at the end. */
      shortcut?: string;
      /** For one of a set of choices: whether it is the one chosen. */
      checked?: boolean;
      /** Takes the item off the menu, from a button beside it or the Delete key. */
      onRemove?(): void;
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
  const at = usePopover(menu, x, y, onClose, (el) => items(el)[0]?.focus());

  // Items of a set of choices leave room for the check mark, all of them alike.
  const checkable = entries.some((e) => typeof e === "object" && "onSelect" in e && e.checked !== undefined);

  /** remove takes an item off, and the item in its place takes the focus once the menu shows the shorter list. */
  const remove = (entry: { onRemove?(): void }, index: number) => {
    if (!entry.onRemove) return;
    const at = items(menu.current!).findIndex((item) => item.dataset.index === String(index));
    entry.onRemove();
    requestAnimationFrame(() => {
      const now = menu.current ? items(menu.current) : [];
      now[Math.min(Math.max(at, 0), now.length - 1)]?.focus();
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const all = items(menu.current!);
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => all[(n + all.length) % all.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") onClose();
    else if ((e.key === "Delete" || e.key === "Backspace") && i >= 0) {
      const index = Number(all[i].dataset.index);
      const entry = entries[index];
      if (typeof entry !== "object" || !("onSelect" in entry) || !entry.onRemove) return;
      remove(entry, index);
    } else return;
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
          <div key={i} className="menu-row" role="none">
            <button
              className={"menu-item" + (entry.danger ? " danger" : "")}
              role={entry.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={entry.checked}
              aria-keyshortcuts={entry.onRemove ? "Delete" : undefined}
              data-index={i}
              disabled={entry.disabled}
              onClick={() => {
                onClose();
                entry.onSelect();
              }}
            >
              {checkable && <span className="menu-check">{entry.checked && <CheckIcon />}</span>}
              <span className="menu-label">{entry.label}</span>
              {entry.shortcut && <kbd className="menu-shortcut">{entry.shortcut}</kbd>}
            </button>
            {entry.onRemove && (
              // for the mouse; the keys reach the same through Delete on the item
              <button
                className="menu-remove"
                tabIndex={-1}
                aria-hidden="true"
                title={`Remove ${entry.label}`}
                onPointerDown={(e) => e.preventDefault()} // the focus stays in the menu
                onClick={() => remove(entry, i)}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        ),
      )}
    </div>
  );
}

/**
 * usePopover keeps a box that opens at a point (a menu, a panel) in the window, gives it the
 * focus, closes it on a click elsewhere, and gives the focus back where it was when it closes.
 */
export function usePopover(
  box: RefObject<HTMLElement | null>,
  x: number,
  y: number,
  onClose: () => void,
  focus: (el: HTMLElement) => void,
): { x: number; y: number } {
  const [at, setAt] = useState({ x, y });
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const el = box.current!;
    const { width, height } = el.getBoundingClientRect();
    setAt({
      x: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
    focus(el);
  }, [x, y]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const outside = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) close.current();
    };
    const dismiss = () => close.current();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      // the focus was in the box, which is gone: it goes back to where it was before
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && before?.isConnected) before.focus();
    };
  }, []);

  return at;
}

function items(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)")];
}
