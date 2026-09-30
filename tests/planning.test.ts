import { describe, expect, it } from 'vitest';
import { getCourse } from '../src/engine/catalog';
import { checkPlan } from '../src/engine/planChecks';
import { alternativesFor } from '../src/data/rules/programs';
import { firstYearEnrollments, firstYearTerms } from '../src/store';
import { en, profile } from './helpers';

describe('default 1L schedule', () => {
  it('fills both 1L semesters from the sample degree plan', () => {
    const es = firstYearEnrollments('202610', []);
    expect(firstYearTerms('202610')).toEqual(['202610', '202650']);
    expect(es).toHaveLength(10);
    expect(es.filter((e) => e.term === '202610').reduce((s, e) => s + e.credits, 0)).toBe(15);
    expect(es.filter((e) => e.term === '202650').reduce((s, e) => s + e.credits, 0)).toBe(16);
    expect(es.every((e) => e.auto)).toBe(true);
    expect(es.some((e) => e.code === 'LPI 912')).toBe(true);
  });

  it('skips requirements already covered, including the other perspectives option', () => {
    const es = firstYearEnrollments('202610', [en('LIP 944', '202650', 3), en('LSK 919', '202610', 2)]);
    expect(es.some((e) => e.code === 'LPI 912')).toBe(false);
    expect(es.some((e) => e.code === 'LSK 921')).toBe(false);
  });

  it('knows the perspectives alternatives', () => {
    expect(alternativesFor('LPI 912')).toEqual(['LIP 944']);
    expect(alternativesFor('LIP 944')).toEqual(['LPI 912']);
    expect(alternativesFor('LGP 909')).toEqual([]);
  });
});

describe('graduate (dual degree) courses', () => {
  it('are in the catalog', () => {
    expect(getCourse('ADMN 930')?.program).toBe('mba');
    expect(getCourse('PPOL 806')?.program).toBe('mpp');
    expect(getCourse('SW 820')?.program).toBe('msw');
  });

  it('skip schedule checks but keep prerequisites', () => {
    const p = profile({ dual: 'mba' });
    const ok = checkPlan([en('ADMN 919', '202610', 3, undefined, 'planned'), en('ADMN 930', '202650', 3, undefined, 'planned')], p);
    expect(ok.filter((i) => i.severity === 'error')).toEqual([]);
    const bad = checkPlan([en('ADMN 930', '202650', 3, undefined, 'planned')], p);
    expect(bad.some((i) => i.message.includes('prerequisite'))).toBe(true);
    expect(bad.some((i) => i.message.includes('not offered'))).toBe(false);
  });
});

describe('credit rules from advising feedback', () => {
  it('treats the Legal Residency Class as a regular elective', async () => {
    const { categoriesOf } = await import('../src/data/rules/courseCategories');
    const { tallyCredits } = await import('../src/engine/evaluate');
    expect(categoriesOf('LSK 949')).toEqual([]);
    expect(categoriesOf('LSK 948')).toContain('residency');
    const t = tallyCredits([en('LSK 934', '202510', 11, 'S'), en('LSK 949', '202510', 1, 'S')], profile());
    expect(t.residency).toBe(11);
    expect(t.nonRegular).toBe(11);
    expect(t.countable).toBe(12);
  });

  it('only warns about overload fees above 17 JD credits', () => {
    const heavy = Array.from({ length: 6 }, (_, i) => en(`LGP 9${10 + i}`, '202610', 3, undefined, 'planned'));
    const issues = checkPlan(heavy, profile());
    const overload = issues.filter((i) => i.message.includes('overload'));
    expect(overload).toHaveLength(1);
    expect(overload[0].severity).toBe('info');
    expect(checkPlan(heavy.slice(0, 5), profile()).some((i) => i.message.includes('overload'))).toBe(false);
  });

  it('has no dual degree per-semester caps; non-accepted MBA credits do not add to the load', () => {
    const p = profile({ dual: 'mba' });
    const term = [
      ...Array.from({ length: 5 }, (_, i) => en(`LGP 9${20 + i}`, '202610', 3, undefined, 'planned')),
      en('ADMN 926', '202610', 3, undefined, 'planned'), // not on the accepted list
    ];
    const issues = checkPlan(term, p);
    expect(issues.some((i) => i.severity === 'error' && /combined|law credits/.test(i.message))).toBe(false);
    expect(issues.some((i) => i.message.includes('overload'))).toBe(false); // 15 JD credits
  });

  it('counts only the enumerated MBA courses toward the JD', async () => {
    const { countsTowardJd } = await import('../src/engine/jdCredit');
    const { evaluate } = await import('../src/engine/evaluate');
    const { regularTermLoads } = await import('../src/engine/residency');
    const mba = profile({ dual: 'mba' });
    expect(countsTowardJd(en('ADMN 912', '202610', 3), mba)).toBe(true);
    expect(countsTowardJd(en('ADMN 926', '202610', 3), mba)).toBe(false);
    // The list is exhaustive even without a dual degree selected.
    expect(countsTowardJd(en('ADMN 926', '202610', 3), profile())).toBe(false);
    expect(countsTowardJd(en('ADMN 912', '202610', 3), profile())).toBe(true);
    // An MSW student can't count MBA courses.
    expect(countsTowardJd(en('ADMN 912', '202610', 3), profile({ dual: 'msw' }))).toBe(false);

    const es = [en('LGP 921', '202610', 3, 'A'), en('ADMN 926', '202610', 3, 'C'), en('ADMN 912', '202610', 3, 'B')];
    const ev = evaluate(es, mba);
    // JD GPA ignores ADMN 926: (3*4 + 3*3) / 6 = 3.5
    expect(ev.gpa).toBeCloseTo(3.5);
    expect(ev.tally.notAccepted.map((e) => e.code)).toEqual(['ADMN 926']);
    expect(regularTermLoads(es, mba)[0].registered).toBe(6);
  });
});

describe('cap bookkeeping', () => {
  it('does not classify master\'s courses by title', async () => {
    const { categoriesOf } = await import('../src/data/rules/courseCategories');
    expect(categoriesOf('ADMN 970')).toEqual(['nonLaw']); // "Economics of Competition"
  });

  it('does not double-count credits already dropped by the non-law cap in the 21-credit cap', async () => {
    const { tallyCredits } = await import('../src/engine/evaluate');
    const mba = profile({ dual: 'mba' });
    const es = [
      en('LSK 934', '202510', 11, 'S'),
      en('LSK 907', '202550', 4, 'S'),
      ...['ADMN 912', 'ADMN 919', 'ADMN 930', 'ADMN 950', 'ADMN 960', 'ADMN 970'].map((c) => en(c, '202610', 3, 'A')),
    ];
    const t = tallyCredits(es, mba);
    expect(t.nonLaw).toBe(18);
    expect(t.excess.nonLaw).toBe(6);
    expect(t.nonRegular).toBe(27); // 15 residency + 12 accepted non-law
    expect(t.excess.nonRegular).toBe(6);
    expect(t.countable).toBe(33 - 12);
  });
});
