import { negate } from '../odm/condition';
import type { BoolExpr, Comparison, ConditionDef, ItemNode, OdmModel } from '../odm/types';
import type { Selection, Subset } from '../selection';
import { buildSubset, guardingConditions } from '../selection';
import { toCsv } from './csv';
import { NameRegistry } from './names';
import { hintText, numericBounds, pickText, questionText, singleLine } from './text';
import type { ExportOptions, ExportResult, ReportEntry } from './types';

/** REDCap allows 26 characters for a variable name. */
const MAX_VARIABLE_LENGTH = 26;
const MAX_FORM_NAME_LENGTH = 50;

/** The 18 columns of a REDCap data dictionary, in the order REDCap exports them. */
export const REDCAP_COLUMNS = [
  'Variable / Field Name',
  'Form Name',
  'Section Header',
  'Field Type',
  'Field Label',
  'Choices, Calculations, OR Slider Labels',
  'Field Note',
  'Text Validation Type OR Show Slider Number',
  'Text Validation Min',
  'Text Validation Max',
  'Identifier?',
  'Branching Logic (Show field only if...)',
  'Required Field?',
  'Custom Alignment',
  'Question Number (surveys only)',
  'Matrix Group Name',
  'Matrix Ranking?',
  'Field Annotation',
] as const;

type FieldType = 'text' | 'notes' | 'radio' | 'dropdown' | 'yesno' | 'descriptive';
type Validation = '' | 'integer' | 'number' | 'date_ymd' | 'datetime_ymd' | 'time';

interface FieldTypeMapping {
  fieldType: FieldType;
  validation: Validation;
  note?: string;
}

/** ODM data type + code list → REDCap field type and text validation. */
export function mapFieldType(item: ItemNode, model: OdmModel, options: ExportOptions): FieldTypeMapping {
  const def = item.def;
  if (def.codeListOid) {
    const list = model.codeLists.get(def.codeListOid);
    const optionCount = list?.items.length ?? 0;
    return {
      fieldType: optionCount > options.dropdownThreshold ? 'dropdown' : 'radio',
      validation: '',
    };
  }
  switch (def.dataType) {
    case 'integer':
      return { fieldType: 'text', validation: 'integer' };
    case 'float':
    case 'double':
      return { fieldType: 'text', validation: 'number' };
    case 'date':
    case 'partialDate':
      return { fieldType: 'text', validation: 'date_ymd' };
    case 'datetime':
    case 'partialDatetime':
      return { fieldType: 'text', validation: 'datetime_ymd' };
    case 'time':
    case 'partialTime':
      return { fieldType: 'text', validation: 'time' };
    case 'boolean':
      return { fieldType: 'yesno', validation: '' };
    case 'string':
    case 'text':
    default:
      return def.length !== undefined && def.length > 255
        ? { fieldType: 'notes', validation: '' }
        : { fieldType: 'text', validation: '' };
  }
}

/**
 * REDCap choice syntax: `code, label | code, label`. Commas and pipes inside a
 * code or label would break the field, so they are replaced.
 */
export function formatChoices(
  codes: { codedValue: string; label: string }[],
): { text: string; sanitized: string[] } {
  const sanitized: string[] = [];
  const parts = codes.map(({ codedValue, label }) => {
    const safeCode = codedValue.replace(/[,|]/g, '');
    const safeLabel = singleLine(label).replace(/\|/g, '/');
    if (safeCode !== codedValue) sanitized.push(codedValue);
    return `${safeCode}, ${safeLabel}`;
  });
  return { text: parts.join(' | '), sanitized };
}

/** Render one comparison as REDCap branching logic. */
function renderComparison(expr: Comparison, variableOf: (itemOid: string) => string | undefined): string | undefined {
  const variable = variableOf(expr.left.itemOid);
  if (!variable) return undefined;
  // REDCap uses `=` for equality and `<>` for inequality in branching logic.
  const operator = expr.operator === '==' ? '=' : expr.operator === '!=' ? '<>' : expr.operator;
  const literal = /^-?\d+(\.\d+)?$/.test(expr.right) ? expr.right : `'${expr.right.replace(/'/g, "\\'")}'`;
  return `[${variable}] ${operator} ${literal}`;
}

/**
 * Translate an ODM *collection exception* condition into REDCap branching logic.
 * ODM says "do not collect when the condition is true", REDCap says "show only if"
 * — so the condition is negated.
 *
 * Returns `undefined` when the logic cannot be expressed, e.g. because a referenced
 * item is not part of the selection.
 */
export function renderBranchingLogic(
  expr: BoolExpr,
  variableOf: (itemOid: string) => string | undefined,
): string | undefined {
  const render = (node: BoolExpr): string | undefined => {
    switch (node.kind) {
      case 'comparison':
        return renderComparison(node, variableOf);
      case 'not': {
        // Push the negation inwards; a remaining `not` cannot be expressed.
        const pushed = negate(node.operand);
        return pushed.kind === 'not' ? undefined : render(pushed);
      }
      case 'and':
      case 'or': {
        const parts = node.operands.map(render);
        if (parts.some((part) => part === undefined)) return undefined;
        const joined = (parts as string[]).join(node.kind === 'and' ? ' and ' : ' or ');
        return node.operands.length > 1 ? `(${joined})` : joined;
      }
    }
  };
  const rendered = render(negate(expr));
  // The outermost parentheses add nothing.
  if (rendered && rendered.startsWith('(') && rendered.endsWith(')')) {
    const inner = rendered.slice(1, -1);
    if (isBalanced(inner)) return inner;
  }
  return rendered;
}

function isBalanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export interface RedcapExport extends ExportResult {
  /** Rows of the data dictionary, header first. Exposed for tests and the preview. */
  rows: string[][];
}

export function exportRedcap(
  model: OdmModel,
  selection: Selection,
  options: ExportOptions,
): RedcapExport {
  const subset = buildSubset(model, selection);
  const report: ReportEntry[] = [];

  // --- instruments ---------------------------------------------------------
  const formNames = new NameRegistry({ maxLength: MAX_FORM_NAME_LENGTH });
  for (const event of subset.events) {
    for (const { form } of event.forms) {
      const label = pickText(form.def.description, options.language, options.fallbackLanguage);
      formNames.add(form.def.oid, label !== '' ? label : form.def.name);
    }
  }

  // --- variables -----------------------------------------------------------
  const variables = new NameRegistry({ maxLength: MAX_VARIABLE_LENGTH });
  if (options.addRecordIdField) variables.add('__record_id__', 'record_id');
  const renamed: { oid: string; name: string; variable: string }[] = [];
  for (const { node, form } of subset.items) {
    const formTopic = form.def.name.replace(/^F_/, '');
    const variable = variables.add(node.id, node.def.name, { redundantPrefix: formTopic });
    if (variable !== node.def.name.toLowerCase()) {
      renamed.push({ oid: node.def.oid, name: node.def.name, variable });
    }
  }

  /** Look up the variable for an ItemDef OID; ambiguous only if an item is used twice. */
  const variableOf = (itemOid: string): string | undefined => {
    const nodeIds = model.nodeIdsByItemOid.get(itemOid) ?? [];
    for (const nodeId of nodeIds) {
      const variable = variables.get(nodeId);
      if (variable) return variable;
    }
    return undefined;
  };

  const rows: string[][] = [[...REDCAP_COLUMNS]];
  if (options.addRecordIdField) {
    rows.push(
      row({
        variable: variables.get('__record_id__')!,
        form: formNames.get(subset.events[0]?.forms[0]?.form.def.oid ?? '') ?? 'core_dataset',
        fieldType: 'text',
        label: 'Record ID',
        annotation: 'Added by the DZIF Core Dataset EDC Selector: REDCap needs a record identifier.',
      }),
    );
  }

  const droppedLogic: string[] = [];
  const ambiguousLogic: string[] = [];
  const repeatingForms: string[] = [];
  const repeatingGroups: string[] = [];
  const sanitizedCodes: string[] = [];

  for (const event of subset.events) {
    for (const { form, groups } of event.forms) {
      const formName = formNames.get(form.def.oid)!;
      if (form.def.repeating) repeatingForms.push(form.def.name);
      for (const { group, items } of groups) {
        const groupTitle = pickText(group.def.description, options.language, options.fallbackLanguage);
        if (group.def.repeating) repeatingGroups.push(group.def.name);
        items.forEach((item, indexInGroup) => {
          const variable = variables.get(item.id)!;
          const mapping = mapFieldType(item, model, options);
          const bounds = numericBounds(item.def.rangeChecks);
          let choices = '';
          if (item.def.codeListOid) {
            const list = model.codeLists.get(item.def.codeListOid);
            if (list) {
              const formatted = formatChoices(
                list.items.map((entry) => ({
                  codedValue: entry.codedValue,
                  label:
                    pickText(entry.decode, options.language, options.fallbackLanguage) ||
                    entry.codedValue,
                })),
              );
              choices = formatted.text;
              for (const code of formatted.sanitized) {
                sanitizedCodes.push(`${item.def.name}: ${code}`);
              }
            }
          }

          let branching = '';
          if (options.includeSkipLogic) {
            const conditions = guardingConditions(model, item);
            const rendered: string[] = [];
            for (const condition of conditions) {
              const logic = conditionToLogic(condition, variableOf);
              if (logic === undefined) {
                droppedLogic.push(`${item.def.name} (${condition.oid})`);
                continue;
              }
              if (condition.ambiguousPrecedence) ambiguousLogic.push(`${item.def.name} (${condition.oid})`);
              rendered.push(conditions.length > 1 ? `(${logic})` : logic);
            }
            branching = rendered.join(' and ');
          }

          rows.push(
            row({
              variable,
              form: formName,
              // REDCap shows a section header above the field it sits on, so only
              // the first field of a question group carries the group title.
              section: indexInGroup === 0 ? singleLine(groupTitle) : '',
              fieldType: mapping.fieldType,
              label: singleLine(questionText(item.def, options)),
              choices,
              note: singleLine(hintText(item.def, model, options)),
              validation: mapping.validation,
              min: bounds.min ?? '',
              max: bounds.max ?? '',
              branching,
              required: options.includeMandatory && item.ref.mandatory ? 'y' : '',
              annotation: annotationFor(item),
            }),
          );
        });
      }
    }
  }

  if (repeatingForms.length > 0) {
    report.push({
      severity: 'info',
      message: `${repeatingForms.length} repeating form(s): ${summarize(repeatingForms, 4)}. REDCap repeating instruments are a project setting and cannot come from a data dictionary — enable them under Project Setup → Repeatable Instruments.`,
    });
  }
  if (repeatingGroups.length > 0) {
    report.push({
      severity: 'warning',
      message: `${repeatingGroups.length} selected question group(s) repeat in ODM but are exported as plain fields, because REDCap can only repeat whole instruments: ${summarize(repeatingGroups, 4)}. Consider moving each into its own repeating instrument.`,
    });
  }
  if (sanitizedCodes.length > 0) {
    report.push({
      severity: 'warning',
      message: `${sanitizedCodes.length} answer code(s) contained a comma or pipe, which REDCap uses as separators, and were stripped: ${summarize(sanitizedCodes, 4)}.`,
    });
  }
  if (renamed.length > 0) {
    report.push({
      severity: 'info',
      message: `${renamed.length} of ${subset.items.length} item names had to be shortened or de-duplicated for REDCap's 26-character limit. See dzif_variable_mapping.csv for the full mapping.`,
    });
  }
  if (droppedLogic.length > 0) {
    report.push({
      severity: 'warning',
      message: `Branching logic dropped for ${droppedLogic.length} field(s) because a referenced question is not part of the selection: ${summarize(droppedLogic)}. Select the missing questions, or add the logic manually in REDCap.`,
    });
  }
  if (ambiguousLogic.length > 0) {
    report.push({
      severity: 'warning',
      message: `${ambiguousLogic.length} condition(s) mix AND and OR without parentheses in the ODM file, so their precedence is ambiguous. AND was bound tighter than OR: ${summarize(ambiguousLogic)}. Please verify these in REDCap.`,
    });
  }
  report.push({
    severity: 'info',
    message:
      'Numeric limits come from ODM range checks, which OpenEDC writes as violation conditions (LT 1 means "minimum 1"). Please spot-check the min/max columns.',
  });
  if (subset.items.some((entry) => entry.node.def.dataType === 'date' && /jahr|year/i.test(pickText(entry.node.def.question, options.language, options.fallbackLanguage)))) {
    report.push({
      severity: 'info',
      message:
        'Some questions ask for a year only but are typed as a full date in the ODM file (a known limitation documented by DZIF). Consider changing those fields to an integer year in REDCap.',
    });
  }

  const mappingCsv = toCsv([
    ['ODM ItemOID', 'ODM Item Name', 'REDCap Variable', 'REDCap Form', 'ODM Node Path'],
    ...subset.items.map(({ node, form }) => [
      node.def.oid,
      node.def.name,
      variables.get(node.id) ?? '',
      formNames.get(form.def.oid) ?? '',
      node.id,
    ]),
  ]);

  // A REDCap data dictionary is monolingual, so the other languages of the core
  // dataset travel in their own file — usable with REDCap's multi-language module or
  // as a reference for translators.
  const otherLanguages = model.languages.filter((language) => language !== options.language);
  const translationRows: string[][] = [
    ['REDCap Variable', 'ODM ItemOID', 'Language', 'Field Label', 'Choices', 'Field Note'],
  ];
  for (const { node } of subset.items) {
    const variable = variables.get(node.id) ?? '';
    for (const language of model.languages) {
      const localOptions = { ...options, language };
      let choices = '';
      if (node.def.codeListOid) {
        const list = model.codeLists.get(node.def.codeListOid);
        if (list) {
          choices = formatChoices(
            list.items.map((entry) => ({
              codedValue: entry.codedValue,
              label: pickText(entry.decode, language, options.fallbackLanguage) || entry.codedValue,
            })),
          ).text;
        }
      }
      translationRows.push([
        variable,
        node.def.oid,
        language,
        singleLine(questionText(node.def, localOptions)),
        choices,
        singleLine(hintText(node.def, model, localOptions)),
      ]);
    }
  }
  if (otherLanguages.length > 0) {
    report.push({
      severity: 'info',
      message: `A REDCap data dictionary holds one language. The labels use "${options.language}"; every language of the core dataset (${model.languages.join(', ')}) is in dzif_redcap_translations.csv, for REDCap's multi-language module or for reference.`,
    });
  }

  return {
    rows,
    files: [
      {
        name: 'dzif_redcap_data_dictionary.csv',
        mimeType: 'text/csv;charset=utf-8',
        content: toCsv(rows),
      },
      { name: 'dzif_variable_mapping.csv', mimeType: 'text/csv;charset=utf-8', content: mappingCsv },
      ...(otherLanguages.length > 0
        ? [
            {
              name: 'dzif_redcap_translations.csv',
              mimeType: 'text/csv;charset=utf-8',
              content: toCsv(translationRows),
            },
          ]
        : []),
    ],
    report,
  };
}

function conditionToLogic(
  condition: ConditionDef,
  variableOf: (itemOid: string) => string | undefined,
): string | undefined {
  if (!condition.ast) return undefined;
  return renderBranchingLogic(condition.ast, variableOf);
}

function annotationFor(item: ItemNode): string {
  const parts = [`@DZIF-ODM-ITEM=${item.def.oid}`, `@DZIF-ODM-NAME=${item.def.name}`];
  if (item.core) parts.push('@DZIF-CORE');
  return parts.join(' ');
}

function summarize(values: string[], limit = 5): string {
  return values.length <= limit
    ? values.join(', ')
    : `${values.slice(0, limit).join(', ')} and ${values.length - limit} more`;
}

interface RowInput {
  variable: string;
  form: string;
  section?: string;
  fieldType: FieldType;
  label: string;
  choices?: string;
  note?: string;
  validation?: Validation;
  min?: string;
  max?: string;
  branching?: string;
  required?: string;
  annotation?: string;
}

function row(input: RowInput): string[] {
  return [
    input.variable,
    input.form,
    input.section ?? '',
    input.fieldType,
    input.label,
    input.choices ?? '',
    input.note ?? '',
    input.validation ?? '',
    input.min ?? '',
    input.max ?? '',
    '', // Identifier? — never set automatically; the study decides what is identifying.
    input.branching ?? '',
    input.required ?? '',
    '', // Custom Alignment
    '', // Question Number
    '', // Matrix Group Name
    '', // Matrix Ranking?
    input.annotation ?? '',
  ];
}

export type { Subset };
