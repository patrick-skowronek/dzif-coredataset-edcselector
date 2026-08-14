# DZIF Core Dataset EDC Selector

Pick the questions your study needs from the
[DZIF CoreDataSet](https://mdm.mi.uni-heidelberg.de/46192?form-id=5) and export them
ready to import into the EDC system you use — REDCap, LimeSurvey, any ODM-capable
system, or a plain codebook.

A static web app: HTML, CSS, one JS file and the ODM files. No server and no upload —
the dataset ships with the app and everything happens in your browser.

## Test it

```bash
npm install
npm run dev
```

Then open the printed URL:

1. Select the mandatory core dataset with one click — the questions every DZIF study
   has to report. Add more by browsing the forms or searching question texts, item
   names and answer options.
2. If the bar reports missing referenced questions, add them: skip logic that reads an
   unselected question cannot be translated.
3. Export, answer *which EDC system do you use?*, download the ZIP.

Saving the selection writes a small JSON file to share with colleagues or re-open
later. The interface is available in German and English.

## Export targets

| Target | Files | How to import |
| --- | --- | --- |
| REDCap | `dzif_redcap_data_dictionary.csv` + variable mapping and translations | Project Setup → Data Dictionary → Upload |
| LimeSurvey | one `.lsg` per ODM form (or one `.lsq` per question) + question and answer code mappings | Open the survey → Question groups → Import a question group |
| CDISC ODM | `dzif_coredataset_subset.xml` | OpenEDC: Import → ODM XML, and other CDISC tools |
| Codebook | `dzif_codebook.csv` | Opens in Excel, for building the eCRF by hand and for documentation |

Every export carries all languages of the dataset and includes
`dzif_export_report.txt`, which lists what needs your attention in the target system.

Two limits worth knowing before you map data back:

- **REDCap** variable names are capped at 26 characters, so long item names are
  shortened. `dzif_variable_mapping.csv` holds the full mapping, and every field
  carries its ODM OID in the field annotation.
- **LimeSurvey** answer codes are capped at 5 alphanumeric characters, so 225 DZIF
  codes such as `LIQUID_EDTA_PLA` are replaced by generated ones. You need
  `dzif_limesurvey_answer_codes.csv` to map collected data back to the DZIF code list.

## Adding a new version of the core dataset

1. Put the ODM file in `public/odm/`, named after the id DZIF publishes it under, e.g.
   `46195_DZIF-Kerndatensatz.xml`.
2. Add an entry to `public/odm/versions.json`:

   ```json
   { "id": "46195", "file": "46195_DZIF-Kerndatensatz.xml", "created": "2026-01-15",
     "mdmUrl": "https://mdm.mi.uni-heidelberg.de/46195?form-id=5" }
   ```

3. Run `npm test` — it checks that the file is readable and that `created` matches its
   `CreationDateTime`.

No code change needed. The newest date becomes the default, and the app remembers the
version each user last had open.

## Development

```bash
npm test          # parser, exporters, zip writer (Vitest)
npm run check     # svelte-check + TypeScript
npm run build     # static bundle in dist/
npm run preview   # serve the built bundle
```


## Ideas for later

Nothing here is promised; it depends on whether the tool proves useful.

- **A library for any ODM file.** The parser and exporters under `src/lib` are not
  DZIF-specific — they read CDISC ODM 1.3.2 and write REDCap, LimeSurvey and ODM.
  Only two things tie the app to DZIF: the rule that recognises the mandatory core
  dataset, and the branding. Published as an npm package, other projects could convert
  their own ODM files.

## Before you import

Importing into your EDC system is at your own risk. Make a backup of your project
first — in many systems an import cannot easily be undone.

Which questions you collect affects your data protection concept, your informed
consent form and further legal requirements. Agree your selection with the responsible
people at your institution, and ask for support if you are unsure.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Every dependency is
permissively licensed and build-time only; the only third-party code in the bundle is
the Svelte runtime (MIT).

Two things in this repository are **not** covered by that licence:

- **The DZIF core dataset** in `public/odm/` is DZIF content, bundled for convenience.
  The authoritative version is the one in the
  [MDM portal](https://mdm.mi.uni-heidelberg.de/46192?form-id=5).
- **The DZIF logo and name** in `public/dzif-logo*.svg` are trademarks. Section 6 of
  the Apache licence grants no trademark rights; replace them in derivative works
  published outside DZIF.
