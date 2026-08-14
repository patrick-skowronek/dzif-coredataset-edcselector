/** UI language, independent of the language used for exports. */
export type UiLang = 'de' | 'en';

export interface Strings {
  appTitle: string;
  appSubtitle: string;
  loading: string;
  loadError: string;
  retry: string;

  search: string;
  searchPlaceholder: string;
  filter: string;
  filterAll: string;
  filterCore: string;
  filterSelected: string;
  filterUnselected: string;
  filterWithLogic: string;
  expandAll: string;
  collapseAll: string;
  noMatches: string;
  matches: string;

  presets: string;
  selectCore: string;
  selectCoreHint: string;
  selectAll: string;
  clear: string;
  addDependencies: string;
  addDependenciesHint: string;

  selected: string;
  ofQuestions: string;
  coreCoverage: string;
  coreComplete: string;
  coreIncomplete: string;
  missingDeps: string;
  forms: string;
  groups: string;

  badgeCore: string;
  badgeCoreTitle: string;
  badgeMandatory: string;
  badgeMandatoryTitle: string;
  badgeRepeating: string;
  badgeRepeatingTitle: string;
  badgeLogic: string;
  badgeLogicTitle: string;
  badgeInconsistent: string;
  badgeInconsistentTitle: string;

  itemName: string;
  dataType: string;
  answerOptions: string;
  hint: string;
  unit: string;
  range: string;
  collectedOnlyIf: string;
  dependsOn: string;
  showDetails: string;
  hideDetails: string;

  exportTitle: string;
  exportOptions: string;
  advancedOptions: string;
  advancedOptionsHint: string;
  optionKeepMarker: string;
  optionHints: string;
  optionSkipLogic: string;
  optionMandatory: string;
  optionRecordId: string;
  optionDropdown: string;
  download: string;
  downloadAll: string;
  reportTitle: string;
  reportEmpty: string;
  reportWarnings: string;
  reportInfos: string;
  exportAllLanguages: string;
  nothingSelected: string;
  files: string;

  saveSelection: string;
  loadSelection: string;
  restoredUnknown: string;
  restoredFallback: string;
  uiLanguage: string;
  versionLabel: string;
  versionCurrent: string;
  versionSwitched: string;
  versionSwitchedDropped: string;
  infoButton: string;
  infoTitle: string;
  infoVersion: string;
  infoCurrent: string;
  infoOlder: string;
  infoLoaded: string;
  infoStudyName: string;
  infoOdmVersion: string;
  infoLanguages: string;
  infoContent: string;
  infoQuestions: string;
  infoCodeLists: string;
  infoConditions: string;
  infoRuleMarker: string;
  infoRuleMandatory: string;
  infoMdm: string;
  infoAllVersions: string;
  infoSwitchHint: string;
  infoDescription: string;
  infoOtherLanguage: string;
  openExport: string;
  closeDialog: string;
  exportIntro: string;
  targetQuestion: string;
  limesurveyFormat: string;
  limesurveyFormatLsg: string;
  limesurveyImportLsg: string;
  limesurveyImportLsq: string;
  limesurveyFormatLsgHint: string;
  limesurveyFormatLsq: string;
  limesurveyFormatLsqHint: string;
  limesurveyStructure: string;
  optionGroupHeadings: string;
  optionGroupHeadingsHint: string;
  importHint: string;
  targetRedcapLabel: string;
  targetRedcapDescription: string;
  targetRedcapImport: string;
  targetLimesurveyLabel: string;
  targetLimesurveyDescription: string;
  targetOdmLabel: string;
  targetOdmDescription: string;
  targetOdmImport: string;
  targetCodebookLabel: string;
  targetCodebookDescription: string;
  targetCodebookImport: string;
  linkCoredataset: string;
  linkCoredatasetTitle: string;
  linkTibbd: string;
  linkTibbdTitle: string;
  linkDzif: string;
  linkGithub: string;
  linkGithubTitle: string;
  appVersion: string;
  logoAlt: string;
  about: string;
  aboutText: string;
  disclaimer: string;
  disclaimerRisk: string;
  disclaimerLegal: string;
  licenseLine: string;
  sourceFile: string;
  odmCreated: string;
}

const de: Strings = {
  appTitle: 'DZIF-Kerndatensatz — Auswahl für Ihr EDC-System',
  appSubtitle:
    'Fragen aus dem DZIF-Kerndatensatz auswählen und für REDCap, LimeSurvey, CDISC ODM oder ein anderes EDC-System exportieren.',
  loading: 'Kerndatensatz wird geladen …',
  loadError: 'Der Kerndatensatz konnte nicht geladen werden.',
  retry: 'Erneut versuchen',

  search: 'Suche',
  searchPlaceholder: 'Frage, Item-Name oder Antwortoption …',
  filter: 'Filter',
  filterAll: 'Alle',
  filterCore: 'Nur Pflichtfragen',
  filterSelected: 'Nur ausgewählte',
  filterUnselected: 'Nur nicht ausgewählte',
  filterWithLogic: 'Nur mit Sprunglogik',
  expandAll: 'Alle aufklappen',
  collapseAll: 'Alle zuklappen',
  noMatches: 'Keine Frage entspricht der Suche.',
  matches: 'Treffer',

  presets: 'Vorauswahl',
  selectCore: 'Pflicht-Kerndatensatz auswählen',
  selectCoreHint:
    'Wählt alle Pflichtfragen aus — die Elemente, die DZIF-Studien erheben müssen.',
  selectAll: 'Alles auswählen',
  clear: 'Auswahl leeren',
  addDependencies: 'Benötigte Fragen ergänzen',
  addDependenciesHint:
    'Ergänzt die Fragen, die die Sprunglogik Ihrer ausgewählten Fragen ausliest. Ohne sie lässt sich die Logik nicht übersetzen.',

  selected: 'ausgewählt',
  ofQuestions: 'von',
  coreCoverage: 'Pflichtfragen',
  coreComplete: 'Kerndatensatz vollständig',
  coreIncomplete: 'Kerndatensatz unvollständig',
  missingDeps: 'fehlende Bezugsfragen',
  forms: 'Formulare',
  groups: 'Fragengruppen',

  badgeCore: 'Pflicht',
  badgeCoreTitle: 'Gehört zum verpflichtenden DZIF-Kerndatensatz',
  badgeMandatory: 'ODM-Pflichtfeld',
  badgeMandatoryTitle: 'Im ODM als Mandatory="Yes" gekennzeichnet',
  badgeRepeating: 'wiederholbar',
  badgeRepeatingTitle: 'Diese Fragengruppe kann mehrfach erfasst werden',
  badgeLogic: 'Sprunglogik',
  badgeLogicTitle: 'Wird nur unter einer Bedingung erhoben — siehe Details',
  badgeInconsistent: 'Markierung unvollständig',
  badgeInconsistentTitle:
    'Die Markierung * steht nur in einem Teil der Sprachen — bitte dem DZIF melden',

  itemName: 'Item-Name',
  dataType: 'Datentyp',
  answerOptions: 'Antwortoptionen',
  hint: 'Hinweis',
  unit: 'Einheit',
  range: 'Wertebereich',
  collectedOnlyIf: 'Wird erhoben, wenn',
  dependsOn: 'Bezieht sich auf',
  showDetails: 'Details anzeigen',
  hideDetails: 'Details ausblenden',

  exportTitle: 'Export',
  exportOptions: 'Optionen',
  advancedOptions: 'Erweiterte Optionen',
  advancedOptionsHint:
    'Die Voreinstellungen passen für die meisten Studien — hier können Sie den Export im Detail anpassen.',
  optionKeepMarker: 'Markierung * in den Fragetexten behalten',
  optionHints: 'Hinweistexte als Feldnotiz übernehmen',
  optionSkipLogic: 'Sprunglogik übersetzen',
  optionMandatory: 'Pflichtfeld-Kennzeichnung übernehmen',
  optionRecordId: 'record_id-Feld voranstellen (von REDCap benötigt)',
  optionDropdown: 'Ab so vielen Antwortoptionen ein Dropdown verwenden',
  download: 'Herunterladen',
  downloadAll: 'Alle Dateien herunterladen',
  reportTitle: 'Hinweise zum Export',
  reportEmpty: 'keine',
  reportWarnings: 'Warnungen',
  reportInfos: 'Hinweise',
  exportAllLanguages:
    'Der Export enthält immer alle Sprachen des Datensatzes ({languages}). Die Sprache der Oberfläche bestimmt, welche davon führt: bei REDCap die Sprache der Feldbezeichnungen, bei LimeSurvey die Basissprache der Umfrage.',
  nothingSelected: 'Bitte wählen Sie zuerst Fragen aus.',
  files: 'Dateien',

  saveSelection: 'Auswahl speichern',
  loadSelection: 'Auswahl laden',
  restoredUnknown: 'Diese Fragen aus der Datei gibt es im geladenen Kerndatensatz nicht:',
  restoredFallback:
    'Die Auswahl wurde über die Item-OIDs wiederhergestellt, weil sich die Struktur des Datensatzes geändert hat.',
  versionLabel: 'Datensatz-Version',
  versionCurrent: 'aktuell',
  versionSwitched: 'Version {id} geladen.',
  versionSwitchedDropped:
    'Version {id} geladen. {count} ausgewählte Frage(n) gibt es in dieser Version nicht — sie wurden aus der Auswahl entfernt.',
  infoButton: 'Datensatz-Info',
  infoTitle: 'Über diesen Datensatz',
  infoVersion: 'Version',
  infoCurrent: 'aktuellste',
  infoOlder: 'älter',
  infoLoaded: 'geladen',
  infoStudyName: 'Studienname im ODM',
  infoOdmVersion: 'Format',
  infoLanguages: 'Sprachen',
  infoContent: 'Inhalt',
  infoQuestions: 'Fragen',
  infoCodeLists: 'Codelisten',
  infoConditions: 'Bedingungen',
  infoRuleMarker: 'Erkannt an der Markierung * im Fragetext, wie vom DZIF dokumentiert.',
  infoRuleMandatory:
    'Diese Version enthält keine *-Markierung. Als Pflichtfragen gelten daher die im ODM als Mandatory="Yes" gekennzeichneten Fragen — eine andere Definition als in neueren Versionen.',
  infoMdm: 'MDM-Portal',
  infoAllVersions: 'Verfügbare Versionen',
  infoSwitchHint: 'Die Version wechseln Sie über die Auswahlliste in der Kopfzeile.',
  infoDescription: 'Beschreibung aus der ODM-Datei',
  infoOtherLanguage: 'Andere Sprache anzeigen',
  uiLanguage: 'Sprache',
  openExport: 'Exportieren',
  closeDialog: 'Schließen',
  exportIntro:
    'Der Export erzeugt die Dateien, die Sie in Ihr EDC-System importieren. Lesen Sie danach die Hinweise — dort steht, worauf Sie in Ihrem System noch achten müssen.',
  targetQuestion: 'Welches EDC-System verwenden Sie?',
  limesurveyFormat: 'LimeSurvey-Dateiformat',
  limesurveyFormatLsg: 'Formulare (.lsg)',
  limesurveyFormatLsgHint:
    'Eine Datei pro ODM-Formular, z. B. „Visite“ — zum Import in eine bestehende Umfrage. Empfohlen.',
  limesurveyImportLsg:
    'Umfrage öffnen → Fragengruppen → Fragengruppe importieren, einmal pro Datei',
  limesurveyImportLsq: 'Fragengruppe öffnen → Frage importieren, einmal pro Datei',
  limesurveyFormatLsq: 'Einzelfragen (.lsq)',
  limesurveyFormatLsqHint:
    'Eine Datei pro Frage — nur sinnvoll, um einzelne Fragen nachzutragen.',
  limesurveyStructure: 'Struktur',
  optionGroupHeadings: 'Titel der ODM-Fragengruppen als Zwischenüberschrift einfügen',
  optionGroupHeadingsHint:
    'Alle Fragengruppen eines Formulars kommen in eine LimeSurvey-Gruppe. Ihre Titel bleiben als Textanzeige-Frage (Typ X) erhalten — wie die Abschnittsüberschriften in REDCap. Sie erheben keine Daten.',
  importHint: 'So importieren Sie',
  targetRedcapLabel: 'REDCap',
  targetRedcapDescription: 'Datenwörterbuch als CSV, dazu die Zuordnung der Variablennamen.',
  targetRedcapImport: 'Project Setup → Data Dictionary → Upload',
  targetLimesurveyLabel: 'LimeSurvey',
  targetLimesurveyDescription: 'Strukturdatei (XML) mit Fragengruppen, Fragen und Antwortoptionen.',
  targetOdmLabel: 'CDISC ODM',
  targetOdmDescription: 'Gültiges ODM 1.3.2 mit allen Sprachen und Metadaten — verlustfrei.',
  targetOdmImport: 'OpenEDC: Import → ODM XML',
  targetCodebookLabel: 'Anderes System / Codebuch',
  targetCodebookDescription:
    'Eine Zeile pro Frage, alle Sprachen — für den eCRF-Aufbau von Hand und die Dokumentation.',
  targetCodebookImport: 'Öffnet sich in Excel',
  linkCoredataset: 'Kerndatensatz im MDM-Portal',
  linkCoredatasetTitle: 'Der DZIF-Kerndatensatz im Medical Data Models Portal (Heidelberg)',
  linkTibbd: 'TI BBD',
  linkTibbdTitle: 'TI Bioressourcen, Biodaten und digitale Gesundheit (TI BBD) im DZIF',
  linkDzif: 'dzif.de',
  linkGithub: 'GitHub',
  linkGithubTitle: 'Quellcode, Releases und Fehlermeldungen auf GitHub',
  appVersion: 'App-Version',
  logoAlt: 'Deutsches Zentrum für Infektionsforschung',
  about: 'Über',
  aboutText:
    'Dieses Werkzeug hilft Ihnen, den DZIF-Kerndatensatz in Ihrer Studie umzusetzen: Wählen Sie die Fragen aus, die Sie erheben, und exportieren Sie sie direkt im Format Ihres EDC-Systems — REDCap, LimeSurvey oder ein anderes. Alle Daten bleiben in Ihrem Browser; es werden keine Inhalte an einen Server gesendet.',
  disclaimer: 'Wichtig vor dem Import',
  disclaimerRisk:
    'Der Import in Ihr EDC-System erfolgt auf eigenes Risiko. Legen Sie vorher eine Sicherung Ihres Projekts an — in vielen Systemen lässt sich ein Import nicht ohne Weiteres zurücknehmen.',
  disclaimerLegal:
    'Welche Fragen Sie erheben, wirkt sich auf Ihr Datenschutzkonzept, die Einwilligungserklärung und weitere rechtliche Anforderungen aus. Stimmen Sie die Auswahl mit den zuständigen Stellen Ihrer Einrichtung ab und holen Sie Unterstützung ein, wenn Sie unsicher sind.',
  licenseLine: 'Quellcode unter der Apache-Lizenz 2.0. „DZIF“ und das DZIF-Logo sind Marken des Deutschen Zentrums für Infektionsforschung und von der Lizenz nicht erfasst.',
  sourceFile: 'Quelldatei',
  odmCreated: 'ODM erstellt',
};

const en: Strings = {
  appTitle: 'DZIF core dataset — selection for your EDC system',
  appSubtitle:
    'Pick questions from the DZIF core dataset and export them for REDCap, LimeSurvey, CDISC ODM or another EDC system.',
  loading: 'Loading the core dataset …',
  loadError: 'The core dataset could not be loaded.',
  retry: 'Try again',

  search: 'Search',
  searchPlaceholder: 'Question, item name or answer option …',
  filter: 'Filter',
  filterAll: 'All',
  filterCore: 'Mandatory only',
  filterSelected: 'Selected only',
  filterUnselected: 'Unselected only',
  filterWithLogic: 'With skip logic only',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  noMatches: 'No question matches the search.',
  matches: 'matches',

  presets: 'Presets',
  selectCore: 'Select mandatory core dataset',
  selectCoreHint: 'Selects every mandatory question — the elements DZIF studies have to collect.',
  selectAll: 'Select everything',
  clear: 'Clear selection',
  addDependencies: 'Add required questions',
  addDependenciesHint:
    'Adds the questions that the skip logic of your selected questions reads. Without them the logic cannot be translated.',

  selected: 'selected',
  ofQuestions: 'of',
  coreCoverage: 'mandatory questions',
  coreComplete: 'Core dataset complete',
  coreIncomplete: 'Core dataset incomplete',
  missingDeps: 'missing referenced questions',
  forms: 'forms',
  groups: 'question groups',

  badgeCore: 'mandatory',
  badgeCoreTitle: 'Belongs to the mandatory DZIF core dataset',
  badgeMandatory: 'ODM required',
  badgeMandatoryTitle: 'Marked Mandatory="Yes" in the ODM file',
  badgeRepeating: 'repeating',
  badgeRepeatingTitle: 'This question group can be collected more than once',
  badgeLogic: 'skip logic',
  badgeLogicTitle: 'Only collected under a condition — see the details',
  badgeInconsistent: 'incomplete marker',
  badgeInconsistentTitle:
    'The * marker is present in only some of the languages — please report this to DZIF',

  itemName: 'Item name',
  dataType: 'Data type',
  answerOptions: 'Answer options',
  hint: 'Hint',
  unit: 'Unit',
  range: 'Range',
  collectedOnlyIf: 'Collected if',
  dependsOn: 'Depends on',
  showDetails: 'Show details',
  hideDetails: 'Hide details',

  exportTitle: 'Export',
  exportOptions: 'Options',
  advancedOptions: 'Advanced options',
  advancedOptionsHint:
    'The defaults suit most studies — here you can fine-tune what the export contains.',
  optionKeepMarker: 'Keep the * marker in question texts',
  optionHints: 'Carry hints over as field notes',
  optionSkipLogic: 'Translate skip logic',
  optionMandatory: 'Carry over required-field flags',
  optionRecordId: 'Prepend a record_id field (REDCap needs one)',
  optionDropdown: 'Use a dropdown from this many answer options on',
  download: 'Download',
  downloadAll: 'Download all files',
  reportTitle: 'Notes on this export',
  reportEmpty: 'none',
  reportWarnings: 'warnings',
  reportInfos: 'notes',
  exportAllLanguages:
    'Exports always contain every language of the dataset ({languages}). The interface language decides which one leads: the field label language in REDCap, the base language of the survey in LimeSurvey.',
  nothingSelected: 'Please select some questions first.',
  files: 'Files',

  saveSelection: 'Save selection',
  loadSelection: 'Load selection',
  restoredUnknown: 'These questions from the file do not exist in the loaded core dataset:',
  restoredFallback:
    'The selection was restored via item OIDs, because the structure of the dataset has changed.',
  versionLabel: 'Dataset version',
  versionCurrent: 'current',
  versionSwitched: 'Version {id} loaded.',
  versionSwitchedDropped:
    'Version {id} loaded. {count} selected question(s) do not exist in this version — they were removed from the selection.',
  infoButton: 'Dataset info',
  infoTitle: 'About this dataset',
  infoVersion: 'Version',
  infoCurrent: 'newest',
  infoOlder: 'older',
  infoLoaded: 'loaded',
  infoStudyName: 'Study name in the ODM',
  infoOdmVersion: 'Format',
  infoLanguages: 'Languages',
  infoContent: 'Content',
  infoQuestions: 'questions',
  infoCodeLists: 'code lists',
  infoConditions: 'conditions',
  infoRuleMarker: 'Recognised by the * marker in the question text, as documented by DZIF.',
  infoRuleMandatory:
    'This version carries no * marker. Questions flagged Mandatory="Yes" in the ODM are treated as mandatory instead — a different definition from newer versions.',
  infoMdm: 'MDM portal',
  infoAllVersions: 'Available versions',
  infoSwitchHint: 'Switch versions with the drop-down in the header.',
  infoDescription: 'Description from the ODM file',
  infoOtherLanguage: 'Show the other language',
  uiLanguage: 'Language',
  openExport: 'Export',
  closeDialog: 'Close',
  exportIntro:
    'The export produces the files you import into your EDC system. Read the notes afterwards — they say what still needs your attention in your system.',
  targetQuestion: 'Which EDC system do you use?',
  limesurveyFormat: 'LimeSurvey file format',
  limesurveyFormatLsg: 'Forms (.lsg)',
  limesurveyFormatLsgHint:
    'One file per ODM form, e.g. "Ward round" — to import into an existing survey. Recommended.',
  limesurveyImportLsg: 'Open the survey → Question groups → Import a question group, once per file',
  limesurveyImportLsq: 'Open the question group → Import a question, once per file',
  limesurveyFormatLsq: 'Single questions (.lsq)',
  limesurveyFormatLsqHint: 'One file per question — only worth it to add single questions later.',
  limesurveyStructure: 'Structure',
  optionGroupHeadings: 'Insert ODM question group titles as headings',
  optionGroupHeadingsHint:
    'All question groups of a form go into one LimeSurvey group. Their titles are kept as text-display questions (type X) — the equivalent of REDCap\'s section headers. They collect no data.',
  importHint: 'How to import',
  targetRedcapLabel: 'REDCap',
  targetRedcapDescription: 'Data dictionary as CSV, plus the mapping of the variable names.',
  targetRedcapImport: 'Project Setup → Data Dictionary → Upload',
  targetLimesurveyLabel: 'LimeSurvey',
  targetLimesurveyDescription:
    'Structure file (XML) with question groups, questions and answer options.',
  targetOdmLabel: 'CDISC ODM',
  targetOdmDescription: 'Valid ODM 1.3.2 with every language and all metadata — lossless.',
  targetOdmImport: 'OpenEDC: Import → ODM XML',
  targetCodebookLabel: 'Other system / codebook',
  targetCodebookDescription:
    'One row per question, all languages — for building the eCRF by hand and for documentation.',
  targetCodebookImport: 'Opens in Excel',
  linkCoredataset: 'Core dataset in the MDM portal',
  linkCoredatasetTitle: 'The DZIF core dataset in the Medical Data Models portal (Heidelberg)',
  linkTibbd: 'TI BBD',
  linkTibbdTitle: 'Bioresources, Biodata and Digital Health (TI BBD) at DZIF',
  linkDzif: 'dzif.de',
  linkGithub: 'GitHub',
  linkGithubTitle: 'Source code, releases and issue tracker on GitHub',
  appVersion: 'App version',
  logoAlt: 'German Center for Infection Research',
  about: 'About',
  aboutText:
    'This tool helps you put the DZIF core dataset to work in your study: pick the questions you collect and export them straight into the format of your EDC system — REDCap, LimeSurvey or another one. Everything stays in your browser; no content is sent to a server.',
  disclaimer: 'Before you import',
  disclaimerRisk:
    'Importing into your EDC system is at your own risk. Make a backup of your project first — in many systems an import cannot easily be undone.',
  disclaimerLegal:
    'Which questions you collect affects your data protection concept, your informed consent form and further legal requirements. Agree your selection with the responsible people at your institution, and ask for support if you are unsure.',
  licenseLine: 'Source code under the Apache License 2.0. "DZIF" and the DZIF logo are trademarks of the German Center for Infection Research and are not covered by that licence.',
  sourceFile: 'Source file',
  odmCreated: 'ODM created',
};

export const strings: Record<UiLang, Strings> = { de, en };
