<script lang="ts">
  import { pickText } from '../lib/export/text';
  import type { Strings } from '../lib/i18n';
  import { stripCoreMarker } from '../lib/odm/parse';
  import type { ItemNode } from '../lib/odm/types';
  import { guardingConditions } from '../lib/selection';
  import type { AppState } from '../lib/app.svelte';
  import Badge from './Badge.svelte';

  interface Props {
    app: AppState;
    item: ItemNode;
    t: Strings;
    lang: string;
    fallback: string;
  }
  const { app, item, t, lang, fallback }: Props = $props();

  const selected = $derived(app.selection.has(item.id));
  const open = $derived(app.detailsOpen.has(item.id));
  const question = $derived(stripCoreMarker(pickText(item.def.question, lang, fallback)));
  const hint = $derived(pickText(item.def.comment, lang, fallback));
  const codeList = $derived(
    item.def.codeListOid ? app.model?.codeLists.get(item.def.codeListOid) : undefined,
  );
  const conditions = $derived(app.model ? guardingConditions(app.model, item) : []);
  const dependencies = $derived(open ? app.dependencyNames(item.id) : []);
  const missingDeps = $derived(
    (app.missing.get(item.id) ?? []).length > 0 && selected,
  );
  const units = $derived(
    item.def.measurementUnitOids
      .map((oid) => pickText(app.model?.units.get(oid)?.symbol, lang, fallback))
      .filter((symbol) => symbol !== ''),
  );
  const bounds = $derived(
    item.def.rangeChecks
      .map((check) => `${check.comparator} ${check.checkValues.join(', ')}`)
      .join(' · '),
  );
</script>

<div class="item" class:selected>
  <label class="main">
    <input
      type="checkbox"
      checked={selected}
      onchange={() => app.toggleItem(item.id)}
    />
    <span class="question">
      {question}
      <span class="badges">
        {#if item.core}<Badge tone="core" title={t.badgeCoreTitle}>{t.badgeCore}</Badge>{/if}
        {#if item.coreMarkerInconsistent}
          <Badge tone="warn" title={t.badgeInconsistentTitle}>{t.badgeInconsistent}</Badge>
        {/if}
        {#if conditions.length > 0}
          <Badge tone="accent" title={t.badgeLogicTitle}>{t.badgeLogic}</Badge>
        {/if}
        {#if missingDeps}
          <Badge tone="warn" title={t.addDependenciesHint}>{t.missingDeps}</Badge>
        {/if}
        <Badge title={t.dataType}>{item.def.dataType}</Badge>
      </span>
    </span>
  </label>
  <button
    class="details-toggle"
    aria-expanded={open}
    title={open ? t.hideDetails : t.showDetails}
    onclick={() => app.toggleDetails(item.id)}
  >
    {open ? '▴' : '▾'}
  </button>
</div>

{#if open}
  <div class="details">
    <dl>
      <dt>{t.itemName}</dt>
      <dd><code>{item.def.name}</code> <span class="muted">({item.def.oid})</span></dd>

      {#if item.ref.mandatory}
        <dt>{t.badgeMandatory}</dt>
        <dd>{t.badgeMandatoryTitle}</dd>
      {/if}

      {#if hint !== ''}
        <dt>{t.hint}</dt>
        <dd class="prewrap">{hint}</dd>
      {/if}

      {#if units.length > 0}
        <dt>{t.unit}</dt>
        <dd>{units.join(', ')}</dd>
      {/if}

      {#if bounds !== ''}
        <dt>{t.range}</dt>
        <dd class="mono">{bounds}</dd>
      {/if}

      {#if codeList}
        <dt>{t.answerOptions}</dt>
        <dd>
          <ul class="options">
            {#each codeList.items as option (option.codedValue + option.order)}
              <li>
                <code>{option.codedValue}</code>
                {pickText(option.decode, lang, fallback)}
              </li>
            {/each}
          </ul>
        </dd>
      {/if}

      {#if conditions.length > 0}
        <dt>{t.collectedOnlyIf}</dt>
        <dd>
          {#each conditions as condition (condition.oid)}
            <div class="mono expression">{condition.expression}</div>
          {/each}
          {#if dependencies.length > 0}
            <div class="deps">
              {t.dependsOn}:
              {#each dependencies as dependency (dependency.id)}
                <button
                  class="dep"
                  class:missing={!dependency.selected}
                  onclick={() => app.setItems([dependency.id], true)}
                  title={dependency.selected ? '' : t.addDependenciesHint}
                >
                  <code>{dependency.name}</code>
                  {#if !dependency.selected}<span class="mark">+</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </dd>
      {/if}
    </dl>
  </div>
{/if}

<style>
  .item {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.15rem 0.5rem 0.15rem 3.1rem;
    border-radius: var(--radius);
  }
  .item:hover {
    background: var(--surface-2);
  }
  .item.selected {
    background: var(--accent-soft);
  }
  .main {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    flex: 1;
    cursor: pointer;
    padding: 0.1rem 0;
  }
  input[type='checkbox'] {
    width: 1rem;
    height: 1rem;
    margin-top: 0.25rem;
    accent-color: var(--accent);
    flex: none;
  }
  .question {
    flex: 1;
  }
  .badges {
    display: inline-flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    margin-left: 0.35rem;
    vertical-align: 1px;
  }
  .details-toggle {
    border: none;
    background: none;
    color: var(--text-muted);
    padding: 0.1rem 0.35rem;
    flex: none;
  }
  .details {
    margin: 0.15rem 0.5rem 0.5rem 4.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  dl {
    display: grid;
    grid-template-columns: minmax(7rem, max-content) 1fr;
    gap: 0.2rem 0.9rem;
    margin: 0;
    font-size: 0.9rem;
  }
  dt {
    color: var(--text-muted);
    font-weight: 600;
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .muted {
    color: var(--text-muted);
  }
  .prewrap {
    white-space: pre-wrap;
  }
  .options {
    margin: 0;
    padding-left: 1rem;
    columns: 2;
    column-gap: 1.5rem;
  }
  .options li {
    break-inside: avoid;
  }
  .expression {
    overflow-wrap: anywhere;
  }
  .deps {
    margin-top: 0.3rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  .dep {
    padding: 0 0.35rem;
    border-radius: 999px;
    font-size: 0.8rem;
  }
  .dep.missing {
    border-color: var(--warn);
    color: var(--warn);
    background: var(--warn-soft);
  }
  .mark {
    font-weight: 700;
  }
</style>
