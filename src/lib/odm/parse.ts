import { parseFormalExpression } from './condition';
import type {
  CodeList,
  CodeListItem,
  ConditionDef,
  ElementRef,
  EventNode,
  FormDef,
  FormNode,
  GroupNode,
  I18nText,
  ItemDef,
  ItemGroupDef,
  ItemNode,
  Lang,
  MeasurementUnit,
  NodeId,
  OdmDataType,
  OdmModel,
  RangeCheck,
  StudyEventDef,
  TreeNode,
} from './types';

export const ODM_NS = 'http://www.cdisc.org/ns/odm/v1.3';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** Marker used by the DZIF core dataset to flag a mandatory question. */
const CORE_MARKER = '*';

export class OdmParseError extends Error {}

function children(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) result.push(child);
  }
  return result;
}

function child(parent: Element, localName: string): Element | undefined {
  return children(parent, localName)[0];
}

/** Collect `<TranslatedText xml:lang="…">` children of `element`'s `localName` child. */
function translatedText(parent: Element | undefined, localName?: string): I18nText {
  if (!parent) return {};
  const host = localName ? child(parent, localName) : parent;
  if (!host) return {};
  const result: I18nText = {};
  for (const node of children(host, 'TranslatedText')) {
    const lang = node.getAttributeNS(XML_NS, 'lang') ?? node.getAttribute('xml:lang') ?? '';
    result[lang] = (node.textContent ?? '').trim();
  }
  return result;
}

/**
 * OpenEDC stores item/group hints as JSON in the `Comment` attribute
 * (`{"de":"…","en":"…"}`). Anything else is kept as a language-less comment.
 */
function parseComment(element: Element): I18nText {
  const raw = element.getAttribute('Comment');
  if (!raw) return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const result: I18nText = {};
      for (const [lang, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.trim() !== '') result[lang] = value.trim();
      }
      return result;
    } catch {
      /* fall through to the raw string */
    }
  }
  return trimmed === '' ? {} : { '': trimmed };
}

function elementRef(element: Element, oidAttribute: string): ElementRef {
  const oid = element.getAttribute(oidAttribute);
  if (!oid) throw new OdmParseError(`<${element.localName}> is missing ${oidAttribute}`);
  const ref: ElementRef = {
    oid,
    mandatory: element.getAttribute('Mandatory') === 'Yes',
  };
  const condition = element.getAttribute('CollectionExceptionConditionOID');
  if (condition) ref.collectionExceptionConditionOid = condition;
  const keySequence = element.getAttribute('KeySequence');
  if (keySequence) ref.keySequence = Number(keySequence);
  const orderNumber = element.getAttribute('OrderNumber');
  if (orderNumber) ref.orderNumber = Number(orderNumber);
  return ref;
}

function requireAttribute(element: Element, name: string): string {
  const value = element.getAttribute(name);
  if (!value) throw new OdmParseError(`<${element.localName}> is missing ${name}`);
  return value;
}

function optionalNumber(element: Element, name: string): number | undefined {
  const value = element.getAttribute(name);
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRangeCheck(element: Element): RangeCheck {
  return {
    comparator: (element.getAttribute('Comparator') ?? 'EQ') as RangeCheck['comparator'],
    softHard: (element.getAttribute('SoftHard') ?? 'Soft') as RangeCheck['softHard'],
    checkValues: children(element, 'CheckValue').map((node) => (node.textContent ?? '').trim()),
    errorText: translatedText(child(element, 'ErrorMessage')),
  };
}

function parseItemDef(element: Element): ItemDef {
  const def: ItemDef = {
    oid: requireAttribute(element, 'OID'),
    name: requireAttribute(element, 'Name'),
    dataType: (element.getAttribute('DataType') ?? 'text') as OdmDataType,
    question: translatedText(element, 'Question'),
    comment: parseComment(element),
    measurementUnitOids: children(element, 'MeasurementUnitRef')
      .map((node) => node.getAttribute('MeasurementUnitOID'))
      .filter((oid): oid is string => Boolean(oid)),
    rangeChecks: children(element, 'RangeCheck').map(parseRangeCheck),
  };
  const length = optionalNumber(element, 'Length');
  if (length !== undefined) def.length = length;
  const significantDigits = optionalNumber(element, 'SignificantDigits');
  if (significantDigits !== undefined) def.significantDigits = significantDigits;
  const codeListRef = child(element, 'CodeListRef');
  const codeListOid = codeListRef?.getAttribute('CodeListOID');
  if (codeListOid) def.codeListOid = codeListOid;
  return def;
}

function parseCodeList(element: Element): CodeList {
  // ODM allows CodeListItem (coded, with Decode) and EnumeratedItem (coded only).
  const entries: { item: CodeListItem; rank?: number }[] = [];
  let order = 0;
  for (const node of Array.from(element.children)) {
    if (node.localName !== 'CodeListItem' && node.localName !== 'EnumeratedItem') continue;
    const item: CodeListItem = {
      codedValue: node.getAttribute('CodedValue') ?? '',
      decode: node.localName === 'CodeListItem' ? translatedText(node, 'Decode') : {},
      order: order++,
    };
    const rank = optionalNumber(node, 'Rank');
    entries.push(rank === undefined ? { item } : { item, rank });
  }
  // `Rank` is optional; fall back to document order, and keep it stable when only
  // some items carry a rank.
  const allRanked = entries.length > 0 && entries.every((entry) => entry.rank !== undefined);
  if (allRanked) entries.sort((a, b) => a.rank! - b.rank! || a.item.order - b.item.order);
  const items = entries.map((entry) => entry.item);
  return {
    oid: requireAttribute(element, 'OID'),
    name: element.getAttribute('Name') ?? requireAttribute(element, 'OID'),
    dataType: (element.getAttribute('DataType') ?? 'text') as OdmDataType,
    items,
  };
}

function parseCondition(element: Element): ConditionDef {
  const formalExpression = children(element, 'FormalExpression').find(
    (node) => (node.textContent ?? '').trim() !== '',
  );
  const expression = (formalExpression?.textContent ?? '').trim();
  const condition: ConditionDef = {
    oid: requireAttribute(element, 'OID'),
    name: element.getAttribute('Name') ?? requireAttribute(element, 'OID'),
    description: translatedText(child(element, 'Description')),
    expression,
    ambiguousPrecedence: false,
    references: [],
  };
  if (expression !== '') {
    try {
      const parsed = parseFormalExpression(expression);
      condition.ast = parsed.ast;
      condition.ambiguousPrecedence = parsed.ambiguousPrecedence;
      condition.references = parsed.references;
    } catch {
      // Keep the raw expression; exporters degrade to "logic not translated".
    }
  }
  return condition;
}

/**
 * How a file marks the questions of the mandatory core dataset.
 *
 * `marker`    the question text ends with `*`, the convention DZIF documents in the
 *             study description (used from version 46192 on)
 * `mandatory` no question carries `*` anywhere in the file, so `ItemRef
 *             Mandatory="Yes"` is the only signal available (version 46190)
 */
export type CoreRule = 'marker' | 'mandatory';

/**
 * Whether the core-dataset marker is present in no, some or all translations.
 * `partial` means the source file is inconsistent — the app surfaces those so
 * they can be reported back to DZIF.
 */
export function coreMarkerStatus(question: I18nText): 'none' | 'partial' | 'all' {
  const texts = Object.values(question);
  if (texts.length === 0) return 'none';
  const marked = texts.filter((text) => text.trimEnd().endsWith(CORE_MARKER)).length;
  if (marked === 0) return 'none';
  return marked === texts.length ? 'all' : 'partial';
}

/** True when a question is marked as part of the mandatory DZIF core dataset. */
export function isCoreQuestion(question: I18nText): boolean {
  return coreMarkerStatus(question) !== 'none';
}

/** Question text without the trailing core-dataset marker. */
export function stripCoreMarker(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith(CORE_MARKER) ? trimmed.slice(0, -1).trimEnd() : trimmed;
}

export function parseOdmDocument(doc: Document): OdmModel {
  const odm = doc.documentElement;
  if (!odm || odm.localName !== 'ODM') {
    throw new OdmParseError('Not an ODM file: the root element is not <ODM>.');
  }
  const study = child(odm, 'Study');
  if (!study) throw new OdmParseError('The ODM file contains no <Study> element.');
  const mdv = child(study, 'MetaDataVersion');
  if (!mdv) throw new OdmParseError('The <Study> element contains no <MetaDataVersion>.');

  const globals = child(study, 'GlobalVariables');
  const basics = child(study, 'BasicDefinitions');

  const units = new Map<string, MeasurementUnit>();
  if (basics) {
    for (const node of children(basics, 'MeasurementUnit')) {
      const oid = requireAttribute(node, 'OID');
      units.set(oid, {
        oid,
        name: node.getAttribute('Name') ?? oid,
        symbol: translatedText(child(node, 'Symbol')),
      });
    }
  }

  const itemDefs = new Map<string, ItemDef>();
  for (const node of children(mdv, 'ItemDef')) {
    const def = parseItemDef(node);
    itemDefs.set(def.oid, def);
  }

  // Older releases of the core dataset do not use the `*` marker at all; there the
  // ODM `Mandatory` flag is the only signal left to go by.
  const markedItems = [...itemDefs.values()].filter(
    (def) => coreMarkerStatus(def.question) !== 'none',
  ).length;
  const coreRule: CoreRule = markedItems > 0 ? 'marker' : 'mandatory';

  const itemGroupDefs = new Map<string, ItemGroupDef>();
  for (const node of children(mdv, 'ItemGroupDef')) {
    const oid = requireAttribute(node, 'OID');
    itemGroupDefs.set(oid, {
      oid,
      name: node.getAttribute('Name') ?? oid,
      repeating: node.getAttribute('Repeating') === 'Yes',
      description: translatedText(child(node, 'Description')),
      comment: parseComment(node),
      itemRefs: children(node, 'ItemRef').map((ref) => elementRef(ref, 'ItemOID')),
    });
  }

  const formDefs = new Map<string, FormDef>();
  for (const node of children(mdv, 'FormDef')) {
    const oid = requireAttribute(node, 'OID');
    formDefs.set(oid, {
      oid,
      name: node.getAttribute('Name') ?? oid,
      repeating: node.getAttribute('Repeating') === 'Yes',
      description: translatedText(child(node, 'Description')),
      comment: parseComment(node),
      itemGroupRefs: children(node, 'ItemGroupRef').map((ref) => elementRef(ref, 'ItemGroupOID')),
    });
  }

  const eventDefs = new Map<string, StudyEventDef>();
  for (const node of children(mdv, 'StudyEventDef')) {
    const oid = requireAttribute(node, 'OID');
    const def: StudyEventDef = {
      oid,
      name: node.getAttribute('Name') ?? oid,
      repeating: node.getAttribute('Repeating') === 'Yes',
      description: translatedText(child(node, 'Description')),
      formRefs: children(node, 'FormRef').map((ref) => elementRef(ref, 'FormOID')),
    };
    const type = node.getAttribute('Type');
    if (type) def.type = type;
    eventDefs.set(oid, def);
  }

  const codeLists = new Map<string, CodeList>();
  for (const node of children(mdv, 'CodeList')) {
    const list = parseCodeList(node);
    codeLists.set(list.oid, list);
  }

  const conditions = new Map<string, ConditionDef>();
  for (const node of children(mdv, 'ConditionDef')) {
    const condition = parseCondition(node);
    conditions.set(condition.oid, condition);
  }

  // --- resolve the tree -----------------------------------------------------
  const nodesById = new Map<NodeId, TreeNode>();
  const itemNodeIds: NodeId[] = [];
  const nodeIdsByItemOid = new Map<string, NodeId[]>();

  const protocol = child(mdv, 'Protocol');
  const eventRefs = protocol
    ? children(protocol, 'StudyEventRef').map((ref) => elementRef(ref, 'StudyEventOID'))
    : [...eventDefs.keys()].map((oid) => ({ oid, mandatory: false }) satisfies ElementRef);

  const events: EventNode[] = [];
  for (const eventRef of eventRefs) {
    const eventDef = eventDefs.get(eventRef.oid);
    if (!eventDef) continue;
    const eventNode: EventNode = { kind: 'event', id: eventDef.oid, def: eventDef, forms: [] };
    for (const formRef of eventDef.formRefs) {
      const formDef = formDefs.get(formRef.oid);
      if (!formDef) continue;
      const formNode: FormNode = {
        kind: 'form',
        id: `${eventNode.id}/${formDef.oid}`,
        def: formDef,
        ref: formRef,
        parentId: eventNode.id,
        groups: [],
      };
      for (const groupRef of formDef.itemGroupRefs) {
        const groupDef = itemGroupDefs.get(groupRef.oid);
        if (!groupDef) continue;
        const groupNode: GroupNode = {
          kind: 'group',
          id: `${formNode.id}/${groupDef.oid}`,
          def: groupDef,
          ref: groupRef,
          parentId: formNode.id,
          items: [],
        };
        for (const itemRef of groupDef.itemRefs) {
          const itemDef = itemDefs.get(itemRef.oid);
          if (!itemDef) continue;
          const markerStatus = coreMarkerStatus(itemDef.question);
          const itemNode: ItemNode = {
            kind: 'item',
            id: `${groupNode.id}/${itemDef.oid}`,
            def: itemDef,
            ref: itemRef,
            parentId: groupNode.id,
            core: coreRule === 'marker' ? markerStatus !== 'none' : itemRef.mandatory,
            coreMarkerInconsistent: markerStatus === 'partial',
          };
          groupNode.items.push(itemNode);
          nodesById.set(itemNode.id, itemNode);
          itemNodeIds.push(itemNode.id);
          const siblings = nodeIdsByItemOid.get(itemDef.oid);
          if (siblings) siblings.push(itemNode.id);
          else nodeIdsByItemOid.set(itemDef.oid, [itemNode.id]);
        }
        formNode.groups.push(groupNode);
        nodesById.set(groupNode.id, groupNode);
      }
      eventNode.forms.push(formNode);
      nodesById.set(formNode.id, formNode);
    }
    events.push(eventNode);
    nodesById.set(eventNode.id, eventNode);
  }

  // --- languages, ordered by how often they appear --------------------------
  const languageCounts = new Map<Lang, number>();
  for (const node of Array.from(odm.getElementsByTagNameNS(ODM_NS, 'TranslatedText'))) {
    const lang = node.getAttributeNS(XML_NS, 'lang') ?? node.getAttribute('xml:lang');
    if (!lang) continue;
    languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
  }
  const languages = [...languageCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lang]) => lang);

  const model: OdmModel = {
    fileOid: odm.getAttribute('FileOID') ?? '',
    studyOid: requireAttribute(study, 'OID'),
    metaDataVersionOid: requireAttribute(mdv, 'OID'),
    studyName: child(globals ?? study, 'StudyName')?.textContent?.trim() ?? '',
    studyDescription: child(globals ?? study, 'StudyDescription')?.textContent?.trim() ?? '',
    protocolName: child(globals ?? study, 'ProtocolName')?.textContent?.trim() ?? '',
    languages: languages.length > 0 ? languages : ['en'],
    coreRule,
    events,
    itemDefs,
    itemGroupDefs,
    formDefs,
    codeLists,
    units,
    conditions,
    nodesById,
    itemNodeIds,
    nodeIdsByItemOid,
  };
  const creationDateTime = odm.getAttribute('CreationDateTime');
  if (creationDateTime) model.creationDateTime = creationDateTime;
  const sourceSystem = odm.getAttribute('SourceSystem');
  if (sourceSystem) model.sourceSystem = sourceSystem;
  const odmVersion = odm.getAttribute('ODMVersion');
  if (odmVersion) model.odmVersion = odmVersion;
  const mdvName = mdv.getAttribute('Name');
  if (mdvName) model.metaDataVersionName = mdvName;
  return model;
}

export function parseOdmString(xml: string): OdmModel {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new OdmParseError(`The file is not valid XML: ${parseError.textContent?.trim() ?? ''}`);
  }
  return parseOdmDocument(doc);
}
