/**
 * Writers for LimeSurvey's XML structure files.
 *
 * LimeSurvey exports and imports its own database rows as XML. Every table becomes
 *
 *   <tablename>
 *     <fields><fieldname>col</fieldname>…</fields>
 *     <rows><row><col><![CDATA[value]]></col>…</row></rows>
 *   </tablename>
 *
 * wrapped in a `<document>` with a `LimeSurveyDocType` of `Survey`, `Group` or
 * `Question` (files named `.lss`, `.lsg`, `.lsq`). A `null` column is omitted, an
 * empty one is written as an empty element — the importer reads some columns
 * unconditionally, so they have to be present.
 *
 * Verified against LimeSurvey's `buildXMLFromQuery()` / `surveyGetXMLStructure()`
 * in export_helper.php and `XMLImportSurvey()` / `XMLImportGroup()` /
 * `XMLImportQuestion()` in import_helper.php.
 */

export type LsValue = string | number | undefined;

/** One database row. `undefined` means "omit this column". */
export type LsRow = Record<string, LsValue>;

export interface LsTable {
  name: string;
  /** Column order, as LimeSurvey writes the `<fields>` list. */
  columns: string[];
  rows: LsRow[];
}

export type LsDocType = 'Survey' | 'Group' | 'Question';

/** The DBVersion LimeSurvey writes; readers only compare it against old formats. */
export const LS_DB_VERSION = 710;

export function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Strip characters XML 1.0 cannot represent, as LimeSurvey does on export. */
function stripInvalidXmlChars(text: string): string {
  // C0 controls except tab, newline and carriage return, plus the two non-characters.
  // Surrogate pairs are left alone so astral characters survive.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
}

function cdata(value: string): string {
  // A CDATA section cannot contain "]]>"; LimeSurvey inserts a space, so do the same.
  return `<![CDATA[${stripInvalidXmlChars(value).replace(/]]>/g, ']] >')}]]>`;
}

function renderRow(row: LsRow, columns: string[], indent: string): string[] {
  const lines = [`${indent}<row>`];
  for (const column of columns) {
    const value = row[column];
    if (value === undefined) continue; // null column: no element at all
    const text = String(value);
    lines.push(
      text === ''
        ? `${indent}  <${column}/>`
        : `${indent}  <${column}>${cdata(text)}</${column}>`,
    );
  }
  lines.push(`${indent}</row>`);
  return lines;
}

function renderTable(table: LsTable, indent: string): string[] {
  if (table.rows.length === 0) return []; // LimeSurvey omits empty tables
  const lines = [`${indent}<${table.name}>`, `${indent}  <fields>`];
  for (const column of table.columns) {
    lines.push(`${indent}    <fieldname>${column}</fieldname>`);
  }
  lines.push(`${indent}  </fields>`, `${indent}  <rows>`);
  for (const row of table.rows) lines.push(...renderRow(row, table.columns, `${indent}    `));
  lines.push(`${indent}  </rows>`, `${indent}</${table.name}>`);
  return lines;
}

export function renderLimesurveyDocument(
  docType: LsDocType,
  languages: string[],
  tables: LsTable[],
): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<document>'];
  lines.push(`  <LimeSurveyDocType>${docType}</LimeSurveyDocType>`);
  lines.push(`  <DBVersion>${LS_DB_VERSION}</DBVersion>`);
  lines.push('  <languages>');
  for (const language of languages) {
    lines.push(`    <language>${escapeXmlText(language)}</language>`);
  }
  lines.push('  </languages>');
  for (const table of tables) lines.push(...renderTable(table, '  '));
  lines.push('</document>');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Column lists, matching the LimeSurvey schema
// ---------------------------------------------------------------------------

export const SURVEY_COLUMNS = [
  'sid',
  'gsid',
  'language',
  'additional_languages',
  'format',
  'active',
  'anonymized',
  'datestamp',
  'ipaddr',
  'refurl',
  'savetimings',
  'usecookie',
  'allowregister',
  'allowsave',
  'allowprev',
  'printanswers',
  'htmlemail',
  'assessments',
  'autonumber_start',
  'questionindex',
];

export const SURVEY_LANGUAGESETTINGS_COLUMNS = [
  'surveyls_survey_id',
  'surveyls_language',
  'surveyls_title',
  'surveyls_description',
];

export const GROUP_COLUMNS = ['gid', 'sid', 'group_order', 'randomization_group', 'grelevance'];
export const GROUP_L10N_COLUMNS = ['id', 'gid', 'group_name', 'description', 'language'];

export const QUESTION_COLUMNS = [
  'qid',
  'parent_qid',
  'sid',
  'gid',
  'type',
  'title',
  'preg',
  'other',
  'mandatory',
  'encrypted',
  'question_order',
  'scale_id',
  'same_default',
  'relevance',
];
export const QUESTION_L10N_COLUMNS = ['id', 'qid', 'question', 'help', 'script', 'language'];

export const ANSWER_COLUMNS = ['aid', 'qid', 'code', 'sortorder', 'assessment_value', 'scale_id'];
export const ANSWER_L10N_COLUMNS = ['id', 'aid', 'answer', 'language'];

export const QUESTION_ATTRIBUTE_COLUMNS = ['qid', 'attribute', 'value', 'language'];
