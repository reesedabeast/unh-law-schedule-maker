import { describe, expect, it } from 'vitest';
import { allocateUlwEl } from '../src/engine/allocate';
import { equivalentsOf, flagFor, getCourse } from '../src/engine/catalog';
import { evaluate, evaluateProgram, tallyCredits } from '../src/engine/evaluate';
import { gpa } from '../src/engine/gpa';
import { evalExpr, parsePrereq } from '../src/engine/prereq';
import { nextTerm, parseTermName, termName } from '../src/engine/terms';
import type { ReqResult } from '../src/engine/types';
import { en, firstYear, profile, upperYears } from './helpers';

const find = (r: ReqResult, id: string): ReqResult | undefined => {
  if (r.id === id) return r;
  for (const c of r.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
};

describe('terms', () => {
  it('maps Banner codes both ways', () => {
    expect(termName('202410')).toBe('Fall 2024');
    expect(termName('202450')).toBe('Spring 2025');
    expect(termName('202470')).toBe('Summer 2025');
    expect(parseTermName('Spring 2026')).toBe('202550');
    expect(parseTermName('Fall 2025')).toBe('202510');
    expect(nextTerm('202510')).toBe('202550');
    expect(nextTerm('202550')).toBe('202610');
    expect(nextTerm('202550', true)).toBe('202570');
  });
});

describe('catalog data', () => {
  it('loads courses with equivalents', () => {
    expect(getCourse('LGP 909')?.title).toBe('Civil Procedure');
    expect(equivalentsOf('LSK 919')).toContain('LSK 921');
    expect(equivalentsOf('LSK 921')).toContain('LSK 919');
  });

  it('resolves section-level flags by term', () => {
    expect(flagFor(en('LSK 928', '202610', 3, undefined, 'planned'), 'LEXP').value).toBe(true);
    expect(flagFor(en('LGP 909', '202410', 4, 'A'), 'LEXP').value).toBe(false);
    // Special Topics varies by section: needs confirmation.
    expect(flagFor(en('LGP 990', '202610', 2, undefined, 'planned'), 'LEXP').uncertain).toBe(true);
    // Student override wins.
    expect(flagFor(en('LGP 990', '202610', 2, undefined, 'planned', { el: true }), 'LEXP').value).toBe(true);
  });
});

describe('prerequisites', () => {
  it('parses and/or expressions from catalog text', () => {
    const e = parsePrereq('LGP 924 with a minimum grade of D- and LSK 928 with a minimum grade of D-.')!;
    expect(evalExpr(e, (c) => c === 'LGP 924')).toBe(false);
    expect(evalExpr(e, (c) => ['LGP 924', 'LSK 928'].includes(c))).toBe(true);
    const o = parsePrereq('(LSK 921 or LSK 919) and LSK 922')!;
    expect(evalExpr(o, (c) => ['LSK 919', 'LSK 922'].includes(c))).toBe(true);
    expect(parsePrereq('')).toBeNull();
    const c = parsePrereq('LGP 924 with a minimum grade of D- and LGP 951 with a minimum grade of D- and LCR 906 (may be taken concurrently) with a minimum grade of D-.')!;
    expect(evalExpr(c, (code, concurrent) => code !== 'LCR 906' || concurrent)).toBe(true);
    expect(evalExpr(c, (code, concurrent) => code !== 'LCR 906' || !concurrent)).toBe(false);
    // Banner sometimes leaves parentheses unbalanced.
    const u = parsePrereq('(LCL 935 with a minimum grade of D- and (LCL 936 with a minimum grade of D-.')!;
    expect(evalExpr(u, (code) => code === 'LCL 935')).toBe(false);
    expect(evalExpr(u, () => true)).toBe(true);
  });
});

describe('ULW / EL allocation', () => {
  it('does not let one course satisfy both requirements', () => {
    const a = allocateUlwEl([{ id: 'x', credits: 3, ulw: true, el: true }], 2, 6);
    expect(a.ulw.length + a.el.length).toBe(1);
  });

  it('assigns a dual-designated course where it helps most', () => {
    const a = allocateUlwEl(
      [
        { id: 'both', credits: 2, ulw: true, el: true },
        { id: 'el1', credits: 3, ulw: false, el: true },
        { id: 'el2', credits: 3, ulw: false, el: true },
      ],
      2,
      6,
    );
    expect(a.ulw).toEqual(['both']);
    expect(a.elCredits).toBe(6);
  });
});

describe('GPA', () => {
  it('matches the transcript points table', () => {
    const g = gpa(firstYear().slice(0, 5));
    // A(4)*4 + A(4)*4 + B+(3.33)*3 + A-(3.67)*3 over 14 graded credits (LGP 900 is S)
    expect(g.hours).toBe(14);
    expect(g.gpa!.toFixed(2)).toBe('3.79');
  });
});

describe('residential JD', () => {
  it('a complete 3-year record meets every computed requirement', () => {
    const es = [...firstYear(), ...upperYears()];
    const r = evaluateProgram(es, profile());
    expect(find(r, 'total-credits')!.status).toBe('met');
    expect(find(r, 'first-year')!.status).toBe('met');
    expect(find(r, 'upper-level')!.status).toBe('met');
    expect(find(r, 'ulw')!.status).toBe('met');
    expect(find(r, 'el')!.status).toBe('met');
    expect(find(r, 'residency')!.status).toBe('met');
    expect(r.status).toBe('met');
  });

  it('layers progress: completed vs planned', () => {
    const es = [...firstYear(), ...upperYears('planned')];
    const r = evaluateProgram(es, profile());
    const total = find(r, 'total-credits')!;
    expect(total.progress!.have[0]).toBe(31);
    expect(total.status).toBe('planned');
    expect(find(r, 'ulw')!.status).toBe('planned');
  });

  it('flags missing upper-level writing and suggests courses', () => {
    const es = [...firstYear(), ...upperYears('planned').filter((e) => e.code !== 'LBS 943')];
    const ulw = find(evaluateProgram(es, profile()), 'ulw')!;
    expect(ulw.status).toBe('unmet');
    expect(ulw.suggestions!.length).toBeGreaterThan(0);
  });

  it('does not count credits over the residency cap', () => {
    const es = [
      ...firstYear(),
      en('LSK 934', '202510', 11, 'S'),
      en('LSK 948', '202550', 6, 'S'),
    ];
    const t = tallyCredits(es, profile());
    expect(t.residency).toBe(17);
    expect(t.excess.residency).toBe(2);
    expect(t.countable).toBe(t.total - 2);
    expect(find(evaluateProgram(es, profile()), 'cap-residency')!.status).toBe('unmet');
  });

  it('counts a semester under 12 credits as not full-time', () => {
    const es = [...firstYear(), ...upperYears()].filter((e) => !(e.term === '202650' && ['LGP 928', 'LBS 932'].includes(e.code)));
    const res = find(evaluateProgram(es, profile()), 'residency')!;
    expect(res.progress!.have[0]).toBe(5);
    expect(res.status).toBe('unmet');
    expect(res.warnings!.some((w) => w.includes('Spring 2027'))).toBe(true);
  });

  it('transfer students need 4 semesters', () => {
    const es = [...upperYears()];
    expect(find(evaluateProgram(es, profile({ transfer: true, startTerm: '202510' })), 'residency')!.status).toBe('met');
  });

  it('failed required course does not satisfy it', () => {
    const es = firstYear().map((e) => (e.code === 'LGP 960' ? { ...e, grade: 'F' } : e));
    const torts = find(evaluateProgram(es, profile()), 'LGP 960')!;
    expect(torts.status).toBe('unmet');
    expect(torts.warnings![0]).toContain('did not earn credit');
  });
});

describe('DWS', () => {
  it('requires DWS courses and counts only clinic/residency toward EL', () => {
    const es = [...firstYear(), en('LSK 928', '202510', 3, 'A', 'completed', { el: true })];
    const r = evaluateProgram(es, profile({ program: 'dws' }));
    expect(find(r, 'el')!.progress!.have[0]).toBe(0);
    expect(find(r, 'dws-core')!.status).toBe('unmet');
    expect(find(r, 'gpa')!.label).toContain('3.00');
  });
});

describe('concentrations', () => {
  it('criminal law requires B- or better', () => {
    const es = [
      ...firstYear(),
      en('LCR 906', '202510', 3, 'A'),
      en('LCR 907', '202510', 2, 'C+'),
      en('LGP 924', '202510', 3, 'B'),
      en('LSK 928', '202550', 3, 'B-'),
      en('LGP 926', '202550', 3, 'A'),
    ];
    const ev = evaluate(es, profile({ concentrations: ['criminal'] }));
    const c = ev.concentrations[0];
    expect(c.warnings!.some((w) => w.includes('LCR 907'))).toBe(true);
    expect(find(c, 'conc-criminal-g0')!.status).toBe('unmet');
    expect(find(c, 'conc-criminal-credits')!.progress!.have[0]).toBe(12);
  });

  it('IP needs three of the four core courses', () => {
    const es = [
      ...firstYear(),
      en('LIP 954', '202510', 3, 'A'),
      en('LIP 912', '202550', 3, undefined, 'planned'),
    ];
    const c = evaluate(es, profile({ concentrations: ['ip'] })).concentrations[0];
    // LIP 944 from 1L counts toward the group.
    expect(find(c, 'conc-ip-g0')!.status).toBe('planned');
  });

  it('hybrid-only concentration is marked ineligible', () => {
    const c = evaluate(firstYear(), profile({ concentrations: ['health-life-sciences'] })).concentrations[0];
    expect(c.status).toBe('info');
  });
});

describe('dual degrees', () => {
  it('JD/MBA counts only approved ADMN courses, capped at 12', () => {
    const es = [
      ...firstYear(),
      en('ADMN 912', '202510', 3, 'A'),
      en('ADMN 919', '202510', 3, 'A'),
      en('ADMN 930', '202550', 3, 'A'),
      en('ADMN 950', '202550', 3, 'A'),
      en('ADMN 960', '202610', 3, 'A'),
      en('ADMN 926', '202610', 3, 'A'),
    ];
    const t = tallyCredits(es, profile({ dual: 'mba' }));
    expect(t.nonLaw).toBe(15); // ADMN 926 not transferable
    expect(t.excess.nonLaw).toBe(3);
    const ev = evaluate(es, profile({ dual: 'mba' }));
    expect(ev.dual!.children!.find((c) => c.id === 'dual-law-to-master')!.status).toBe('met');
  });
});

describe('plan checks', () => {
  it('allows concurrent prerequisites and flags missing ones', async () => {
    const { checkPlan } = await import('../src/engine/planChecks');
    const base = firstYear();
    const ok = checkPlan([...base, en('LGP 924', '202610', 3, undefined, 'planned'), en('LSK 928', '202610', 3, undefined, 'planned')], profile());
    expect(ok.some((i) => i.message.includes('LSK 928') && i.message.includes('prerequisite'))).toBe(false);
    const bad = checkPlan([...base, en('LSK 903', '202610', 3, undefined, 'planned')], profile());
    expect(bad.some((i) => i.message.includes('LSK 903') && i.message.includes('prerequisite'))).toBe(true);
  });

  it('detects meeting-time conflicts and restricted sections', async () => {
    const { checkPlan, sectionsConflict } = await import('../src/engine/planChecks');
    const { SECTIONS_BY_TERM } = await import('../src/engine/catalog');
    const secs = SECTIONS_BY_TERM['202610'].filter((s) => s.meetings.some((m) => m.time));
    const pair = secs.flatMap((a, i) => secs.slice(i + 1).map((b) => [a, b] as const)).find(([a, b]) => a.code !== b.code && sectionsConflict(a, b));
    expect(pair).toBeTruthy();
    const [a, b] = pair!;
    const issues = checkPlan(
      [...firstYear(), en(a.code, '202610', 3, undefined, 'planned', { section: a.section }), en(b.code, '202610', 3, undefined, 'planned', { section: b.section })],
      profile(),
    );
    expect(issues.some((i) => i.message.includes('overlapping'))).toBe(true);

    const hybridOnly = SECTIONS_BY_TERM['202610'].find((s) => s.majorsExcluded.includes('JD'))!;
    const r = checkPlan([...firstYear(), en(hybridOnly.code, '202610', 3, undefined, 'planned', { section: hybridOnly.section })], profile());
    expect(r.some((i) => i.message.includes('not open to JD'))).toBe(true);
  });
});
