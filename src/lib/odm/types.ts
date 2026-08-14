/**
 * Typed model for the subset of CDISC ODM 1.3.2 that the DZIF core dataset uses.
 *
 * The ODM file is a flat list of definitions (FormDef, ItemGroupDef, ItemDef, …)
 * wired together by OID references. `parseOdm` resolves those references into a
 * tree of nodes for the UI, while keeping the flat definitions addressable by OID
 * so the exporters can look up code lists, units and conditions.
 */

export type Lang = string;

/** Text in every language the ODM file provides, keyed by `xml:lang`. */
export type I18nText = Record<Lang, string>;

export type OdmDataType =
  | 'text'
  | 'string'
  | 'integer'
  | 'float'
  | 'double'
  | 'date'
  | 'time'
  | 'datetime'
  | 'boolean'
  | 'partialDate'
  | 'partialTime'
  | 'partialDatetime'
  | 'URI';

export type Yes = 'Yes' | 'No';

export interface CodeListItem {
  codedValue: string;
  decode: I18nText;
  /** Position as written in the file; used to keep export order stable. */
  order: number;
}

export interface CodeList {
  oid: string;
  name: string;
  dataType: OdmDataType;
  items: CodeListItem[];
}

export interface MeasurementUnit {
  oid: string;
  name: string;
  symbol: I18nText;
}

export interface RangeCheck {
  /** ODM comparator. OpenEDC writes these as *violation* conditions — see `numericBounds`. */
  comparator: 'LT' | 'LE' | 'GT' | 'GE' | 'EQ' | 'NE' | 'IN' | 'NOTIN';
  softHard: 'Soft' | 'Hard';
  checkValues: string[];
  errorText?: I18nText;
}

export interface ItemDef {
  oid: string;
  name: string;
  dataType: OdmDataType;
  length?: number;
  significantDigits?: number;
  question: I18nText;
  /** OpenEDC stores per-language item hints as a JSON blob in the `Comment` attribute. */
  comment: I18nText;
  codeListOid?: string;
  measurementUnitOids: string[];
  rangeChecks: RangeCheck[];
}

export interface ItemGroupDef {
  oid: string;
  name: string;
  repeating: boolean;
  description: I18nText;
  comment: I18nText;
  itemRefs: ElementRef[];
}

export interface FormDef {
  oid: string;
  name: string;
  repeating: boolean;
  description: I18nText;
  comment: I18nText;
  itemGroupRefs: ElementRef[];
}

export interface StudyEventDef {
  oid: string;
  name: string;
  repeating: boolean;
  type?: string;
  description: I18nText;
  formRefs: ElementRef[];
}

/** A `*Ref` element: which definition, and the per-position attributes. */
export interface ElementRef {
  oid: string;
  mandatory: boolean;
  /** `CollectionExceptionConditionOID` — when the condition is true the element is *not* collected. */
  collectionExceptionConditionOid?: string;
  keySequence?: number;
  orderNumber?: number;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export interface ConditionRef {
  /** Raw OID path as written, e.g. `F.4-IG.22-I.42` or `I.42`. */
  path: string;
  /** Last segment of the path — the ItemDef OID. */
  itemOid: string;
  formOid?: string;
  itemGroupOid?: string;
}

export type Comparison = {
  kind: 'comparison';
  left: ConditionRef;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=';
  right: string;
};

export type BoolExpr =
  | Comparison
  | { kind: 'and'; operands: BoolExpr[] }
  | { kind: 'or'; operands: BoolExpr[] }
  | { kind: 'not'; operand: BoolExpr };

export interface ConditionDef {
  oid: string;
  name: string;
  description: I18nText;
  /** The `Context="OpenEDC"` formal expression, verbatim. */
  expression: string;
  /** Parsed expression, or `undefined` when the expression could not be parsed. */
  ast?: BoolExpr;
  /** Set when the expression mixes AND and OR without parentheses (precedence is ambiguous). */
  ambiguousPrecedence: boolean;
  /** Every item referenced by the expression, in order of appearance. */
  references: ConditionRef[];
}

// ---------------------------------------------------------------------------
// Resolved tree
// ---------------------------------------------------------------------------

/** A node id is the path of OIDs from the study event down, e.g. `SE.1/F.1/IG.1/I.2`. */
export type NodeId = string;

export interface ItemNode {
  kind: 'item';
  id: NodeId;
  def: ItemDef;
  ref: ElementRef;
  parentId: NodeId;
  /** Part of the mandatory DZIF core dataset (question text is marked with `*`). */
  core: boolean;
  /** The `*` marker is present in some translations but not all — a source-data defect. */
  coreMarkerInconsistent: boolean;
}

export interface GroupNode {
  kind: 'group';
  id: NodeId;
  def: ItemGroupDef;
  ref: ElementRef;
  parentId: NodeId;
  items: ItemNode[];
}

export interface FormNode {
  kind: 'form';
  id: NodeId;
  def: FormDef;
  ref: ElementRef;
  parentId: NodeId;
  groups: GroupNode[];
}

export interface EventNode {
  kind: 'event';
  id: NodeId;
  def: StudyEventDef;
  forms: FormNode[];
}

export type TreeNode = EventNode | FormNode | GroupNode | ItemNode;

export interface OdmModel {
  fileOid: string;
  creationDateTime?: string;
  sourceSystem?: string;
  odmVersion?: string;
  studyOid: string;
  metaDataVersionOid: string;
  metaDataVersionName?: string;
  studyName: string;
  studyDescription: string;
  protocolName: string;
  /** Languages found anywhere in the file, most frequent first. */
  languages: Lang[];
  /** How this file marks the mandatory core dataset — see `CoreRule` in parse.ts. */
  coreRule: 'marker' | 'mandatory';
  events: EventNode[];
  itemDefs: Map<string, ItemDef>;
  itemGroupDefs: Map<string, ItemGroupDef>;
  formDefs: Map<string, FormDef>;
  codeLists: Map<string, CodeList>;
  units: Map<string, MeasurementUnit>;
  conditions: Map<string, ConditionDef>;
  /** Every node in the tree, keyed by node id. */
  nodesById: Map<NodeId, TreeNode>;
  /** Node ids of item nodes, in document order. */
  itemNodeIds: NodeId[];
  /** Item node ids that use a given ItemDef OID (an ItemDef may be referenced more than once). */
  nodeIdsByItemOid: Map<string, NodeId[]>;
}
