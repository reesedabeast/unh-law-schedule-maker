import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCourse, normCode } from './engine/catalog';
import { nextTerm } from './engine/terms';
import type { Enrollment, Profile } from './engine/types';
import type { ParsedRow } from './transcript/parseRows';

export const newId = () => Math.random().toString(36).slice(2, 10);

export const defaultProfile = (): Profile => ({
  program: 'residential',
  transfer: false,
  startTerm: '202510',
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
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
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
        set((s) => ({ enrollments: s.enrollments.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
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
          const keep =
            mode === 'replace-record'
              ? s.enrollments.filter((e) => e.status === 'planned')
              : s.enrollments.filter((e) => !imported.some((i) => i.code === e.code && i.term === e.term));
          const first = [...imported.map((e) => e.term)].filter((t) => !t.endsWith('70')).sort()[0];
          return {
            enrollments: [...keep, ...imported],
            profile: first ? { ...s.profile, startTerm: first } : s.profile,
          };
        }),
      loadState: (st) => set({ profile: { ...defaultProfile(), ...st.profile }, enrollments: st.enrollments, extraTerms: st.extraTerms ?? [] }),
      reset: () => set({ profile: defaultProfile(), enrollments: [], extraTerms: [] }),
    }),
    { name: 'unh-law-schedule-maker', version: 1 },
  ),
);

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
