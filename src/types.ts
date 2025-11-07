export type Priority = "high" | "medium" | "low";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number; // epoch ms
  due?: string | null; // yyyy-mm-dd or null
  tags: string[];
  priority: Priority;
}