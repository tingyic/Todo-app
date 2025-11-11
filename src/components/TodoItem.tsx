import { useEffect, useState } from "react";
import type { Todo, Priority, Recurrence } from "../types";
import { formatLocalDateTime, parseLocalDateTime } from "../utils/dates";

type Props = {
  todo: Todo;
  onToggle: (id: string, createNext?: boolean | null) => void; // createNext overrides global setting
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>) => void;
};

function recurrenceHasWeekdays(r?: Todo["recurrence"]): r is (Recurrence & { weekdays?: number[] }) {
  if (!r) return false;
  if (!("freq" in (r as Record<string, unknown>))) return false;
  if ((r as Record<string, unknown>).freq !== "weekly") return false;
  const maybeWeekdays = (r as Record<string, unknown>).weekdays;
  return Array.isArray(maybeWeekdays);
}

function recurrenceLabel(r?: Todo["recurrence"]) {
  if (!r) return "";
  if (r.freq === "daily") return `Repeats: every ${r.interval ?? 1} day(s)`;
  if (r.freq === "weekly") {
    const days = recurrenceHasWeekdays(r) ? r.weekdays : undefined;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const list = days && days.length ? days.map(d => dayNames[d]).join(", ") : "weekly";
    return `Repeats: ${list}`;
  }
  if (r.freq === "monthly") return `Repeats: every ${r.interval ?? 1} month(s)`;
  return "";
}

export default function TodoItem({ todo, onToggle, onRemove, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState(() => ({
    text: todo.text,
    due: todo.due ?? "",
    tags: todo.tags.join(", "),
    priority: todo.priority as Priority,
    reminders: (todo.reminders ?? []) as number[],
  }));

  // recurrence editing state (in edit mode)
  const [isRecurring, setIsRecurring] = useState<boolean>(!!todo.recurrence);
  const [freq, setFreq] = useState<Recurrence["freq"]>(todo.recurrence?.freq ?? "daily");
  const [interval, setInterval] = useState<number>((todo.recurrence?.interval as number) ?? 1);
  const initialWeekdays = recurrenceHasWeekdays(todo.recurrence) ? (todo.recurrence!.weekdays ?? []) : [];
  const [weekdays, setWeekdays] = useState<number[]>(initialWeekdays);

  // inline confirm for toggle on recurring todos
  const [confirmOpen, setConfirmOpen] = useState(false);

  // EXPIRED PROMPT state: show prompt if due passed and not done.
  const [showExpiredPrompt, setShowExpiredPrompt] = useState(false);

  // UI help for adding reminders in edit mode
  const [reminderSelect, setReminderSelect] = useState<number | "">(5);

  function toggleWeekday(d: number) {
    setWeekdays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));
  }

  function addReminderToDraft() {
    if (reminderSelect === "") return;
    const m = Number(reminderSelect);
    if (!Number.isFinite(m) || m < 0) return;
    setDraft(d => {
      const cur = d.reminders ?? [];
      if (cur.includes(m)) return d;
      return { ...d, reminders: [...cur, m].sort((a, b) => a - b) };
    });
    setReminderSelect("");
  }

  function removeReminderFromDraft(m: number) {
    setDraft(d => ({ ...d, reminders: (d.reminders ?? []).filter(x => x !== m) }));
  }

  function save() {
    const recurrence: Recurrence | null = isRecurring
      ? freq === "daily"
        ? { freq: "daily", interval: Math.max(1, Math.floor(interval)) }
        : freq === "weekly"
          ? { freq: "weekly", interval: Math.max(1, Math.floor(interval)), weekdays: weekdays.length ? weekdays : undefined }
          : { freq: "monthly", interval: Math.max(1, Math.floor(interval)), dayOfMonth: undefined }
      : null;

    onUpdate(todo.id, {
      text: draft.text.trim() || todo.text,
      due: draft.due || null,
      tags: draft.tags.split(",").map(s => s.trim()).filter(Boolean),
      priority: draft.priority,
      recurrence,
      reminders: draft.reminders?.length ? draft.reminders : undefined,
    });
    setEditing(false);
  }

  // when user clicks checkbox
  function handleCheckboxClick() {
    // If toggling from done -> undone, just toggle (no confirm)
    if (todo.done) {
      onToggle(todo.id);
      return;
    }

    // If non-recurring, simply toggle; if recurring, show inline confirm
    if (!todo.recurrence) {
      onToggle(todo.id);
      return;
    }

    // show inline confirm to let user choose
    setConfirmOpen(true);
  }

  // compute expired
  const expired = (() => {
    if (!todo.due) return false;
    const d = parseLocalDateTime(todo.due);
    if (!d) return false;
    return d.getTime() < Date.now();
  })();

  // show the prompt once when item becomes expired and is not done
  useEffect(() => {
    if (expired && !todo.done) {
      setShowExpiredPrompt(true);
    } else {
      setShowExpiredPrompt(false);
    }
  }, [expired, todo.done]);

  const recLabel = recurrenceLabel(todo.recurrence);

  return (
    <div className={`todo-item ${todo.done ? "todo-done" : ""}`}>
      <div className="todo-col-checkbox">
        <input
          aria-label="Toggle todo"
          type="checkbox"
          checked={todo.done}
          onChange={handleCheckboxClick}
        />
      </div>

      <div className="todo-col-content">
        {!editing ? (
          <>
            <div className={`todo-title prio-${todo.priority}`}>{todo.text}</div>

            <div className="todo-tags" aria-hidden={todo.tags.length === 0}>
              {todo.tags.length ? todo.tags.map(t => <span key={t} className="tag">#{t}</span>) : <span className="no-tags">no tags</span>}
            </div>

            <div className="todo-meta">
              <span className="todo-date">{todo.due ? formatLocalDateTime(todo.due) : new Date(todo.createdAt).toLocaleString()}</span>
              <span className={`priority-badge prio-${todo.priority}`}>{todo.priority}</span>
            </div>

            {recLabel ? <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{recLabel}</div> : null}

            {/* show reminders summary */}
            {todo.reminders && todo.reminders.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {todo.reminders.map(m => (
                  <div key={m} className="tag" style={{ padding: "4px 8px" }}>
                    {m === 0 ? "At due" : (m >= 60 ? `${m/60} hr` : `${m} min`)}
                  </div>
                ))}
              </div>
            )}

            {/* inline confirm UI (visible when user checks recurring todo) */}
            {confirmOpen && (
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  className="btn-plain"
                  onClick={() => { setConfirmOpen(false); onToggle(todo.id, true); }}
                >
                  Create next
                </button>
                <button
                  className="btn-plain"
                  onClick={() => { setConfirmOpen(false); onToggle(todo.id, false); }}
                >
                  Mark done permanently
                </button>
                <button
                  className="btn-plain"
                  onClick={() => { setConfirmOpen(false); /* cancel */ }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* EXPIRED PROMPT: show only when expired & not done */}
            {showExpiredPrompt && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "var(--tag-bg)", border: "1px solid var(--app-border)", display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: "var(--app-text)" }}>
                  Hmm...this task's due time has passed sia. Have you finished it already? Or u simply forgor 💀
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn-plain" onClick={() => { onToggle(todo.id); setShowExpiredPrompt(false); }}>
                    Sir yes sir it's done~
                  </button>
                  <button type="button" className="btn-plain" onClick={() => { setShowExpiredPrompt(false); }}>
                    No leh alamak i forgor 🤡
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <input className="editor-input" value={draft.text} onChange={(e) => setDraft(d => ({ ...d, text: e.target.value }))} />

            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <input
                type="datetime-local"
                className="editor-input"
                value={draft.due}
                onChange={(e) => setDraft(d => ({ ...d, due: e.target.value }))}
                style={{ minWidth: 200 }}
              />
              <input
                className="editor-input"
                placeholder="tags: a, b"
                value={draft.tags}
                onChange={(e) => setDraft(d => ({ ...d, tags: e.target.value }))}
                style={{ minWidth: 150 }}
              />
              <select value={draft.priority} onChange={(e) => setDraft(d => ({ ...d, priority: e.target.value as Priority }))} className="editor-input" style={{ width: 120 }}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Reminders editor */}
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={reminderSelect}
                onChange={(e) => setReminderSelect(e.target.value === "" ? "" : Number(e.target.value))}
                className="editor-input"
                style={{ width: 140 }}
              >
                <option value="">Add reminder</option>
                <option value={60}>1 hr</option>
                <option value={30}>30 min</option>
                <option value={10}>10 min</option>
                <option value={5}>5 min</option>
                <option value={1}>1 min</option>
                <option value={0}>At due</option>
              </select>
              <button type="button" onClick={addReminderToDraft} className="btn-plain">Add reminder</button>

              {/* show draft reminders */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: 8 }}>
                {(draft.reminders ?? []).map(m => (
                  <div key={m} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 999, border: "1px solid var(--app-border)", background: "var(--tag-bg)" }}>
                    <span style={{ fontSize: 12 }}>{m === 0 ? "At due" : (m >= 60 ? `${m/60} hr` : `${m} min`)}</span>
                    <button type="button" onClick={() => removeReminderFromDraft(m)} className="btn-plain" style={{ padding: "4px 6px" }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Recurrence editor UI */}
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                Recurring
              </label>

              {isRecurring && (
                <>
                  <select value={freq} onChange={(e) => setFreq(e.target.value as Recurrence["freq"])} className="editor-input" style={{ width: 120 }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>

                  <input
                    className="editor-input"
                    style={{ width: 80 }}
                    type="number"
                    min={1}
                    value={interval}
                    onChange={(e) => setInterval(parseInt(e.target.value || "1", 10))}
                  />

                  {freq === "weekly" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {["S","M","T","W","T","F","S"].map((label, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleWeekday(i)}
                          className="btn-plain"
                          style={{ padding: "6px 8px", background: weekdays.includes(i) ? "#eef" : undefined }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <button onClick={save} className="btn-plain">Save</button>
              <button onClick={() => setEditing(false)} className="btn-plain" style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <div className="todo-col-actions">
        {!editing ? (
          <>
            <button className="btn-plain" onClick={() => {
              setEditing(true);
              setDraft({ text: todo.text, due: todo.due ?? "", tags: todo.tags.join(", "), priority: todo.priority, reminders: todo.reminders ?? [] });
              // initialize recurrence edit state
              setIsRecurring(!!todo.recurrence);
              setFreq((todo.recurrence?.freq) ?? "daily");
              setInterval((todo.recurrence?.interval) ?? 1);
              setWeekdays(recurrenceHasWeekdays(todo.recurrence) ? (todo.recurrence!.weekdays ?? []) : []);
            }}>Edit</button>

            <button className="btn-danger" onClick={() => onRemove(todo.id)}>Delete</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
