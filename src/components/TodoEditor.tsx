import { useState } from "react";
import type { Recurrence } from "../types";

type Props = {
  onAdd: (payload: {
    text: string;
    tags?: string[];
    due?: string | null;
    priority?: "high" | "medium" | "low";
    recurrence?: Recurrence | null;
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

  function toggleWeekday(d: number) {
    setWeekdays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));
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
        <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
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

      <button type="submit" className="editor-btn">Add</button>
    </form>
  );
}