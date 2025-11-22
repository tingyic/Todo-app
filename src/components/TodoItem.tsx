import { useEffect, useRef, useState } from "react";
import type { Todo, Priority, Recurrence, Subtask } from "../types";
import { formatLocalDateTime, parseLocalDateTime } from "../utils/dates";
import { play } from "../utils/sound";

type Props = {
  index?: number;
  todo: Todo;
  onToggle: (id: string, createNext?: boolean | null) => void; // createNext overrides global setting
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>, toastMsg?: string) => void;
  isDusting?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string | null) => void;
  showToast?: (msg: string, ms?: number) => void;
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

export default function TodoItem({ index, todo, onToggle, onRemove, onUpdate, isDusting = false, isSelected = false, onSelect, showToast }: Props) {
  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState(() => ({
    text: todo.text,
    due: todo.due ?? "",
    tags: todo.tags.join(", "),
    priority: todo.priority as Priority,
    reminders: (todo.reminders ?? []) as number[],
    notes: todo.notes ?? "",
  }));

  const [notesExpanded, setNotesExpanded] = useState(false);
  const N_LINES = 3;
  const N_CHARS = 200;

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

  {/* Mobile gestures */}
  // swipe
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeLockedRef = useRef(false); // prevent swiping when scrolling vertically
  const SWIPE_THRESHOLD = 80; // px required to trigger swipe toggle
  const SWIPE_CANCEL_VERTICAL = 12; //px required of vertical displacement to cancel swipe

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

  useEffect(() => {
    if (isSelected && rootRef.current) {
      rootRef.current.focus();
    }
  }, [isSelected]);

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
    play("click");
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
    play("click");
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
      if (!editing) {
        onUpdate(todo.id, { subtasks: next, done: false });
      }
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
      onUpdate(todo.id, { subtasks: (todo.subtasks ?? []).filter(s => s.id !== id) }, "Subtask deleted");
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

    const toggled = next.find(s => s.id === id);

    if (toggled?.done) {
      onUpdate(todo.id, { subtasks: next }, "Subtask marked done");
    } else {
      onUpdate(todo.id, { subtasks: next }, "Subtask marked not done")
    }

    const allDone = next.length > 0 && next.every(s => s.done);
    if (allDone && !todo.done) {
      onToggle(todo.id);
      play("done", true);
      return;
    }

    if (todo.done && toggled && !toggled.done) {
      onUpdate(todo.id, { done: false, subtasks: next }, "Subtask marked not done");
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
      notes: draft.notes?.trim() ? draft.notes.trim() : undefined,
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
      onUpdate(todo.id, { subtasks: allDoneSubs }, "Subtasks marked done");
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

  // progress bar for parent tasks with subtasks
  const viewTotal = (todo.subtasks ?? []).length;
  const viewDoneCount = todo.done ? viewTotal : (todo.subtasks ?? []).filter(s => !!s.done).length;
  const viewPct = viewTotal ? Math.round((viewDoneCount / viewTotal) * 100) : 0;

  const editTotal = subtasksLocal.length;
  const editDoneCount = subtasksLocal.filter(s => !!s.done).length;
  const editPct = editTotal ? Math.round((editDoneCount / editTotal) * 100) : 0;

  function keepFocus(e: React.MouseEvent) {
    e.preventDefault();
  }

  // Keyboard handler for the root (when focused)
  function handleRootKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

    const key = e.key;
    if (key === "e") {
      // enters edit mode
      if (!editing) {
        e.preventDefault();
        setEditing(true);
        setDraft({ text: todo.text, due: todo.due ?? "", tags: todo.tags.join(", "), priority: todo.priority, reminders: todo.reminders ?? [], notes: todo.notes ?? "" });
        setSubtasksLocal(todo.subtasks ?? []);
        setIsRecurring(!!todo.recurrence);
        setFreq((todo.recurrence?.freq) ?? "daily");
        setInterval((todo.recurrence?.interval) ?? 1);
        setWeekdays(recurrenceHasWeekdays(todo.recurrence) ? (todo.recurrence!.weekdays ?? []) : []);
        play("click");
      }
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      if (!deleteConfirmOpen) {
        // first press: triggers the delete prompt
        setDeleteConfirmOpen(true);
        play("click");
        if (showToast) showToast("Press Delete/Backspace key or Delete button again to confirm", 1800);
      } else {
        // second press: actually delete
        handleDeleteClick();
      }
      return;
    }

    if (key === "Escape") {
      // cancels events
      e.preventDefault();
      if (editing) {
        // cancels edit
        setEditing(false);
        setDraft({ text: todo.text, due: todo.due ?? "", tags: todo.tags.join(", "), priority: todo.priority, reminders: todo.reminders ?? [], notes: todo.notes ?? "" });
        setSubtasksLocal(todo.subtasks ?? []);
        setSubtaskDraft("");
        setSubtaskRemSelects({});
        setSubtaskDeleteConfirm({});
        play("click");
      } else if (deleteConfirmOpen) {
        // cancels delete
        setDeleteConfirmOpen(false);
        play("click");
      } else if (confirmOpen) {
        // cancels confirm
        setConfirmOpen(false);
        play("click");
      }
      return;
    }
  }

  // Click handler on root: select the task if user clicked empty space / background.
  function handleRootClick(e: React.MouseEvent) {
    const tgt = e.target as HTMLElement | null;
    if (!tgt) return;
    const tag = (tgt.tagName || "").toLowerCase();
    const interactiveTags = ["button", "input", "select", "a", "textarea", "label"];
    if (interactiveTags.includes(tag) || tgt.closest("button") || tgt.closest("a") || tgt.closest("input")) {
      return;
    }

    if (onSelect) onSelect(todo.id);
    if (rootRef.current) rootRef.current.focus();
  }

  // pointer (touch/mouse) handlers for swipe toggle
  function onPointerDownSwipe(e: React.PointerEvent) {
    const tgt = e.target as HTMLElement | null;
    const interactiveTags = ["button", "input", "select", "a", "textarea", "label"];
    if (tgt && (interactiveTags.includes(tgt.tagName.toLowerCase()) || tgt.closest("button") || tgt.closest("a") || tgt.closest("input"))) {
      return;
    }

    (e.target as Element).setPointerCapture?.(e.pointerId);
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    swipeLockedRef.current = false;
    setIsDragging(true);
    setDragX(0);
  }

  function onPointerMoveSwipe(e: React.PointerEvent) {
    if (!isDragging || !swipeStartRef.current) return;

    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;

    // if user scrolls vertically beyond maximum displacement, lock swipe, allow scroll
    if (!swipeLockedRef.current && Math.abs(dy) > SWIPE_CANCEL_VERTICAL && Math.abs(dy) > Math.abs(dx)) {
      swipeLockedRef.current = true;
      setIsDragging(false);
      setDragX(0);
      try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {/* Empty */}
      return;
    }

    if (swipeLockedRef.current) return;

    // for now, only right swipes allowed
    const allowedX = Math.max(0, dx);
    setDragX(allowedX);
  }

  function onPointerUpSwipe(e: React.PointerEvent) {
    if (!swipeStartRef.current) return;
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {/* Empty */}
    if (swipeLockedRef.current) {
      swipeStartRef.current = null;
      swipeLockedRef.current = false;
      setDragX(0);
      setIsDragging(false);
      return;
    }

    const dx = e.clientX - swipeStartRef.current.x;
    const success = dx >= SWIPE_THRESHOLD;

    setIsDragging(false);
    setDragX(0);
    swipeStartRef.current = null;

    if (success) {
      // perform the toggle: if undone, mark done, if done, mark undone
      onToggle(todo.id);
      play("done", true);
      if (showToast) showToast(todo.done ? "Yayyyyy lesgoooo task completed weeeee 🎉" : "Marked done", 900);
    }
  }

  const noteText = todo.notes ?? "";
  const noteLines = noteText ? noteText.split(/\r?\n/) : [];
  const hasManyLines = noteLines.length > N_LINES;
  const isLongChars = noteText.length > N_CHARS;

  const collapsedPreview = (() => {
    if (!noteText) return "";
    if (hasManyLines) {
      const head = noteLines.slice(0, N_LINES).join("\n");
      return noteLines.length > N_LINES ? head + "\n..." : head;
    }
    if (isLongChars) {
      return noteText.slice(0, N_CHARS) + "...";
    }
    return noteText;
  })();

  const needsToggle = noteText.length > 0 && noteText !== collapsedPreview;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleRootKeyDown}
      onClick={handleRootClick}
      onPointerDown={onPointerDownSwipe}
      onPointerMove={onPointerMoveSwipe}
      onPointerUp={onPointerUpSwipe}
      onPointerCancel={onPointerUpSwipe}
      className={`todo-item ${todo.done ? "todo-done" : ""} ${leaving ? "leaving" : ""} ${isDusting ? "dust" : ""}`}
      style={{
        ...cssVars,
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        transition: isDragging ? "none" : "transform 220ms cubic-bezier(.2,.9,.2,1)",
      }}
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

            {/* Notes preview (view-only) */}
            {todo.notes ? (
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.4,
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    maxWidth: "100%",
                  }}
                >
                  {notesExpanded ? noteText: collapsedPreview}
                </div>

                {/* toggle button only if notes are longer than what the clamp shows — always show button to allow collapse/expand */}
                {needsToggle ? (
                  <button
                    type="button"
                    className="btn-plain"
                    onClick={() => setNotesExpanded(prev => !prev)}
                    style={{ marginTop: 6 }}
                    onMouseDown={keepFocus}
                  >
                    {notesExpanded ? "Collapse" : "Expand"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Subtasks list (view mode) */}
            {todo.subtasks && todo.subtasks.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                { /* Progress bar (view) */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="subtasks-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={viewPct} style={{ flex: 1 }}>
                    <div className="subtasks-progress-fill" style={{ width: `${viewPct}%` }} />
                  </div>
                  <div style={{ minWidth: 56, textAlign: "right", fontSize: 12, color: "var(--app-muted)" }}>
                    {viewDoneCount} / {viewTotal} • {viewPct}%
                  </div>
                </div>
                
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
                              onMouseDown={keepFocus}
                              onClick={() => confirmSubtaskDelete(s.id, false)}
                              title={`Confirm delete ${s.text}`}
                              aria-label={`Confirm delete ${s.text}`}
                            >
                              Delete this?
                            </button>
                            <button className="btn-plain" onMouseDown={keepFocus} onClick={() => cancelSubtaskDelete(s.id)}>Cancel</button>
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
                  <button type="button" className="btn-plain" onMouseDown={keepFocus} onClick={() => { onToggle(todo.id); setShowExpiredPrompt(false); play("done", true); }}>
                    Sir yes sir it's done~
                  </button>
                  <button type="button" className="btn-plain" onMouseDown={keepFocus} onClick={() => { setShowExpiredPrompt(false); play("click"); }}>
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
              <button type="button" onMouseDown={keepFocus} onClick={addReminderToDraft} className="btn-plain">Add reminder</button>

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

            {/* Notes (edit-only) */}
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 13, marginBottom: 6, color: "var(--app-muted)" }}>
                Notes (optional)
              </label>

              <textarea
                className="editor-textarea"
                placeholder="Add description for this task... (saved when you press Save)"
                value={draft.notes}
                onChange={(e) => setDraft(d => ({ ...d, notes: e.target.value }))}
                rows={5}
                style={{ width: "100%", minHeight: 120, resize: "vertical", padding: 10 }}
              />

              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-plain"
                  onMouseDown={keepFocus}
                  onClick={() => setDraft(d => ({ ...d, notes: ""}))}
                >
                  Clear notes
                </button>
                <div style={{ fontSize: 12, color: "var(--app-muted)", alignSelf: "center" }}>
                  Clear then Save to remove note permanently.
                </div>
              </div>
            </div>

            {/* Subtasks editor */}
            {/* Subtask header & separator from main task edit mode */}
            <div style={{ marginTop: 16 }} />

            <div style={{ marginTop: 10, borderTop: "1px dashed var(--app-border)", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)" }}>
                  Add / edit subtasks <span style={{ fontSize: 12, fontWeight: 400, color: "var(--app-muted)" }}>(optional)</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--app-muted)" }}>
                  Both main tasks and subtasks are saved when you press <em>Save</em>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 10, borderTop: "1px dashed var(--app-border)", paddingTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input className="editor-input" placeholder="Subtask title" value={subtaskDraft} onChange={(e) => setSubtaskDraft(e.target.value)} style={{ flex: 1, minWidth: 180 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtaskDraft(); } }} />
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
                <button type="button" className="btn-plain" onMouseDown={keepFocus} onClick={addSubtaskReminder}>Add reminder</button>
                <button type="button" className="btn-plain" onMouseDown={keepFocus} onClick={addSubtaskDraft}>Add subtask</button>
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
                  {/* Progress bar (edit preview) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="subtasks-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={editPct} style={{ flex: 1 }}>
                      <div className="subtasks-progress-fill" style={{ width: `${editPct}%` }} />
                    </div>
                    <div style={{ minWidth: 56, textAlign: "right", fontSize: 12, color: "var(--app-muted)" }}>
                      {editDoneCount} / {editTotal} • {editPct}%
                    </div>
                  </div>
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
                                    play("click");
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
                                    onMouseDown={keepFocus}
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
                          <button className="btn-danger" onMouseDown= {keepFocus} onClick={() => requestSubtaskDelete(s.id)}>Delete</button>
                        ) : (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button
                              className="btn-danger"
                              onMouseDown={keepFocus}
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
              setDraft({ text: todo.text, due: todo.due ?? "", tags: todo.tags.join(", "), priority: todo.priority, reminders: todo.reminders ?? [], notes: todo.notes ?? "" });
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
              <button className="btn-danger" onMouseDown={keepFocus} onClick={() => { setDeleteConfirmOpen(true); play("click"); }}>Delete</button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn-danger"
                  onMouseDown={keepFocus}
                  onClick={handleDeleteClick}
                  title="Confirm delete"
                  aria-label={`Confirm delete ${todo.text}`}
                >
                  Delete this?
                </button>
                <button className="btn-plain" onMouseDown={keepFocus} onClick={() => { setDeleteConfirmOpen(false); play("click"); }}>Cancel</button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
