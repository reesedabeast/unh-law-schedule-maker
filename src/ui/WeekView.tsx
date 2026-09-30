import { findSection, type Section } from '../engine/catalog';
import { meetingDays, parseMeetingTime, sectionsConflict } from '../engine/planChecks';
import type { Enrollment } from '../engine/types';

const DAYS = [
  ['M', 'Mon'],
  ['T', 'Tue'],
  ['W', 'Wed'],
  ['R', 'Thu'],
  ['F', 'Fri'],
] as const;
const PX_PER_MIN = 0.7;

/** Places overlapping blocks side by side: each gets a lane index and the lane count of its cluster. */
function lanes<T extends { start: number; end: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: { b: T; lane: number; of: number }[] = [];
  let cluster: { b: T; lane: number; of: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const of = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => out.push({ ...c, of }));
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => c.b.end > b.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ b, lane, of: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

export function WeekView({ enrollments }: { enrollments: Enrollment[] }) {
  const chosen = enrollments.map((e) => [e, findSection(e)] as const).filter((p): p is [Enrollment, Section] => !!p[1]);
  const blocks = chosen.flatMap(([e, s]) =>
    s.meetings.flatMap((m) => {
      const t = parseMeetingTime(m.time);
      if (!t) return [];
      const conflict = chosen.some(([o, os]) => o !== e && sectionsConflict(s, os));
      return meetingDays(m.days).map((d) => ({ day: d, start: t[0], end: t[1], label: e.code, room: m.room, conflict, half: s.partOfTerm }));
    }),
  );
  const unscheduled = enrollments.filter((e) => !findSection(e));
  if (!blocks.length)
    return <p className="small muted">Choose sections for your courses to see a weekly calendar.</p>;

  const start = Math.min(8 * 60, ...blocks.map((b) => b.start));
  const end = Math.max(18 * 60, ...blocks.map((b) => b.end));
  const height = (end - start) * PX_PER_MIN + 24;
  const hours: number[] = [];
  for (let h = Math.ceil(start / 60); h * 60 <= end; h++) hours.push(h);

  return (
    <div>
      <div className="week" style={{ height }}>
        <div className="col" style={{ borderLeft: 'none' }}>
          <div className="dayhead">&nbsp;</div>
          {hours.map((h) => (
            <div key={h} className="hour" style={{ top: 24 + (h * 60 - start) * PX_PER_MIN, borderTop: 'none' }}>
              {h > 12 ? `${h - 12}p` : `${h}${h === 12 ? 'p' : 'a'}`}
            </div>
          ))}
        </div>
        {DAYS.map(([d, name]) => (
          <div key={d} className="col">
            <div className="dayhead">{name}</div>
            {hours.map((h) => (
              <div key={h} className="hour" style={{ top: 24 + (h * 60 - start) * PX_PER_MIN }} />
            ))}
            {lanes(blocks.filter((b) => b.day === d)).map(({ b, lane, of }, i) => (
                <div
                  key={i}
                  className={`block ${b.conflict ? 'conflict' : ''}`}
                  style={{
                    top: 24 + (b.start - start) * PX_PER_MIN,
                    height: (b.end - b.start) * PX_PER_MIN,
                    left: `calc(${(lane / of) * 100}% + 2px)`,
                    right: 'auto',
                    width: `calc(${100 / of}% - 4px)`,
                  }}
                  title={`${b.label} ${b.half}${b.room ? ` · Room ${b.room}` : ''}`}
                >
                  <strong>{b.label}</strong>
                  {/Half Term/.test(b.half) && <div>{b.half.replace('Law ', '')}</div>}
                </div>
              ))}
          </div>
        ))}
      </div>
      {unscheduled.length > 0 && (
        <p className="small muted">No section/time chosen: {unscheduled.map((e) => e.code).join(', ')}</p>
      )}
    </div>
  );
}
