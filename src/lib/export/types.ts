import type { Lang } from '../odm/types';

export type Severity = 'info' | 'warning' | 'error';

export interface ReportEntry {
  severity: Severity;
  /** What the entry is about, e.g. an item OID or a form name. */
  scope?: string;
  message: string;
}

export interface ExportFile {
  name: string;
  mimeType: string;
  content: string;
  /** Shown next to the file name in the export dialog, e.g. which form it holds. */
  description?: string;
}

export interface ExportResult {
  files: ExportFile[];
  /** What the conversion changed, approximated or dropped. */
  report: ReportEntry[];
}

export interface ExportOptions {
  /** Language used for questions, answer options and group titles. */
  language: Lang;
  /** Used whenever a text is missing in `language`. */
  fallbackLanguage: Lang;
  /** Keep the DZIF `*` marker in exported labels. */
  keepCoreMarker: boolean;
  /** Export the per-item hints (ODM `Comment`) as field notes / help text. */
  includeHints: boolean;
  /** Translate ODM collection-exception conditions into the target's skip logic. */
  includeSkipLogic: boolean;
  /** Carry the ODM `Mandatory` flag into the target's required flag. */
  includeMandatory: boolean;
  /** Code lists with more options than this become dropdowns instead of radios. */
  dropdownThreshold: number;
  /** Prepend a `record_id` field, which REDCap needs as the first field of the project. */
  addRecordIdField: boolean;
  /**
   * Which LimeSurvey file flavour to produce: a whole survey (`.lss`), one file per
   * question group (`.lsg`) or one file per question (`.lsq`).
   */
  limesurveyFormat: 'lss' | 'lsg' | 'lsq';
  /**
   * Language codes written into a LimeSurvey file, whitespace or comma separated.
   * Empty means every language the ODM file provides, starting with `language`.
   * Set this when the target survey uses a variant code such as `de-informal`:
   * LimeSurvey refuses a group or question import unless the file declares the
   * base language of that survey.
   */
  limesurveyLanguageCodes: string;
  /**
   * Keep the ODM question group titles as text-display questions inside the merged
   * LimeSurvey group — the equivalent of REDCap's section headers.
   */
  limesurveyGroupHeadings: boolean;
  /** Stamped into file headers; injected so exports are reproducible in tests. */
  timestamp: string;
}

export const defaultExportOptions: ExportOptions = {
  language: 'de',
  fallbackLanguage: 'en',
  keepCoreMarker: true,
  includeHints: true,
  includeSkipLogic: true,
  includeMandatory: true,
  dropdownThreshold: 8,
  addRecordIdField: true,
  limesurveyFormat: 'lsg',
  limesurveyLanguageCodes: '',
  limesurveyGroupHeadings: true,
  timestamp: '',
};
