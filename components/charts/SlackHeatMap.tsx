"use client";

interface DayCount {
  date: string;
  count: number;
}

interface Props {
  messagesByDay: DayCount[];
}

function dayLabel(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function cellColor(count: number, max: number): string {
  if (count === 0) return "#F3F4F6";
  const intensity = count / max;
  if (intensity >= 0.75) return "#4F46E5";
  if (intensity >= 0.5) return "#818CF8";
  if (intensity >= 0.25) return "#C7D2FE";
  return "#E0E7FF";
}

export default function SlackHeatMap({ messagesByDay }: Props) {
  if (!messagesByDay || messagesByDay.length === 0) return null;

  const max = Math.max(...messagesByDay.map((d) => d.count), 1);

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-ink4">
          Messages per day (reports channel)
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink4">Less</span>
          {["#E0E7FF", "#C7D2FE", "#818CF8", "#4F46E5"].map((c) => (
            <span
              key={c}
              className="w-3.5 h-3.5 rounded-sm inline-block"
              style={{ background: c }}
            />
          ))}
          <span className="text-[10px] text-ink4">More</span>
        </div>
      </div>

      {/* Grid - scrollable on mobile */}
      <div className="overflow-x-auto">
        <div className="flex gap-1.5 min-w-max pb-1">
          {messagesByDay.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-semibold transition-colors"
                style={{
                  background: cellColor(d.count, max),
                  color: d.count / max >= 0.5 ? "#fff" : "#6B7280",
                }}
                title={`${dayLabel(d.date)}: ${d.count} messages`}
              >
                {d.count > 0 ? d.count : ""}
              </div>
              <span className="text-[9px] text-ink4 rotate-0">
                {new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "narrow",
                })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary row */}
      <div className="flex gap-4 mt-3 flex-wrap">
        <span className="text-xs text-ink4">
          Peak: <span className="font-semibold text-ink">{max} msgs</span>
        </span>
        <span className="text-xs text-ink4">
          Active days:{" "}
          <span className="font-semibold text-ink">
            {messagesByDay.filter((d) => d.count > 0).length}
          </span>
        </span>
        <span className="text-xs text-ink4">
          Total:{" "}
          <span className="font-semibold text-ink">
            {messagesByDay.reduce((s, d) => s + d.count, 0)}
          </span>
        </span>
      </div>
    </div>
  );
}
