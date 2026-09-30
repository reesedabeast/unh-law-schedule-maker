/** Text item in device space (viewport applied, so page rotation is handled): y grows downward. */
export interface PositionedText {
  str: string;
  x: number;
  y: number;
}

/**
 * Groups positioned PDF text into lines per column, top-to-bottom, left column first.
 * The UNH transcript prints two columns per page and the PDF text layer interleaves them,
 * so the column split is taken from the x position of the second "SUBJ" header.
 */
export function linesFromItems(items: PositionedText[]): string[] {
  const texts = items.filter((i) => i.str.trim());
  const subjXs = [...new Set(texts.filter((i) => /^SUBJ\b/.test(i.str.trim())).map((i) => Math.round(i.x)))].sort((a, b) => a - b);
  const split = subjXs.length >= 2 && subjXs[subjXs.length - 1] - subjXs[0] > 100 ? subjXs[subjXs.length - 1] - 5 : Infinity;

  const columns = [texts.filter((i) => i.x < split), texts.filter((i) => i.x >= split)];
  const out: string[] = [];
  for (const col of columns) {
    const sorted = [...col].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: PositionedText[][] = [];
    for (const it of sorted) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line[0].y - it.y) <= 2.5) line.push(it);
      else lines.push([it]);
    }
    for (const l of lines) out.push(l.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(' '));
  }
  return out;
}
