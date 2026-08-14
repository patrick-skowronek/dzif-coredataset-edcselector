<script lang="ts">
  import ExportDialog from './components/ExportDialog.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Tree from './components/Tree.svelte';
  import { strings, type UiLang } from './lib/i18n';
  import { AppState } from './lib/app.svelte';

  import { downloadFile } from './lib/download';
  import { buildProjectFile, projectFileToExport, restoreProjectFile } from './lib/export/project';

  const BASE = import.meta.env.BASE_URL;
  const MDM_URL = 'https://mdm.mi.uni-heidelberg.de/46192?form-id=5';
  const TIBBD_URL = 'https://www.dzif.de/de/infrastruktur/bioressourcen-biodaten-und-digitale-gesundheit#2';
  const DZIF_URL = 'https://www.dzif.de/de';

  const app = new AppState();
  app.restore();
  void app.load(BASE);

  let exportOpen = $state(false);

  const t = $derived(strings[app.uiLang]);
  /** Language used to display questions: the UI language when the file has it. */
  const lang = $derived(
    app.model?.languages.includes(app.uiLang) ? app.uiLang : (app.model?.languages[0] ?? 'en'),
  );
  const fallback = $derived(app.model?.languages.find((entry) => entry !== lang) ?? lang);
  const stats = $derived(app.stats);
  const logo = $derived(
    `${import.meta.env.BASE_URL}${app.uiLang === 'en' ? 'dzif-logo-en.svg' : 'dzif-logo.svg'}`,
  );

  $effect(() => {
    app.persist();
  });

  $effect(() => {
    document.documentElement.lang = app.uiLang;
    document.title = t.appTitle;
  });

  // Exports always contain every language; the interface language decides which one
  // leads (the REDCap label language, the LimeSurvey base language).
  $effect(() => {
    app.syncExportLanguage();
  });

  /** Notices are stored as keys so they follow a language switch. */
  function noticeText(notice: string): string {
    const switched = /^versionSwitched:(.+)$/.exec(notice);
    if (switched) return t.versionSwitched.replace('{id}', switched[1]!);
    const dropped = /^versionSwitchDropped:(\d+):(.+)$/.exec(notice);
    if (dropped) {
      return t.versionSwitchedDropped
        .replace('{count}', dropped[1]!)
        .replace('{id}', dropped[2]!);
    }
    return notice;
  }

    let selectionInput: HTMLInputElement | undefined = $state();


  function saveSelection(): void {
    if (!app.model) return;
    const project = buildProjectFile(app.model, app.selection, new Date().toISOString());
    downloadFile(projectFileToExport(project));
  }

  async function loadSelection(file: File): Promise<void> {
    if (!app.model) return;
    app.notices = [];
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = restoreProjectFile(app.model, parsed);
      app.selection.clear();
      app.setItems(result.selection, true);
      const notices: string[] = [];
      if (result.usedFallback) notices.push(t.restoredFallback);
      if (result.unknown.length > 0) {
        notices.push(`${t.restoredUnknown} ${result.unknown.join(', ')}`);
      }
      app.notices = notices;
    } catch (error) {
      app.notices = [error instanceof Error ? error.message : String(error)];
    }
  }
</script>

<header>
  <a class="logo" href={DZIF_URL} target="_blank" rel="noopener noreferrer">
    <img src={logo} alt={t.logoAlt} width="102" height="70" />
  </a>
  <div class="titles">
    <h1>{t.appTitle}</h1>
    <p>{t.appSubtitle}</p>
  </div>
  <div class="header-actions">
    <div class="header-controls">
      {#if app.versions.length > 0}
        <label class="version">
          {t.versionLabel}
          <select
            disabled={app.switching}
            value={app.version?.id ?? ''}
            onchange={(event) => {
              const next = app.versions.find((entry) => entry.id === event.currentTarget.value);
              if (next) void app.loadVersion(next, BASE);
            }}
          >
            {#each app.versions as entry, index (entry.id)}
              <option value={entry.id}>
                {entry.id} · {entry.created}{index === 0 ? ` · ${t.versionCurrent}` : ''}
              </option>
            {/each}
          </select>
        </label>
      {/if}
      <label class="ui-lang">
        <span class="visually-hidden">{t.uiLanguage}</span>
        <select
          value={app.uiLang}
          onchange={(event) => (app.uiLang = event.currentTarget.value as UiLang)}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
    <nav>
      <a href={MDM_URL} title={t.linkCoredatasetTitle} target="_blank" rel="noopener noreferrer">
        {t.linkCoredataset}
      </a>
      <a href={TIBBD_URL} title={t.linkTibbdTitle} target="_blank" rel="noopener noreferrer">
        {t.linkTibbd}
      </a>
    </nav>
  </div>
</header>

{#if stats}
  <div class="stats">
    <span role="status">
      <span class="big">{stats.items}</span>
      <span class="label">{t.selected} ({t.ofQuestions} {stats.totalItems})</span>
    </span>

    <span
      class="pill"
      class:ok={stats.coreItems === stats.totalCoreItems}
      class:warn={stats.coreItems < stats.totalCoreItems}
      title={stats.coreItems === stats.totalCoreItems ? t.coreComplete : t.coreIncomplete}
    >
      {stats.coreItems}/{stats.totalCoreItems} {t.coreCoverage}
    </span>

    <span class="muted">{stats.forms} {t.forms} · {stats.groups} {t.groups}</span>

    {#if stats.missingDependencies > 0}
      <span class="pill warn">{stats.missingDependencies} {t.missingDeps}</span>
    {/if}

    <span class="spacer"></span>


    <button onclick={saveSelection} disabled={app.selection.size === 0}>{t.saveSelection}</button>
    <button onclick={() => selectionInput?.click()}>{t.loadSelection}</button>

  <input
    bind:this={selectionInput}
    type="file"
    accept="application/json,.json"
    hidden
    onchange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (file) void loadSelection(file);
      event.currentTarget.value = '';
    }}
  />

    <button
      class="cyan export"
      disabled={stats.items === 0}
      onclick={() => (exportOpen = true)}
    >
      {t.openExport} …
    </button>
  </div>
{/if}

{#each app.notices as notice, index (index)}
  <p class="notice">{noticeText(notice)}</p>
{/each}

{#if app.loading}
  <p class="status">{t.loading}</p>
{:else if app.loadError}
  <div class="error">
    <p><strong>{t.loadError}</strong></p>
    <p class="mono">{app.loadError}</p>
    <button onclick={() => void app.load(BASE)}>{t.retry}</button>
  </div>
{:else if app.model}
  <main>
    <Toolbar {app} {t} />
    <Tree {app} {t} {lang} {fallback} />
  </main>

  <ExportDialog {app} {t} open={exportOpen} onclose={() => (exportOpen = false)} />

  <footer>
    <div class="footer-columns">
      <section class="about">
        <h2>{t.about}</h2>
        <p>{t.aboutText}</p>
      </section>
      <section class="about">
        <h2>{t.disclaimer}</h2>
        <p>{t.disclaimerRisk}</p>
        <p>{t.disclaimerLegal}</p>
      </section>
    </div>
    <nav class="footer-links">
      <a href={DZIF_URL} target="_blank" rel="noopener noreferrer">{t.linkDzif}</a>
      <a href={MDM_URL} target="_blank" rel="noopener noreferrer">{t.linkCoredataset}</a>
      <a href={TIBBD_URL} title={t.linkTibbdTitle} target="_blank" rel="noopener noreferrer">
        {t.linkTibbdTitle}
      </a>
      <a href="https://dt-hub.dzif.de">DZIF Data &amp; Tools-Hub</a>
    </nav>
    <p class="license">
      © 2026 {t.logoAlt} · {t.licenseLine}
    </p>
    <p>Webapp Version: 0.1</p>
  </footer>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 0.7rem 1.3rem;
    border-bottom: 3px solid var(--dzif-navy);
    background: var(--surface);
  }
  .logo {
    border: none;
    flex: none;
    line-height: 0;
  }
  .logo img {
    display: block;
    height: 3.6rem;
    width: auto;
  }
  h1 {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.2;
  }
  .titles p {
    margin: 0.2rem 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    max-width: 60ch;
  }
  .header-actions {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
  }
  .header-actions nav {
    display: flex;
    gap: 0.9rem;
    font-size: 0.85rem;
  }
  .header-controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .header-controls select {
    font-size: 0.85rem;
  }
  .version {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .version select {
    font-weight: 700;
    color: var(--dzif-navy);
  }
  .stats {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
    padding: 0.45rem 1.3rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .big {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--dzif-navy);
  }
  .label,
  .muted {
    color: var(--text-muted);
  }
  .pill {
    padding: 0.05rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-weight: 700;
    background: var(--surface);
  }
  .pill.ok {
    background: var(--ok-soft);
    color: var(--ok);
    border-color: transparent;
  }
    .spacer {
    flex: 1;
  }
  .pill.warn {
    background: var(--warn-soft);
    color: var(--warn);
    border-color: transparent;
  }
  .export {
    margin-left: auto;
  }
  .notice {
    margin: 0.5rem 1.3rem 0;
    padding: 0.4rem 0.6rem;
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
    font-size: 0.9rem;
  }
  main {
    padding: 0.8rem 1.3rem 2rem;
  }
  .status,
  .error {
    padding: 1rem 1.3rem;
  }
  .error {
    color: var(--warn);
  }
  footer {
    border-top: 1px solid var(--border);
    background: var(--dzif-navy);
    color: #fff;
    padding: 1rem 1.3rem 1.4rem;
    font-size: 0.88rem;
  }
  footer h2 {
    margin: 0 0 0.25rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9fc7e6;
  }
  .about p {
    margin: 0;
    max-width: 80ch;
    color: #dce6f1;
  }
  .footer-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
    gap: 1.6rem;
    align-items: start;
  }
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.1rem;
    margin: 0.9rem 0 0.6rem;
    padding-top: 0.9rem;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }
  .license {
    margin: 0;
    color: #9fc7e6;
    font-size: 0.8rem;
    max-width: 110ch;
  }
  @media (max-width: 52rem) {
    .footer-columns {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }
  footer a {
    color: #ffffff;
    border-bottom-color: rgba(255, 255, 255, 0.5);
  }
  footer a:hover {
    color: #9fd8f5;
  }
  @media (max-width: 52rem) {
    header {
      flex-wrap: wrap;
    }
    .header-actions {
      align-items: flex-start;
      margin-left: 0;
      width: 100%;
      flex-direction: row;
      justify-content: space-between;
    }
  }
</style>
