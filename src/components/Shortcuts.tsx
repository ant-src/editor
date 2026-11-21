// The keyboard in the toolbar, and the panel it opens: every key of the editor, by where it works.
// ? opens it too, and Escape, a click elsewhere or ? again close it.
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { key, keymap, type Shortcut } from "../keys";
import { KeyboardIcon } from "./icons";
import { usePopover } from "./Menu";

interface ShortcutsButtonProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function ShortcutsButton({ open, onOpenChange }: ShortcutsButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  // under the button, whether a click or a key opened it
  useLayoutEffect(() => {
    if (!open) return setAt(null);
    const box = button.current!.getBoundingClientRect();
    setAt({ x: box.right, y: box.bottom + 4 });
  }, [open]);
  return (
    <>
      <button
        ref={button}
        className="icon-button"
        title={`Keyboard shortcuts (${key("?")})`}
        aria-label="Keyboard shortcuts"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <KeyboardIcon />
      </button>
      {open && at && <ShortcutsPanel x={at.x} y={at.y} onClose={() => onOpenChange(false)} />}
    </>
  );
}

interface ShortcutsPanelProps {
  /** Where the panel's top left corner goes, in the window; it stays in the window. */
  x: number;
  y: number;
  onClose(): void;
}

export function ShortcutsPanel({ x, y, onClose }: ShortcutsPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const at = usePopover(panel, x, y, onClose, (el) => el.focus());
  return (
    <div
      ref={panel}
      className="shortcuts"
      role="dialog"
      aria-labelledby="shortcuts-title"
      tabIndex={-1}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      // Tab out of the panel closes it, as a click elsewhere does
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) onClose();
      }}
    >
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <div className="shortcuts-groups">
        {keymap.map(({ group, shortcuts }) => (
          <section key={group} aria-label={group}>
            <h3>{group}</h3>
            <KeyList shortcuts={shortcuts} />
          </section>
        ))}
      </div>
    </div>
  );
}

/** KeyList is shortcuts as a list of terms: the keys, then what they do. */
export function KeyList({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <dl>
      {shortcuts.map(({ keys, label }) => (
        <Fragment key={label}>
          <dt>
            {keys.map((k) => (
              <kbd key={k}>{key(k)}</kbd>
            ))}
          </dt>
          <dd>{label}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
