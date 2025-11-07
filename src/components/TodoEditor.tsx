import React, { useState } from "react";

type Props = {
  onAdd: (text: string) => void;
};

export default function TodoEditor({ onAdd }: Props) {
  const [text, setText] = useState("");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2 mb-4">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What needs doing? (Enter to add)"
        className="flex-1 rounded-md border p-2"
        autoFocus
      />
      <button type="submit" className="px-4 py-2 rounded-md bg-slate-800 text-white">Add</button>
    </form>
  );
}
