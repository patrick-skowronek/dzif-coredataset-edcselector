import { SvelteSet } from 'svelte/reactivity';
import { defaultExportOptions, type ExportOptions } from './export/types';
import type { UiLang } from './i18n';
import { parseOdmString } from './odm/parse';
import type { FormNode, GroupNode, ItemNode, NodeId, OdmModel } from './odm/types';
import {
  findVersion,
  newestVersion,
  parseVersionManifest,
  type OdmVersion,
} from './odm/versions';
import {
  allSelection,
  buildSubset,
  coreSelection,
  dependenciesOf,
  guardingConditions,
  missingDependencies,
  selectionStats,
  withDependencies,
} from './selection';

export type FilterMode = 'all' | 'core' | 'selected' | 'unselected' | 'logic';

const STORAGE_KEY = 'dzif-edcselector-state-v1';

interface PersistedState {
  selection: NodeId[];
  uiLang: UiLang;
  versionId: string;
}

/** Everything the UI needs, as one reactive object. */
export class AppState {
  model = $state<OdmModel | null>(null);
  loadError = $state<string | null>(null);
  loading = $state(true);

  selection = new SvelteSet<NodeId>();
  expanded = new SvelteSet<NodeId>();
  detailsOpen = new SvelteSet<NodeId>();

  uiLang = $state<UiLang>('de');
  query = $state('');
  filter = $state<FilterMode>('all');

  exportOptions = $state<ExportOptions>({ ...defaultExportOptions });
  /** Notices shown once, e.g. after loading a selection file. */
  notices = $state<string[]>([]);

  /** Versions of the core dataset that ship with the app, newest first. */
  versions = $state<OdmVersion[]>([]);
  /** The version currently loaded. */
  version = $state<OdmVersion | null>(null);
  /** Set while switching versions, so the tree is not rebuilt against a stale model. */
  switching = $state(false);
  /** Restored from storage before the manifest is known. */
  private wantedVersionId: string | null = null;

  // --- derived --------------------------------------------------------------

  get stats() {
    const model = this.model;
    if (!model) return null;
    return selectionStats(model, this.selection);
  }

  get missing(): Map<NodeId, NodeId[]> {
    const model = this.model;
    if (!model) return new Map();
    return missingDependencies(model, this.selection);
  }

  /** Item ids matching the current search and filter. */
  get visibleItems(): Set<NodeId> {
    const model = this.model;
    if (!model) return new Set();
    const needle = this.query.trim().toLowerCase();
    const result = new Set<NodeId>();
    for (const id of model.itemNodeIds) {
      const node = model.nodesById.get(id) as ItemNode;
      if (!this.passesFilter(node)) continue;
      if (needle !== '' && !this.matchesQuery(node, needle)) continue;
      result.add(id);
    }
    return result;
  }

  private passesFilter(node: ItemNode): boolean {
    switch (this.filter) {
      case 'core':
        return node.core;
      case 'selected':
        return this.selection.has(node.id);
      case 'unselected':
        return !this.selection.has(node.id);
      case 'logic':
        return this.model ? guardingConditions(this.model, node).length > 0 : false;
      case 'all':
      default:
        return true;
    }
  }

  private matchesQuery(node: ItemNode, needle: string): boolean {
    if (node.def.name.toLowerCase().includes(needle)) return true;
    if (node.def.oid.toLowerCase().includes(needle)) return true;
    for (const text of Object.values(node.def.question)) {
      if (text.toLowerCase().includes(needle)) return true;
    }
    for (const text of Object.values(node.def.comment)) {
      if (text.toLowerCase().includes(needle)) return true;
    }
    const codeList = node.def.codeListOid
      ? this.model?.codeLists.get(node.def.codeListOid)
      : undefined;
    if (codeList) {
      for (const entry of codeList.items) {
        if (entry.codedValue.toLowerCase().includes(needle)) return true;
        for (const text of Object.values(entry.decode)) {
          if (text.toLowerCase().includes(needle)) return true;
        }
      }
    }
    return false;
  }

  // --- loading --------------------------------------------------------------

  /** Read `versions.json`, then load the remembered version or the newest one. */
  async load(baseUrl: string): Promise<void> {
    this.loading = true;
    this.loadError = null;
    try {
      const response = await fetch(`${baseUrl}odm/versions.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      this.versions = parseVersionManifest(await response.json());
      const wanted =
        findVersion(this.versions, this.wantedVersionId) ?? newestVersion(this.versions);
      await this.loadVersion(wanted, baseUrl);
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      this.loading = false;
    }
  }

  /**
   * Load one version. The selection is kept where the same question still exists;
   * how many questions were dropped is reported as a notice.
   */
  async loadVersion(version: OdmVersion, baseUrl: string): Promise<void> {
    const isSwitch = this.model !== null;
    if (isSwitch) this.switching = true;
    else this.loading = true;
    this.loadError = null;
    try {
      const response = await fetch(`${baseUrl}odm/${version.file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const model = parseOdmString(await response.text());
      const before = this.selection.size;
      this.version = version;
      this.setModel(model);
      if (isSwitch) {
        const dropped = before - this.selection.size;
        this.notices =
          dropped > 0
            ? [`versionSwitchDropped:${dropped}:${version.id}`]
            : [`versionSwitched:${version.id}`];
      }
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.switching = false;
      this.clearSelection()
    }
  }

  private setModel(model: OdmModel): void {
    this.model = model;
    // Exports always carry every language of the file; the first one is the primary
    // (the label language for REDCap, the base language for LimeSurvey).
    const primary = model.languages.includes(this.uiLang)
      ? this.uiLang
      : (model.languages[0] ?? 'en');
    const fallback = model.languages.find((language) => language !== primary) ?? primary;
    this.exportOptions = { ...this.exportOptions, language: primary, fallbackLanguage: fallback };
    // Keep only ids that still exist after loading a different file.
    for (const id of [...this.selection]) {
      if (model.nodesById.get(id)?.kind !== 'item') this.selection.delete(id);
    }
  }

  /** Keep the export's primary language in step with the interface language. */
  syncExportLanguage(): void {
    const model = this.model;
    if (!model) return;
    if (!model.languages.includes(this.uiLang)) return;
    if (this.exportOptions.language === this.uiLang) return;
    const fallback = model.languages.find((language) => language !== this.uiLang) ?? this.uiLang;
    this.exportOptions = {
      ...this.exportOptions,
      language: this.uiLang,
      fallbackLanguage: fallback,
    };
  }

  // --- selection ------------------------------------------------------------

  toggleItem(id: NodeId): void {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
  }

  setItems(ids: Iterable<NodeId>, selected: boolean): void {
    for (const id of ids) {
      if (selected) this.selection.add(id);
      else this.selection.delete(id);
    }
  }

  toggleGroup(group: GroupNode, selected: boolean, onlyVisible = true): void {
    const visible = onlyVisible ? this.visibleItems : null;
    const ids = group.items
      .filter((item) => !visible || visible.has(item.id))
      .map((item) => item.id);
    this.setItems(ids, selected);
  }

  toggleForm(form: FormNode, selected: boolean, onlyVisible = true): void {
    for (const group of form.groups) this.toggleGroup(group, selected, onlyVisible);
  }

  selectCore(): void {
    if (!this.model) return;
    this.selection.clear();
    this.setItems(coreSelection(this.model), true);
  }

  selectAll(): void {
    if (!this.model) return;
    this.setItems(allSelection(this.model), true);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  addDependencies(): void {
    if (!this.model) return;
    this.setItems(withDependencies(this.model, this.selection), true);
  }

  dependencyNames(id: NodeId): { id: NodeId; name: string; selected: boolean }[] {
    const model = this.model;
    if (!model) return [];
    const node = model.nodesById.get(id);
    if (node?.kind !== 'item') return [];
    return dependenciesOf(model, node).map((dependency) => {
      const target = model.nodesById.get(dependency);
      return {
        id: dependency,
        name: target?.kind === 'item' ? target.def.name : dependency,
        selected: this.selection.has(dependency),
      };
    });
  }

  // --- expansion ------------------------------------------------------------

  toggleExpanded(id: NodeId): void {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
  }

  expandAll(): void {
    const model = this.model;
    if (!model) return;
    for (const event of model.events) {
      for (const form of event.forms) {
        this.expanded.add(form.id);
        for (const group of form.groups) this.expanded.add(group.id);
      }
    }
  }

  collapseAll(): void {
    this.expanded.clear();
  }

  toggleDetails(id: NodeId): void {
    if (this.detailsOpen.has(id)) this.detailsOpen.delete(id);
    else this.detailsOpen.add(id);
  }

  get subset() {
    const model = this.model;
    if (!model) return null;
    return buildSubset(model, this.selection);
  }

  // --- persistence ----------------------------------------------------------

  persist(): void {
    if (typeof localStorage === 'undefined') return;
    const payload: PersistedState = {
      selection: [...this.selection],
      uiLang: this.uiLang,
      versionId: this.version?.id ?? '',
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // A full or blocked storage must not break the app.
    }
  }

  restore(): void {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed.uiLang === 'de' || parsed.uiLang === 'en') this.uiLang = parsed.uiLang;
      if (typeof parsed.versionId === 'string' && parsed.versionId !== '') {
        this.wantedVersionId = parsed.versionId;
      }
      if (Array.isArray(parsed.selection)) {
        for (const id of parsed.selection) if (typeof id === 'string') this.selection.add(id);
      }
    } catch {
      // Ignore a corrupt entry.
    }
  }
}
