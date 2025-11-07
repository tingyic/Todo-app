export type Priority = "high" | "medium" | "low";

export type Recurrence =
  | { freq: "daily"; interval?: number } // every n days
  | { freq: "weekly"; interval?: number; weekdays?: number[] } // weekdays: 0(Sun)-6(Sat)
  | { freq: "monthly"; interval?: number; dayOfMonth?: number }; // dayOfMonth optional

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  due: string | null; // datetime-local string like "2025-11-07T14:30" or null
  tags: string[];
  priority: Priority;
  recurrence?: Recurrence | null;
};