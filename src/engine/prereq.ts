/**
 * Parses catalog prerequisite text such as
 *   "LGP 924 with a minimum grade of D- and LSK 928 with a minimum grade of D-."
 *   "(LSK 921 or LSK 919) and LSK 922 ..."
 * into a boolean expression over course codes. Words other than codes, and/or and parens are ignored.
 */
export type Expr = { code: string; concurrent?: boolean } | { and: Expr[] } | { or: Expr[] };

const TOKEN = /\(|\)|\band\b|\bor\b|[A-Z]{2,5}\s\d{3}[A-Z]?(?:~C)?/gi;

export function parsePrereq(text: string): Expr | null {
  // "LGP 924 (may be taken concurrently)" -> "LGP 924~C" so its parentheses aren't read as grouping.
  const marked = text.replace(/([A-Z]{2,5}\s\d{3}[A-Z]?)\s*\(may be taken concurrently\)/gi, '$1~C');
  const tokens = (marked.match(TOKEN) ?? []).map((t) => t.trim());
  let i = 0;
  const peek = () => tokens[i]?.toLowerCase();

  function primary(): Expr | null {
    const t = tokens[i];
    if (t === undefined) return null;
    if (t === '(') {
      i++;
      const e = orExpr();
      if (tokens[i] === ')') i++;
      return e;
    }
    if (/^[A-Z]{2,5}\s\d/i.test(t)) {
      i++;
      const code = t.toUpperCase().replace('~C', '');
      return t.endsWith('~C') ? { code, concurrent: true } : { code };
    }
    i++; // stray operator/paren
    return primary();
  }
  function andExpr(): Expr | null {
    const parts: Expr[] = [];
    let p = primary();
    if (p) parts.push(p);
    while (peek() === 'and') {
      i++;
      p = primary();
      if (p) parts.push(p);
    }
    return parts.length === 0 ? null : parts.length === 1 ? parts[0] : { and: parts };
  }
  function orExpr(): Expr | null {
    const parts: Expr[] = [];
    let p = andExpr();
    if (p) parts.push(p);
    while (peek() === 'or') {
      i++;
      p = andExpr();
      if (p) parts.push(p);
    }
    return parts.length === 0 ? null : parts.length === 1 ? parts[0] : { or: parts };
  }
  return orExpr();
}

/** `has(code, concurrent)`: concurrent = true when the course may be taken in the same term. */
export function evalExpr(e: Expr, has: (code: string, concurrent: boolean) => boolean): boolean {
  if ('code' in e) return has(e.code, !!e.concurrent);
  if ('and' in e) return e.and.every((x) => evalExpr(x, has));
  return e.or.some((x) => evalExpr(x, has));
}

export function exprToString(e: Expr): string {
  if ('code' in e) return e.concurrent ? `${e.code} (or concurrently)` : e.code;
  if ('and' in e) return e.and.map((x) => ('or' in x ? `(${exprToString(x)})` : exprToString(x))).join(' and ');
  return e.or.map(exprToString).join(' or ');
}
