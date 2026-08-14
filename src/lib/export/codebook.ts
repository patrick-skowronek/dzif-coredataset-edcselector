import type { OdmModel } from '../odm/types';
import type { Selection } from '../selection';
import { buildSubset, guardingConditions } from '../selection';
import { toCsv } from './csv';
import { numericBounds, pickText, singleLine } from './text';
import type { ExportOptions, ExportResult } from './types';

/**
 * EDC-agnostic codebook: one row per selected question, with everything a study
 * needs to build the eCRF by hand or to document the subset in a protocol. Opens
 * directly in Excel.
 */
export function exportCodebook(
  model: OdmModel,
  selection: Selection,
  options: ExportOptions,
): ExportResult {
  const subset = buildSubset(model, selection);
  const languages = model.languages;

  const header = [
    'Form',
    'Question group',
    'Group repeating',
    'ODM ItemOID',
    'ODM Item name',
    ...languages.map((language) => `Question (${language})`),
    'Data type',
    'Mandatory (ODM)',
    'DZIF core dataset',
    'Answer options',
    'Unit',
    ...languages.map((language) => `Hint (${language})`),
    'Minimum',
    'Maximum',
    'Collected only if',
  ];

  const rows: (string | undefined)[][] = [header];
  for (const { node, group, form } of subset.items) {
    const bounds = numericBounds(node.def.rangeChecks);
    const codeList = node.def.codeListOid ? model.codeLists.get(node.def.codeListOid) : undefined;
    const answers = codeList
      ? codeList.items
          .map(
            (entry) =>
              `${entry.codedValue} = ${pickText(entry.decode, options.language, options.fallbackLanguage)}`,
          )
          .join('; ')
      : '';
    const units = node.def.measurementUnitOids
      .map((oid) => pickText(model.units.get(oid)?.symbol, options.language, options.fallbackLanguage))
      .filter((symbol) => symbol !== '')
      .join(', ');
    const conditions = guardingConditions(model, node)
      .map((condition) => condition.expression)
      .join(' AND ');

    rows.push([
      pickText(form.def.description, options.language, options.fallbackLanguage) || form.def.name,
      pickText(group.def.description, options.language, options.fallbackLanguage) || group.def.name,
      group.def.repeating ? 'yes' : 'no',
      node.def.oid,
      node.def.name,
      ...languages.map((language) => singleLine(node.def.question[language] ?? '')),
      node.def.dataType,
      node.ref.mandatory ? 'yes' : 'no',
      node.core ? 'yes' : 'no',
      answers,
      units,
      ...languages.map((language) => singleLine(node.def.comment[language] ?? '')),
      bounds.min ?? '',
      bounds.max ?? '',
      singleLine(conditions),
    ]);
  }

  return {
    files: [
      {
        name: 'dzif_codebook.csv',
        mimeType: 'text/csv;charset=utf-8',
        content: toCsv(rows),
      },
    ],
    report: [
      {
        severity: 'info',
        message:
          'The codebook keeps every language and the original ODM condition expressions, so nothing is lost. It is meant for manual eCRF building and for documenting the subset.',
      },
    ],
  };
}
