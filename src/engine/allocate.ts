/**
 * Upper-Level Writing and Experiential Learning must be satisfied by separate courses
 * (Rule I-A(C)(5)). A course designated for both can count toward only one of them, so
 * pick the assignment that best satisfies both minimums.
 */
export interface Candidate {
  id: string;
  credits: number;
  ulw: boolean;
  el: boolean;
}

export interface Allocation {
  ulw: string[];
  el: string[];
  ulwCredits: number;
  elCredits: number;
}

const MAX_ENUMERATED = 12;

export function allocateUlwEl(cands: Candidate[], ulwNeed: number, elNeed: number): Allocation {
  const base: Allocation = { ulw: [], el: [], ulwCredits: 0, elCredits: 0 };
  const both: Candidate[] = [];
  for (const c of cands) {
    if (c.ulw && c.el) both.push(c);
    else if (c.ulw) {
      base.ulw.push(c.id);
      base.ulwCredits += c.credits;
    } else if (c.el) {
      base.el.push(c.id);
      base.elCredits += c.credits;
    }
  }
  const enumerated = both.slice(0, MAX_ENUMERATED);
  const rest = both.slice(MAX_ENUMERATED);
  const score = (a: Allocation) =>
    Math.min(a.ulwCredits / ulwNeed, 1) + Math.min(a.elCredits / elNeed, 1) + (a.ulwCredits + a.elCredits) * 1e-4;

  let best: Allocation | null = null;
  for (let mask = 0; mask < 1 << enumerated.length; mask++) {
    const a: Allocation = { ulw: [...base.ulw], el: [...base.el], ulwCredits: base.ulwCredits, elCredits: base.elCredits };
    enumerated.forEach((c, i) => {
      if (mask & (1 << i)) {
        a.ulw.push(c.id);
        a.ulwCredits += c.credits;
      } else {
        a.el.push(c.id);
        a.elCredits += c.credits;
      }
    });
    if (!best || score(a) > score(best)) best = a;
  }
  // Extremely unlikely overflow: send remaining dual-designated courses to EL.
  for (const c of rest) {
    best!.el.push(c.id);
    best!.elCredits += c.credits;
  }
  return best!;
}
