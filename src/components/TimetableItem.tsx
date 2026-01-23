import type React from "react";

type Priority = "low" | "medium" | "high";

type Props = {
  id: string;
  templateId: string;
  title: string;
  startMin: number;
  endMin: number;
  dayIndex: number;
  colIndex: number;
  colCount: number;
  notes?: string;
  priority: Priority;
  completed: boolean;
  hourHeight: number; // px per hour
  onEdit: (templateId: string, date: Date) => void;
  date: Date;
};

function minutesToHHMM(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  const hh = Math.floor(mins / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function _getPriorityStyle(priority: "low" | "medium" | "high", completed: boolean): React.CSSProperties {
  if (completed) {
    return {
      background: "var(--prio-completed-bg)",
      color: "var(--prio-completed-text)",
      textDecoration: "line-through",
      opacity: 0.7,
    };
  }
  const map: Record<"low" | "medium" | "high", { bg: string; color: string }> = {
    high: { bg: "var(--prio-high-bg)", color: "var(--prio-high)" },
    medium: { bg: "var(--prio-medium-bg)", color: "var(--prio-medium)" },
    low: { bg: "var(--prio-low-bg)", color: "var(--prio-low)" },
  };
  return { background: map[priority].bg, color: map[priority].color };
}

type TimetableItemComponent = React.FC<Props> & {
  getPriorityStyle?: (priority: Priority, completed: boolean) => React.CSSProperties;
};

const TimetableItem: TimetableItemComponent = ({
  id,
  templateId,
  title,
  startMin,
  endMin,
  dayIndex,
  colIndex,
  colCount,
  notes,
  priority,
  completed,
  hourHeight,
  onEdit,
  date,
}) => {
  const top = (startMin / 60) * hourHeight;
  const height = Math.max(8, ((endMin - startMin) / 60) * hourHeight);

  const dayWidth = 100 / 7;
  const colWidth = dayWidth / Math.max(1, colCount);
  const left = dayWidth * dayIndex + colWidth * colIndex;

  const pStyle = _getPriorityStyle(priority, completed);
  const background = pStyle.background as string | undefined;
  const color = pStyle.color as string | undefined;

  return (
    <div
      data-timetable-item="true"
      className="timetable-item"
      key={id}
      title={`${title} ${minutesToHHMM(startMin)}-${minutesToHHMM(endMin)}`}
      onPointerDown={(e) => {
        try {
          if ((e as unknown as PointerEvent).pointerType === "mouse") {
            e.stopPropagation();
          }
        } catch {
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        onEdit(templateId, date);
      }}
      role="button"
      style={{
        position: "absolute",
        top,
        left: `${left}%`,
        width: `${colWidth}%`,
        height,
        padding: 6,
        boxSizing: "border-box",
        borderRadius: 6,
        overflow: "hidden",
        fontSize: 12,
        border: "1px solid var(--app-border)",
        background,
        color,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        whiteSpace: "wrap",
        textOverflow: "ellipsis",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", width: "100%", minWidth: 0, gap: 8 }}>
        <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>

        {notes ? (
          <div
            aria-hidden
            title={notes}
            style={{
              flex: "0 0 auto",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 12,
              opacity: 0.95,
              background: "rgba(0, 0, 0, 0.06)",
              color: "inherit",
              marginLeft: 4,
              pointerEvents: "auto",
            }}
          >
            📝
          </div>
        ) : null}
      </div>
    </div>
  );
}

TimetableItem.getPriorityStyle = _getPriorityStyle;

export default TimetableItem;
