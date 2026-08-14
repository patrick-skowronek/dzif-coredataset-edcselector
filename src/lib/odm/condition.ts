import type { BoolExpr, Comparison, ConditionRef } from './types';

/**
 * Parser for OpenEDC formal expressions, e.g.
 *
 *   !(I.1 == "Y" OR I.1 == "P")
 *   !(F.4-IG.22-I.42 == "Y" AND I.47 == "BV")
 *
 * Grammar:
 *   expr       := orExpr
 *   orExpr     := andExpr ( "OR" andExpr )*
 *   andExpr    := unary ( "AND" unary )*
 *   unary      := "!" unary | "(" expr ")" | comparison
 *   comparison := path operator literal
 *   path       := [A-Za-z_][A-Za-z0-9_.-]*        e.g. I.1, IG.4-I.9, F.4-IG.22-I.42
 *   literal    := '"' … '"' | number | path
 */

type Token =
  | { t: 'not' }
  | { t: 'and' }
  | { t: 'or' }
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'op'; v: Comparison['operator'] }
  | { t: 'string'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'number'; v: string };

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_.\-]/;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ t: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ t: 'rparen' });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = '';
      while (j < input.length && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < input.length) {
          value += input[j + 1];
          j += 2;
          continue;
        }
        value += input[j];
        j++;
      }
      if (j >= input.length) throw new Error(`Unterminated string literal in: ${input}`);
      tokens.push({ t: 'string', v: value });
      i = j + 1;
      continue;
    }
    if (ch === '!' && input[i + 1] === '=') {
      tokens.push({ t: 'op', v: '!=' });
      i += 2;
      continue;
    }
    if (ch === '!') {
      tokens.push({ t: 'not' });
      i++;
      continue;
    }
    if (ch === '=' && input[i + 1] === '=') {
      tokens.push({ t: 'op', v: '==' });
      i += 2;
      continue;
    }
    if ((ch === '<' || ch === '>') && input[i + 1] === '=') {
      tokens.push({ t: 'op', v: `${ch}=` as Comparison['operator'] });
      i += 2;
      continue;
    }
    if (ch === '<' || ch === '>') {
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j++;
      tokens.push({ t: 'number', v: input.slice(i, j) });
      i = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i;
      while (j < input.length && IDENT_CHAR.test(input[j]!)) j++;
      const word = input.slice(i, j);
      i = j;
      const upper = word.toUpperCase();
      if (upper === 'AND') tokens.push({ t: 'and' });
      else if (upper === 'OR') tokens.push({ t: 'or' });
      else tokens.push({ t: 'ident', v: word });
      continue;
    }
    throw new Error(`Unexpected character '${ch}' at ${i} in: ${input}`);
  }
  return tokens;
}

/** Split an OID path such as `F.4-IG.22-I.42` into its parts. */
export function parseConditionRef(path: string): ConditionRef {
  const segments = path.split('-');
  const ref: ConditionRef = { path, itemOid: segments[segments.length - 1] ?? path };
  for (const segment of segments) {
    if (segment.startsWith('F.')) ref.formOid = segment;
    else if (segment.startsWith('IG.')) ref.itemGroupOid = segment;
  }
  return ref;
}

export interface ParsedCondition {
  ast: BoolExpr;
  /** True when AND and OR appear at the same level without parentheses. */
  ambiguousPrecedence: boolean;
  references: ConditionRef[];
}

export function parseFormalExpression(input: string): ParsedCondition {
  const tokens = tokenize(input);
  let pos = 0;
  let ambiguousPrecedence = false;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const token = tokens[pos];
    if (!token) throw new Error(`Unexpected end of expression in: ${input}`);
    pos++;
    return token;
  };

  function parseExpr(): BoolExpr {
    const operands: BoolExpr[] = [parseAnd()];
    let sawOr = false;
    while (peek()?.t === 'or') {
      next();
      sawOr = true;
      operands.push(parseAnd());
    }
    // `A OR B AND C` has no parentheses to disambiguate; we apply the usual
    // precedence (AND binds tighter) and flag it so the export report can warn.
    if (sawOr && operands.some((o) => o.kind === 'and')) ambiguousPrecedence = true;
    return operands.length === 1 ? operands[0]! : { kind: 'or', operands };
  }

  function parseAnd(): BoolExpr {
    const operands: BoolExpr[] = [parseUnary()];
    while (peek()?.t === 'and') {
      next();
      operands.push(parseUnary());
    }
    return operands.length === 1 ? operands[0]! : { kind: 'and', operands };
  }

  function parseUnary(): BoolExpr {
    const token = peek();
    if (!token) throw new Error(`Unexpected end of expression in: ${input}`);
    if (token.t === 'not') {
      next();
      return { kind: 'not', operand: parseUnary() };
    }
    if (token.t === 'lparen') {
      next();
      const inner = parseExpr();
      const closing = next();
      if (closing.t !== 'rparen') throw new Error(`Expected ')' in: ${input}`);
      return inner;
    }
    return parseComparison();
  }

  function parseComparison(): Comparison {
    const left = next();
    if (left.t !== 'ident') throw new Error(`Expected an item reference in: ${input}`);
    const operator = next();
    if (operator.t !== 'op') throw new Error(`Expected a comparison operator in: ${input}`);
    const right = next();
    if (right.t !== 'string' && right.t !== 'number' && right.t !== 'ident') {
      throw new Error(`Expected a literal in: ${input}`);
    }
    return {
      kind: 'comparison',
      left: parseConditionRef(left.v),
      operator: operator.v,
      right: right.v,
    };
  }

  const ast = parseExpr();
  if (pos !== tokens.length) throw new Error(`Trailing tokens in: ${input}`);

  const references: ConditionRef[] = [];
  const seen = new Set<string>();
  walk(ast, (node) => {
    if (node.kind === 'comparison' && !seen.has(node.left.path)) {
      seen.add(node.left.path);
      references.push(node.left);
    }
  });

  return { ast, ambiguousPrecedence, references };
}

export function walk(expr: BoolExpr, visit: (node: BoolExpr) => void): void {
  visit(expr);
  if (expr.kind === 'and' || expr.kind === 'or') {
    for (const operand of expr.operands) walk(operand, visit);
  } else if (expr.kind === 'not') {
    walk(expr.operand, visit);
  }
}

/**
 * Push a negation inwards so exporters can render *show-when* logic from an ODM
 * *collect-unless* condition. De Morgan's laws plus operator flipping; a `not`
 * that cannot be pushed further is returned as-is.
 */
export function negate(expr: BoolExpr): BoolExpr {
  switch (expr.kind) {
    case 'not':
      return expr.operand;
    case 'and':
      return { kind: 'or', operands: expr.operands.map(negate) };
    case 'or':
      return { kind: 'and', operands: expr.operands.map(negate) };
    case 'comparison': {
      const flipped: Record<Comparison['operator'], Comparison['operator']> = {
        '==': '!=',
        '!=': '==',
        '<': '>=',
        '<=': '>',
        '>': '<=',
        '>=': '<',
      };
      return { ...expr, operator: flipped[expr.operator] };
    }
  }
}
