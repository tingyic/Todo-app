import { useEffect, useRef, useState } from "react";

/**
 * Floating Help FAB + modal that follows the user while scrolling.
 * - Opens by clicking the FAB
 * - Also opens when pressing "/" or "?" (shift+/ or direct ? depending on layout)
 * - Close with Esc, clicking overlay, or the Close button
 */

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // open on '/' or '?' keypress
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // don't trigger when typing in inputs/textareas
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;

      if (e.key === "/" || e.key === "?") {
        e.preventDefault();
        setOpen(v => !v);
      }
      // quick close with Escape
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // trap focus into modal while open (basic)
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    // focus first focusable element inside content
    const el = contentRef.current;
    const focusable = el?.querySelector<HTMLElement>("button, a, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    return () => {
      prevActive?.focus();
    };
  }, [open]);

  // click outside to close
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const el = contentRef.current;
      if (!el) return;
      if (e.target instanceof Node && (fabRef.current?.contains(e.target as Node))) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const shortcuts = [
    { key: "E", desc: "Edit the focused task after clicking onto it (open edit panel for that task)" },
    { key: "Delete / Backspace", desc: "Trigger delete confirmation for focused task (after clicking onto it); press again to delete" },
    { key: "Escape", desc: "Cancel edit / close inline confirms / close this help bar" },
    { key: "Enter", desc: "In edit inputs (like Subtask title), press Enter to quickly add a subtask" },
    { key: "Arrow up / down", desc: "Navigate when you implement list focus navigation" },
    { key: "A", desc: "Toggles reminders on or off (A for alarms)" },
    { key: "S", desc: "Toggles sounds on or off (S for sound)" },
    { key: "T", desc: "Switches between light or dark theme (T for themes)" },
    { key: "J", desc: "Sort existing tasks by everything" },
    { key: "K", desc: "Sort by active / incomplete tasks" },
    { key: "L", desc: "Sort by inactive / completed tasks" },
    { key: "?", desc: "Open/close this help panel quickly" },
  ];

  return (
    <>
      {/* Floating FAB */}
      <button
        ref={fabRef}
        id="help-fab"
        aria-controls="help-modal"
        className="help-fab"
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        onClick={(e) => {
            e.stopPropagation();
            setOpen(v => !v);
        }}
      >
        <span className="help-fab-inner" aria-hidden>{open ? "X" : "?"}</span>
      </button>

      {/* Modal + overlay */}
      {open && (
        <>
          <div className="help-overlay" aria-hidden onClick={() => setOpen(false)} />
          <div className="help-modal" id="help-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" ref={contentRef}>
            <div className="help-header">
              <h3 style={{ margin: 0 }}>Keyboard shortcuts</h3>
              <button className="btn-plain" onClick={() => setOpen(false)} aria-label="Close help">Close</button>
            </div>

            <div className="help-body">
              <p style={{ marginTop: 0, color: "var(--app-muted)" }}>
                Quick guide: press the keys shown to speed up common actions
              </p>

              <ul className="help-list" aria-hidden={false}>
                {shortcuts.map(s => (
                  <li key={s.key}>
                    <kbd className="help-kbd">{s.key}</kbd>
                    <div className="help-desc">{s.desc}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </>
  );
}
