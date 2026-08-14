import type { OdmModel } from '../odm/types';
import type { Selection } from '../selection';
import type { ExportFile } from './types';

/**
 * The save file of the app: a selection that can be shared with colleagues and
 * re-opened later. Item OIDs are stored (not node paths) so a selection survives
 * small structural changes in a future version of the core dataset.
 */
export interface ProjectFile {
  format: 'dzif-coredataset-selection';
  version: 1;
  savedAt: string;
  source: {
    fileOid: string;
    studyName: string;
    odmCreationDateTime?: string;
  };
  /** Node paths, for an exact restore. */
  nodeIds: string[];
  /** Item OIDs, used when a node path no longer exists. */
  itemOids: string[];
}

export function buildProjectFile(
  model: OdmModel,
  selection: Selection,
  savedAt: string,
): ProjectFile {
  const nodeIds = model.itemNodeIds.filter((id) => selection.has(id));
  const itemOids = nodeIds.map((id) => id.split('/').pop() ?? '');
  const project: ProjectFile = {
    format: 'dzif-coredataset-selection',
    version: 1,
    savedAt,
    source: { fileOid: model.fileOid, studyName: model.studyName },
    nodeIds,
    itemOids,
  };
  if (model.creationDateTime) project.source.odmCreationDateTime = model.creationDateTime;
  return project;
}

export function projectFileToExport(project: ProjectFile): ExportFile {
  return {
    name: 'dzif_selection.json',
    mimeType: 'application/json;charset=utf-8',
    content: `${JSON.stringify(project, null, 2)}\n`,
  };
}

export interface RestoreResult {
  selection: Set<string>;
  /** Item OIDs from the file that no longer exist in the loaded ODM. */
  unknown: string[];
  /** True when node paths did not match and item OIDs were used instead. */
  usedFallback: boolean;
}

export function restoreProjectFile(model: OdmModel, project: unknown): RestoreResult {
  if (
    typeof project !== 'object' ||
    project === null ||
    (project as ProjectFile).format !== 'dzif-coredataset-selection'
  ) {
    throw new Error('This is not a DZIF core dataset selection file.');
  }
  const parsed = project as ProjectFile;
  const selection = new Set<string>();
  const unknown: string[] = [];

  const nodeIds = Array.isArray(parsed.nodeIds) ? parsed.nodeIds : [];
  for (const id of nodeIds) {
    if (model.nodesById.get(id)?.kind === 'item') selection.add(id);
  }

  // Fall back to item OIDs for anything the node paths did not cover.
  const itemOids = Array.isArray(parsed.itemOids) ? parsed.itemOids : [];
  let usedFallback = false;
  for (const oid of itemOids) {
    const candidates = model.nodeIdsByItemOid.get(oid);
    if (!candidates || candidates.length === 0) {
      unknown.push(oid);
      continue;
    }
    if (candidates.some((id) => selection.has(id))) continue;
    usedFallback = true;
    for (const id of candidates) selection.add(id);
  }

  return { selection, unknown, usedFallback };
}
