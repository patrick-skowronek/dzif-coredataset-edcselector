import type { OdmModel } from '../odm/types';
import type { Selection } from '../selection';
import { missingDependencies, selectionStats } from '../selection';
import { exportCodebook } from './codebook';
import { exportLimesurvey } from './limesurvey';
import { exportOdmSubset } from './odm';
import { exportRedcap } from './redcap';
import type { ExportFile, ExportOptions, ExportResult, ReportEntry } from './types';

export type TargetId = 'odm' | 'redcap' | 'limesurvey' | 'codebook';

export interface Target {
  id: TargetId;
  label: string;
  /** One sentence on what the user gets and how to import it. */
  description: string;
  run: (model: OdmModel, selection: Selection, options: ExportOptions) => ExportResult;
}

export const targets: Target[] = [
  {
    id: 'redcap',
    label: 'REDCap data dictionary',
    description:
      'CSV for Project Setup → Data Dictionary → Upload, plus a variable mapping file.',
    run: exportRedcap,
  },
  {
    id: 'limesurvey',
    label: 'LimeSurvey structure file',
    description:
      'LimeSurvey XML: one .lsg file per ODM form, or one .lsq per question, plus question and answer code mappings.',
    run: exportLimesurvey,
  },
  {
    id: 'odm',
    label: 'CDISC ODM subset',
    description:
      'Valid ODM 1.3.2 with both languages and all metadata — re-importable into OpenEDC and other CDISC systems.',
    run: exportOdmSubset,
  },
  {
    id: 'codebook',
    label: 'Codebook (CSV)',
    description: 'One row per question, all languages, for any other EDC or for documentation.',
    run: exportCodebook,
  },
];

export interface Bundle {
  files: ExportFile[];
  report: ReportEntry[];
}

/** Run one target and attach the shared selection warnings and a readable report file. */
export function runExport(
  target: Target,
  model: OdmModel,
  selection: Selection,
  options: ExportOptions,
): Bundle {
  const result = target.run(model, selection, options);
  const report = [...selectionReport(model, selection), ...result.report];
  return {
    files: [...result.files, reportFile(target, model, selection, options, report)],
    report,
  };
}

/** Warnings that apply to the selection itself, independent of the target format. */
export function selectionReport(model: OdmModel, selection: Selection): ReportEntry[] {
  const report: ReportEntry[] = [];
  const stats = selectionStats(model, selection);

  if (stats.coreItems < stats.totalCoreItems) {
    report.push({
      severity: 'warning',
      message: `${stats.coreItems} of ${stats.totalCoreItems} mandatory DZIF core dataset questions are selected. A study that has to report the core dataset needs all of them.`,
    });
  } else {
    report.push({
      severity: 'info',
      message: `All ${stats.totalCoreItems} mandatory DZIF core dataset questions are included.`,
    });
  }

  const missing = missingDependencies(model, selection);
  if (missing.size > 0) {
    report.push({
      severity: 'warning',
      message: `${missing.size} selected question(s) have skip logic that reads a question you did not select. Use "Add required questions" to fix this before exporting.`,
    });
  }

  const inconsistent = model.itemNodeIds
    .map((id) => model.nodesById.get(id))
    .filter((node) => node?.kind === 'item' && node.coreMarkerInconsistent && selection.has(node.id));
  if (inconsistent.length > 0) {
    report.push({
      severity: 'warning',
      message: `${inconsistent.length} selected question(s) carry the mandatory marker "*" in only some languages in the source ODM file — please report this to the DZIF core dataset maintainers.`,
    });
  }
  return report;
}

function reportFile(
  target: Target,
  model: OdmModel,
  selection: Selection,
  options: ExportOptions,
  report: ReportEntry[],
): ExportFile {
  const stats = selectionStats(model, selection);
  const lines = [
    `DZIF Core Dataset EDC Selector — ${target.label}`,
    '='.repeat(60),
    '',
    `Source file          ${model.fileOid} (${model.studyName})`,
    `ODM created          ${model.creationDateTime ?? 'unknown'}`,
    `Exported             ${options.timestamp || 'unknown'}`,
    `Export language      ${options.language}`,
    `Questions selected   ${stats.items} of ${stats.totalItems}`,
    `Core dataset         ${stats.coreItems} of ${stats.totalCoreItems} mandatory questions`,
    `Forms / groups       ${stats.forms} / ${stats.groups}`,
    '',
    'Notes on this conversion',
    '-'.repeat(60),
  ];
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...report].sort((a, b) => order[a.severity] - order[b.severity]);
  if (sorted.length === 0) lines.push('Nothing to report.');
  for (const entry of sorted) {
    const scope = entry.scope ? ` [${entry.scope}]` : '';
    lines.push(`- ${entry.severity.toUpperCase()}${scope}: ${entry.message}`);
  }
  lines.push(
    '',
    'Before you import',
    '-'.repeat(60),
    'This tool selects questions from the DZIF core dataset for your questionnaire and',
    'prepares them for one of the EDC systems. Check the files before you use them in',
    'production, and read the notes above.',
    '',
    'Importing into your EDC system is at your own risk. Make a backup of your project',
    'first — in many systems an import cannot easily be undone.',
    '',
    'Which questions you collect affects your data protection concept, your informed',
    'consent form and further legal requirements. Agree your selection with the',
    'responsible people at your institution, and ask for support if you are unsure.',
    '',
    'DZIF Core Dataset EDC Selector, Apache License 2.0. The DZIF core dataset itself is',
    'DZIF content; the authoritative version is published in the MDM portal at',
    'https://mdm.mi.uni-heidelberg.de/46192?form-id=5',
  );
  return {
    name: 'dzif_export_report.txt',
    mimeType: 'text/plain;charset=utf-8',
    content: lines.join('\n') + '\n',
  };
}

export { exportCodebook, exportLimesurvey, exportOdmSubset, exportRedcap };
export type { ExportFile, ExportOptions, ExportResult, ReportEntry };
