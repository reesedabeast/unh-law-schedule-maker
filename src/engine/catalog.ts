import coursesJson from '../data/generated/courses.json';
import termsJson from '../data/generated/terms.json';
import metaJson from '../data/generated/meta.json';
import type { Enrollment } from './types';
import { termName } from './terms';

export interface Offering {
  term: string;
  attrsAll: string[];
  attrsSome: string[];
}

export interface Course {
  code: string;
  title: string;
  creditsText: string;
  creditsMin: number;
  creditsMax: number;
  description: string;
  prereq: string;
  coreq: string;
  equivalents: string[];
  repeatRule: string;
  gradeMode: string;
  /** 'law', or the dual degree program a graduate course belongs to ('mba' | 'msw' | 'mpp'). */
  program: string;
  inCatalog: boolean;
  offerings: Offering[];
}

export interface Meeting {
  days: string;
  time: string;
  building: string;
  room: string;
}

export interface Section {
  term: string;
  crn: string;
  code: string;
  section: string;
  title: string;
  creditsMin: number;
  creditsMax: number;
  partOfTerm: string;
  startDate: string;
  endDate: string;
  gradeMode: string;
  method: string | null;
  maxEnroll: number;
  enrolled: number;
  instructors: string[];
  meetings: Meeting[];
  attrs: string[];
  delivery: string[];
  restrictions: string[];
  majorsAllowed: string[];
  majorsExcluded: string[];
  onlineOnly: boolean;
  prereq: string;
}

export const COURSES = coursesJson as Course[];
export const TERMS = termsJson as { term: string; name: string; count: number }[];
export const DATA_RETRIEVED = (metaJson as { retrieved: string }).retrieved;

const sectionModules = import.meta.glob('../data/generated/sections/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Section[]>;

export const SECTIONS_BY_TERM: Record<string, Section[]> = {};
for (const [path, list] of Object.entries(sectionModules)) {
  const term = path.match(/(\d{6})\.json$/)?.[1];
  if (term) SECTIONS_BY_TERM[term] = list;
}

const byCode = new Map(COURSES.map((c) => [c.code, c]));

export const normCode = (code: string) =>
  code
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/^([A-Z]+)\s*(\d)/, '$1 $2')
    .trim();

export function getCourse(code: string): Course | undefined {
  return byCode.get(normCode(code));
}

export const subjectOf = (code: string) => normCode(code).split(' ')[0];

// Equivalents are listed one-way in the catalog (LSK 921 lists LSK 919); make them symmetric.
const equivMap = new Map<string, Set<string>>();
for (const c of COURSES) {
  for (const e of c.equivalents) {
    for (const [a, b] of [
      [c.code, e],
      [e, c.code],
    ]) {
      if (!equivMap.has(a)) equivMap.set(a, new Set());
      equivMap.get(a)!.add(b);
    }
  }
}

/** The code plus every catalog equivalent. */
export function equivalentsOf(code: string): string[] {
  const c = normCode(code);
  return [c, ...(equivMap.get(c) ?? [])];
}

export function matchesAny(e: Enrollment, codes: string[]): boolean {
  const eq = equivalentsOf(e.code);
  return codes.some((c) => eq.includes(normCode(c)));
}

export function sectionsFor(code: string, term: string): Section[] {
  return (SECTIONS_BY_TERM[term] ?? []).filter((s) => s.code === normCode(code));
}

export function findSection(e: Enrollment): Section | undefined {
  if (!e.section) return undefined;
  return sectionsFor(e.code, e.term).find((s) => s.section === e.section);
}

export const LATEST_TERM = TERMS.length ? TERMS[TERMS.length - 1].term : '';

// ---------------- requirement flags ----------------

export type FlagKind = 'LWI' | 'LEXP' | 'LBAR';

export interface FlagValue {
  /** Counts toward the requirement. */
  value: boolean;
  /** Needs the student to confirm (flag varies by section/term). */
  uncertain: boolean;
  reason: string;
}

/**
 * Upper-Level Writing / Experiential Learning / Bar flags are attached to sections in the
 * schedule, so they can differ by term and section. Resolution order:
 * student override -> chosen section -> that term's offering -> other terms' offerings.
 */
export function flagFor(e: Enrollment, kind: FlagKind): FlagValue {
  const override = kind === 'LWI' ? e.ulw : kind === 'LEXP' ? e.el : undefined;
  if (override !== undefined) {
    return { value: override, uncertain: false, reason: override ? 'You marked this course as counting' : 'You marked this course as not counting' };
  }
  const sec = findSection(e);
  if (sec) {
    const has = sec.attrs.includes(kind);
    return { value: has, uncertain: false, reason: `Section ${sec.section} in ${termName(e.term)} ${has ? 'carries' : 'does not carry'} this designation` };
  }
  const course = getCourse(e.code);
  if (!course) return { value: false, uncertain: false, reason: 'Course not found in schedule data' };
  const off = course.offerings.find((o) => o.term === e.term);
  if (off) {
    if (off.attrsAll.includes(kind)) return { value: true, uncertain: false, reason: `Designated in ${termName(e.term)}` };
    if (off.attrsSome.includes(kind))
      return { value: false, uncertain: true, reason: `Only some sections in ${termName(e.term)} carried this designation — confirm yours` };
    // Some terms have one section only; lack of the flag that term is authoritative.
    return { value: false, uncertain: false, reason: `Not designated in ${termName(e.term)}` };
  }
  const all = course.offerings.filter((o) => o.attrsAll.includes(kind));
  const some = course.offerings.filter((o) => o.attrsSome.includes(kind));
  if (all.length && all.length === course.offerings.length)
    return { value: true, uncertain: false, reason: 'Designated every term it has been offered' };
  const latest = (os: Offering[]) => termName(os[os.length - 1].term);
  if (all.length)
    return {
      value: true,
      uncertain: true,
      reason: `Designated in ${all.length} of ${course.offerings.length} terms offered (most recently ${latest(all)}) — confirm for your term`,
    };
  if (some.length)
    return { value: false, uncertain: true, reason: `Only some sections carried this designation (most recently ${latest(some)}) — confirm yours` };
  return { value: false, uncertain: false, reason: 'Not designated in any term on record' };
}

/** Course-level summary used by the catalog search (ever designated in any section). */
export function courseHasAttr(c: Course, kind: FlagKind, term?: string): boolean {
  if (term) return !!c.offerings.find((o) => o.term === term)?.attrsSome.includes(kind);
  return c.offerings.some((o) => o.attrsSome.includes(kind));
}
