import type {
  ConditionDef,
  EventNode,
  FormNode,
  GroupNode,
  ItemNode,
  NodeId,
  OdmModel,
} from './odm/types';

/** Item node ids the user has picked. Groups and forms are derived from this. */
export type Selection = ReadonlySet<NodeId>;

export type CheckState = 'none' | 'partial' | 'all';

export interface SelectedItem {
  node: ItemNode;
  group: GroupNode;
  form: FormNode;
  event: EventNode;
}

export interface SubsetGroup {
  group: GroupNode;
  items: ItemNode[];
}

export interface SubsetForm {
  form: FormNode;
  groups: SubsetGroup[];
}

export interface SubsetEvent {
  event: EventNode;
  forms: SubsetForm[];
}

/**
 * The selected part of the metadata, with every definition it still needs.
 * Every exporter works from this so they all agree on what "selected" means.
 */
export interface Subset {
  model: OdmModel;
  events: SubsetEvent[];
  items: SelectedItem[];
  /** Item node ids in document order. */
  itemIds: NodeId[];
  codeListOids: Set<string>;
  unitOids: Set<string>;
  /** Conditions still referenced by a selected item, group or form. */
  conditionOids: Set<string>;
  itemGroupOids: Set<string>;
  formOids: Set<string>;
}

export function itemNodesOf(model: OdmModel): ItemNode[] {
  return model.itemNodeIds.map((id) => model.nodesById.get(id) as ItemNode);
}

/** Every item node whose question carries the DZIF core-dataset marker. */
export function coreSelection(model: OdmModel): Set<NodeId> {
  return new Set(itemNodesOf(model).filter((node) => node.core).map((node) => node.id));
}

export function allSelection(model: OdmModel): Set<NodeId> {
  return new Set(model.itemNodeIds);
}

// ---------------------------------------------------------------------------
// Tri-state helpers
// ---------------------------------------------------------------------------

export function groupState(group: GroupNode, selection: Selection): CheckState {
  if (group.items.length === 0) return 'none';
  let selected = 0;
  for (const item of group.items) if (selection.has(item.id)) selected++;
  if (selected === 0) return 'none';
  return selected === group.items.length ? 'all' : 'partial';
}

export function formState(form: FormNode, selection: Selection): CheckState {
  return combine(form.groups.map((group) => groupState(group, selection)));
}

export function eventState(event: EventNode, selection: Selection): CheckState {
  return combine(event.forms.map((form) => formState(form, selection)));
}

function combine(states: CheckState[]): CheckState {
  const meaningful = states.filter((state) => state !== undefined);
  if (meaningful.length === 0) return 'none';
  if (meaningful.every((state) => state === 'all')) return 'all';
  if (meaningful.every((state) => state === 'none')) return 'none';
  return 'partial';
}

// ---------------------------------------------------------------------------
// Skip logic dependencies
// ---------------------------------------------------------------------------

/** The conditions that decide whether an item is collected: its own, its group's, its form's. */
export function guardingConditions(model: OdmModel, item: ItemNode): ConditionDef[] {
  const group = model.nodesById.get(item.parentId) as GroupNode | undefined;
  const form = group ? (model.nodesById.get(group.parentId) as FormNode | undefined) : undefined;
  const oids = [
    item.ref.collectionExceptionConditionOid,
    group?.ref.collectionExceptionConditionOid,
    form?.ref.collectionExceptionConditionOid,
  ];
  const conditions: ConditionDef[] = [];
  for (const oid of oids) {
    if (!oid) continue;
    const condition = model.conditions.get(oid);
    if (condition) conditions.push(condition);
  }
  return conditions;
}

/**
 * Item node ids that an item's skip logic reads. A condition names an ItemDef OID,
 * optionally qualified with a form/group; when an ItemDef sits at several places in
 * the tree the qualified path wins, otherwise every occurrence is returned.
 */
export function dependenciesOf(model: OdmModel, item: ItemNode): NodeId[] {
  const dependencies = new Set<NodeId>();
  for (const condition of guardingConditions(model, item)) {
    for (const reference of condition.references) {
      const candidates = model.nodeIdsByItemOid.get(reference.itemOid) ?? [];
      const qualified = candidates.filter((id) => {
        const parts = id.split('/');
        const formOid = parts[1];
        const groupOid = parts[2];
        if (reference.formOid && reference.formOid !== formOid) return false;
        if (reference.itemGroupOid && reference.itemGroupOid !== groupOid) return false;
        return true;
      });
      for (const id of qualified.length > 0 ? qualified : candidates) {
        if (id !== item.id) dependencies.add(id);
      }
    }
  }
  return [...dependencies];
}

/** For each selected item, the dependencies that are *not* selected. */
export function missingDependencies(
  model: OdmModel,
  selection: Selection,
): Map<NodeId, NodeId[]> {
  const missing = new Map<NodeId, NodeId[]>();
  for (const id of selection) {
    const node = model.nodesById.get(id);
    if (node?.kind !== 'item') continue;
    const gaps = dependenciesOf(model, node).filter((dependency) => !selection.has(dependency));
    if (gaps.length > 0) missing.set(id, gaps);
  }
  return missing;
}

/** Add every transitively required dependency to the selection. */
export function withDependencies(model: OdmModel, selection: Selection): Set<NodeId> {
  const result = new Set<NodeId>(selection);
  const queue = [...selection];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const node = model.nodesById.get(id);
    if (node?.kind !== 'item') continue;
    for (const dependency of dependenciesOf(model, node)) {
      if (!result.has(dependency)) {
        result.add(dependency);
        queue.push(dependency);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Subset
// ---------------------------------------------------------------------------

export function buildSubset(model: OdmModel, selection: Selection): Subset {
  const events: SubsetEvent[] = [];
  const items: SelectedItem[] = [];
  const itemIds: NodeId[] = [];
  const codeListOids = new Set<string>();
  const unitOids = new Set<string>();
  const conditionOids = new Set<string>();
  const itemGroupOids = new Set<string>();
  const formOids = new Set<string>();

  for (const event of model.events) {
    const forms: SubsetForm[] = [];
    for (const form of event.forms) {
      const groups: SubsetGroup[] = [];
      for (const group of form.groups) {
        const selected = group.items.filter((item) => selection.has(item.id));
        if (selected.length === 0) continue;
        groups.push({ group, items: selected });
        itemGroupOids.add(group.def.oid);
        if (group.ref.collectionExceptionConditionOid) {
          conditionOids.add(group.ref.collectionExceptionConditionOid);
        }
        for (const item of selected) {
          items.push({ node: item, group, form, event });
          itemIds.push(item.id);
          if (item.def.codeListOid) codeListOids.add(item.def.codeListOid);
          for (const unit of item.def.measurementUnitOids) unitOids.add(unit);
          if (item.ref.collectionExceptionConditionOid) {
            conditionOids.add(item.ref.collectionExceptionConditionOid);
          }
        }
      }
      if (groups.length === 0) continue;
      forms.push({ form, groups });
      formOids.add(form.def.oid);
      if (form.ref.collectionExceptionConditionOid) {
        conditionOids.add(form.ref.collectionExceptionConditionOid);
      }
    }
    if (forms.length > 0) events.push({ event, forms });
  }

  return {
    model,
    events,
    items,
    itemIds,
    codeListOids,
    unitOids,
    conditionOids,
    itemGroupOids,
    formOids,
  };
}

export interface SelectionStats {
  items: number;
  totalItems: number;
  coreItems: number;
  totalCoreItems: number;
  forms: number;
  groups: number;
  missingDependencies: number;
}

export function selectionStats(model: OdmModel, selection: Selection): SelectionStats {
  const nodes = itemNodesOf(model);
  const subset = buildSubset(model, selection);
  return {
    items: subset.items.length,
    totalItems: nodes.length,
    coreItems: subset.items.filter((entry) => entry.node.core).length,
    totalCoreItems: nodes.filter((node) => node.core).length,
    forms: subset.formOids.size,
    groups: subset.itemGroupOids.size,
    missingDependencies: missingDependencies(model, selection).size,
  };
}
