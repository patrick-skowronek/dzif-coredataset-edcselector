import { ODM_NS } from '../odm/parse';
import type { I18nText, OdmModel } from '../odm/types';
import type { Selection } from '../selection';
import { buildSubset } from '../selection';
import type { ExportOptions, ExportResult, ReportEntry } from './types';

/**
 * Writes the selected part of the metadata back out as CDISC ODM 1.3.2.
 *
 * This is the lossless export: it keeps both languages, all code lists, units,
 * range checks and conditions, so it can be re-imported into OpenEDC or any other
 * ODM-capable system. Conditions whose referenced items are no longer part of the
 * selection are dropped, because an unresolvable OID would make the file invalid.
 */
export function exportOdmSubset(
  model: OdmModel,
  selection: Selection,
  options: ExportOptions,
): ExportResult {
  const subset = buildSubset(model, selection);
  const report: ReportEntry[] = [];

  const selectedItemOids = new Set(subset.items.map((entry) => entry.node.def.oid));

  // Keep only conditions whose referenced items all survived the selection.
  const keptConditions = new Set<string>();
  const droppedConditions: string[] = [];
  for (const oid of subset.conditionOids) {
    const condition = model.conditions.get(oid);
    if (!condition) continue;
    const resolvable = condition.references.every((reference) =>
      selectedItemOids.has(reference.itemOid),
    );
    if (resolvable) keptConditions.add(oid);
    else droppedConditions.push(oid);
  }
  if (droppedConditions.length > 0) {
    report.push({
      severity: 'warning',
      message: `${droppedConditions.length} skip condition(s) were removed because they read questions that are not part of the selection. Select those questions to keep the logic.`,
    });
  }

  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    tag('ODM', {
      xmlns: ODM_NS,
      FileType: 'Snapshot',
      FileOID: `${model.fileOid}-subset`,
      CreationDateTime: options.timestamp,
      ODMVersion: model.odmVersion ?? '1.3.2',
      SourceSystem: 'DZIF Core Dataset EDC Selector',
      Originator: model.sourceSystem ?? '',
    }),
  );
  out.push(indent(1, tag('Study', { OID: model.studyOid })));
  out.push(indent(2, '<GlobalVariables>'));
  out.push(indent(3, element('StudyName', `${model.studyName} (subset)`)));
  out.push(
    indent(
      3,
      element(
        'StudyDescription',
        `${subset.items.length} of ${model.itemNodeIds.length} questions selected from the DZIF core dataset.\n\n${model.studyDescription}`,
      ),
    ),
  );
  out.push(indent(3, element('ProtocolName', model.protocolName)));
  out.push(indent(2, '</GlobalVariables>'));

  if (subset.unitOids.size > 0) {
    out.push(indent(2, '<BasicDefinitions>'));
    for (const oid of orderedKeys(model.units, subset.unitOids)) {
      const unit = model.units.get(oid)!;
      out.push(indent(3, tag('MeasurementUnit', { OID: unit.oid, Name: unit.name })));
      out.push(...translatedBlock(4, 'Symbol', unit.symbol));
      out.push(indent(3, '</MeasurementUnit>'));
    }
    out.push(indent(2, '</BasicDefinitions>'));
  }

  out.push(
    indent(
      2,
      tag('MetaDataVersion', {
        OID: model.metaDataVersionOid,
        Name: model.metaDataVersionName ?? 'MetaDataVersion',
      }),
    ),
  );

  out.push(indent(3, '<Protocol>'));
  for (const { event } of subset.events) {
    out.push(
      indent(4, selfClosing('StudyEventRef', { StudyEventOID: event.def.oid, Mandatory: 'No' })),
    );
  }
  out.push(indent(3, '</Protocol>'));

  for (const { event, forms } of subset.events) {
    out.push(
      indent(
        3,
        tag('StudyEventDef', {
          OID: event.def.oid,
          Name: event.def.name,
          Repeating: event.def.repeating ? 'Yes' : 'No',
          ...(event.def.type ? { Type: event.def.type } : {}),
        }),
      ),
    );
    out.push(...translatedBlock(4, 'Description', event.def.description));
    for (const { form } of forms) {
      out.push(
        indent(
          4,
          selfClosing('FormRef', {
            FormOID: form.def.oid,
            Mandatory: form.ref.mandatory ? 'Yes' : 'No',
            ...conditionAttribute(form.ref.collectionExceptionConditionOid, keptConditions),
          }),
        ),
      );
    }
    out.push(indent(3, '</StudyEventDef>'));
  }

  for (const { forms } of subset.events) {
    for (const { form, groups } of forms) {
      out.push(
        indent(
          3,
          tag('FormDef', {
            OID: form.def.oid,
            Name: form.def.name,
            Repeating: form.def.repeating ? 'Yes' : 'No',
          }),
        ),
      );
      out.push(...translatedBlock(4, 'Description', form.def.description));
      for (const { group } of groups) {
        out.push(
          indent(
            4,
            selfClosing('ItemGroupRef', {
              ItemGroupOID: group.def.oid,
              Mandatory: group.ref.mandatory ? 'Yes' : 'No',
              ...conditionAttribute(group.ref.collectionExceptionConditionOid, keptConditions),
            }),
          ),
        );
      }
      out.push(indent(3, '</FormDef>'));
    }
  }

  for (const { forms } of subset.events) {
    for (const { groups } of forms) {
      for (const { group, items } of groups) {
        out.push(
          indent(
            3,
            tag('ItemGroupDef', {
              OID: group.def.oid,
              Name: group.def.name,
              Repeating: group.def.repeating ? 'Yes' : 'No',
            }),
          ),
        );
        out.push(...translatedBlock(4, 'Description', group.def.description));
        for (const item of items) {
          out.push(
            indent(
              4,
              selfClosing('ItemRef', {
                ItemOID: item.def.oid,
                Mandatory: item.ref.mandatory ? 'Yes' : 'No',
                ...(item.ref.keySequence !== undefined
                  ? { KeySequence: String(item.ref.keySequence) }
                  : {}),
                ...conditionAttribute(item.ref.collectionExceptionConditionOid, keptConditions),
              }),
            ),
          );
        }
        out.push(indent(3, '</ItemGroupDef>'));
      }
    }
  }

  for (const { node } of subset.items) {
    const def = node.def;
    out.push(
      indent(
        3,
        tag('ItemDef', {
          OID: def.oid,
          Name: def.name,
          DataType: def.dataType,
          ...(def.length !== undefined ? { Length: String(def.length) } : {}),
          ...(def.significantDigits !== undefined
            ? { SignificantDigits: String(def.significantDigits) }
            : {}),
        }),
      ),
    );
    out.push(...translatedBlock(4, 'Question', def.question));
    for (const unitOid of def.measurementUnitOids) {
      out.push(indent(4, selfClosing('MeasurementUnitRef', { MeasurementUnitOID: unitOid })));
    }
    for (const check of def.rangeChecks) {
      out.push(
        indent(4, tag('RangeCheck', { Comparator: check.comparator, SoftHard: check.softHard })),
      );
      for (const value of check.checkValues) {
        out.push(indent(5, element('CheckValue', value)));
      }
      out.push(indent(4, '</RangeCheck>'));
    }
    if (def.codeListOid) {
      out.push(indent(4, selfClosing('CodeListRef', { CodeListOID: def.codeListOid })));
    }
    out.push(indent(3, '</ItemDef>'));
  }

  for (const oid of orderedKeys(model.codeLists, subset.codeListOids)) {
    const list = model.codeLists.get(oid)!;
    out.push(
      indent(3, tag('CodeList', { OID: list.oid, Name: list.name, DataType: list.dataType })),
    );
    for (const item of list.items) {
      out.push(indent(4, tag('CodeListItem', { CodedValue: item.codedValue })));
      out.push(...translatedBlock(5, 'Decode', item.decode));
      out.push(indent(4, '</CodeListItem>'));
    }
    out.push(indent(3, '</CodeList>'));
  }

  for (const oid of orderedKeys(model.conditions, keptConditions)) {
    const condition = model.conditions.get(oid)!;
    out.push(indent(3, tag('ConditionDef', { OID: condition.oid, Name: condition.name })));
    out.push(...translatedBlock(4, 'Description', condition.description));
    out.push(
      indent(4, `<FormalExpression Context="OpenEDC">${escapeXml(condition.expression)}</FormalExpression>`),
    );
    out.push(indent(3, '</ConditionDef>'));
  }

  out.push(indent(2, '</MetaDataVersion>'));
  out.push(indent(1, '</Study>'));
  out.push('</ODM>');

  report.push({
    severity: 'info',
    message:
      'The ODM subset keeps both languages and all metadata. It can be re-imported into OpenEDC (Import → ODM XML) and other CDISC-capable systems.',
  });

  return {
    files: [
      {
        name: 'dzif_coredataset_subset.xml',
        mimeType: 'application/xml;charset=utf-8',
        content: out.join('\n') + '\n',
      },
    ],
    report,
  };
}

/** Keys of `wanted`, in the order they appear in `source`, so output stays stable. */
function orderedKeys<T>(source: Map<string, T>, wanted: Set<string>): string[] {
  return [...source.keys()].filter((key) => wanted.has(key));
}

function conditionAttribute(
  oid: string | undefined,
  kept: Set<string>,
): Record<string, string> {
  return oid && kept.has(oid) ? { CollectionExceptionConditionOID: oid } : {};
}

function translatedBlock(level: number, name: string, text: I18nText): string[] {
  const entries = Object.entries(text).filter(([, value]) => value.trim() !== '');
  if (entries.length === 0) return [];
  const lines = [indent(level, `<${name}>`)];
  for (const [lang, value] of entries) {
    const attributes = lang === '' ? '' : ` xml:lang="${escapeXml(lang)}"`;
    lines.push(indent(level + 1, `<TranslatedText${attributes}>${escapeXml(value)}</TranslatedText>`));
  }
  lines.push(indent(level, `</${name}>`));
  return lines;
}

function tag(name: string, attributes: Record<string, string>): string {
  return `<${name}${renderAttributes(attributes)}>`;
}

function selfClosing(name: string, attributes: Record<string, string>): string {
  return `<${name}${renderAttributes(attributes)}/>`;
}

function element(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function renderAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');
}

function indent(level: number, text: string): string {
  return `${'    '.repeat(level)}${text}`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
