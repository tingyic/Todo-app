import { useEffect, useRef, useState } from "react";
import type { Todo, Priority, Recurrence, Subtask } from "../types";
import { formatLocalDateTime, parseLocalDateTime } from "../utils/dates";
import { play } from "../utils/sound";

type Props = {
  index?: number;
  todo: Todo;
  onToggle: (id: string, createNext?: boolean | null) => void; // createNext overrides global setting
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>) => void;
  isDusting?: boolean;
};

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

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

export default function TodoItem({ index, todo, onToggle, onRemove, onUpdate, isDusting = false, }: Props) {
  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState(() => ({
    text: todo.text,
    due: todo.due ?? "",
    tags: todo.tags.join(", "),
    priority: todo.priority as Priority,
    reminders: (todo.reminders ?? []) as number[],
  }));

  // subtask editing UI (only used while editing)
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [subtaskPriority, setSubtaskPriority] = useState<Priority>("medium");
  const [subtaskDue, setSubtaskDue] = useState("");
  const [subtaskReminderSelect, setSubtaskReminderSelect] = useState<number | "">(5);
  const [subtaskReminders, setSubtaskReminders] = useState<number[]>([]);
  const [subtasksLocal, setSubtasksLocal] = useState<Subtask[]>(todo.subtasks ?? []);

  const cleanedSubtasks = subtasksLocal;
  const [subtaskRemSelects, setSubtaskRemSelects] = useState<Record<string, number | "">>({});

  const [subtaskDeleteConfirm, setSubtaskDeleteConfirm] = useState<Record<string, boolean>>({});

  // recurrence editing state (in edit mode)
  const [isRecurring, setIsRecurring] = useState<boolean>(!!todo.recurrence);
  const [freq, setFreq] = useState<Recurrence["freq"]>(todo.recurrence?.freq ?? "daily");
  const [interval, setInterval] = useState<number>((todo.recurrence?.interval as number) ?? 1);
  const initialWeekdays = recurrenceHasWeekdays(todo.recurrence) ? (todo.recurrence!.weekdays ?? []) : [];
  const [weekdays, setWeekdays] = useState<number[]>(initialWeekdays);

  // inline confirm for toggle on recurring todos
  const [confirmOpen, setConfirmOpen] = useState(false);

  // inline confirm for delete
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // EXPIRED PROMPT state: show prompt if due passed and not done.
  const [showExpiredPrompt, setShowExpiredPrompt] = useState(false);

  // UI help for adding reminders in edit mode
  const [reminderSelect, setReminderSelect] = useState<number | "">(5);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState(false);

  // add entrance animation class on mount
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.classList.add("enter");
    const t = window.setTimeout(() => el.classList.remove("enter"), 20);
    return () => {
      clearTimeout(t);
    };
  }, []);

  // sync local subtasks if todo changes from outside
  useEffect(() => {
    setSubtasksLocal(todo.subtasks ?? []);
  }, [todo.subtasks]);

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

  function addSubtaskReminder() {
    if (subtaskReminderSelect === "") return;
    const m = Number(subtaskReminderSelect);
    if (!Number.isFinite(m) || m < 0) return;
    setSubtaskReminders(prev => (prev.includes(m) ? prev : [...prev, m].sort((a, b) => a - b)));
    setSubtaskReminderSelect("");
  }
  function removeSubtaskReminder(m: number) {
    setSubtaskReminders(prev => prev.filter(x => x !== m));
  }

  function addSubtaskDraft() {
    const trimmed = subtaskDraft.trim();
    if (!trimmed) return;
    const s: Subtask = {
      id: makeId(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
      ...(subtaskPriority ? { priority: subtaskPriority } : {}),
      ...(subtaskDue ? { due: subtaskDue } : {}),
      ...(subtaskReminders.length ? { reminders: subtaskReminders.slice() } : {}),
    } as unknown as Subtask;

    setSubtasksLocal(prev => {
      const next = [...prev, s];
      onUpdate(todo.id, { subtasks: next, done: false });
      return next;
    });

    setSubtaskDraft("");
    setSubtaskPriority("medium");
    setSubtaskDue("");
    setSubtaskReminders([]);
    setSubtaskReminderSelect(5);
  }

  function requestSubtaskDelete(id: string) {
    setSubtaskDeleteConfirm(prev => ({ ...prev, [id]: true }));
  }

  function cancelSubtaskDelete(id: string) {
    setSubtaskDeleteConfirm(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function confirmSubtaskDelete(id: string, isEditingMode: boolean) {
    if (isEditingMode) {
      setSubtasksLocal(prev => prev.filter(s => s.id !== id));
    } else {
      onUpdate(todo.id, { subtasks: (todo.subtasks ?? []).filter(s => s.id !== id) });
    }

    play("delete", true);
    cancelSubtaskDelete(id);
  }

  function toggleSubtaskDone(id: string) {
    const current = todo.subtasks ?? [];

    const next = current.map(s => {
      if (s.id !== id) return s;
      const currentDone = !!s.done || !!todo.done;
      return { ...s, done: !currentDone };
    });

    onUpdate(todo.id, { subtasks: next });

    const allDone = next.length > 0 && next.every(s => s.done);
    if (allDone && !todo.done) {
      onToggle(todo.id);
      play("done", true);
      return;
    }

    const toggled = next.find(s => s.id === id);
    if (todo.done && toggled && !toggled.done) {
      onUpdate(todo.id, { done: false, subtasks: next });
      play("undo", true);
      return;
    }

    if (toggled?.done) play("done", true);
    else play("undo", true);
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
      subtasks: subtasksLocal.length ? cleanedSubtasks : undefined,
    });
    setEditing(false);
    play("click");
  }

  // when user clicks checkbox
  function handleCheckboxClick() {
    // If toggling from done -> undone, just toggle (no confirm)
    if (todo.done) {
      onToggle(todo.id);
      play("undo", true);
      return;
    }

    // If non-recurring, simply toggle; if recurring, show inline confirm
    if (!todo.recurrence) {
      onToggle(todo.id);
      play("done", true);
      return;
    }

    // show inline confirm to let user choose
    setConfirmOpen(true);

    if ((todo.subtasks ?? []).length) {
      const allDoneSubs = (todo.subtasks ?? []).map(s => ({ ...s, done: true }));
      onUpdate(todo.id, { subtasks: allDoneSubs });
    }
  }

  function handleDeleteClick() {
    setLeaving(true);
    setDeleteConfirmOpen(false);
    play("delete", true);
    setTimeout(() => onRemove(todo.id), 220);
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
  const cssVars = ({ ["--i"]: index ?? 0 } as unknown) as React.CSSProperties & Record<string, number>;

  return (
    <div
      ref={rootRef}
      className={`todo-item ${todo.done ? "todo-done" : ""} ${leaving ? "leaving" : ""} ${isDusting ? "dust" : ""}`}
      style={cssVars}
    >
      <div className="todo-col-checkbox">
        <input aria-label="Toggle todo" type="checkbox" checked={todo.done} onChange={handleCheckboxClick} />
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
                    {m === 0 ? "At due" : (m >= 60 ? `${m / 60} hr` : `${m} min`)}
                  </div>
                ))}
              </div>
            )}

            {/* Subtasks list (view mode) */}
            {todo.subtasks && todo.subtasks.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {todo.subtasks.map(s => {
                  const subDone = !!s.done || !!todo.done;
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={subDone}
                          onChange={() => toggleSubtaskDone(s.id)}
                          aria-label={`Toggle subtask ${s.text}`}
                        />
                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                          <div
                            className={`subtask-title prio-${s.priority ?? "medium"} ${subDone ? "subtask-done" : ""}`}
                            style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                          >
                            {s.text}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--app-muted)", marginTop: 3 }}>
                            {(s.due ? formatLocalDateTime(s.due as string) : "")}
                            {(s.reminders && s.reminders.length) ? (
                              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: 6 }}>
                                {(s.reminders ?? []).map(m => (
                                  <span key={m} className="tag" style={{ padding: "4px 8px", fontSize: 12 }}>
                                    {m === 0 ? "At due" : (m >= 60 ? `${m/60} hr` : `${m} min`)}
                                  </span>
                                ))}
                              </span>
                            ) : ""}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div className={`priority-pill prio-${s.priority ?? "medium"}`} 
                          title={`Priority: ${((s.priority ?? "medium").slice(0,1).toUpperCase() + (s.priority ?? "medium").slice(1))}`}
                          style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999 }}>
                          {s.priority ? (s.priority[0].toUpperCase() + s.priority.slice(1)) : "Medium"}
                        </div>
                        {!subtaskDeleteConfirm[s.id] ? (
                          <button
                            className="btn-danger"
                            onClick={() => requestSubtaskDelete(s.id)}
                            title="Delete subtask"
                          >
                            X
                          </button>
                        ) : (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button
                              className="btn-danger"
                              onClick={() => confirmSubtaskDelete(s.id, false)}
                              title={`Confirm delete ${s.text}`}
                              aria-label={`Confirm delete ${s.text}`}
                            >
                              Delete this?
                            </button>
                            <button className="btn-plain" onClick={() => cancelSubtaskDelete(s.id)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* inline confirm UI (visible when user checks recurring todo) */}
            {confirmOpen && (
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button className="btn-plain" onClick={() => { setConfirmOpen(false); onToggle(todo.id, true); play("done", true); }}>
                  Create next
                </button>
                <button className="btn-plain" onClick={() => { setConfirmOpen(false); onToggle(todo.id, false); play("done", true); }}>
                  Mark done permanently
                </button>
                <button className="btn-plain" onClick={() => { setConfirmOpen(false); play("click"); }}>
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
                  <button type="button" className="btn-plain" onClick={() => { onToggle(todo.id); setShowExpiredPrompt(false); play("done", true); }}>
                    Sir yes sir it's done~
                  </button>
                  <button type="button" className="btn-plain" onClick={() => { setShowExpiredPrompt(false); play("click"); }}>
                    No leh alamak i forgor 🤡
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* EDIT MODE */}
            <input className="editor-input" placeholder="Task name" value={draft.text} onChange={(e) => setDraft(d => ({ ...d, text: e.target.value }))} />

            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <input type="datetime-local" className="editor-input" value={draft.due} onChange={(e) => setDraft(d => ({ ...d, due: e.target.value }))} style={{ minWidth: 200 }} />
              <input className="editor-input" placeholder="tags: a, b" value={draft.tags} onChange={(e) => setDraft(d => ({ ...d, tags: e.target.value }))} style={{ minWidth: 150 }} />
              <select value={draft.priority} onChange={(e) => setDraft(d => ({ ...d, priority: e.target.value as Priority }))} className="editor-input" style={{ width: 120 }}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Reminders editor */}
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={reminderSelect} onChange={(e) => setReminderSelect(e.target.value === "" ? "" : Number(e.target.value))} className="editor-input" style={{ width: 140 }}>
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

                  <input className="editor-input" style={{ width: 80 }} type="number" min={1} value={interval} onChange={(e) => setInterval(parseInt(e.target.value || "1", 10))} />

                  {freq === "weekly" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
                        <button key={i} type="button" onClick={() => toggleWeekday(i)} className="btn-plain" style={{ padding: "6px 8px", background: weekdays.includes(i) ? "#eef" : undefined }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Subtasks editor */}
            <div style={{ marginTop: 10, borderTop: "1px dashed var(--app-border)", paddingTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input className="editor-input" placeholder="Subtask title (optional)" value={subtaskDraft} onChange={(e) => setSubtaskDraft(e.target.value)} style={{ flex: 1, minWidth: 180 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtaskDraft(); } }} />
                <select value={subtaskPriority} onChange={(e) => setSubtaskPriority(e.target.value as Priority)} className="editor-input" style={{ width: 110 }}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input type="datetime-local" value={subtaskDue} onChange={(e) => setSubtaskDue(e.target.value)} className="editor-input" style={{ width: 220 }} />
                <select value={subtaskReminderSelect} onChange={(e) => setSubtaskReminderSelect(e.target.value === "" ? "" : Number(e.target.value))} className="editor-input" style={{ width: 110 }}>
                  <option value="">Reminder</option>
                  <option value={60}>1 hr</option>
                  <option value={30}>30 min</option>
                  <option value={10}>10 min</option>
                  <option value={5}>5 min</option>
                  <option value={1}>1 min</option>
                  <option value={0}>At due</option>
                </select>
                <button type="button" className="btn-plain" onClick={addSubtaskReminder}>Add reminder</button>
                <button type="button" className="btn-plain" onClick={addSubtaskDraft}>Add subtask</button>
              </div>

              {/* show subtask reminder chips */}
              {subtaskReminders.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {subtaskReminders.map(m => (
                    <div key={m} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 999, border: "1px solid var(--app-border)", background: "var(--tag-bg)" }}>
                      <span style={{ fontSize: 12 }}>{m === 0 ? "At due" : (m >= 60 ? `${m / 60} hr` : `${m} min`)}</span>
                      <button type="button" onClick={() => removeSubtaskReminder(m)} className="btn-plain" style={{ padding: "4px 6px" }}>x</button>
                    </div>
                  ))}
                </div>
              )}

              {/* current subtasks list (editable) */}
              {subtasksLocal.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {subtasksLocal.map(s => (
                    <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                        <input type="checkbox" checked={!!s.done} onChange={() => setSubtasksLocal(prev => prev.map(x => x.id === s.id ? { ...x, done: !x.done } : x))} />
                        <div style={{ flex: 1 }}>
                          <input value={s.text} onChange={(e) => setSubtasksLocal(prev => prev.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))} className="editor-input" />
                          <div style={{ fontSize: 12, color: "var(--app-muted)", marginTop: 4 }}>
                            <select 
                              value={s.priority ?? "medium"}
                              onChange={(e) => setSubtasksLocal(prev => prev.map(x => x.id === s.id ? { ...x, priority: e.target.value as Priority } : x))}
                              className="editor-input"
                              style={{ width: 120 }}
                            >
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                            <input
                              type="datetime-local"
                              value={s.due ?? ""}
                              onChange={(e) => setSubtasksLocal(prev => prev.map(x => x.id === s.id ? { ...x, due: e.target.value || null } : x))}
                              className="editor-input"
                              style={{ width: 220, marginLeft: 8 }}
                            />

                            {/* Reminder controls */}
                            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
                              <select 
                                value={subtaskRemSelects[s.id] ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? "" : Number(e.target.value);
                                  setSubtaskRemSelects(prev => ({ ...prev, [s.id]: val }));
                                }}
                                className="editor-input"
                                style={{ width: 120 }}
                              >
                                <option value="">Reminder</option>
                                <option value={60}>1 hr</option>
                                <option value={30}>30 min</option>
                                <option value={10}>10 min</option>
                                <option value={5}>5 min</option>
                                <option value={1}>1 min</option>
                                <option value={0}>At due</option>
                              </select>

                              <button 
                                type="button"
                                className="btn-plain"
                                onClick={() => {
                                  setSubtasksLocal(prev => prev.map(x => {
                                    if (x.id !== s.id) return x;
                                    const sel = subtaskRemSelects[s.id];
                                    if (sel === "" || sel == null) return x;
                                    const cur = x.reminders ?? [];
                                    if (cur.includes(sel)) {
                                      setSubtaskRemSelects(prev => ({ ...prev, [s.id]: "" }));
                                      return x;
                                    }
                                    const nextRem = [...cur, sel].sort((a, b) => a - b);
                                    setSubtaskRemSelects(prev => ({ ...prev, [s.id]: "" }));
                                    return { ...x, reminders: nextRem } as Subtask;
                                  }));
                                }}
                              >
                                Add reminder
                              </button>
                            </div>

                            {/* show current reminders as chips with remove */}
                            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {(s.reminders ?? []).map(m => (
                                <div key={m} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 999, border: "1px solid var(--app-border)", background: "var(--tag-bg)" }}>
                                  <span style={{ fontSize: 12 }}>{m === 0 ? "At due" : (m >= 60 ? `${m/60} hr` : `${m} min`)}</span>
                                  <button
                                    type="button"
                                    className="btn-plain"
                                    onClick={() => setSubtasksLocal(prev => prev.map(x => x.id === s.id ? ({ ...x, reminders: (x.reminders ?? []).filter(r => r !== m) }) : x))}
                                    style={{ padding: "4px 6px" }}
                                  >
                                    X
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        {!subtaskDeleteConfirm[s.id] ? (
                          <button className="btn-danger" onClick={() => requestSubtaskDelete(s.id)}>Delete</button>
                        ) : (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button
                              className="btn-danger"
                              onClick={() => confirmSubtaskDelete(s.id, true)}
                              title="Confirm delete subtask"
                              aria-label={`Confirm delete ${s.text}`}
                            >
                              Delete this?
                            </button>
                            <button className="btn-plain" onClick={() => cancelSubtaskDelete(s.id)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <button onClick={save} className="btn-plain">Save</button>
              <button onClick={() => { setEditing(false); play("click"); }} className="btn-plain" style={{ marginLeft: 8 }}>Cancel</button>
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
              setSubtasksLocal(todo.subtasks ?? []);
              setIsRecurring(!!todo.recurrence);
              setFreq((todo.recurrence?.freq) ?? "daily");
              setInterval((todo.recurrence?.interval) ?? 1);
              setWeekdays(recurrenceHasWeekdays(todo.recurrence) ? (todo.recurrence!.weekdays ?? []) : []);
              play("click");
            }}>Edit</button>

            {/* Delete: toggles inline delete confirmation */}
            {!deleteConfirmOpen ? (
              <button className="btn-danger" onClick={() => { setDeleteConfirmOpen(true); play("click"); }}>Delete</button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn-danger"
                  onClick={handleDeleteClick}
                  title="Confirm delete"
                  aria-label={`Confirm delete ${todo.text}`}
                >
                  Delete this?
                </button>
                <button className="btn-plain" onClick={() => { setDeleteConfirmOpen(false); play("click"); }}>Cancel</button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
