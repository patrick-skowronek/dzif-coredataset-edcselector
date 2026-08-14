import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseOdmString } from '../odm/parse';
import type { OdmModel } from '../odm/types';
import { buildProjectFile, restoreProjectFile } from './project';
import { coreSelection, missingDependencies, withDependencies } from '../selection';
import { exportCodebook } from './codebook';
import {
  exportLimesurvey,
  limesurveyAnswerCode,
  renderRelevance,
  resolveLanguages,
} from './limesurvey';
import { exportOdmSubset } from './odm';
import { REDCAP_COLUMNS, exportRedcap, formatChoices, renderBranchingLogic } from './redcap';
import { NameRegistry, sanitizeIdentifier, shortenSegments, toSegments } from './names';
import { parseFormalExpression } from '../odm/condition';
import { defaultExportOptions, type ExportOptions } from './types';
import { runExport, targets } from './index';

const ODM_PATH = resolve(import.meta.dirname, '../../../public/odm/46192_DZIF-Kerndatensatz.xml');

const options: ExportOptions = {
  ...defaultExportOptions,
  language: 'de',
  timestamp: '2026-01-01T00:00:00.000Z',
};

let model: OdmModel;
beforeAll(() => {
  model = parseOdmString(readFileSync(ODM_PATH, 'utf8'));
});

/** A small, structurally interesting selection: consent (with skip logic) + demographics. */
function smallSelection(): Set<string> {
  return new Set([
    'SE.1/F.1/IG.1/I.1', // PERSON_CONSENT, code list CL.1, no condition
    'SE.1/F.1/IG.1/I.2', // consent date, hidden unless I.1 is Y or P
    'SE.1/F.1/IG.6/I.11', // age, integer
    'SE.1/F.1/IG.6/I.13', // sex, code list
  ]);
}

describe('identifier shortening', () => {
  it('splits names into words', () => {
    expect(toSegments('PERSON_CONSENT_SIGNDATE')).toEqual(['person', 'consent', 'signdate']);
    expect(toSegments('Größe in cm')).toEqual(['groesse', 'in', 'cm']);
  });

  it('produces snake_case and CamelCase', () => {
    expect(sanitizeIdentifier('PERSON_CONSENT', 'snake')).toBe('person_consent');
    expect(sanitizeIdentifier('PERSON_CONSENT', 'camel')).toBe('PersonConsent');
    expect(sanitizeIdentifier('1_TEST', 'snake')).toBe('v_1_test');
  });

  it('drops leading words to fit the limit', () => {
    const segments = toSegments('PERSON_STUDY_INCLUSION_PARTICIPANT_TYPE');
    expect(shortenSegments(segments, 'snake', 26)).toBe('inclusion_participant_type');
    expect(shortenSegments(segments, 'camel', 20)).toBe('ParticipantType');
  });

  it('keeps identifiers unique', () => {
    const registry = new NameRegistry({ maxLength: 26 });
    expect(registry.add('a', 'PERSON_CONSENT')).toBe('person_consent');
    expect(registry.add('b', 'PERSON_CONSENT')).toBe('person_consent_2');
    expect(registry.get('b')).toBe('person_consent_2');
  });

  it('never exceeds the limit, even when de-duplicating', () => {
    const registry = new NameRegistry({ maxLength: 5, style: 'camel' });
    const names = Array.from({ length: 12 }, () => registry.add(Math.random().toString(), 'Abcdefgh'));
    expect(names.every((name) => name.length <= 5)).toBe(true);
    expect(new Set(names).size).toBe(12);
  });

  it('gives every DZIF item a unique, valid identifier in both styles', () => {
    const snake = new NameRegistry({ maxLength: 26 });
    const camel = new NameRegistry({ maxLength: 20, style: 'camel' });
    for (const id of model.itemNodeIds) {
      const node = model.nodesById.get(id)!;
      if (node.kind !== 'item') continue;
      snake.add(id, node.def.name);
      camel.add(id, node.def.name);
    }
    const snakeNames = snake.entries().map(([, name]) => name);
    const camelNames = camel.entries().map(([, name]) => name);
    expect(snakeNames).toHaveLength(825);
    expect(new Set(snakeNames).size).toBe(825);
    expect(snakeNames.every((name) => /^[a-z][a-z0-9_]{0,25}$/.test(name))).toBe(true);
    expect(new Set(camelNames).size).toBe(825);
    expect(camelNames.every((name) => /^[A-Za-z][A-Za-z0-9]{0,19}$/.test(name))).toBe(true);
  });
});

describe('REDCap export', () => {
  it('writes the 18 standard columns', () => {
    const result = exportRedcap(model, smallSelection(), options);
    expect(result.rows[0]).toEqual([...REDCAP_COLUMNS]);
    expect(REDCAP_COLUMNS).toHaveLength(18);
    expect(result.rows.every((row) => row.length === 18)).toBe(true);
  });

  it('adds a record_id field first, as REDCap requires', () => {
    const result = exportRedcap(model, smallSelection(), options);
    expect(result.rows[1]![0]).toBe('record_id');
    const without = exportRedcap(model, smallSelection(), { ...options, addRecordIdField: false });
    expect(without.rows[1]![0]).not.toBe('record_id');
  });

  it('maps data types and code lists to field types', () => {
    const result = exportRedcap(model, smallSelection(), options);
    const byVariable = new Map(result.rows.slice(1).map((row) => [row[0]!, row]));
    const consent = byVariable.get('person_consent')!;
    expect(consent[3]).toBe('radio');
    expect(consent[5]).toBe('Y, Ja | N, Nein | P, Eingeschränkt | X, Keine Information verfügbar');
    const age = byVariable.get('demog_age') ?? byVariable.get('person_demog_age')!;
    expect(age[3]).toBe('text');
    expect(age[7]).toBe('integer');
    const consentDate = [...byVariable.values()].find((row) => row[17]!.includes('I.2'))!;
    expect(consentDate[7]).toBe('date_ymd');
  });

  it('puts the question group title in the section header of its first field only', () => {
    const result = exportRedcap(model, smallSelection(), options);
    const rows = result.rows.slice(1).filter((row) => row[0] !== 'record_id');
    expect(rows[0]![2]).toBe('Einwilligungserklärung (Patient:in)');
    expect(rows[1]![2]).toBe('');
  });

  it('translates collect-unless conditions into show-only-if logic', () => {
    const result = exportRedcap(model, smallSelection(), options);
    const consentDate = result.rows.slice(1).find((row) => row[17]!.includes('@DZIF-ODM-ITEM=I.2'))!;
    expect(consentDate[11]).toBe("[person_consent] = 'Y' or [person_consent] = 'P'");
  });

  it('drops logic whose referenced question is not selected, and reports it', () => {
    // I.2 alone: its condition reads I.1, which is not selected.
    const result = exportRedcap(model, new Set(['SE.1/F.1/IG.1/I.2']), options);
    const row = result.rows.slice(1).find((entry) => entry[17]!.includes('@DZIF-ODM-ITEM=I.2'))!;
    expect(row[11]).toBe('');
    expect(result.report.some((entry) => /Branching logic dropped/.test(entry.message))).toBe(true);
  });

  it('carries mandatory flags, hints and the ODM annotation', () => {
    const result = exportRedcap(model, smallSelection(), options);
    const age = result.rows.slice(1).find((row) => row[17]!.includes('@DZIF-ODM-ITEM=I.11'))!;
    expect(age[12]).toBe('y');
    expect(age[6]).toContain('Lebensjahr');
    expect(age[17]).toContain('@DZIF-ODM-NAME=PERSON_DEMOG_AGE');
    expect(age[17]).toContain('@DZIF-CORE');
  });

  it('ships a variable mapping file', () => {
    const result = exportRedcap(model, smallSelection(), options);
    const mapping = result.files.find((file) => file.name === 'dzif_variable_mapping.csv')!;
    expect(mapping.content).toContain('I.1,PERSON_CONSENT,person_consent');
  });

  it('exports the whole dataset without duplicate variable names', () => {
    const result = exportRedcap(model, new Set(model.itemNodeIds), options);
    const variables = result.rows.slice(1).map((row) => row[0]!);
    expect(variables).toHaveLength(826); // 825 questions + record_id
    expect(new Set(variables).size).toBe(826);
    expect(variables.every((name) => /^[a-z][a-z0-9_]{0,25}$/.test(name))).toBe(true);
  });

  it('escapes CSV cells', () => {
    const result = exportRedcap(model, new Set(model.itemNodeIds), options);
    const csv = result.files[0]!.content;
    // Minimal RFC 4180 quoting: only cells containing a comma, quote or newline.
    expect(csv.split('\r\n')[0]).toBe(
      'Variable / Field Name,Form Name,Section Header,Field Type,Field Label,"Choices, Calculations, OR Slider Labels",Field Note,Text Validation Type OR Show Slider Number,Text Validation Min,Text Validation Max,Identifier?,Branching Logic (Show field only if...),Required Field?,Custom Alignment,Question Number (surveys only),Matrix Group Name,Matrix Ranking?,Field Annotation',
    );
    expect(csv.endsWith('\r\n')).toBe(true);
    // Labels with commas stay in one cell.
    const withComma = csv.split('\r\n').find((line) => line.includes('"'))!;
    expect(withComma).toMatch(/"/);
  });

  it('renders branching logic for AND, OR and negation', () => {
    const variableOf = (oid: string) => ({ 'I.1': 'a', 'I.2': 'b' })[oid];
    const render = (expression: string) =>
      renderBranchingLogic(parseFormalExpression(expression).ast, variableOf);
    expect(render('!(I.1 == "Y")')).toBe("[a] = 'Y'");
    expect(render('!(I.1 == "Y" OR I.2 == "N")')).toBe("[a] = 'Y' or [b] = 'N'");
    expect(render('!(I.1 == "Y" AND I.2 == "N")')).toBe("[a] = 'Y' and [b] = 'N'");
    expect(render('I.1 == "Y"')).toBe("[a] <> 'Y'");
    expect(render('!(I.1 == "X")')).toBe("[a] = 'X'");
    expect(render('!(I.9 == "Y")')).toBeUndefined();
  });

  it('strips separators that would break REDCap choices', () => {
    const { text, sanitized } = formatChoices([
      { codedValue: 'A,B', label: 'first | second' },
      { codedValue: 'C', label: 'plain' },
    ]);
    expect(text).toBe('AB, first / second | C, plain');
    expect(sanitized).toEqual(['A,B']);
  });
});

describe('LimeSurvey export', () => {
  /** The .lss document holds every table, so most assertions read that one. */
  const lss: ExportOptions = { ...options, limesurveyFormat: 'lss' };

  /** Parse an exported LimeSurvey document into { table: rows[] }. */
  function parseLs(xml: string): {
    docType: string;
    languages: string[];
    tables: Record<string, Record<string, string>[]>;
    fields: Record<string, string[]>;
  } {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const root = doc.documentElement;
    expect(root.nodeName).toBe('document');
    const tables: Record<string, Record<string, string>[]> = {};
    const fields: Record<string, string[]> = {};
    for (const table of Array.from(root.children)) {
      if (['LimeSurveyDocType', 'DBVersion', 'languages'].includes(table.nodeName)) continue;
      fields[table.nodeName] = Array.from(table.querySelectorAll('fields > fieldname')).map(
        (node) => node.textContent ?? '',
      );
      tables[table.nodeName] = Array.from(table.querySelectorAll('rows > row')).map((row) => {
        const values: Record<string, string> = {};
        for (const cell of Array.from(row.children)) values[cell.nodeName] = cell.textContent ?? '';
        return values;
      });
    }
    return {
      docType: root.querySelector('LimeSurveyDocType')?.textContent ?? '',
      languages: Array.from(root.querySelectorAll('languages > language')).map(
        (node) => node.textContent ?? '',
      ),
      tables,
      fields,
    };
  }

  it('writes a survey document LimeSurvey can import', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    const file = result.files.find((entry) => entry.name.endsWith('.lss'))!;
    expect(file).toBeDefined();
    const parsed = parseLs(file.content);
    expect(parsed.docType).toBe('Survey');
    // Every language the ODM offers is declared, the export language first, so the
    // file satisfies a survey whose base language is either one.
    expect(parsed.languages).toEqual(['de', 'en']);
    // XMLImportSurvey() aborts without a surveys row and reads the language settings.
    expect(parsed.tables.surveys).toHaveLength(1);
    expect(parsed.tables.surveys![0]!.language).toBe('de');
    expect(parsed.tables.surveys![0]!.additional_languages).toBe('en');
    expect(parsed.tables.surveys_languagesettings).toHaveLength(2);
    expect(parsed.tables.surveys_languagesettings!.map((row) => row.surveyls_language)).toEqual([
      'de',
      'en',
    ]);
    expect(parsed.tables.surveys_languagesettings![0]!.surveyls_title).toContain('DZIF');
    // Every declared field really is written, and vice versa.
    for (const [table, rows] of Object.entries(parsed.tables)) {
      for (const row of rows) {
        for (const column of Object.keys(row)) {
          expect(parsed.fields[table], `${table}.${column}`).toContain(column);
        }
      }
    }
  });

  it('links groups, questions and answers by id', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);

    const groupIds = new Set(parsed.tables.groups!.map((row) => row.gid));
    // One LimeSurvey group per ODM form: both question groups live in F.1 (Person).
    expect(groupIds.size).toBe(1);
    // Every group has localised text, every question sits in a known group.
    for (const row of parsed.tables.group_l10ns!) expect(groupIds).toContain(row.gid);
    for (const row of parsed.tables.questions!) {
      expect(groupIds).toContain(row.gid);
      expect(Number(row.gid)).toBeGreaterThan(0); // gid 0 rows are skipped on import
      expect(row.parent_qid).toBe('0');
    }

    const questionIds = new Set(parsed.tables.questions!.map((row) => row.qid));
    // 4 questions plus one heading per ODM question group.
    expect(questionIds.size).toBe(6);
    // One localisation row per question and language.
    expect(parsed.tables.question_l10ns).toHaveLength(12);
    for (const row of parsed.tables.question_l10ns!) expect(questionIds).toContain(row.qid);

    const answerIds = new Set(parsed.tables.answers!.map((row) => row.aid));
    for (const row of parsed.tables.answers!) expect(questionIds).toContain(row.qid);
    // answer_l10ns are matched back to answers via aid, one row per language.
    expect(parsed.tables.answer_l10ns).toHaveLength(answerIds.size * 2);
    for (const row of parsed.tables.answer_l10ns!) expect(answerIds).toContain(row.aid);
    // Localisation ids stay unique across languages.
    for (const table of ['group_l10ns', 'question_l10ns', 'answer_l10ns']) {
      const ids = parsed.tables[table]!.map((row) => row.id);
      expect(new Set(ids).size, table).toBe(ids.length);
    }
  });

  it('keeps the columns the importer reads unconditionally', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    for (const row of parsed.tables.groups!) {
      // XMLImportGroup reads these two without an isset() guard.
      expect(row).toHaveProperty('randomization_group');
      expect(row).toHaveProperty('grelevance');
    }
    for (const row of parsed.tables.questions!) {
      expect(['Y', 'N']).toContain(row.mandatory);
      expect(row.relevance).not.toBe('');
    }
  });

  it('uses valid question codes and question types for the whole dataset', () => {
    const result = exportLimesurvey(model, new Set(model.itemNodeIds), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    const questions = parsed.tables.questions!;
    // 19 ODM forms become 19 groups, holding all 825 questions. 250 non-empty ODM
    // question groups yield 249 headings: one form has a single group, which needs none.
    expect(parsed.tables.groups).toHaveLength(19);
    expect(questions.filter((row) => row.type !== 'X')).toHaveLength(825);
    expect(questions.filter((row) => row.type === 'X')).toHaveLength(249);
    const codes = questions.map((row) => row.title!);
    expect(codes.every((code) => /^[A-Za-z][A-Za-z0-9]{0,19}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(questions.length);
    expect(new Set(questions.map((row) => row.type))).toEqual(
      new Set(['L', '!', 'S', 'N', 'D', 'X']),
    );
    // Question order restarts per group.
    const firstOfGroup = new Map<string, string>();
    for (const row of questions) {
      if (!firstOfGroup.has(row.gid!)) firstOfGroup.set(row.gid!, row.question_order!);
    }
    expect([...new Set(firstOfGroup.values())]).toEqual(['0']);
  });

  it('keeps answer codes valid and maps the ones it had to change', () => {
    const result = exportLimesurvey(model, new Set(model.itemNodeIds), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    const answers = parsed.tables.answers!;
    expect(answers.every((row) => /^[A-Za-z0-9]{1,5}$/.test(row.code!))).toBe(true);
    // Codes are unique within a question.
    const perQuestion = new Map<string, Set<string>>();
    for (const row of answers) {
      const set = perQuestion.get(row.qid!) ?? new Set<string>();
      expect(set.has(row.code!), `${row.qid}/${row.code}`).toBe(false);
      set.add(row.code!);
      perQuestion.set(row.qid!, set);
    }
    const mapping = result.files.find((file) => file.name === 'dzif_limesurvey_answer_codes.csv')!;
    expect(mapping.content).toContain('LIQUID_SER');
    expect(result.report.some((entry) => /answer code/i.test(entry.message))).toBe(true);
  });

  it('generates a fallback code only when needed', () => {
    const used = new Set<string>();
    expect(limesurveyAnswerCode('Y', 0, used)).toEqual({ code: 'Y', changed: false });
    expect(limesurveyAnswerCode('LIQUID_SER', 1, used)).toEqual({ code: 'A2', changed: true });
    expect(limesurveyAnswerCode('Y', 2, used)).toEqual({ code: 'A3', changed: true });
  });

  it('writes relevance equations in Expression Manager syntax', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    const byCode = new Map(parsed.tables.questions!.map((row) => [row.title!, row]));
    expect(byCode.get('ConsentSigndate')!.relevance).toBe(
      '((PersonConsent.NAOK == "Y" or PersonConsent.NAOK == "P"))',
    );
    expect(byCode.get('PersonConsent')!.relevance).toBe('1');
  });

  it('falls back to always-relevant when a referenced question is missing', () => {
    const result = exportLimesurvey(model, new Set(['SE.1/F.1/IG.1/I.2']), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    expect(parsed.tables.questions![0]!.relevance).toBe('1');
    expect(result.report.some((entry) => /Relevance equations dropped/.test(entry.message))).toBe(
      true,
    );
  });

  it('renders relevance for AND and OR', () => {
    const codeOf = (oid: string) => ({ 'I.1': 'Qa', 'I.2': 'Qb' })[oid];
    const render = (expression: string) =>
      renderRelevance(parseFormalExpression(expression).ast, codeOf);
    expect(render('!(I.1 == "Y")')).toBe('Qa.NAOK == "Y"');
    expect(render('!(I.1 == "Y" OR I.2 == "N")')).toBe('(Qa.NAOK == "Y" or Qb.NAOK == "N")');
    expect(render('!(I.1 != "Y")')).toBe('Qa.NAOK != "Y"');
  });

  it('maps numeric bounds and date formats to question attributes', () => {
    // I.23 (VISIT_TYPE_NO) is an integer with range checks LT 1 / GT 999.
    const result = exportLimesurvey(model, new Set(['SE.1/F.2/IG.11/I.23']), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    const attributes = new Map(
      parsed.tables.question_attributes!.map((row) => [row.attribute, row.value]),
    );
    expect(attributes.get('min_num_value_n')).toBe('1');
    expect(attributes.get('max_num_value_n')).toBe('999');
    expect(attributes.get('num_value_int_only')).toBe('1');
    expect(parsed.tables.questions![0]!.type).toBe('N');
  });

  it('produces group files by default, matching what the dialog offers', () => {
    expect(defaultExportOptions.limesurveyFormat).toBe('lsg');
    const result = exportLimesurvey(model, smallSelection(), options);
    expect(result.files.map((file) => file.name)).toEqual([
      'groups/1_F_PERSON.lsg',
      'dzif_limesurvey_question_codes.csv',
      'dzif_limesurvey_answer_codes.csv',
    ]);
  });

  it('writes one .lsg file per ODM form, not per question group', () => {
    const result = exportLimesurvey(model, smallSelection(), {
      ...lss,
      limesurveyFormat: 'lsg',
    });
    const groupFiles = result.files.filter((file) => file.name.endsWith('.lsg'));
    expect(groupFiles).toHaveLength(1);
    expect(groupFiles[0]!.name).toBe('groups/1_F_PERSON.lsg');
    expect(groupFiles[0]!.description).toContain('Person');
    const parsed = parseLs(groupFiles[0]!.content);
    expect(parsed.docType).toBe('Group');
    expect(parsed.tables.groups).toHaveLength(1);
    expect(parsed.tables.group_l10ns!.map((row) => row.group_name)).toEqual(['Person', 'Person']);
    // 4 questions plus a heading for each of the two ODM question groups.
    expect(parsed.tables.questions).toHaveLength(6);
    expect(parsed.tables.surveys).toBeUndefined();
    // A group import is refused unless the file declares the survey's base language.
    expect(parsed.languages).toEqual(['de', 'en']);
    expect(new Set(parsed.tables.group_l10ns!.map((row) => row.language))).toEqual(
      new Set(['de', 'en']),
    );
  });

  it('writes one .lsq file per question, without group rows', () => {
    const result = exportLimesurvey(model, smallSelection(), {
      ...lss,
      limesurveyFormat: 'lsq',
    });
    const questionFiles = result.files.filter((file) => file.name.endsWith('.lsq'));
    // Headings are structural, so they get no file of their own.
    expect(questionFiles).toHaveLength(4);
    expect(questionFiles.map((file) => file.name)).toContain('questions/PersonConsent.lsq');
    const parsed = parseLs(questionFiles[0]!.content);
    expect(parsed.docType).toBe('Question');
    expect(parsed.tables.questions).toHaveLength(1);
    expect(parsed.tables.groups).toBeUndefined();
    expect(parsed.tables.group_l10ns).toBeUndefined();
    expect(parsed.tables.answers!.length).toBeGreaterThan(0);
    expect(parsed.languages).toEqual(['de', 'en']);
    expect(parsed.tables.question_l10ns!.map((row) => row.language)).toEqual(['de', 'en']);
  });

  it('writes both languages with the right texts', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    const consentQid = parsed.tables.questions!.find((row) => row.title === 'PersonConsent')!.qid;
    const byLanguage = new Map(
      parsed.tables.question_l10ns!
        .filter((row) => row.qid === consentQid)
        .map((row) => [row.language, row.question]),
    );
    expect(byLanguage.get('de')).toContain('Einwilligungserklärung');
    expect(byLanguage.get('en')).toContain('declaration of consent');
    const answers = parsed.tables.answer_l10ns!.filter((row) => row.aid === '1');
    expect(answers.find((row) => row.language === 'de')!.answer).toBe('Ja');
    expect(answers.find((row) => row.language === 'en')!.answer).toBe('Yes');
  });

  it('honours an explicit list of language codes', () => {
    const result = exportLimesurvey(model, smallSelection(), {
      ...lss,
      limesurveyLanguageCodes: 'de-informal, en',
    });
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    expect(parsed.languages).toEqual(['de-informal', 'en']);
    expect(parsed.tables.surveys![0]!.language).toBe('de-informal');
    expect(parsed.tables.surveys![0]!.additional_languages).toBe('en');
    // A variant code takes the texts of its base language.
    const consentQid = parsed.tables.questions!.find((row) => row.title === 'PersonConsent')!.qid;
    const german = parsed.tables.question_l10ns!.find(
      (row) => row.qid === consentQid && row.language === 'de-informal',
    )!;
    expect(german.question).toContain('Einwilligungserklärung');
    expect(result.report.some((entry) => /de-informal.*texts of "de"/.test(entry.message))).toBe(
      true,
    );
  });

  it('binds language codes to ODM languages', () => {
    const bind = (codes: string) =>
      resolveLanguages(model, { ...lss, limesurveyLanguageCodes: codes });
    expect(bind('')).toEqual([
      { code: 'de', source: 'de' },
      { code: 'en', source: 'en' },
    ]);
    expect(bind('en')).toEqual([{ code: 'en', source: 'en' }]);
    expect(bind('de-informal')).toEqual([{ code: 'de-informal', source: 'de' }]);
    expect(bind('en-GB de')).toEqual([
      { code: 'en-GB', source: 'en' },
      { code: 'de', source: 'de' },
    ]);
    // An unrelated code still gets text, from the chosen export language.
    expect(bind('fr')).toEqual([{ code: 'fr', source: 'de' }]);
    // Duplicates are collapsed.
    expect(bind('de, de')).toEqual([{ code: 'de', source: 'de' }]);
  });

  it('reports which language codes the file declares', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    expect(
      result.report.some((entry) => /declares the language code\(s\) de, en/.test(entry.message)),
    ).toBe(true);
  });

  it('keeps the ODM question group titles as X headings, in order', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    const byQid = new Map(parsed.tables.question_l10ns!.map((row) => [`${row.qid}/${row.language}`, row]));
    const ordered = [...parsed.tables.questions!].sort(
      (a, b) => Number(a.question_order) - Number(b.question_order),
    );
    expect(
      ordered.map((row) => [row.type === 'X' ? 'heading' : 'question', byQid.get(`${row.qid}/de`)!.question]),
    ).toEqual([
      ['heading', 'Einwilligungserklärung (Patient:in)'],
      ['question', 'Gibt es eine Einwilligungserklärung des Patienten/Teilnehmers für die Studie?*'],
      ['question', 'Tagesgenaues Datum des Einschlusses bzw. Einwilligung des Patienten*'],
      ['heading', 'Demographie'],
      ['question', 'Alter (zum Zeitpunkt der Patienteneineinwilligung)*'],
      ['question', 'Geschlecht (biologisch bei Geburt)*'],
    ]);
    // A heading collects nothing and is always shown.
    const heading = parsed.tables.questions!.find((row) => row.type === 'X')!;
    expect(heading.mandatory).toBe('N');
    expect(heading.relevance).toBe('1');
    expect(parsed.tables.answers!.every((row) => row.qid !== heading.qid)).toBe(true);
  });

  it('omits headings when switched off, and when a form has a single group', () => {
    const without = exportLimesurvey(model, smallSelection(), {
      ...lss,
      limesurveyGroupHeadings: false,
    });
    const parsed = parseLs(without.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    expect(parsed.tables.questions!.some((row) => row.type === 'X')).toBe(false);
    expect(parsed.tables.questions).toHaveLength(4);
    expect(
      without.report.some((entry) => /headings are switched off/.test(entry.message)),
    ).toBe(true);

    // I.1 alone: one form, one question group — a heading would add nothing.
    const single = exportLimesurvey(model, new Set(['SE.1/F.1/IG.1/I.1']), lss);
    const singleParsed = parseLs(single.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    expect(singleParsed.tables.questions).toHaveLength(1);
  });

  it('names headings after the ODM question group and lists them in the mapping', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    const parsed = parseLs(result.files.find((entry) => entry.name.endsWith('.lss'))!.content);
    const headings = parsed.tables.questions!.filter((row) => row.type === 'X');
    expect(headings.map((row) => row.title)).toEqual(['GPersonConsent', 'GPersonDemog']);
    const mapping = result.files.find(
      (file) => file.name === 'dzif_limesurvey_question_codes.csv',
    )!.content;
    expect(mapping).toContain('IG.1,G_PERSON_CONSENT,GPersonConsent,Person,group heading (no data)');
    expect(mapping).toContain('I.1,PERSON_CONSENT,PersonConsent,Person,question');
  });

  it('reports the merge', () => {
    const result = exportLimesurvey(model, smallSelection(), lss);
    expect(
      result.report.some((entry) =>
        /merged into a single LimeSurvey group: 1 group\(s\) for 2 ODM question group\(s\)/.test(
          entry.message,
        ),
      ),
    ).toBe(true);
    expect(result.report.some((entry) => /2 text-display question/.test(entry.message))).toBe(true);
  });

  it('warns when skip logic crosses file boundaries', () => {
    const selection = withDependencies(model, coreSelection(model));
    const perForm = exportLimesurvey(model, selection, { ...lss, limesurveyFormat: 'lsg' });
    const pattern = /relevance equation\(s\) read a question that sits in another file/;
    expect(perForm.report.some((entry) => pattern.test(entry.message))).toBe(true);
    // A single survey file has no boundaries to cross.
    const whole = exportLimesurvey(model, selection, { ...lss, limesurveyFormat: 'lss' });
    expect(whole.report.some((entry) => pattern.test(entry.message))).toBe(false);
  });

  it('wraps values in CDATA and keeps special characters intact', () => {
    const result = exportLimesurvey(model, new Set(model.itemNodeIds), lss);
    const xml = result.files.find((entry) => entry.name.endsWith('.lss'))!.content;
    expect(xml).toContain('<![CDATA[');
    const parsed = parseLs(xml);
    const texts = parsed.tables.question_l10ns!.map((row) => row.question ?? '');
    // German umlauts and ampersands survive the round trip.
    expect(texts.some((text) => /[äöüß]/.test(text))).toBe(true);
    expect(texts.some((text) => text.includes('&'))).toBe(true);
  });
});

describe('ODM subset export', () => {
  it('produces a parseable ODM file with only the selected items', () => {
    const result = exportOdmSubset(model, smallSelection(), options);
    const xml = result.files[0]!.content;
    const reparsed = parseOdmString(xml);
    expect(reparsed.itemDefs.size).toBe(4);
    expect(reparsed.itemNodeIds).toHaveLength(4);
    expect(reparsed.formDefs.size).toBe(1);
    expect(reparsed.itemGroupDefs.size).toBe(2);
    expect(reparsed.odmVersion).toBe('1.3.2');
    expect(reparsed.languages).toEqual(['de', 'en']);
  });

  it('keeps only the code lists, units and conditions that are still needed', () => {
    const result = exportOdmSubset(model, smallSelection(), options);
    const reparsed = parseOdmString(result.files[0]!.content);
    expect([...reparsed.codeLists.keys()]).toEqual(['CL.1', 'CL.7']);
    expect(reparsed.conditions.size).toBe(1);
    expect(reparsed.conditions.get('C.1')?.expression).toBe('!(I.1 == "Y" OR I.1 == "P")');
  });

  it('removes conditions that point at unselected items so the file stays valid', () => {
    const result = exportOdmSubset(model, new Set(['SE.1/F.1/IG.1/I.2']), options);
    const reparsed = parseOdmString(result.files[0]!.content);
    expect(reparsed.conditions.size).toBe(0);
    const itemRef = [...reparsed.itemGroupDefs.values()][0]!.itemRefs[0]!;
    expect(itemRef.collectionExceptionConditionOid).toBeUndefined();
    expect(result.report.some((entry) => /skip condition/.test(entry.message))).toBe(true);
  });

  it('round-trips the full dataset', () => {
    const result = exportOdmSubset(model, new Set(model.itemNodeIds), options);
    const reparsed = parseOdmString(result.files[0]!.content);
    expect(reparsed.itemDefs.size).toBe(825);
    // 250, not 256: six ItemGroupDefs in the source file contain no ItemRef at all
    // and therefore cannot be selected.
    expect(reparsed.itemGroupDefs.size).toBe(250);
    expect(reparsed.formDefs.size).toBe(19);
    expect(reparsed.codeLists.size).toBe(382);
    // 412 of the 839 ConditionDefs in the source file are actually referenced by a
    // surviving element; the rest are orphans left behind by the ODM editor.
    expect(reparsed.conditions.size).toBe(412);
    expect(reparsed.itemDefs.get('I.23')!.rangeChecks).toHaveLength(2);
    expect(reparsed.itemDefs.get('I.11')!.question.de).toContain('Alter');
  });

  it('escapes special characters', () => {
    const result = exportOdmSubset(model, new Set(model.itemNodeIds), options);
    const xml = result.files[0]!.content;
    expect(xml).not.toMatch(/<TranslatedText[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    expect(xml).toContain('&amp;');
  });
});

describe('codebook export', () => {
  it('writes one row per selected question with both languages', () => {
    const result = exportCodebook(model, smallSelection(), options);
    const lines = result.files[0]!.content.trimEnd().split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('Question (de)');
    expect(lines[0]).toContain('Question (en)');
    expect(lines[1]).toContain('PERSON_CONSENT');
    expect(lines[1]).toContain('Y = Ja; N = Nein');
  });
});

describe('runExport', () => {
  it('adds a report file to every target', () => {
    for (const target of targets) {
      const bundle = runExport(target, model, smallSelection(), options);
      const report = bundle.files.find((file) => file.name === 'dzif_export_report.txt');
      expect(report, target.id).toBeDefined();
      expect(report!.content).toContain('Questions selected   4 of 825');
      expect(report!.content).toContain('mandatory questions');
    }
  });

  it('warns when the mandatory core dataset is incomplete and confirms when it is not', () => {
    const partial = runExport(targets[0]!, model, smallSelection(), options);
    expect(partial.report.some((entry) => /mandatory DZIF core dataset questions are selected/.test(entry.message))).toBe(true);

    const complete = runExport(targets[0]!, model, withDependencies(model, coreSelection(model)), options);
    expect(complete.report.some((entry) => /All 350 mandatory/.test(entry.message))).toBe(true);
  });
});

describe('selection dependencies', () => {
  it('adds the questions that skip logic depends on', () => {
    const start = new Set(['SE.1/F.1/IG.1/I.2']);
    expect(missingDependencies(model, start).size).toBe(1);
    const resolved = withDependencies(model, start);
    expect(resolved.has('SE.1/F.1/IG.1/I.1')).toBe(true);
    expect(missingDependencies(model, resolved).size).toBe(0);
  });

  it('resolves the whole core dataset without leaving gaps', () => {
    const resolved = withDependencies(model, coreSelection(model));
    expect(missingDependencies(model, resolved).size).toBe(0);
    expect(resolved.size).toBeGreaterThanOrEqual(350);
  });
});

describe('project file', () => {
  it('round-trips a selection', () => {
    const selection = smallSelection();
    const project = buildProjectFile(model, selection, options.timestamp);
    expect(project.nodeIds).toHaveLength(4);
    const restored = restoreProjectFile(model, JSON.parse(JSON.stringify(project)));
    expect([...restored.selection].sort()).toEqual([...selection].sort());
    expect(restored.unknown).toEqual([]);
  });

  it('falls back to item OIDs when node paths do not match', () => {
    const project = buildProjectFile(model, smallSelection(), options.timestamp);
    const moved = { ...project, nodeIds: ['SE.9/F.9/IG.9/I.1'] };
    const restored = restoreProjectFile(model, moved);
    expect(restored.usedFallback).toBe(true);
    expect(restored.selection.has('SE.1/F.1/IG.1/I.1')).toBe(true);
  });

  it('reports item OIDs that no longer exist', () => {
    const project = buildProjectFile(model, smallSelection(), options.timestamp);
    const restored = restoreProjectFile(model, { ...project, nodeIds: [], itemOids: ['I.99999'] });
    expect(restored.unknown).toEqual(['I.99999']);
  });

  it('rejects foreign files', () => {
    expect(() => restoreProjectFile(model, { format: 'something-else' })).toThrow(/not a DZIF/);
  });
});
