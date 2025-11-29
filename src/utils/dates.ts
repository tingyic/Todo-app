// Small utilities for handling "datetime-local" strings
// format: "YYYY-MM-DDTHH:mm"

export function parseLocalDateTime(s: string | null): Date | null {
  if (!s) return null;
  // split: "2025-11-07T14:30"
  const parts = s.split(/[-T:]/).map((p) => parseInt(p, 10) || 0);
  const [y, m = 1, d = 1, hh = 0, mm = 0] = parts;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function formatLocalDateTime(s: string | null): string {
  const d = parseLocalDateTime(s);
  if (!d) return "";
  // Customize to locale friendly format with date + time
  // e.g. "Nov 7, 2025 · 14:30"
  const datePart = d.toLocaleDateString();
  const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}