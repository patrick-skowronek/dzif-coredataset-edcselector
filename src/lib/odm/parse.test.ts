import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { negate, parseConditionRef, parseFormalExpression } from './condition';
import { isCoreQuestion, parseOdmString, stripCoreMarker } from './parse';
import type { OdmModel } from './types';

export const ODM_PATH = resolve(import.meta.dirname, '../../../public/odm/46192_DZIF-Kerndatensatz.xml');

export function loadModel(): OdmModel {
  return parseOdmString(readFileSync(ODM_PATH, 'utf8'));
}

describe('parseOdmString on the DZIF core dataset', () => {
  let model: OdmModel;
  beforeAll(() => {
    model = loadModel();
  });

  it('reads the study header', () => {
    expect(model.fileOid).toBe('DZIF-Kerndatensatz');
    expect(model.odmVersion).toBe('1.3.2');
    expect(model.sourceSystem).toBe('OpenEDC');
    expect(model.studyName).toBe('46192_DZIF-Kerndatensatz');
    expect(model.protocolName).toBe('DZIF-Kerndatensatz');
    expect(model.studyOid).toBe('S.1');
    expect(model.metaDataVersionOid).toBe('MDV.1');
  });

  it('finds both languages, German first', () => {
    expect(model.languages).toEqual(['de', 'en']);
  });

  it('reads every definition', () => {
    expect(model.formDefs.size).toBe(19);
    expect(model.itemGroupDefs.size).toBe(256);
    expect(model.itemDefs.size).toBe(825);
    expect(model.codeLists.size).toBe(382);
    expect(model.conditions.size).toBe(839);
    expect(model.units.size).toBe(19);
  });

  it('resolves one study event with all forms in protocol order', () => {
    expect(model.events).toHaveLength(1);
    const event = model.events[0]!;
    expect(event.def.oid).toBe('SE.1');
    expect(event.forms).toHaveLength(19);
    expect(event.forms.map((form) => form.def.oid).slice(0, 4)).toEqual([
      'F.20',
      'F.21',
      'F.1',
      'F.3',
    ]);
  });

  it('places every item in the tree exactly once', () => {
    expect(model.itemNodeIds).toHaveLength(825);
    expect(new Set(model.itemNodeIds).size).toBe(825);
    const groupCount = model.events.flatMap((event) => event.forms).flatMap((form) => form.groups)
      .length;
    expect(groupCount).toBe(256);
  });

  it('builds node ids from the OID path', () => {
    const node = model.nodesById.get('SE.1/F.1/IG.1/I.1');
    expect(node?.kind).toBe('item');
    expect(node && node.kind === 'item' && node.def.name).toBe('PERSON_CONSENT');
  });

  it('reads questions, code lists and comments of an item', () => {
    const item = model.itemDefs.get('I.1')!;
    expect(item.name).toBe('PERSON_CONSENT');
    expect(item.dataType).toBe('text');
    expect(item.question.de).toBe(
      'Gibt es eine Einwilligungserklärung des Patienten/Teilnehmers für die Studie?*',
    );
    expect(item.question.en).toContain('declaration of consent');
    expect(item.codeListOid).toBe('CL.1');

    const withComment = model.itemDefs.get('I.11')!;
    expect(withComment.comment.de).toContain('Lebensjahr');
    expect(withComment.comment.en).toContain('DZG core dataset item version 2');
    // Empty JSON comments must not leak through as empty strings.
    expect(model.itemDefs.get('I.1')!.comment).toEqual({});
  });

  it('reads code list items in document order', () => {
    const list = model.codeLists.get('CL.1')!;
    expect(list.items.map((item) => item.codedValue)).toEqual(['Y', 'N', 'P', 'X']);
    expect(list.items[0]!.decode.de).toBe('Ja');
    expect(list.items[0]!.decode.en).toBe('Yes');
  });

  it('reads range checks and measurement units', () => {
    const item = model.itemDefs.get('I.23')!;
    expect(item.rangeChecks).toEqual([
      { comparator: 'LT', softHard: 'Hard', checkValues: ['1'], errorText: {} },
      { comparator: 'GT', softHard: 'Hard', checkValues: ['999'], errorText: {} },
    ]);
    const withUnit = [...model.itemDefs.values()].find(
      (candidate) => candidate.measurementUnitOids.length > 0,
    );
    expect(withUnit).toBeDefined();
    expect(model.units.get(withUnit!.measurementUnitOids[0]!)).toBeDefined();
  });

  it('marks mandatory core-dataset items via the * marker', () => {
    const items = model.itemNodeIds
      .map((id) => model.nodesById.get(id)!)
      .filter((node): node is Extract<typeof node, { kind: 'item' }> => node.kind === 'item');
    expect(items.filter((node) => node.core)).toHaveLength(350);
    // 349 questions carry the marker in both languages; I.681 only in English.
    const inconsistent = items.filter((node) => node.coreMarkerInconsistent);
    expect(inconsistent.map((node) => node.def.oid)).toEqual(['I.681']);
  });

  it('keeps ItemRef attributes per position', () => {
    const node = model.nodesById.get('SE.1/F.1/IG.1/I.2');
    expect(node?.kind).toBe('item');
    if (node?.kind !== 'item') return;
    expect(node.ref.mandatory).toBe(true);
    expect(node.ref.collectionExceptionConditionOid).toBe('C.1');
  });

  it('parses every formal expression in the file', () => {
    const unparsed = [...model.conditions.values()].filter((condition) => !condition.ast);
    expect(unparsed).toEqual([]);
  });

  it('extracts the items a condition depends on', () => {
    const condition = model.conditions.get('C.1')!;
    expect(condition.expression).toBe('!(I.1 == "Y" OR I.1 == "P")');
    expect(condition.references.map((ref) => ref.itemOid)).toEqual(['I.1']);

    const crossForm = [...model.conditions.values()].find((candidate) =>
      candidate.references.some((ref) => ref.formOid),
    )!;
    expect(crossForm.references.some((ref) => ref.formOid?.startsWith('F.'))).toBe(true);
  });

  it('flags the expressions that mix AND and OR without parentheses', () => {
    const ambiguous = [...model.conditions.values()].filter(
      (condition) => condition.ambiguousPrecedence,
    );
    expect(ambiguous).toHaveLength(6);
  });

  it('rejects files that are not ODM', () => {
    expect(() => parseOdmString('<html><body/></html>')).toThrow(/not an ODM file/i);
    expect(() => parseOdmString('<ODM')).toThrow(/not valid XML/i);
  });
});

describe('formal expressions', () => {
  it('parses a plain comparison', () => {
    const { ast } = parseFormalExpression('I.1 == "Y"');
    expect(ast).toEqual({
      kind: 'comparison',
      left: { path: 'I.1', itemOid: 'I.1' },
      operator: '==',
      right: 'Y',
    });
  });

  it('gives AND a tighter binding than OR', () => {
    const { ast, ambiguousPrecedence } = parseFormalExpression(
      'I.1 == "A" OR I.2 == "B" AND I.3 == "C"',
    );
    expect(ambiguousPrecedence).toBe(true);
    expect(ast.kind).toBe('or');
    if (ast.kind !== 'or') return;
    expect(ast.operands[1]!.kind).toBe('and');
  });

  it('honours explicit parentheses without flagging ambiguity', () => {
    const { ambiguousPrecedence } = parseFormalExpression('(I.1 == "A" OR I.2 == "B") AND I.3 == "C"');
    expect(ambiguousPrecedence).toBe(false);
  });

  it('splits qualified OID paths', () => {
    expect(parseConditionRef('F.4-IG.22-I.42')).toEqual({
      path: 'F.4-IG.22-I.42',
      itemOid: 'I.42',
      formOid: 'F.4',
      itemGroupOid: 'IG.22',
    });
    expect(parseConditionRef('IG.15-I.28')).toEqual({
      path: 'IG.15-I.28',
      itemOid: 'I.28',
      itemGroupOid: 'IG.15',
    });
  });

  it('turns a collect-unless condition into show-when logic', () => {
    const { ast } = parseFormalExpression('!(I.1 == "Y" OR I.1 == "P")');
    // The ODM condition hides the item; negating it yields the show condition.
    expect(negate(ast)).toEqual({
      kind: 'or',
      operands: [
        { kind: 'comparison', left: { path: 'I.1', itemOid: 'I.1' }, operator: '==', right: 'Y' },
        { kind: 'comparison', left: { path: 'I.1', itemOid: 'I.1' }, operator: '==', right: 'P' },
      ],
    });
  });

  it('applies De Morgan when negating', () => {
    const { ast } = parseFormalExpression('I.1 == "Y" AND I.2 != "N"');
    expect(negate(ast)).toEqual({
      kind: 'or',
      operands: [
        { kind: 'comparison', left: { path: 'I.1', itemOid: 'I.1' }, operator: '!=', right: 'Y' },
        { kind: 'comparison', left: { path: 'I.2', itemOid: 'I.2' }, operator: '==', right: 'N' },
      ],
    });
  });

  it('rejects malformed expressions', () => {
    expect(() => parseFormalExpression('I.1 ==')).toThrow();
    expect(() => parseFormalExpression('I.1 == "Y" OR')).toThrow();
    expect(() => parseFormalExpression('"unterminated')).toThrow();
  });
});

describe('core marker helpers', () => {
  it('detects and strips the marker', () => {
    expect(isCoreQuestion({ de: 'Alter*' })).toBe(true);
    expect(isCoreQuestion({ de: 'Alter' })).toBe(false);
    expect(stripCoreMarker('Alter*')).toBe('Alter');
    expect(stripCoreMarker('Alter')).toBe('Alter');
  });
});
