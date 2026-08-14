<script lang="ts">

  import type { Strings } from '../lib/i18n';
  import type { AppState, FilterMode } from '../lib/app.svelte';

    const filters: { value: FilterMode; label: () => string }[] = [
    { value: 'all', label: () => t.filterAll },
    { value: 'core', label: () => t.filterCore },
    { value: 'selected', label: () => t.filterSelected },
    { value: 'unselected', label: () => t.filterUnselected },
    { value: 'logic', label: () => t.filterWithLogic },
  ];

  interface Props {
    app: AppState;
    t: Strings;
  }
  const { app, t }: Props = $props();

</script>

<div class="toolbar">
  <div class="row">
    <label class="search">
      <span class="visually-hidden">{t.search}</span>
      <input type="search" placeholder={t.searchPlaceholder} bind:value={app.query} />
    </label>

    <label class="filter">
      <span class="visually-hidden">{t.filter}</span>
      <select bind:value={app.filter}>
        {#each filters as option (option.value)}
          <option value={option.value}>{option.label()}</option>
        {/each}
      </select>
    </label>

    <button onclick={() => app.expandAll()}>{t.expandAll}</button>
    <button onclick={() => app.collapseAll()}>{t.collapseAll}</button>
  </div>

  <div class="row">
    <span class="group-label">{t.presets}:</span>
    <button class="primary" title={t.selectCoreHint} onclick={() => app.selectCore()}>
      {t.selectCore}
    </button>
    <button onclick={() => app.selectAll()}>{t.selectAll}</button>
    <button onclick={() => app.clearSelection()} disabled={app.selection.size === 0}>
      {t.clear}
    </button>
    {#if app.missing.size > 0}
      <button class="warn" title={t.addDependenciesHint} onclick={() => app.addDependencies()}>
        {t.addDependencies} ({app.missing.size})
      </button>
    {/if}

  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.7rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 14rem;
  }
  .search input {
    width: 100%;
  }
  .group-label {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  button.warn {
    border-color: var(--warn);
    color: var(--warn);
    background: var(--warn-soft);
    font-weight: 600;
  }
</style>
