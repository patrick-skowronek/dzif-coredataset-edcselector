import { negate } from '../odm/condition';
import type { BoolExpr, Comparison, ItemNode, Lang, OdmModel } from '../odm/types';
import type { Selection } from '../selection';
import { buildSubset, guardingConditions } from '../selection';
import { toCsv } from './csv';
import {
  ANSWER_COLUMNS,
  ANSWER_L10N_COLUMNS,
  GROUP_COLUMNS,
  GROUP_L10N_COLUMNS,
  QUESTION_ATTRIBUTE_COLUMNS,
  QUESTION_COLUMNS,
  QUESTION_L10N_COLUMNS,
  SURVEY_COLUMNS,
  SURVEY_LANGUAGESETTINGS_COLUMNS,
  renderLimesurveyDocument,
  type LsRow,
  type LsTable,
} from './limesurvey-xml';
import { NameRegistry } from './names';
import { hintText, numericBounds, pickText, questionText, singleLine } from './text';
import type { ExportFile, ExportOptions, ExportResult, ReportEntry } from './types';

/**
 * LimeSurvey export.
 *
 * Three file flavours, all XML in LimeSurvey's own structure format:
 *   `.lsg`  one file per question group — imported into an existing survey
 *   `.lsq`  one file per question — imported into an existing question group
 *
 * Hard limits enforced by LimeSurvey: question codes are 20 characters and strictly
 * alphanumeric, answer codes 5 characters and alphanumeric.
 *
 * `.lsg` and `.lsq` are refused unless the file declares the target survey's base
 * language ("The languages of the imported question file must at least include the
 * base language of this survey"), so every available language is written into the
 * file by default; `limesurveyLanguageCodes` overrides the codes when a survey uses
 * a variant such as `de-informal`.
 */

const MAX_QUESTION_CODE = 20;
const MAX_ANSWER_CODE = 5;
const MAX_GROUP_NAME = 100;

/** Placeholder ids; LimeSurvey remaps all of them on import. */
const SID = 123456;

/** LimeSurvey question type codes. `X` is a text display, used for headings. */
export type QuestionType = 'L' | '!' | 'S' | 'T' | 'N' | 'D' | 'Y' | 'X';

interface TypeMapping {
  type: QuestionType;
  /** Extra question attributes, e.g. a date format or numeric bounds. */
  attributes?: Record<string, string>;
  note?: string;
}

export function mapQuestionType(
  item: ItemNode,
  model: OdmModel,
  options: ExportOptions,
): TypeMapping {
  const def = item.def;
  if (def.codeListOid) {
    const list = model.codeLists.get(def.codeListOid);
    const optionCount = list?.items.length ?? 0;
    // "L" is a radio list, "!" a dropdown.
    return { type: optionCount > options.dropdownThreshold ? '!' : 'L' };
  }
  const bounds = numericBounds(def.rangeChecks);
  switch (def.dataType) {
    case 'integer':
    case 'float':
    case 'double': {
      const attributes: Record<string, string> = {};
      if (bounds.min !== undefined) attributes.min_num_value_n = bounds.min;
      if (bounds.max !== undefined) attributes.max_num_value_n = bounds.max;
      if (def.dataType === 'integer') attributes.num_value_int_only = '1';
      return { type: 'N', attributes };
    }
    case 'date':
    case 'partialDate':
      return { type: 'D', attributes: { date_format: 'dd.mm.yyyy', dropdown_dates: '0' } };
    case 'datetime':
    case 'partialDatetime':
      return { type: 'D', attributes: { date_format: 'dd.mm.yyyy HH:MM' } };
    case 'time':
    case 'partialTime':
      return {
        type: 'D',
        attributes: { date_format: 'HH:MM' },
        note: 'ODM time questions are exported as LimeSurvey date/time questions restricted to hours and minutes.',
      };
    case 'boolean':
      return { type: 'Y' };
    case 'string':
    case 'text':
    default:
      return def.length !== undefined && def.length > 255 ? { type: 'T' } : { type: 'S' };
  }
}

/**
 * Answer codes are limited to 5 alphanumeric characters. Codes that already fit are
 * kept so the data stays comparable with the DZIF code list; the rest get a short
 * generated code and appear in the answer-code mapping file.
 */
export function limesurveyAnswerCode(
  codedValue: string,
  index: number,
  used: Set<string>,
): { code: string; changed: boolean } {
  const fits = /^[A-Za-z0-9]{1,5}$/.test(codedValue) && !used.has(codedValue);
  if (fits) {
    used.add(codedValue);
    return { code: codedValue, changed: false };
  }
  let counter = index + 1;
  let candidate = `A${counter}`;
  while (used.has(candidate) || candidate.length > MAX_ANSWER_CODE) {
    counter++;
    candidate = `A${counter}`;
  }
  used.add(candidate);
  return { code: candidate, changed: true };
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

/** A LimeSurvey language code and the ODM language its texts come from. */
export interface LanguageBinding {
  /** The code written into the file, e.g. `de` or `de-informal`. */
  code: string;
  /** The `xml:lang` of the ODM texts used for it. */
  source: Lang;
}

/**
 * Which language codes the exported file declares.
 *
 * By default every language the ODM file provides, starting with the chosen export
 * language, so the file satisfies any survey whose base language is one of them.
 * `limesurveyLanguageCodes` replaces that list — a code with a variant suffix takes
 * its texts from the matching base language (`de-informal` → `de`).
 */
export function resolveLanguages(model: OdmModel, options: ExportOptions): LanguageBinding[] {
  const explicit = options.limesurveyLanguageCodes
    .split(/[\s,;]+/)
    .map((code) => code.trim())
    .filter((code) => code !== '');
  const codes =
    explicit.length > 0
      ? explicit
      : [options.language, ...model.languages.filter((language) => language !== options.language)];

  const seen = new Set<string>();
  const bindings: LanguageBinding[] = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    bindings.push({ code, source: sourceLanguageFor(code, model, options) });
  }
  return bindings.length > 0
    ? bindings
    : [{ code: options.language, source: options.language }];
}

function sourceLanguageFor(code: string, model: OdmModel, options: ExportOptions): Lang {
  if (model.languages.includes(code)) return code;
  const base = code.split(/[-_]/)[0]!.toLowerCase();
  const match = model.languages.find(
    (language) => language.toLowerCase() === base || language.split(/[-_]/)[0]?.toLowerCase() === base,
  );
  return match ?? options.language;
}

/** Render a comparison in LimeSurvey Expression Manager syntax. */
function renderComparison(
  expr: Comparison,
  codeOf: (itemOid: string) => string | undefined,
): string | undefined {
  const code = codeOf(expr.left.itemOid);
  if (!code) return undefined;
  const value = /^-?\d+(\.\d+)?$/.test(expr.right)
    ? expr.right
    : `"${expr.right.replace(/"/g, '\\"')}"`;
  // `.NAOK` keeps the expression valid while the referenced question is unanswered.
  return `${code}.NAOK ${expr.operator} ${value}`;
}

/**
 * Turn an ODM collection-exception condition into a LimeSurvey relevance equation.
 * ODM hides when true, LimeSurvey shows when true, so the condition is negated.
 */
export function renderRelevance(
  expr: BoolExpr,
  codeOf: (itemOid: string) => string | undefined,
): string | undefined {
  const render = (node: BoolExpr): string | undefined => {
    switch (node.kind) {
      case 'comparison':
        return renderComparison(node, codeOf);
      case 'not': {
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
  return render(negate(expr));
}

// ---------------------------------------------------------------------------
// Intermediate model
// ---------------------------------------------------------------------------

/** Texts per LimeSurvey language code. */
type Localised<T> = Record<string, T>;

interface LsQuestion {
  qid: number;
  gid: number;
  code: string;
  type: QuestionType;
  text: Localised<{ question: string; help: string }>;
  mandatory: 'Y' | 'N';
  relevance: string;
  order: number;
  answers: { aid: number; code: string; label: Localised<string>; sortorder: number }[];
  attributes: Record<string, string>;
  /** For the mapping files: the ODM ItemOID, or the ItemGroupOID of a heading. */
  itemOid: string;
  itemName: string;
  /** A text-display question standing in for an ODM question group title. */
  heading: boolean;
}

interface LsGroup {
  gid: number;
  text: Localised<{ name: string; description: string }>;
  order: number;
  questions: LsQuestion[];
  /** ODM form name, used for file names. */
  odmName: string;
}

interface LsSurvey {
  text: Localised<{ title: string; description: string }>;
  languages: LanguageBinding[];
  groups: LsGroup[];
}

interface BuildResult {
  survey: LsSurvey;
  report: ReportEntry[];
  questionCodeCsv: string;
  answerCodeCsv: string;
}

function buildSurvey(model: OdmModel, selection: Selection, options: ExportOptions): BuildResult {
  const subset = buildSubset(model, selection);
  const report: ReportEntry[] = [];
  const languages = resolveLanguages(model, options);
  const primary = languages[0]!;

  /** Options with `language` switched, so the shared text helpers pick that language. */
  const forLanguage = (binding: LanguageBinding): ExportOptions => ({
    ...options,
    language: binding.source,
  });

  const codes = new NameRegistry({ maxLength: MAX_QUESTION_CODE, style: 'camel' });
  for (const { node, form } of subset.items) {
    codes.add(node.id, node.def.name, { redundantPrefix: form.def.name.replace(/^F_/, '') });
  }
  // Heading codes share the registry so they cannot collide with a question code.
  const headingCodes = new Map<string, string>();
  if (options.limesurveyGroupHeadings) {
    for (const { forms } of subset.events) {
      for (const { form, groups: formGroups } of forms) {
        if (formGroups.length < 2) continue; // a single section needs no heading
        for (const { group } of formGroups) {
          // ODM group names start with `G_`, so `G_PERSON_CONSENT` → `GPersonConsent`.
          headingCodes.set(
            group.id,
            codes.add(`heading:${group.id}`, group.def.name, {
              redundantPrefix: `G_${form.def.name.replace(/^F_/, '')}`,
            }),
          );
        }
      }
    }
  }
  const codeOf = (itemOid: string): string | undefined => {
    for (const nodeId of model.nodeIdsByItemOid.get(itemOid) ?? []) {
      const code = codes.get(nodeId);
      if (code) return code;
    }
    return undefined;
  };

  const droppedLogic: string[] = [];
  const ambiguousLogic: string[] = [];
  const changedAnswerCodes: string[] = [];
  const notes = new Set<string>();
  const answerCodeRows: string[][] = [
    ['LimeSurvey question code', 'ODM item', 'LimeSurvey answer code', 'ODM coded value', 'Label'],
  ];

  const groups: LsGroup[] = [];
  let qid = 0;
  let aid = 0;

  let headingCount = 0;

  for (const { forms } of subset.events) {
    for (const { form, groups: formGroups } of forms) {
      // One LimeSurvey group per ODM form: LimeSurvey has a single level, so all
      // question groups of a form are merged and the form is imported as one file.
      const groupText: Localised<{ name: string; description: string }> = {};
      for (const binding of languages) {
        groupText[binding.code] = {
          name: singleLine(
            pickText(form.def.description, binding.source, options.fallbackLanguage) ||
              form.def.name,
          ).slice(0, MAX_GROUP_NAME),
          description: singleLine(
            pickText(form.def.comment, binding.source, options.fallbackLanguage),
          ),
        };
      }

      const lsGroup: LsGroup = {
        gid: groups.length + 1,
        text: groupText,
        order: groups.length,
        questions: [],
        odmName: form.def.name,
      };

      for (const { group, items } of formGroups) {
        // The ODM question group title survives as a text-display question, the
        // LimeSurvey equivalent of REDCap's section header.
        const headingCode = headingCodes.get(group.id);
        if (headingCode !== undefined) {
          const headingText: Localised<{ question: string; help: string }> = {};
          for (const binding of languages) {
            headingText[binding.code] = {
              question:
                singleLine(
                  pickText(group.def.description, binding.source, options.fallbackLanguage) ||
                    group.def.name,
                ),
              help: singleLine(pickText(group.def.comment, binding.source, options.fallbackLanguage)),
            };
          }
          qid++;
          headingCount++;
          lsGroup.questions.push({
            qid,
            gid: lsGroup.gid,
            code: headingCode,
            type: 'X',
            text: headingText,
            mandatory: 'N',
            relevance: '1',
            order: lsGroup.questions.length,
            answers: [],
            attributes: {},
            itemOid: group.def.oid,
            itemName: group.def.name,
            heading: true,
          });
        }

        for (const item of items) {
          const code = codes.get(item.id)!;
          const mapping = mapQuestionType(item, model, options);
          if (mapping.note) notes.add(mapping.note);

          let relevance = '1';
          if (options.includeSkipLogic) {
            const rendered: string[] = [];
            let failed = false;
            for (const condition of guardingConditions(model, item)) {
              const logic = condition.ast ? renderRelevance(condition.ast, codeOf) : undefined;
              if (logic === undefined) {
                droppedLogic.push(`${item.def.name} (${condition.oid})`);
                failed = true;
                continue;
              }
              if (condition.ambiguousPrecedence) {
                ambiguousLogic.push(`${item.def.name} (${condition.oid})`);
              }
              rendered.push(`(${logic})`);
            }
            if (!failed && rendered.length > 0) relevance = rendered.join(' and ');
          }

          const text: Localised<{ question: string; help: string }> = {};
          for (const binding of languages) {
            const localOptions = forLanguage(binding);
            text[binding.code] = {
              question: singleLine(questionText(item.def, localOptions)),
              help: singleLine(hintText(item.def, model, localOptions)),
            };
          }

          qid++;
          const question: LsQuestion = {
            qid,
            gid: lsGroup.gid,
            code,
            type: mapping.type,
            text,
            mandatory: options.includeMandatory && item.ref.mandatory ? 'Y' : 'N',
            relevance,
            order: lsGroup.questions.length,
            answers: [],
            attributes: { ...(mapping.attributes ?? {}) },
            itemOid: item.def.oid,
            itemName: item.def.name,
            heading: false,
          };

          if (item.def.codeListOid) {
            const list = model.codeLists.get(item.def.codeListOid);
            if (list) {
              const used = new Set<string>();
              list.items.forEach((entry, index) => {
                const { code: answerCode, changed } = limesurveyAnswerCode(
                  entry.codedValue,
                  index,
                  used,
                );
                if (changed) changedAnswerCodes.push(`${code}: ${entry.codedValue} → ${answerCode}`);
                const label: Localised<string> = {};
                for (const binding of languages) {
                  label[binding.code] = singleLine(
                    pickText(entry.decode, binding.source, options.fallbackLanguage) ||
                      entry.codedValue,
                  );
                }
                aid++;
                question.answers.push({ aid, code: answerCode, label, sortorder: index + 1 });
                answerCodeRows.push([
                  code,
                  item.def.name,
                  answerCode,
                  entry.codedValue,
                  label[primary.code] ?? entry.codedValue,
                ]);
              });
            }
          }

          lsGroup.questions.push(question);
        }
      }
      groups.push(lsGroup);
    }
  }

  // --- report --------------------------------------------------------------
  report.push({
    severity: 'info',
    message: `The file declares the language code(s) ${languages.map((binding) => binding.code).join(', ')}, with "${primary.code}" as the survey's base language. LimeSurvey refuses a group or question import unless the file contains the base language of the target survey.`,
  });
  for (const binding of languages) {
    if (binding.code !== binding.source) {
      report.push({
        severity: 'info',
        message: `Language code "${binding.code}" uses the ODM texts of "${binding.source}".`,
      });
    }
  }
  const mergedForms = subset.events
    .flatMap((event) => event.forms)
    .filter((entry) => entry.groups.length > 1).length;
  report.push({
    severity: 'info',
    message: `LimeSurvey has one structural level, so all question groups of an ODM form were merged into a single LimeSurvey group: ${groups.length} group(s) for ${subset.itemGroupOids.size} ODM question group(s).${mergedForms > 0 ? ` ${mergedForms} form(s) contain more than one question group.` : ''}`,
  });
  if (headingCount > 0) {
    report.push({
      severity: 'info',
      message: `${headingCount} text-display question(s) of type X were inserted to keep the ODM question group titles as headings, the way REDCap uses section headers. They collect no data.`,
    });
  } else if (!options.limesurveyGroupHeadings && mergedForms > 0) {
    report.push({
      severity: 'warning',
      message:
        'Question group headings are switched off, so the ODM question group titles are not visible anywhere in the survey.',
    });
  }
  const shortened = subset.items.filter(({ node }) => codes.get(node.id) !== node.def.name);
  if (shortened.length > 0) {
    report.push({
      severity: 'info',
      message: `LimeSurvey question codes must be alphanumeric and at most 20 characters, so ${shortened.length} of ${subset.items.length} item names were converted (e.g. PERSON_CONSENT → PersonConsent). See dzif_limesurvey_question_codes.csv.`,
    });
  }
  if (changedAnswerCodes.length > 0) {
    report.push({
      severity: 'warning',
      message: `LimeSurvey answer codes are limited to 5 alphanumeric characters, so ${changedAnswerCodes.length} answer code(s) were replaced by generated codes (A1, A2, …). The original DZIF codes are in dzif_limesurvey_answer_codes.csv — you need that file to map collected data back to the core dataset.`,
    });
  }
  if (droppedLogic.length > 0) {
    report.push({
      severity: 'warning',
      message: `Relevance equations dropped for ${droppedLogic.length} question(s) because a referenced question is not part of the selection: ${summarize(droppedLogic)}.`,
    });
  }
  if (ambiguousLogic.length > 0) {
    report.push({
      severity: 'warning',
      message: `${ambiguousLogic.length} condition(s) mix AND and OR without parentheses in the ODM file; AND was bound tighter than OR. Please verify: ${summarize(ambiguousLogic)}.`,
    });
  }
  for (const note of notes) report.push({ severity: 'info', message: note });
  if (subset.items.some(({ group }) => group.def.repeating)) {
    report.push({
      severity: 'warning',
      message:
        'Some selected question groups are repeating in ODM. LimeSurvey has no repeating groups; the questions were exported once. Use an array question or a separate survey if you need repetitions.',
    });
  }

  const questionCodeCsv = toCsv([
    ['ODM OID', 'ODM name', 'LimeSurvey question code', 'LimeSurvey group', 'Kind'],
    ...groups.flatMap((group) =>
      group.questions.map((question) => [
        question.itemOid,
        question.itemName,
        question.code,
        group.text[primary.code]?.name ?? '',
        question.heading ? 'group heading (no data)' : 'question',
      ]),
    ),
  ]);

  const surveyText: Localised<{ title: string; description: string }> = {};
  for (const binding of languages) {
    surveyText[binding.code] = {
      title: singleLine(`${model.studyName} (${subset.items.length} questions)`),
      description: singleLine(
        `Subset of the DZIF core dataset (${model.protocolName}). Generated with the DZIF Core Dataset EDC Selector${options.timestamp ? ` on ${options.timestamp.slice(0, 10)}` : ''}.`,
      ),
    };
  }

  return {
    survey: { text: surveyText, languages, groups },
    report,
    questionCodeCsv,
    answerCodeCsv: toCsv(answerCodeRows),
  };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function groupTables(groups: LsGroup[], languages: LanguageBinding[]): LsTable[] {
  const groupRows: LsRow[] = [];
  const groupL10nRows: LsRow[] = [];
  const questionRows: LsRow[] = [];
  const questionL10nRows: LsRow[] = [];
  const answerRows: LsRow[] = [];
  const answerL10nRows: LsRow[] = [];
  const attributeRows: LsRow[] = [];
  let groupL10nId = 0;
  let questionL10nId = 0;
  let answerL10nId = 0;

  for (const group of groups) {
    groupRows.push({
      gid: group.gid,
      sid: SID,
      group_order: group.order,
      // XMLImportGroup reads both of these unconditionally.
      randomization_group: '',
      grelevance: '',
    });
    for (const binding of languages) {
      const text = group.text[binding.code];
      groupL10nRows.push({
        id: ++groupL10nId,
        gid: group.gid,
        group_name: text?.name ?? '',
        description: text?.description ?? '',
        language: binding.code,
      });
    }

    for (const question of group.questions) {
      questionRows.push({
        qid: question.qid,
        parent_qid: 0,
        sid: SID,
        gid: group.gid,
        type: question.type,
        title: question.code,
        preg: '',
        other: 'N',
        mandatory: question.mandatory,
        encrypted: 'N',
        question_order: question.order,
        scale_id: 0,
        same_default: 0,
        relevance: question.relevance,
      });
      for (const binding of languages) {
        const text = question.text[binding.code];
        questionL10nRows.push({
          id: ++questionL10nId,
          qid: question.qid,
          question: text?.question ?? '',
          help: text?.help ?? '',
          script: '',
          language: binding.code,
        });
      }
      for (const answer of question.answers) {
        answerRows.push({
          aid: answer.aid,
          qid: question.qid,
          code: answer.code,
          sortorder: answer.sortorder,
          assessment_value: 0,
          scale_id: 0,
        });
        for (const binding of languages) {
          answerL10nRows.push({
            id: ++answerL10nId,
            aid: answer.aid,
            answer: answer.label[binding.code] ?? answer.code,
            language: binding.code,
          });
        }
      }
      for (const [attribute, value] of Object.entries(question.attributes)) {
        // `language` is omitted: these attributes are not language specific.
        attributeRows.push({ qid: question.qid, attribute, value });
      }
    }
  }

  return [
    { name: 'answers', columns: ANSWER_COLUMNS, rows: answerRows },
    { name: 'answer_l10ns', columns: ANSWER_L10N_COLUMNS, rows: answerL10nRows },
    { name: 'groups', columns: GROUP_COLUMNS, rows: groupRows },
    { name: 'group_l10ns', columns: GROUP_L10N_COLUMNS, rows: groupL10nRows },
    { name: 'questions', columns: QUESTION_COLUMNS, rows: questionRows },
    { name: 'question_l10ns', columns: QUESTION_L10N_COLUMNS, rows: questionL10nRows },
    { name: 'question_attributes', columns: QUESTION_ATTRIBUTE_COLUMNS, rows: attributeRows },
  ];
}

function languageCodes(survey: LsSurvey): string[] {
  return survey.languages.map((binding) => binding.code);
}

/** A complete survey, ready for Surveys → Create → Import. */
export function renderSurveyFile(survey: LsSurvey): string {
  const codes = languageCodes(survey);
  const [base, ...additional] = codes;
  const tables: LsTable[] = [
    ...groupTables(survey.groups, survey.languages),
    {
      name: 'surveys',
      columns: SURVEY_COLUMNS,
      rows: [
        {
          sid: SID,
          gsid: 1,
          language: base,
          // LimeSurvey stores the other languages space separated.
          additional_languages: additional.join(' '),
          // "G" shows one question group per page, which matches the ODM structure.
          format: 'G',
          active: 'N',
          anonymized: 'N',
          datestamp: 'N',
          ipaddr: 'N',
          refurl: 'N',
          savetimings: 'N',
          usecookie: 'N',
          allowregister: 'N',
          allowsave: 'Y',
          allowprev: 'Y',
          printanswers: 'N',
          htmlemail: 'Y',
          assessments: 'N',
          autonumber_start: 0,
          questionindex: 0,
        },
      ],
    },
    {
      name: 'surveys_languagesettings',
      columns: SURVEY_LANGUAGESETTINGS_COLUMNS,
      rows: survey.languages.map((binding) => ({
        surveyls_survey_id: SID,
        surveyls_language: binding.code,
        surveyls_title: survey.text[binding.code]?.title ?? '',
        surveyls_description: survey.text[binding.code]?.description ?? '',
      })),
    },
  ];
  return renderLimesurveyDocument('Survey', codes, tables);
}

/** One question group, for importing into an existing survey. */
export function renderGroupFile(group: LsGroup, languages: LanguageBinding[]): string {
  return renderLimesurveyDocument(
    'Group',
    languages.map((binding) => binding.code),
    groupTables([group], languages),
  );
}

/** One question, for importing into an existing question group. */
export function renderQuestionFile(question: LsQuestion, languages: LanguageBinding[]): string {
  const group: LsGroup = {
    gid: 1,
    text: {},
    order: 0,
    questions: [question],
    odmName: '',
  };
  const tables = groupTables([group], languages).filter(
    (table) => table.name !== 'groups' && table.name !== 'group_l10ns',
  );
  return renderLimesurveyDocument(
    'Question',
    languages.map((binding) => binding.code),
    tables,
  );
}

export interface LimesurveyExport extends ExportResult {
  /** The intermediate model, exposed for tests. */
  survey: LsSurvey;
}

export function exportLimesurvey(
  model: OdmModel,
  selection: Selection,
  options: ExportOptions,
): LimesurveyExport {
  const built = buildSurvey(model, selection, options);
  const { survey } = built;
  const report = [...built.report];
  const files: ExportFile[] = [];
  const mimeType = 'application/xml;charset=utf-8';
  const codes = languageCodes(survey).join(', ');

  /**
   * Relevance equations may name a question from another ODM form, which lands in a
   * different file. Those references only resolve once every file is imported.
   */
  const groupOfCode = new Map<string, number>();
  for (const group of survey.groups) {
    for (const question of group.questions) groupOfCode.set(question.code, group.gid);
  }
  const crossFile: string[] = [];
  for (const group of survey.groups) {
    for (const question of group.questions) {
      if (question.relevance === '1') continue;
      for (const [, reference] of question.relevance.matchAll(/([A-Za-z][A-Za-z0-9]*)\.NAOK/g)) {
        if (groupOfCode.get(reference!) !== group.gid) {
          crossFile.push(`${question.code} → ${reference}`);
          break;
        }
      }
    }
  }
  if (crossFile.length > 0 && options.limesurveyFormat !== 'lss') {
    report.push({
      severity: 'warning',
      message: `${crossFile.length} relevance equation(s) read a question that sits in another file, because the ODM condition crosses form boundaries (e.g. ${summarize(crossFile, 3)}). Import every file before checking the logic, otherwise LimeSurvey reports an unknown question code.`,
    });
  }

  switch (options.limesurveyFormat) {
    case 'lsg': {
      const width = String(survey.groups.length).length;
      for (const group of survey.groups) {
        const questions = group.questions.filter((question) => !question.heading).length;
        files.push({
          name: `groups/${String(group.order + 1).padStart(width, '0')}_${fileSafe(group.odmName)}.lsg`,
          mimeType,
          content: renderGroupFile(group, survey.languages),
          description: `${group.text[survey.languages[0]!.code]?.name ?? group.odmName} · ${questions}`,
        });
      }
      report.unshift({
        severity: 'info',
        message: `One file per ODM form — ${survey.groups.length} file(s). Open the target survey, then use Question groups → Import a question group, once per file. The survey's base language must be one of: ${codes}.`,
      });
      break;
    }
    case 'lsq': {
      for (const group of survey.groups) {
        for (const question of group.questions) {
          // Headings only make sense inside a group, so they are left out here.
          if (question.heading) continue;
          files.push({
            name: `questions/${fileSafe(question.code)}.lsq`,
            mimeType,
            content: renderQuestionFile(question, survey.languages),
          });
        }
      }
      report.unshift({
        severity: 'info',
        message: `${files.length} single-question file(s). Open the target question group, then use Import a question, once per file — the .lsg format needs far fewer imports. The survey's base language must be one of: ${codes}.`,
      });
      break;
    }
    case 'lss':
    default:
      files.push({
        name: 'dzif_limesurvey_survey.lss',
        mimeType,
        content: renderSurveyFile(survey),
      });
      report.unshift({
        severity: 'info',
        message:
          'Import with Surveys → Create a new survey → Import a survey structure file, and pick the .lss file. It creates the whole survey including all question groups.',
      });
      break;
  }

  files.push(
    {
      name: 'dzif_limesurvey_question_codes.csv',
      mimeType: 'text/csv;charset=utf-8',
      content: built.questionCodeCsv,
    },
    {
      name: 'dzif_limesurvey_answer_codes.csv',
      mimeType: 'text/csv;charset=utf-8',
      content: built.answerCodeCsv,
    },
  );

  return { survey, files, report };
}

function fileSafe(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

function summarize(values: string[], limit = 5): string {
  return values.length <= limit
    ? values.join(', ')
    : `${values.slice(0, limit).join(', ')} and ${values.length - limit} more`;
}
