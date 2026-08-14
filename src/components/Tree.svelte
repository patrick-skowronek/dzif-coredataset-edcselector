<script lang="ts">
  import { pickText } from '../lib/export/text';
  import type { Strings } from '../lib/i18n';
  import type { NodeId } from '../lib/odm/types';
  import { formState, groupState } from '../lib/selection';
  import type { AppState } from '../lib/app.svelte';
  import Badge from './Badge.svelte';
  import ItemRow from './ItemRow.svelte';
  import TriCheckbox from './TriCheckbox.svelte';

  interface Props {
    app: AppState;
    t: Strings;
    lang: string;
    fallback: string;
  }
  const { app, t, lang, fallback }: Props = $props();

  const visible = $derived(app.visibleItems);
  const filtering = $derived(app.query.trim() !== '' || app.filter !== 'all');

  /** Forms and groups that still contain a visible item. */
  const tree = $derived.by(() => {
    const model = app.model;
    if (!model) return [];
    return model.events.flatMap((event) =>
      event.forms
        .map((form) => ({
          form,
          groups: form.groups
            .map((group) => ({ group, items: group.items.filter((item) => visible.has(item.id)) }))
            .filter((entry) => entry.items.length > 0),
        }))
        .filter((entry) => entry.groups.length > 0),
    );
  });

  const totalVisible = $derived(visible.size);

  function selectedCount(ids: NodeId[]): number {
    let count = 0;
    for (const id of ids) if (app.selection.has(id)) count++;
    return count;
  }
</script>

{#if app.model}
  {#if totalVisible === 0}
    <p class="empty">{t.noMatches}</p>
  {:else}
    {#if filtering}
      <p class="filter-note">{totalVisible} {t.matches}</p>
    {/if}
    <ul class="forms">
      {#each tree as { form, groups } (form.id)}
        {@const formOpen = app.expanded.has(form.id) || filtering}
        {@const formItems = groups.flatMap((entry) => entry.items.map((item) => item.id))}
        <li class="form">
          <div class="row form-row">
            <button
              class="disclosure"
              aria-expanded={formOpen}
              onclick={() => app.toggleExpanded(form.id)}
              title={formOpen ? t.collapseAll : t.expandAll}
            >
              {formOpen ? '▾' : '▸'}
            </button>
            <TriCheckbox
              checkState={filtering
                ? selectedCount(formItems) === 0
                  ? 'none'
                  : selectedCount(formItems) === formItems.length
                    ? 'all'
                    : 'partial'
                : formState(form, app.selection)}
              label={pickText(form.def.description, lang, fallback) || form.def.name}
              onchange={(selected) => app.toggleForm(form, selected)}
            />
            <button class="title" onclick={() => app.toggleExpanded(form.id)}>
              <strong>{pickText(form.def.description, lang, fallback) || form.def.name}</strong>
              <span class="count">{selectedCount(formItems)}/{formItems.length}</span>
            </button>
          </div>

          {#if formOpen}
            <ul class="groups">
              {#each groups as { group, items } (group.id)}
                {@const groupOpen = app.expanded.has(group.id) || filtering}
                {@const groupItems = items.map((item) => item.id)}
                <li class="group">
                  <div class="row group-row">
                    <button
                      class="disclosure"
                      aria-expanded={groupOpen}
                      onclick={() => app.toggleExpanded(group.id)}
                    >
                      {groupOpen ? '▾' : '▸'}
                    </button>
                    <TriCheckbox
                      checkState={filtering
                        ? selectedCount(groupItems) === 0
                          ? 'none'
                          : selectedCount(groupItems) === groupItems.length
                            ? 'all'
                            : 'partial'
                        : groupState(group, app.selection)}
                      label={pickText(group.def.description, lang, fallback) || group.def.name}
                      onchange={(selected) => app.toggleGroup(group, selected)}
                    />
                    <button class="title" onclick={() => app.toggleExpanded(group.id)}>
                      <span class="group-title"
                        >{pickText(group.def.description, lang, fallback) || group.def.name}</span
                      >
                      <span class="count">{selectedCount(groupItems)}/{groupItems.length}</span>
                      {#if group.def.repeating}
                        <Badge title={t.badgeRepeatingTitle}>{t.badgeRepeating}</Badge>
                      {/if}
                    </button>
                  </div>

                  {#if groupOpen}
                    <div class="items">
                      {#each items as item (item.id)}
                        <ItemRow {app} {item} {t} {lang} {fallback} />
                      {/each}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .form {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 0.4rem;
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .form-row {
    padding: 0.4rem 0.6rem;
    background: var(--surface-2);
  }
  .group-row {
    padding: 0.25rem 0.6rem 0.25rem 1.6rem;
  }
  .disclosure {
    border: none;
    background: none;
    color: var(--text-muted);
    padding: 0 0.2rem;
    width: 1.4rem;
    flex: none;
  }
  .title {
    border: none;
    background: none;
    text-align: left;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.1rem 0;
    min-width: 0;
  }
  .group-title {
    white-space: pre-wrap;
  }
  .count {
    color: var(--text-muted);
    font-size: 0.8rem;
    font-family: var(--mono);
    flex: none;
  }
  .items {
    padding-bottom: 0.3rem;
  }
  .empty,
  .filter-note {
    color: var(--text-muted);
    margin: 0.5rem 0.2rem;
  }
</style>
