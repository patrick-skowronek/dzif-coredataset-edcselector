/**
 * Turning ODM names into target-system identifiers.
 *
 * The DZIF core dataset uses long, readable item names (up to 48 characters,
 * e.g. `PERSON_STUDY_INCLUSION_PARTICIPANT_TYPE`), while the targets are stricter:
 *
 *   REDCap      variable name  26 chars, `[a-z0-9_]`, must start with a letter
 *   LimeSurvey  question code  20 chars, alphanumeric only, must start with a letter
 *   LimeSurvey  answer code     5 chars, alphanumeric only
 *
 * The shortening is deterministic — the same selection always yields the same
 * identifiers — and every export ships a mapping file with the original names.
 */

export type IdentifierStyle = 'snake' | 'camel';

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Split a name into lower-case alphanumeric words, also splitting camelCase. */
export function toSegments(name: string): string[] {
  return name
    .replace(/[äöüß]/gi, (match) => {
      const lower = match.toLowerCase();
      const mapped = UMLAUTS[lower] ?? lower;
      return match === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((segment) => segment !== '')
    .map((segment) => segment.toLowerCase());
}

export function joinSegments(segments: string[], style: IdentifierStyle): string {
  if (segments.length === 0) return '';
  if (style === 'snake') return segments.join('_');
  return segments.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
}

function ensureStartsWithLetter(name: string, style: IdentifierStyle): string {
  if (name === '') return style === 'snake' ? 'field' : 'Field';
  if (/^[a-zA-Z]/.test(name)) return name;
  return style === 'snake' ? `v_${name}` : `V${name}`;
}

export function sanitizeIdentifier(name: string, style: IdentifierStyle = 'snake'): string {
  return ensureStartsWithLetter(joinSegments(toSegments(name), style), style);
}

/**
 * Shorten to `maxLength`, dropping leading words first: the tail carries the
 * specific meaning (`person_study_inclusion_reason` → `study_inclusion_reason`).
 * Falls back to a hard cut when a single word is already too long.
 */
export function shortenSegments(
  segments: string[],
  style: IdentifierStyle,
  maxLength: number,
): string {
  for (let start = 0; start < segments.length; start++) {
    const candidate = joinSegments(segments.slice(start), style);
    if (candidate.length <= maxLength && /^[a-zA-Z]/.test(candidate)) return candidate;
  }
  const full = joinSegments(segments, style);
  const cut = full.slice(0, maxLength);
  return style === 'snake' ? cut.replace(/_+$/, '') : cut;
}

export interface NameRegistryOptions {
  maxLength: number;
  style?: IdentifierStyle;
}

/** Allocates unique identifiers and remembers what each one came from. */
export class NameRegistry {
  private readonly used = new Set<string>();
  private readonly mapping = new Map<string, string>();
  private readonly maxLength: number;
  private readonly style: IdentifierStyle;

  constructor(options: NameRegistryOptions) {
    this.maxLength = options.maxLength;
    this.style = options.style ?? 'snake';
  }

  /**
   * @param sourceKey stable key of the source element, used for the mapping file
   * @param preferred human-readable name to derive the identifier from
   * @param options.redundantPrefix dropped when the name does not fit as-is
   */
  add(sourceKey: string, preferred: string, options: { redundantPrefix?: string } = {}): string {
    let segments = toSegments(preferred);
    if (segments.length === 0) segments = ['field'];

    if (joinSegments(segments, this.style).length > this.maxLength && options.redundantPrefix) {
      const prefix = toSegments(options.redundantPrefix);
      const startsWithPrefix =
        prefix.length > 0 &&
        prefix.length < segments.length &&
        prefix.every((word, index) => segments[index] === word);
      if (startsWithPrefix) segments = segments.slice(prefix.length);
    }

    const base = ensureStartsWithLetter(
      shortenSegments(segments, this.style, this.maxLength),
      this.style,
    );

    let candidate = base;
    let counter = 2;
    while (this.used.has(candidate)) {
      const suffix = this.style === 'snake' ? `_${counter}` : String(counter);
      const trimmed = base.slice(0, this.maxLength - suffix.length).replace(/_+$/, '');
      candidate = `${trimmed}${suffix}`;
      counter++;
    }
    this.used.add(candidate);
    this.mapping.set(sourceKey, candidate);
    return candidate;
  }

  get(sourceKey: string): string | undefined {
    return this.mapping.get(sourceKey);
  }

  entries(): [string, string][] {
    return [...this.mapping.entries()];
  }

  /** True when the identifier differs from a plain sanitization of the source name. */
  wasChanged(sourceKey: string, preferred: string): boolean {
    return this.mapping.get(sourceKey) !== sanitizeIdentifier(preferred, this.style);
  }
}
