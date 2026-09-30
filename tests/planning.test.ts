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
