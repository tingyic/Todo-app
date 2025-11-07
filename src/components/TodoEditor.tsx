import { useState, type ChangeEvent } from "react";

type AddPayload = {
  text: string;
  tags?: string;
  due?: string;
  priority?: "high" | "medium" | "low";
};

type Props = {
  onAdd: (payload: { text: string; tags?: string[]; due?: string | null; priority?: "high" | "medium" | "low" }) => void;
};

export default function TodoEditor({ onAdd }: Props) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<AddPayload["priority"]>("medium");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    const tagsArr = tags.split(",").map(s => s.trim()).filter(Boolean);
    onAdd({ text: t, tags: tagsArr.length ? tagsArr : undefined, due: due || null, priority });
    setText("");
    setTags("");
    setDue("");
    setPriority("medium");
  }
  
  function onPriorityChange(e: ChangeEvent<HTMLSelectElement>) {
    setPriority(e.target.value as AddPayload["priority"]);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What needs doing? (Enter to add)"
        className="editor-input"
        style={{ flex: 1 }}
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
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className="editor-input"
        style={{ width: 150 }}
      />

      <select 
            value={priority} 
            onChange={onPriorityChange} 
            className="editor-input" 
            style={{ width: 120 }}
        >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
      </select>

      <button type="submit" className="editor-btn">Add</button>
    </form>
  );
}