import Fuse from 'fuse.js';
import { useMemo } from 'react';
import { COURSES, getCourse, type Course, type Section } from '../engine/catalog';
import { eligibleSections } from '../engine/planChecks';
import { currentTerm, defaultStatus, termCode } from '../engine/terms';
import type { Enrollment, Profile } from '../engine/types';

export { currentTerm, defaultStatus };

/** Fall/spring start terms from six years ago through next year. */
export function startTermOptions(): string[] {
  const y = Number(currentTerm().slice(0, 4));
  const out: string[] = [];
  for (let yr = y - 6; yr <= y + 1; yr++) out.push(termCode('Fall', yr), termCode('Spring', yr + 1));
  return out.sort();
}

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


// ---------- adding courses ----------


/**
 * Defaults for a course added to a term: status from the calendar, credits from the section
 * (or catalog), and the section pre-selected when only one is open to the student.
 */
export function addPatch(code: string, term: string, profile: Profile): Partial<Enrollment> {
  const patch: Partial<Enrollment> = { status: defaultStatus(term) };
  const eligible = eligibleSections(code, term, profile);
  patch.credits = eligible[0]?.creditsMin || getCourse(code)?.creditsMin || 3;
  if (eligible.length === 1 && patch.status !== 'completed') patch.section = eligible[0].section;
  return patch;
}
