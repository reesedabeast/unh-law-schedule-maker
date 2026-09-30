import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FIRST_YEAR_PLAN, alternativesFor } from './data/rules/programs';
import { equivalentsOf, getCourse, normCode } from './engine/catalog';
import { currentTerm, defaultStatus, isRegularTerm, nextTerm } from './engine/terms';
import type { Enrollment, Profile } from './engine/types';
import type { ParsedRow } from './transcript/parseRows';

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Fall of the current academic year: the most likely start term for a new student. */
const defaultStart = () => `${currentTerm().slice(0, 4)}10`;

export const defaultProfile = (): Profile => ({
  program: 'residential',
  transfer: false,
  startTerm: defaultStart(),
  concentrations: [],
  dual: null,
  manual: {},
  concentrationApprovals: {},
});

interface State {
  profile: Profile;
  enrollments: Enrollment[];
  /** Extra empty terms the student added to plan into. */
  extraTerms: string[];
  /** First-run setup (start term, 1L defaults) has been completed. */
  setupDone: boolean;
  startFresh: (p: Partial<Profile>, fillFirstYear: boolean) => void;
  /** Adds any default 1L courses not already on the record/plan. */
  fillFirstYear: () => void;
  /** Swap an either/or requirement course (e.g. LPI 912 <-> LIP 944). */
  swapCourse: (id: string, code: string) => void;
  setProfile: (p: Partial<Profile>) => void;
  toggleManual: (key: string) => void;
  addCourse: (code: string, term: string, patch?: Partial<Enrollment>) => void;
  updateEnrollment: (id: string, patch: Partial<Enrollment>) => void;
  removeEnrollment: (id: string) => void;
  addTerm: (term: string) => void;
  removeTerm: (term: string) => void;
  applyTranscript: (rows: ParsedRow[], mode: 'replace-record' | 'merge') => void;
  loadState: (s: { profile: Profile; enrollments: Enrollment[]; extraTerms?: string[] }) => void;
  reset: () => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      profile: defaultProfile(),
      enrollments: [],
      extraTerms: [],
      setupDone: false,
      setProfile: (p) =>
        set((s) => {
          const profile = { ...s.profile, ...p };
          if (!p.startTerm || p.startTerm === s.profile.startTerm) return { profile };
          // Untouched 1L defaults move with the start term.
          const [fall, spring] = firstYearTerms(profile.startTerm);
          const enrollments = s.enrollments.map((e) => {
            if (!e.auto) return e;
            const term = FIRST_YEAR_PLAN.fall.includes(e.code) ? fall : spring;
            return { ...e, term, status: defaultStatus(term), grade: undefined };
          });
          return { profile, enrollments };
        }),
      startFresh: (p, fill) =>
        set((s) => {
          const profile = { ...s.profile, ...p };
          return { profile, setupDone: true, enrollments: fill ? firstYearEnrollments(profile.startTerm, s.enrollments) : s.enrollments };
        }),
      fillFirstYear: () => set((s) => ({ enrollments: [...s.enrollments, ...firstYearEnrollments(s.profile.startTerm, s.enrollments)] })),
      swapCourse: (id, code) =>
        set((s) => ({
          enrollments: s.enrollments.map((e) => {
            if (e.id !== id) return e;
            const c = getCourse(code);
            return { ...e, code, title: c?.title, credits: c?.creditsMax || e.credits, section: undefined };
          }),
        })),
      toggleManual: (key) => set((s) => ({ profile: { ...s.profile, manual: { ...s.profile.manual, [key]: !s.profile.manual[key] } } })),
      addCourse: (code, term, patch = {}) =>
        set((s) => {
          const c = getCourse(code);
          const e: Enrollment = {
            id: newId(),
            code: normCode(code),
            title: c?.title,
            term,
            credits: c?.creditsMin || 3,
            status: 'planned',
            ...patch,
          };
          return { enrollments: [...s.enrollments, e] };
        }),
      updateEnrollment: (id, patch) =>
        set((s) => ({
          enrollments: s.enrollments.map((e) => {
            if (e.id !== id) return e;
            // Editing term, status or grade makes a 1L default the student's own entry.
            const touched = 'term' in patch || 'status' in patch || 'grade' in patch;
            return { ...e, ...patch, auto: touched ? undefined : e.auto };
          }),
        })),
      removeEnrollment: (id) => set((s) => ({ enrollments: s.enrollments.filter((e) => e.id !== id) })),
      addTerm: (term) => set((s) => ({ extraTerms: [...new Set([...s.extraTerms, term])] })),
      removeTerm: (term) =>
        set((s) => ({
          extraTerms: s.extraTerms.filter((t) => t !== term),
          enrollments: s.enrollments.filter((e) => e.term !== term || e.status !== 'planned'),
        })),
      applyTranscript: (rows, mode) =>
        set((s) => {
          const imported: Enrollment[] = rows.map((r) => ({
            id: newId(),
            code: r.code,
            title: getCourse(r.code)?.title ?? r.title,
            term: r.term,
            credits: r.credits,
            grade: r.grade,
            status: r.status,
            transferredIn: r.transferredIn || undefined,
          }));
          // Planned courses stay; completed/in-progress courses come from the transcript.
          // Untouched 1L defaults are dropped: the transcript is the real record.
          const mine = s.enrollments.filter((e) => !e.auto);
          const keep =
            mode === 'replace-record'
              ? mine.filter((e) => e.status === 'planned')
              : mine.filter((e) => !imported.some((i) => i.code === e.code && i.term === e.term));
          const first = [...imported.map((e) => e.term)].filter((t) => !t.endsWith('70')).sort()[0];
          return {
            enrollments: [...keep, ...imported],
            profile: first ? { ...s.profile, startTerm: first } : s.profile,
            setupDone: true,
          };
        }),
      loadState: (st) =>
        set({ profile: { ...defaultProfile(), ...st.profile }, enrollments: st.enrollments, extraTerms: st.extraTerms ?? [], setupDone: true }),
      reset: () => set({ profile: defaultProfile(), enrollments: [], extraTerms: [], setupDone: false }),
    }),
    { name: 'unh-law-schedule-maker', version: 1 },
  ),
);

/** The fall and spring terms of the first JD year. */
export function firstYearTerms(start: string): [string, string] {
  const first = isRegularTerm(start) ? start : nextTerm(start);
  return [first, nextTerm(first)];
}

/** Default 1L enrollments, skipping requirements already covered (incl. equivalents and either/or options). */
export function firstYearEnrollments(start: string, existing: Enrollment[]): Enrollment[] {
  const [fall, spring] = firstYearTerms(start);
  const covered = (code: string) =>
    [code, ...alternativesFor(code)].some((c) => existing.some((e) => equivalentsOf(e.code).includes(c)));
  const make = (code: string, term: string): Enrollment => {
    const c = getCourse(code);
    // Variable-credit 1L courses (e.g. Contracts 3-4) take the residential credit value.
    return { id: newId(), code, title: c?.title, term, credits: c?.creditsMax || 3, status: defaultStatus(term), auto: true };
  };
  return [
    ...FIRST_YEAR_PLAN.fall.filter((c) => !covered(c)).map((c) => make(c, fall)),
    ...FIRST_YEAR_PLAN.spring.filter((c) => !covered(c)).map((c) => make(c, spring)),
  ];
}

/** All terms to show: from the start term through the last term used, plus added terms. */
export function visibleTerms(start: string, enrollments: Enrollment[], extra: string[]): string[] {
  const used = new Set([...enrollments.map((e) => e.term), ...extra]);
  const last = [...used].sort().pop() ?? start;
  const out: string[] = [];
  let t = start;
  const end = last > start ? last : start;
  while (t <= end) {
    // Summer terms appear only when something is in them.
    if (!t.endsWith('70') || used.has(t)) out.push(t);
    t = nextTerm(t, true);
  }
  return out;
}
