export type Priority = "high" | "medium" | "low";

export type Recurrence =
  | { freq: "daily"; interval?: number } // every n days
  | { freq: "weekly"; interval?: number; weekdays?: number[] } // weekdays: 0(Sun)-6(Sat)
  | { freq: "monthly"; interval?: number; dayOfMonth?: number }; // dayOfMonth optional

export type Subtask = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;

  priority?: Priority;
  due?: string | null;
  reminders?: number[];
};

  export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  due: string | null; // datetime-local string like "2025-11-07T14:30" or null
  tags: string[];
  priority: Priority;
  recurrence?: Recurrence | null;
  reminders?: number[];
  subtasks?: Subtask[];
  notes?: string;
};

export type AddPayload = {
  text: string;
  tags?: string[];
  due?: string | null;
  priority?: Priority;
  recurrence?: Recurrence | null;
  reminders?: number[]; // minutes before due
};
