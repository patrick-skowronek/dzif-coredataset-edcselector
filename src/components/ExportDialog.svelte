<script lang="ts">
  import { downloadFile, downloadZip } from '../lib/download';
  import { runExport, targets, type TargetId } from '../lib/export/index';
  import type { Strings } from '../lib/i18n';
  import type { AppState } from '../lib/app.svelte';

  interface Props {
    app: AppState;
    t: Strings;
    open: boolean;
    onclose: () => void;
  }
  const { app, t, open, onclose }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  let targetId = $state<TargetId>('redcap');

  const target = $derived(targets.find((entry) => entry.id === targetId) ?? targets[0]!);

  /** Localised label, description and import hint per target. */
  const targetText = $derived({
    redcap: { label: t.targetRedcapLabel, description: t.targetRedcapDescription, how: t.targetRedcapImport },
    limesurvey: {
      label: t.targetLimesurveyLabel,
      description: t.targetLimesurveyDescription,
      how: t.limesurveyImportLsg,
    },
    odm: { label: t.targetOdmLabel, description: t.targetOdmDescription, how: t.targetOdmImport },
    codebook: {
      label: t.targetCodebookLabel,
      description: t.targetCodebookDescription,
      how: t.targetCodebookImport,
    },
  } satisfies Record<TargetId, { label: string; description: string; how: string }>);

  const limesurveyFormats = $derived([
    { value: 'lsg' as const, label: t.limesurveyFormatLsg, hint: t.limesurveyFormatLsgHint },
    { value: 'lsq' as const, label: t.limesurveyFormatLsq, hint: t.limesurveyFormatLsqHint },
  ]);

  const bundle = $derived.by(() => {
    const model = app.model;
    if (!open || !model || app.selection.size === 0) return null;
    // A fixed timestamp would make exports look stale; it is taken per run.
    const options = { ...app.exportOptions, timestamp: new Date().toISOString() };
    return runExport(target, model, app.selection, options);
  });

  const totalSize = $derived(
    bundle ? bundle.files.reduce((sum, file) => sum + file.content.length, 0) : 0,
  );
  const severityLabel = { error: '✕', warning: '!', info: 'i' } as const;

  const reportCounts = $derived.by(() => {
    const counts = { error: 0, warning: 0, info: 0 };
    for (const entry of bundle?.report ?? []) counts[entry.severity]++;
    return counts;
  });

  // Keep the native dialog in sync with the `open` prop so Esc and the backdrop work.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  function formatSize(bytes: number): string {
    return bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} kB`;
  }
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="export-dialog-title">
  <div class="sheet">
    <header>
      <h2 id="export-dialog-title">{t.exportTitle}</h2>
      <button class="close" onclick={onclose} aria-label={t.closeDialog}>✕</button>
    </header>

    <div class="body">
      <p class="intro">{t.exportIntro}</p>

      <fieldset class="targets">
        <legend>{t.targetQuestion}</legend>
        <div class="cards">
          {#each targets as entry (entry.id)}
            <label class="card" class:selected={targetId === entry.id}>
              <input type="radio" name="export-target" value={entry.id} bind:group={targetId} />
              <span class="card-text">
                <strong>{targetText[entry.id].label}</strong>
                <span class="muted">{targetText[entry.id].description}</span>
              </span>
            </label>
          {/each}
        </div>
      </fieldset>

      <div class="how">
        <strong>{t.importHint}:</strong>
        {targetId === 'limesurvey'
          ? app.exportOptions.limesurveyFormat === 'lsq'
            ? t.limesurveyImportLsq
            : t.limesurveyImportLsg
          : targetText[targetId].how}
      </div>

      {#if targetId === 'limesurvey'}
        <fieldset>
          <legend>{t.limesurveyFormat}</legend>
          {#each limesurveyFormats as format (format.value)}
            <label class="radio">
              <input
                type="radio"
                name="limesurvey-format"
                value={format.value}
                checked={app.exportOptions.limesurveyFormat === format.value}
                onchange={() =>
                  (app.exportOptions = {
                    ...app.exportOptions,
                    limesurveyFormat: format.value,
                  })}
              />
              <span>
                {format.label}
                <span class="muted block">{format.hint}</span>
              </span>
            </label>
          {/each}
        </fieldset>
      {/if}

      <details class="advanced">
        <summary>{t.advancedOptions}</summary>
        <p class="hint">{t.advancedOptionsHint}</p>
        {#if targetId === 'limesurvey'}
          <label class="check">
            <input type="checkbox" bind:checked={app.exportOptions.limesurveyGroupHeadings} />
            {t.optionGroupHeadings}
          </label>
          <p class="hint indented">{t.optionGroupHeadingsHint}</p>
        {/if}
        <div class="option-grid">
          <label class="check">
            <input type="checkbox" bind:checked={app.exportOptions.keepCoreMarker} />
            {t.optionKeepMarker}
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={app.exportOptions.includeHints} />
            {t.optionHints}
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={app.exportOptions.includeSkipLogic} />
            {t.optionSkipLogic}
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={app.exportOptions.includeMandatory} />
            {t.optionMandatory}
          </label>
          {#if targetId === 'redcap'}
            <label class="check">
              <input type="checkbox" bind:checked={app.exportOptions.addRecordIdField} />
              {t.optionRecordId}
            </label>
          {/if}
          {#if targetId === 'redcap' || targetId === 'limesurvey'}
            <label class="check">
              <input type="number" min="2" max="99" bind:value={app.exportOptions.dropdownThreshold} />
              {t.optionDropdown}
            </label>
          {/if}
        </div>
        <p class="hint">{t.exportAllLanguages.replace('{languages}', (app.model?.languages ?? []).join(', '))}</p>
      </details>

      {#if !bundle}
        <p class="empty">{t.nothingSelected}</p>
      {:else}
        <div class="files">
          <h3>
            {t.files}
            <span class="muted">({bundle.files.length}, {formatSize(totalSize)})</span>
          </h3>
          <ul>
            {#each bundle.files as file (file.name)}
              <li>
                <code>{file.name}</code>
                {#if file.description}<span class="file-note">{file.description}</span>{/if}
                <span class="size">{formatSize(file.content.length)}</span>
                <button
                  class="dl"
                  onclick={() => downloadFile(file)}
                  title={t.download}
                  aria-label={`${t.download}: ${file.name}`}
                >
                  <span aria-hidden="true">⬇️</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>

        <details class="report" open={reportCounts.error > 0}>
          <summary>
            {t.reportTitle}
            {#if bundle.report.length === 0}
              <span class="muted">· {t.reportEmpty}</span>
            {:else}
              {#if reportCounts.warning + reportCounts.error > 0}
                <span class="count warn">
                  {reportCounts.warning + reportCounts.error}
                  {t.reportWarnings}
                </span>
              {/if}
              {#if reportCounts.info > 0}
                <span class="count">{reportCounts.info} {t.reportInfos}</span>
              {/if}
            {/if}
          </summary>
          {#if bundle.report.length > 0}
            <ul>
              {#each bundle.report as entry, index (index)}
                <li class={entry.severity}>
                  <span class="sev" aria-hidden="true">{severityLabel[entry.severity]}</span>
                  <span>
                    {#if entry.scope}<code>{entry.scope}</code>{/if}
                    {entry.message}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </details>
      {/if}
    </div>

    <footer>
      <button onclick={onclose}>{t.closeDialog}</button>
      <button
        class="cyan"
        disabled={!bundle}
        onclick={() => bundle && downloadZip(bundle.files, `dzif_${target.id}_export.zip`)}
      >
        {t.downloadAll} (.zip)
      </button>
    </footer>
  </div>
</dialog>

<style>
  .sheet {
    display: flex;
    flex-direction: column;
    width: min(62rem, calc(100vw - 2rem));
    max-height: calc(100vh - 3rem);
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    color: var(--text);
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 1rem;
    background: var(--dzif-navy);
  }
  header h2 {
    margin: 0;
    font-size: 1.05rem;
    color: #fff;
  }
  .close {
    margin-left: auto;
    background: transparent;
    border-color: rgba(255, 255, 255, 0.4);
    color: #fff;
    line-height: 1;
    padding: 0.2rem 0.5rem;
  }
  .close:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: #fff;
    color: #fff;
  }
  .body {
    padding: 0.9rem 1rem;
    overflow-y: auto;
  }
  .intro {
    margin: 0 0 0.8rem;
    color: var(--text-muted);
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.7rem 0.5rem;
    margin: 0 0 0.6rem;
  }
  details.advanced {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.7rem;
    margin: 0 0 0.6rem;
  }
  details.advanced summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--dzif-navy);
  }
  details.advanced[open] summary {
    margin-bottom: 0.3rem;
  }
  .indented {
    padding-left: 1.4rem;
  }
  legend {
    font-weight: 700;
    color: var(--dzif-navy);
    padding: 0 0.35rem;
  }
  .targets legend {
    font-size: 1rem;
  }
  .cards {
    display: grid;
    /* All four targets on one row; the dialog is wide enough for it. */
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .card {
    display: flex;
    gap: 0.4rem;
    align-items: flex-start;
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    cursor: pointer;
    background: var(--surface);
  }
  .card:hover {
    border-color: var(--accent);
  }
  .card.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .card-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .card-text .muted {
    font-size: 0.8rem;
    line-height: 1.35;
  }
  .card-text strong {
    color: var(--dzif-navy);
  }
  .how {
    margin: -0.3rem 0 0.9rem;
    padding: 0.4rem 0.6rem;
    background: var(--surface-2);
    border-left: 3px solid var(--accent);
    font-size: 0.9rem;
  }
  .option-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 0 1.2rem;
  }
  .radio,
  .check {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    font-size: 0.9rem;
    margin-top: 0.25rem;
  }
  .radio input,
  .check input[type='checkbox'] {
    margin-top: 0.25rem;
  }
  .check input[type='number'] {
    width: 4rem;
    margin-top: 0;
  }
  .languages {
    width: 18rem;
    max-width: 100%;
  }
  .hint {
    margin: 0.3rem 0 0;
    color: var(--text-muted);
    font-size: 0.84rem;
    max-width: 70ch;
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.86rem;
  }
  .block {
    display: block;
  }
  h3 {
    margin: 0.6rem 0 0.3rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  .files ul,
  .report ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.88rem;
  }
  .files ul {
    max-height: 11rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.2rem 0.4rem;
  }
  .files li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.12rem 0;
  }
  .dl {
    padding: 0 0.4rem;
    line-height: 1.4;
    font-size: 0.8rem;
    flex: none;
    color: var(--accent-dark);
    border-color: var(--border-strong);
  }
  .dl span {
    font-weight: 600;
  }
  .file-note {
    color: var(--text-muted);
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .size {
    color: var(--text-muted);
    margin-left: auto;
    font-size: 0.8rem;
    flex: none;
  }
  .more {
    padding-left: 0.2rem;
  }
  details.report {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.6rem;
    margin-top: 0.7rem;
  }
  details.report summary {
    cursor: pointer;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    font-weight: 700;
  }
  details.report[open] summary {
    margin-bottom: 0.3rem;
  }
  .count {
    display: inline-block;
    margin-left: 0.3rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-muted);
    font-size: 0.72rem;
    text-transform: none;
    letter-spacing: 0;
  }
  .count.warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .report li {
    display: flex;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-top: 1px solid var(--border);
  }
  .report li:first-child {
    border-top: none;
  }
  .sev {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 999px;
    text-align: center;
    font-weight: 700;
    font-size: 0.78rem;
    line-height: 1.25rem;
    background: var(--surface-3);
    color: var(--text-muted);
  }
  .warning .sev {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .error .sev {
    background: var(--warn);
    color: #fff;
  }
  .empty {
    color: var(--warn);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--surface-2);
  }
  @media (max-width: 60rem) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 34rem) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
