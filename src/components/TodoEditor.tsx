/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import type { Recurrence } from "../types";

type Props = {
  onAdd: (payload: {
    text: string;
    tags?: string[];
    due?: string | null;
    priority?: "high" | "medium" | "low";
    recurrence?: Recurrence | null;
    reminders?: number[]; // NEW: array of minutes before due, e.g. [30,5]
  }) => void;
};

export default function TodoEditor({ onAdd }: Props) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [due, setDue] = useState(""); // datetime-local string
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");

  // recurrence UI state
  const [isRecurring, setIsRecurring] = useState(false);
  const [freq, setFreq] = useState<Recurrence["freq"]>("daily");
  const [interval, setInterval] = useState<number>(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);

  // NEW: reminders UI state (minutes before due)
  const [reminderSelect, setReminderSelect] = useState<number | "">(5);
  const [reminders, setReminders] = useState<number[]>([]);

  function toggleWeekday(d: number) {
    setWeekdays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));
  }

  function addReminder() {
    if (reminderSelect === "") return;
    const m = Number(reminderSelect);
    if (!Number.isFinite(m) || m < 0) return;
    setReminders(prev => {
      if (prev.includes(m)) return prev;
      return [...prev, m].sort((a, b) => a - b);
    });
    setReminderSelect("");
  }

  function removeReminder(m: number) {
    setReminders(prev => prev.filter(x => x !== m));
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    const tagsArr = tags.split(",").map(s => s.trim()).filter(Boolean);
    let recurrence: Recurrence | null = null;

    if (isRecurring) {
      if (freq === "daily") {
        recurrence = { freq: "daily", interval: Math.max(1, Math.floor(interval)) };
      } else if (freq === "weekly") {
        recurrence = {
          freq: "weekly",
          interval: Math.max(1, Math.floor(interval)),
          weekdays: weekdays.length ? weekdays : undefined,
        };
      } else if (freq === "monthly") {
        recurrence = { freq: "monthly", interval: Math.max(1, Math.floor(interval)), dayOfMonth: undefined };
      }
    }

    onAdd({
      text: t,
      tags: tagsArr.length ? tagsArr : undefined,
      due: due || null,
      priority,
      recurrence,
      reminders: reminders.length ? reminders : undefined, // include reminders
    });

    // reset
    setText("");
    setTags("");
    setDue("");
    setPriority("medium");
    setIsRecurring(false);
    setFreq("daily");
    setInterval(1);
    setWeekdays([]);
    setReminders([]);
    setReminderSelect(5);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Let's get this bread (Enter to add)"
        className="editor-input"
        style={{ flex: 1, minWidth: 200 }}
        autoFocus
      />

      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="tags (comma separated)"
        className="editor-input"
        style={{ width: 180 }}
      />

      <input
        type="datetime-local"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className="editor-input"
        style={{ width: 220 }}
      />

      <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="editor-input" style={{ width: 120 }}>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" className="app-checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} aria-label="Recurring" />
        Recurring
      </label>

      {isRecurring && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={freq} onChange={(e) => setFreq(e.target.value as any)} className="editor-input" style={{ width: 120 }}>
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
              {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  className="btn-plain"
                  style={{
                    padding: "6px 8px",
                    background: weekdays.includes(i) ? "#eef" : undefined,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -- Reminders UI -- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={reminderSelect}
          onChange={(e) => setReminderSelect(e.target.value === "" ? "" : Number(e.target.value))}
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
        <button type="button" onClick={addReminder} className="btn-plain" style={{ padding: "6px 8px" }}>Add reminder</button>
      </div>

      {reminders.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", width: "100%" }}>
          {reminders.map(m => (
            <div key={m} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 999, border: "1px solid var(--app-border)", background: "var(--tag-bg)" }}>
              <span style={{ fontSize: 12 }}>{m === 0 ? "At due" : (m >= 60 ? `${m/60} hr` : `${m} min`)}</span>
              <button type="button" onClick={() => removeReminder(m)} className="btn-plain" style={{ padding: "4px 6px" }}>×</button>
            </div>
          ))}
        </div>
      )}

      <button type="submit" className="editor-btn">Add task</button>
    </form>
  );
}
