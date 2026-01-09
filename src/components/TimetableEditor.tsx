import { useEffect, useRef, useState, type JSX } from "react";

export type TimetableTask = {
  id: string;
  title: string;
  dayIndex: number;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  priority: "low" | "medium" | "high";
  tags?: string[];
  notes?: string;
  oneOffDate?: string;
  recurrence?: {
    freq: "weekly";
    interval?: number; // every N weeks
    startDate?: string; // first date when recurrence applies
    endDate?: string; // last date when recurrence applies
    count?: number; // number of occurences
  };

  exceptions?: {
    date: string;
    deleted?: true;
    override?: Partial<Omit<TimetableTask, "id" | "exceptions" | "recurrence">>;
  }[];
};

type Props = {
  open: boolean;
  initialDay?: number;
  prefill?: Partial<TimetableTask>;
  onClose: () => void;
  onSave: (payload: Omit<TimetableTask, "id">) => void;
  onDelete?: () => void;
};

export type TimetableEditorWithHelpers = ((
  props: Props
) => JSX.Element | null) & {
  parseTimeToMinutes?: (time: string) => number | null;
};

function parseTimeToMinutes(time: string): number | null {
  if (!time || typeof time !== "string") return null;
  const m = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

const TimetableEditor: TimetableEditorWithHelpers = function TimetableEditor({
  open,
  initialDay = new Date().getDay(),
  prefill,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const recStartRef = useRef<HTMLInputElement | null>(null);
  const recEndRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(prefill?.title ?? "");
  const [dayIndex, setDayIndex] = useState<number>(prefill?.dayIndex ?? initialDay);
  const [start, setStart] = useState(prefill?.start ?? "09:00");
  const [end, setEnd] = useState(prefill?.end ?? "10:00");
  const [priority, setPriority] = useState<TimetableTask["priority"]>(prefill?.priority ?? "medium");
  const [tags, setTags] = useState<string>((prefill?.tags ?? []).join?.(",") ?? "");
  const [notes, setNotes] = useState<string>(prefill?.notes ?? "");

  // recurrence
  const [isRecurring, setIsRecurring] = useState<boolean>(() => !!prefill?.recurrence);
  const [interval, setInterval] = useState<string>(() => String(prefill?.recurrence?.interval ?? 1));
  const [recStart, setRecStart] = useState<string | "">(() => prefill?.recurrence?.startDate ?? "");
  const [recEnd, setRecEnd] = useState<string | "">(() => prefill?.recurrence?.endDate ?? "");
  const [recCount, setRecCount] = useState<string>(() => prefill?.recurrence?.count ? String(prefill?.recurrence?.count) : "");

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) return;

    setTitle(prefill?.title ?? "");
    setDayIndex(prefill?.dayIndex ?? initialDay);
    setStart(prefill?.start ?? "09:00");
    setEnd(prefill?.end ?? "10:00");
    setPriority(prefill?.priority ?? "medium");
    setTags((prefill?.tags ?? []).join?.(",") ?? "");
    setNotes(prefill?.notes ?? "");
    setIsRecurring(!!prefill?.recurrence);
    setInterval(String(prefill?.recurrence?.interval ?? 1));
    setRecStart(prefill?.recurrence?.startDate ?? "");
    setRecEnd(prefill?.recurrence?.endDate ?? "");
    setRecCount(prefill?.recurrence?.count ? String(prefill?.recurrence?.count) : "");
    setConfirmingDelete(false);
  }, [open, prefill, initialDay]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSave() {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (!title.trim()) {
      alert("Please enter a title");
      return;
    }
    if (s === null || e === null) {
      alert("Please enter valid times (HH:mm)");
      return;
    }
    if (e <= s) {
      alert("End time must be after start time");
      return;
    }

    const intervalNum = isRecurring ? (Number.parseInt(interval || "0", 10) || 0) : 0;
    const countNum = isRecurring && recCount ? (Number.parseInt(recCount, 10) || 0) : undefined;

    if (isRecurring && intervalNum <= 0) {
      alert("Recurrence interval must be a positive integer (every N weeks).");
      return;
    }
    if (isRecurring && typeof countNum === "number" && countNum < 2) {
      alert("Recurrence count must be at least 2 (untick repeat weekly box for single events)");
      return;
    }

    const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);

    const payload: Omit<TimetableTask, "id"> = {
      title: title.trim(),
      dayIndex,
      start,
      end,
      priority,
      tags: tagList,
      notes: notes.trim() || undefined,
    };

    if (isRecurring) {
      payload.recurrence = {
        freq: "weekly",
        interval: intervalNum > 0 ? intervalNum : 1,
        ...(recStart ? { startDate: recStart } : {}),
        ...(recEnd ? { endDate: recEnd } : {}),
        ...(typeof countNum === "number" && countNum >= 2 ? { count: countNum } : {}),
      };
    } else {
      payload.recurrence = undefined;
    }

    onSave(payload);
    onClose();
  }

  if (!open) return null;

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const layoutInputStyle: React.CSSProperties = {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    boxSizing: "border-box",
    WebkitAppearance: "none",
    appearance: "none",
    background: "var(--app-input-bg)",
    color: "var(--app-text)",
    border: "1px solid var(--app-border)",
  };

  const smallInputStyle: React.CSSProperties = {
    ...layoutInputStyle,
    padding: 6,
    height: "36px",
  };

  const calendarButtonStyle: React.CSSProperties = {
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid var(--app-border)",
    background: "transparent",
    cursor: "pointer",
  };

  return (
    <div
      className="timetable-editor"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.35)"
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-modal
    >
      <div
        ref={modalRef}
        role="dialog"
        style={{
          width: 420,
          maxWidth: "94%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--app-card)",
          border: "1px solid var(--app-border)",
          borderRadius: 12,
          padding: 16,
          boxSizing: "border-box",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)"
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 8px 0" }}>{prefill ? "Edit timetable task" : "Add timetable task"}</h3>

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 13, flex: 1 }}>
            Title
            <input
              className="editor-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={layoutInputStyle}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 13, flex: 1 }}>
              Day
              <select
                className="editor-input"
                value={dayIndex}
                onChange={e => setDayIndex(Number(e.target.value))}
                style={layoutInputStyle}
              >
                {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Start
              <input
                className="editor-input"
                type="time"
                value={start}
                onChange={e => setStart(e.target.value)}
                style={layoutInputStyle}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              End
              <input
                className="editor-input"
                type="time"
                value={end}
                onChange={e => setEnd(e.target.value)}
                style={layoutInputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Priority
              <select
                className="editor-input"
                value={priority}
                onChange={e => setPriority(e.target.value as TimetableTask["priority"])}
                style={layoutInputStyle}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13, flex: 1 }}>
              Tags (comma-separated)
              <input
                className="editor-input"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="e.g. lecture, lab"
                style={layoutInputStyle}
              />
            </label>
          </div>

          {/* Notes */}
          <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
            Notes (optional)
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g: Project X / pre-read lecture 2 slides"
              style={{ ...layoutInputStyle, minHeight: 80, resize: "vertical" }}
            />
          </label>

          {/* Recurrence controls */}
          <div style={{ borderTop: "1px dashed var(--app-border)", paddingTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Repeat weekly</span>
            </label>

            {isRecurring && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 13 }}>Every</div>
                  <input
                    type="text"
                    value={interval}
                    onChange={e => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setInterval(v);
                    }}
                    style={{ width: 64, ...smallInputStyle }}
                    placeholder="1"
                  />
                  <div style={{ fontSize: 13 }}>week(s)</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 13 }}>Start</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      ref={recStartRef}
                      type="date"
                      value={recStart}
                      onChange={e => setRecStart(e.target.value)}
                      style={{ ...smallInputStyle }}
                    />
                    <button
                      type="button"
                      style={calendarButtonStyle}
                      title="Open calendar"
                      onClick={() => {
                        const input = recStartRef.current;
                        if (!input) return;

                        if (typeof input.showPicker === "function") {
                          input.showPicker();
                        } else {
                          input.focus();
                        }
                      }}
                    >
                      📅
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 13 }}>End</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      ref={recEndRef}
                      type="date"
                      value={recEnd}
                      onChange={e => setRecEnd(e.target.value)}
                      style={{ ...smallInputStyle }}
                    />
                    <button
                      type="button"
                      style={calendarButtonStyle}
                      title="Open calendar"
                      onClick={() => {
                        const input = recEndRef.current;
                        if (!input) return;

                        if (typeof input.showPicker === "function") {
                          input.showPicker();
                        } else {
                          input.focus();
                        }
                      }}
                    >
                      📅
                    </button>
                  </div>

                  <div style={{ fontSize: 13 }}>or</div>

                  <input
                    type="text"
                    value={recCount}
                    onChange={e => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setRecCount(v);
                    }}
                    placeholder="count (≥ 2)"
                    style={{ width: 80, ...smallInputStyle }}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button
              className="app-btn"
              onClick={onClose}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.95")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Cancel
            </button>

            {prefill && (
              <>
                {!confirmingDelete ? (
                  <button
                    className="app-btn btn-danger"
                    onClick={() => setConfirmingDelete(true)}
                    style={{ padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
                    onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.95)")}
                    onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
                  >
                    Delete
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13, marginRight: 4 }}>Delete this?</div>
                    <button
                      className="app-btn"
                      onClick={() => setConfirmingDelete(false)}
                      style={{ padding: "6px 10px", borderRadius: 8 }}
                    >
                      Cancel
                    </button>
                    <button
                      className="app-btn btn-danger"
                      onClick={() => {
                        if (typeof onDelete === "function") onDelete();
                        else onClose();
                      }}
                      style={{ padding: "6px 10px", borderRadius: 8, fontWeight: 600 }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              className="app-btn"
              onClick={handleSave}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.95")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

TimetableEditor.parseTimeToMinutes = parseTimeToMinutes;

export default TimetableEditor;
