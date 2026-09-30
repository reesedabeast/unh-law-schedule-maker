/**
 * UNH Banner term codes: YYYY10 = Fall YYYY, YYYY50 = Spring YYYY+1, YYYY70 = Summer YYYY+1.
 * Codes sort chronologically as plain strings.
 */
export type Season = 'Fall' | 'Spring' | 'Summer';

export interface TermInfo {
  code: string;
  season: Season;
  year: number;
  name: string;
}

const SUFFIX: Record<string, Season> = { '10': 'Fall', '50': 'Spring', '70': 'Summer' };

export function termInfo(code: string): TermInfo {
  const ay = Number(code.slice(0, 4));
  const season = SUFFIX[code.slice(4)] ?? 'Fall';
  const year = season === 'Fall' ? ay : ay + 1;
  return { code, season, year, name: `${season} ${year}` };
}

export function termCode(season: Season, year: number): string {
  if (season === 'Fall') return `${year}10`;
  return `${year - 1}${season === 'Spring' ? '50' : '70'}`;
}

export function termName(code: string): string {
  return termInfo(code).name;
}

/** Parses "Fall 2024" / "Spring 2025" / "Summer 2025". */
export function parseTermName(name: string): string | null {
  const m = name.trim().match(/^(Fall|Spring|Summer)\s+(\d{4})$/i);
  if (!m) return null;
  const season = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as Season;
  return termCode(season, Number(m[2]));
}

export function isRegularTerm(code: string): boolean {
  return termInfo(code).season !== 'Summer';
}

export function nextTerm(code: string, includeSummer = false): string {
  const ay = Number(code.slice(0, 4));
  const s = code.slice(4);
  if (s === '10') return `${ay}50`;
  if (s === '50') return includeSummer ? `${ay}70` : `${ay + 1}10`;
  return `${ay + 1}10`;
}

/** Approximate month index of a term's start, for the 84-month completion limit. */
export function termStartMonth(code: string): number {
  const { season, year } = termInfo(code);
  const month = season === 'Fall' ? 8 : season === 'Spring' ? 1 : 5;
  return year * 12 + month;
}

export function termEndMonth(code: string): number {
  const { season, year } = termInfo(code);
  const month = season === 'Fall' ? 12 : season === 'Spring' ? 5 : 8;
  return year * 12 + month;
}

/** Regular (fall/spring) terms from start through `count` terms. */
export function regularTermsFrom(start: string, count: number): string[] {
  const out: string[] = [];
  let t = isRegularTerm(start) ? start : nextTerm(start);
  while (out.length < count) {
    out.push(t);
    t = nextTerm(t);
  }
  return out;
}
