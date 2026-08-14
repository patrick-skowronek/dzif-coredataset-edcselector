import { stripCoreMarker } from '../odm/parse';
import type { I18nText, ItemDef, Lang, OdmModel, RangeCheck } from '../odm/types';
import type { ExportOptions } from './types';

/** Text in the requested language, falling back to the fallback language, then to anything. */
export function pickText(
  text: I18nText | undefined,
  language: Lang,
  fallback: Lang,
): string {
  if (!text) return '';
  const candidates = [text[language], text[fallback], text['']];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate.trim() !== '') return candidate;
  }
  for (const value of Object.values(text)) {
    if (value.trim() !== '') return value;
  }
  return '';
}

export function questionText(item: ItemDef, options: ExportOptions): string {
  const raw = pickText(item.question, options.language, options.fallbackLanguage);
  return options.keepCoreMarker ? raw : stripCoreMarker(raw);
}

/** Hint text for an item: the ODM comment plus the measurement unit, when present. */
export function hintText(item: ItemDef, model: OdmModel, options: ExportOptions): string {
  const parts: string[] = [];
  if (options.includeHints) {
    const comment = pickText(item.comment, options.language, options.fallbackLanguage);
    if (comment !== '') parts.push(comment);
  }
  const units = item.measurementUnitOids
    .map((oid) => pickText(model.units.get(oid)?.symbol, options.language, options.fallbackLanguage))
    .filter((symbol) => symbol !== '');
  if (units.length > 0) parts.push(`[${units.join(', ')}]`);
  return parts.join(' ');
}

/**
 * Numeric bounds implied by ODM range checks.
 *
 * OpenEDC writes range checks as *violation* conditions: `Comparator="LT"` with
 * `CheckValue=1` means "flag anything below 1", i.e. the minimum is 1. So the
 * comparator is inverted relative to a plain reading of the ODM attribute.
 */
export function numericBounds(rangeChecks: RangeCheck[]): { min?: string; max?: string } {
  const bounds: { min?: string; max?: string } = {};
  for (const check of rangeChecks) {
    const value = check.checkValues[0];
    if (value === undefined || value === '') continue;
    switch (check.comparator) {
      case 'LT':
      case 'LE':
        bounds.min = value;
        break;
      case 'GT':
      case 'GE':
        bounds.max = value;
        break;
      default:
        break;
    }
  }
  return bounds;
}

/** Collapse newlines and tabs so a text is safe for single-line formats. */
export function singleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\t/g, ' ').trim();
}
