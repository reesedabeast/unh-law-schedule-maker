import { describe, expect, it } from 'vitest';
import { linesFromItems, type PositionedText } from '../src/transcript/lines';
import { parseTranscriptLines } from '../src/transcript/parseRows';

// Synthetic transcript shaped like the UNH Parchment PDF (fake person, fake grades).
const LEFT = [
  'Record of: Jane Q Student',
  'Course Level: Law JD',
  'SUBJ NO. COURSE TITLE CRED GRD PTS R',
  'INSTITUTION CREDIT:',
  'Fall 2024',
  'LGP 900 The Legal Profession 1.00 S 0.00',
  'LGP 909 Civil Procedure 4.00 B 12.00',
  'LSK 921 Legal Analysis,Writing&Rsrch I 3.00 A- 11.01',
  'Ehrs: 8.00 GPA-Hrs: 7.00 QPts: 23.01 GPA: 3.28',
  'Spring 2025',
  'LGP 952 Property 4.00 D+ 5.32',
  'LIP 944 Fund of Intellectual Property 3.00 A 12.00',
  'Good Standing',
  'Spring 2026',
  'IN PROGRESS WORK',
  'LBS 907 Business Associations I 3.00 IN PROGRESS',
  '******************** CONTINUED ON NEXT COLUMN ******************',
];
const RIGHT = [
  'SUBJ NO. COURSE TITLE CRED GRD PTS R',
  'IN PROGRESS WORK continued:',
  'LIP 962 Patent Practice & Procedure II 3.00 IN PROGRESS',
  'In Progress Credits 6.00',
  '********************** TRANSCRIPT TOTALS ***********************',
  'Earned Hrs GPA Hrs Points GPA',
  'TOTAL INSTITUTION 15.00 14.00 40.33 2.88',
  'OVERALL 15.00 14.00 40.33 2.88',
];

/** Lays the two columns out as positioned items, as a rotated PDF would after the viewport transform. */
function layout(): PositionedText[] {
  const items: PositionedText[] = [];
  LEFT.forEach((l, i) => items.push({ str: l, x: 50, y: 100 + i * 12 }));
  RIGHT.forEach((l, i) => items.push({ str: l, x: 580, y: 100 + i * 12 + 0.7 }));
  return items;
}

describe('transcript parsing', () => {
  it('rebuilds two columns in reading order', () => {
    const lines = linesFromItems(layout());
    expect(lines.indexOf('LBS 907 Business Associations I 3.00 IN PROGRESS')).toBeLessThan(
      lines.indexOf('LIP 962 Patent Practice & Procedure II 3.00 IN PROGRESS'),
    );
  });

  it('splits a line broken into several text items', () => {
    const lines = linesFromItems([
      { str: 'LGP', x: 50, y: 10 },
      { str: '909', x: 80, y: 10.5 },
      { str: 'Civil Procedure', x: 120, y: 10 },
      { str: '4.00 A', x: 300, y: 10 },
      { str: '16.00', x: 350, y: 10 },
    ]);
    expect(lines).toEqual(['LGP 909 Civil Procedure 4.00 A 16.00']);
  });

  it('parses rows, terms, in-progress work and totals', () => {
    const r = parseTranscriptLines(linesFromItems(layout()));
    expect(r.rows.map((x) => `${x.term} ${x.code} ${x.credits} ${x.grade ?? 'IP'}`)).toEqual([
      '202410 LGP 900 1 S',
      '202410 LGP 909 4 B',
      '202410 LSK 921 3 A-',
      '202450 LGP 952 4 D+',
      '202450 LIP 944 3 A',
      '202550 LBS 907 3 IP',
      '202550 LIP 962 3 IP',
    ]);
    expect(r.rows.find((x) => x.code === 'LIP 962')!.status).toBe('in-progress');
    expect(r.totals?.earned).toBe(15);
    expect(r.warnings).toEqual([]);
    // Personal header lines never become rows.
    expect(JSON.stringify(r.rows)).not.toContain('Jane');
  });

  it('reports a credit mismatch against the totals', () => {
    const lines = linesFromItems(layout()).filter((l) => !l.startsWith('LGP 909'));
    expect(parseTranscriptLines(lines).warnings[0]).toContain('transcript totals');
  });

  it('reports unreadable course-like lines and transfer credit', () => {
    const r = parseTranscriptLines([
      'TRANSFER CREDIT ACCEPTED BY INSTITUTION:',
      'Fall 2023',
      'LGP 920 Contracts 4.00 T 0.00',
      'INSTITUTION CREDIT:',
      'Fall 2024',
      'LGP 960 Torts three credits',
    ]);
    expect(r.rows[0].transferredIn).toBe(true);
    expect(r.warnings.some((w) => w.includes('Torts'))).toBe(true);
  });
});
