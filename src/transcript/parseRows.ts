/**
 * Turns reading-order transcript lines (see parsePdf.ts) into course rows.
 * Format (UNH Banner / Parchment "Certified Digital Credential"):
 *
 *   Fall 2024
 *   LGP 900     The Legal Profession        1.00 S      0.00
 *   LSK 921     Legal Analysis,Writing&Rsrch I 3.00 A-  11.01
 *        Ehrs: 15.00 GPA-Hrs: 14.00 QPts:  53.00 GPA:  3.78
 *   Spring 2026
 *   IN PROGRESS WORK
 *   LBS 907     Business Associations I     3.00 IN PROGRESS
 *
 * Titles are abbreviated, so rows are keyed by subject + number. Header lines (name, ID,
 * date of birth, SSN) are never matched or returned.
 */
import { parseTermName } from '../engine/terms';

export interface ParsedRow {
  code: string;
  title: string;
  term: string;
  credits: number;
  grade?: string;
  status: 'completed' | 'in-progress';
  transferredIn: boolean;
  /** Repeat indicator column, if present (e.g. "E" excluded, "I" included). */
  repeat?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
  /** From the "OVERALL" totals line, for cross-checking. */
  totals?: { earned: number; gpaHours: number; points: number; gpa: number };
}

const ROW =
  /^([A-Z]{2,5})\s+(\d{3}[A-Z]?)\s+(.*?)\s+(\d{1,2}\.\d{2})\s+(IN PROGRESS|[A-Z]{1,2}[+-]?)(?:\s+(\d+\.\d{2}))?(?:\s+([A-Z]))?\s*$/;
const TERM = /^(Fall|Spring|Summer)\s+(\d{4})\b/i;
const OVERALL = /^OVERALL\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})/;
/** Starts like a course row (used to report lines we failed to parse). */
const LOOKS_LIKE_ROW = /^[A-Z]{2,5}\s+\d{3}[A-Z]?\s/;

export function parseTranscriptLines(lines: string[]): ParseResult {
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let term: string | null = null;
  let transfer = false;
  let totals: ParseResult['totals'];

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    if (/TRANSFER CREDIT/i.test(line) && !/^TOTAL/i.test(line)) {
      transfer = true;
      continue;
    }
    if (/^INSTITUTION CREDIT/i.test(line)) {
      transfer = false;
      continue;
    }
    const t = line.match(TERM);
    if (t && !ROW.test(line)) {
      term = parseTermName(`${t[1]} ${t[2]}`);
      continue;
    }
    const o = line.match(OVERALL);
    if (o) {
      totals = { earned: Number(o[1]), gpaHours: Number(o[2]), points: Number(o[3]), gpa: Number(o[4]) };
      continue;
    }
    const m = line.match(ROW);
    if (m) {
      if (!term) {
        warnings.push(`Found a course before any term heading: "${line}"`);
        continue;
      }
      const inProgress = m[5] === 'IN PROGRESS';
      rows.push({
        code: `${m[1]} ${m[2]}`,
        title: m[3].trim(),
        term,
        credits: Number(m[4]),
        grade: inProgress ? undefined : m[5],
        status: inProgress ? 'in-progress' : 'completed',
        transferredIn: transfer,
        repeat: m[7],
      });
      continue;
    }
    if (LOOKS_LIKE_ROW.test(line) && !/^SUBJ\b/.test(line)) warnings.push(`Couldn't read this line: "${line}"`);
  }

  if (totals) {
    const earned = rows.filter((r) => r.status === 'completed' && !['F', 'U', 'W'].includes(r.grade ?? '')).reduce((s, r) => s + r.credits, 0);
    if (Math.abs(earned - totals.earned) > 0.01)
      warnings.push(`Parsed ${earned} earned credits but the transcript totals show ${totals.earned}. Check for missing or extra rows.`);
  }
  return { rows, warnings, totals };
}
