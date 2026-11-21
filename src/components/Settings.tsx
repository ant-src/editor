// The gear in the toolbar, and the panel it opens: the colors, the code's text size, and whether
// long lines wrap. A change takes effect at once, and the browser remembers it.
import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { getSettings, maxFontSize, minFontSize, set, subscribe, themes, validFontSize, type Theme } from "../settings";
import { GearIcon } from "./icons";
import { isOpener, usePopover } from "./Menu";

const themeLabels: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

export function SettingsButton() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        className="icon-button"
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={at !== null}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: box.right, y: box.bottom + 4 });
        }}
      >
        <GearIcon />
      </button>
      {at && <SettingsPanel x={at.x} y={at.y} onClose={() => setAt(null)} />}
    </>
  );
}

interface SettingsPanelProps {
  /** Where the panel's top left corner goes, in the window; it stays in the window. */
  x: number;
  y: number;
  onClose(): void;
}

export function SettingsPanel({ x, y, onClose }: SettingsPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const settings = useSyncExternalStore(subscribe, getSettings);
  const at = usePopover(panel, x, y, onClose, (el) =>
    el.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus(),
  );
  return (
    <div
      ref={panel}
      className="settings"
      role="dialog"
      aria-label="Settings"
      style={{ left: at.x, top: at.y }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      // Tab out of the panel closes it, as a click elsewhere does
      onBlur={(e) => {
        const to = e.relatedTarget;
        if (to && !e.currentTarget.contains(to as Node) && !isOpener(to)) onClose();
      }}
    >
      <div className="settings-row">
        <span id="settings-theme">Theme</span>
        <ThemeSwitch theme={settings.theme} />
      </div>
      <div className="settings-row">
        <span id="settings-font-size">Font size</span>
        <FontSize size={settings.fontSize} />
      </div>
      <div className="settings-row">
        <span id="settings-word-wrap">Word wrap</span>
        <button
          className="switch"
          role="switch"
          aria-checked={settings.wordWrap}
          aria-labelledby="settings-word-wrap"
          onClick={() => set("wordWrap", !settings.wordWrap)}
        />
      </div>
    </div>
  );
}

/** ThemeSwitch is one control for the three themes: the arrow keys move between them, as in a radio group. */
function ThemeSwitch({ theme }: { theme: Theme }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = themes[(themes.indexOf(theme) + step + themes.length) % themes.length];
    set("theme", next);
    e.currentTarget.querySelector<HTMLElement>(`[data-theme="${next}"]`)?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-labelledby="settings-theme" onKeyDown={onKeyDown}>
      {themes.map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={t === theme}
          tabIndex={t === theme ? 0 : -1}
          data-theme={t}
          onClick={() => set("theme", t)}
        >
          {themeLabels[t]}
        </button>
      ))}
    </div>
  );
}

/** FontSize is the text size, a step at a time with − and +, or typed in: it takes effect on Enter or leaving the field. */
function FontSize({ size }: { size: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n))
      set("fontSize", Math.min(Math.max(Math.round(n), minFontSize), maxFontSize));
    setDraft(null);
  };
  const step = (by: number) => {
    const next = size + by;
    if (validFontSize(next)) set("fontSize", next);
  };
  return (
    <div className="stepper" role="group" aria-labelledby="settings-font-size">
      <button
        tabIndex={-1}
        aria-label="Smaller"
        disabled={size <= minFontSize}
        onPointerDown={(e) => e.preventDefault()} // the focus stays where it is
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-labelledby="settings-font-size"
        aria-valuenow={size}
        aria-valuemin={minFontSize}
        aria-valuemax={maxFontSize}
        value={draft ?? String(size)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setDraft(null);
            step(e.key === "ArrowUp" ? 1 : -1);
          } else if (e.key === "Escape" && draft !== null) {
            e.stopPropagation(); // drops what was typed; a second Escape closes the panel
            setDraft(null);
          }
        }}
      />
      <button
        tabIndex={-1}
        aria-label="Larger"
        disabled={size >= maxFontSize}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}
