import Fuse from 'fuse.js';
import { useMemo } from 'react';
import { COURSES, type Course, type Section } from '../engine/catalog';
import type { EnrollmentStatus } from '../engine/types';

/** Term containing today's date. */
export function currentTerm(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 8) return `${y}10`;
  if (m <= 5) return `${y - 1}50`;
  return `${y - 1}70`;
}

export const defaultStatus = (term: string): EnrollmentStatus => {
  const now = currentTerm();
  return term < now ? 'completed' : term === now ? 'in-progress' : 'planned';
};

export const sectionLabel = (s: Section) => {
  const when = s.meetings.map((m) => `${m.days} ${m.time}`.trim()).filter(Boolean).join('; ') || 'No set meeting time';
  const half = /Half Term|Immersion/.test(s.partOfTerm) ? ` · ${s.partOfTerm.replace('Law ', '')}` : '';
  return `${s.section} · ${when}${half}${s.instructors[0] ? ` · ${s.instructors[0]}` : ''}`;
};

// ---------- course search ----------

export function useCourseSearch() {
  return useMemo(
    () =>
      new Fuse(COURSES, {
        keys: [
          { name: 'code', weight: 3 },
          { name: 'title', weight: 2 },
          { name: 'description', weight: 0.5 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [],
  );
}

export function searchCourses(fuse: Fuse<Course>, q: string, limit = 12): Course[] {
  const query = q.trim();
  if (!query) return [];
  const compact = query.toUpperCase().replace(/\s+/g, '');
  const exact = COURSES.filter((c) => c.code.replace(' ', '').startsWith(compact));
  const fuzzy = fuse.search(query, { limit }).map((r) => r.item);
  return [...new Map([...exact, ...fuzzy].map((c) => [c.code, c])).values()].slice(0, limit);
}

