# CAD Translate — Translation Studio

A local React, TypeScript, and Vite prototype for translating drawing text, either by replacing the original file's current text or by creating a separate translated copy. Each file has one primary language and each object has one current text value. Reports connect before/after snapshots to exact objects in the drawing.

**Gemini simulates Autodesk MT.** Files, folders, and drawings are JSON-backed browser records. There is no real DWG parsing, Autodesk integration, server infrastructure, or deployment.

## Run locally

Requires **Node.js 22.12 or newer** and npm:

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:5173**, or the address Vite prints. **Offline demo** works without an API key or internet at runtime. Fonts, icons, drawings, and translation fixtures are local.

## Optional Gemini configuration

```powershell
Copy-Item .env.example .env.local
```

Set the following values and restart Vite:

```dotenv
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-3.5-flash-lite
```

Create a key in [Google AI Studio](https://aistudio.google.com/apikey). The default model is listed in Google's [model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite); account access and quotas apply. With a key configured, **Gemini simulation** is the default. Switch providers using the header dropdown. Service failures are reported without silently switching to offline mode.

**Browser API keys are visible.** Every `VITE_*` value is included in browser-accessible code. Use a dedicated restricted demo key and keep `.env.local` out of source control. Production service requests would require an authenticated backend.

## Translation workflow

Open a drawing and choose **Translate All**, or click annotations and choose **Translate Selection**. From Home, **Translate Drawings** lets you select multiple files first. Use **Search files** to find filenames, including searches such as `site plan` or `level 02`. Checked files remain selected when later searches hide them; the selection count stays visible. Clear the search to review all checked files before Continue.

The compact dialog has a **searchable target-language dropdown**, selected-language chips, a live MT submission preview, and two output choices. Open **Add a language** and search by English name, native name where available, alias, or language code. Select multiple results, then click Done. Selections stay visible as chips; each chip has a remove button. Search works without case or accent sensitivity, for example `espanol` finds Spanish.

The local catalogue includes 7,925 choices drawn from the [IANA Language Subtag Registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry), using its 2026-09-17 snapshot. It includes current registered individual/macrolanguage subtags, including rare and historical languages, plus explicit Simplified/Traditional Chinese choices. Deprecated identifiers, language collections, and non-language codes are excluded. No catalogue request is made at runtime. Translation availability and quality depend on the Gemini service; a catalogue entry does not guarantee model support.

**Offline fixtures cover English, French, German and Simplified Chinese.** Selecting another language shows a message that Gemini is required. Offline attempts produce explicit failures and preserve input text; the prototype never silently switches providers. English is also a target, so a known French fixture can be translated into a separate English file.

Choose your output:

- **Create translated copy** is the default. Multiple targets create a separate copy for each selected language, all from the same input text. Copies appear on Home in virtual folders such as `Translations/FR/`.
- **Translate original file** is available for a single target language. It replaces eligible current text and keeps the filename. Before/after text survives in report history only. Choosing a second language automatically selects copies and disables original replacement, since each file has one language.


The **MT API preview** shows eligible text submissions per selected language and the total before Translate is pressed. It uses the same scope and fixed eligibility rules as the job engine. Previously translated text is included again, even when its current language matches the target; prior reports and object statuses never prevent a request. For example, Locate demo counts 3 submissions for French or 9 for three languages, while locked and unsupported objects are excluded. These are text submissions, not HTTP request or retry counts. Offline mode labels them as simulated submissions and makes no API calls. Previewing or cancelling never starts translation.

There is no separate preview step, glossary, preset, editable filter, replacement toggle, or language-version panel. The workspace shows a read-only file-language badge. Canvas editing changes that file's current text.

Successful output updates the object's text and language. Skipped or failed objects retain their input text, so translated files can contain exceptions. An amber dot and “Some input text retained” identify objects whose actual language differs from the file's primary language. Each object's tooltip also includes its latest status and reason. Copies use the base drawing name and target suffix, such as `Site_Plan_FR.dwg`; collisions become `Site_Plan_FR_2.dwg`, `Site_Plan_FR_3.dwg`, and so on.

## Try Locate demo

On Home, click **Try Locate demo**. This opens a fresh English `Locate_Demo.dwg`, selects Offline demo and French, then shows the ordinary translation dialog. Leave **Create translated copy** selected and click **Translate**.

The normal job engine processes five spatially separated objects with the **exact same submitted source text, FIRE PUMP ROOM**:

| Object ID | Result | Reason |
|---|---|---|
| `locate-demo-translated` | Translated | Supported, unlocked object with enough room |
| `locate-demo-overflow` | Warning | The French translation exceeds its narrow bounds |
| `locate-demo-locked` | Failed | Locked object; no request or write allowed |
| `locate-demo-unsupported` | Skipped | Unsupported object type; no request |
| `locate-demo-unchanged` | Skipped | Offline MT deliberately returns this object's submitted text |

Filter **Warnings**, then click **Locate**. The canvas opens the output file, centers and highlights only `locate-demo-overflow`. A compact navigator shows its ID, translated or retained text, status, and reason. The full report table stays on the reports page, leaving the drawing canvas visible. There is one Warning instance, so Previous and Next are disabled. Click **Back to report**, choose **Skipped**, and Locate the unsupported object. Next visits the other Skipped instance, whose text was returned unchanged; Previous returns to the unsupported object. Locate Translated or Failed rows separately from the report.

This demonstrates why searching for words alone is insufficient: identical labels can require different actions. Locate uses the output drawing ID and stable object ID. Its instance navigation matches both the original source snapshot and the located row’s status. It can cross drawings and target-language copies while staying within that status.

The unchanged fixture is tied only to `locate-demo-unchanged` in offline mode. Gemini results remain service-derived. The demo shortcut never clears previous outputs or reports. If an English demo input was modified, it creates a fresh numbered input; a pristine input can be reused.

## Other walkthroughs

1. **Selection:** Open `Mechanical_Plan.dwg`, click its first three annotations, then Translate Selection. The report contains three objects; the copy retains unselected input text.
2. **Original replacement:** Open `Level_01.dwg`, choose Translate All → Translate original file. The name stays unchanged, translated text becomes current, and old text is available in that job's report.
3. **Copy isolation:** Translate `Site_Plan.dwg` with the default output. Home shows both the English input and French copy. Editing one does not change the other.
4. **Batch:** On Home choose Translate Drawings, select the two levels and Site Plan, then Continue → choose one or more languages → Translate. Follow progress across all output files, use drawing/status report filters, and locate repeated `FFL 0.000` instances across files.
5. **Editing and recovery:** Double-click a current annotation or focus it and press F2. Edit its text and save. Reload to verify persistence. Reload during a larger batch to retain completed output and mark pending requests interrupted.

## Eligibility, service requests, and reports

Eligibility is fixed and automatic. MText, DBText, MultiLeader, and BlockAttribute are supported. Unsupported objects, structured Dimension/TableCell objects, empty content, numeric-only text, levels/dimensions, and short drawing codes are skipped with explicit reasons. Locked eligible objects are Failed and never sent. Prior translation status and target-language matches do not exclude an object. Eligible current text is sent again for every selected language, including same-language requests. Language metadata identifies the current source language for the provider.

Each eligible object's **whole current text** goes directly to MT. There is no glossary, placeholder masking, or splitting around protected phrases. Requests use the actual object source language, grouped by language in sequential batches of at most five objects. Partially translated files can therefore produce more than one source-language group.

A service returning the submitted string is Skipped with **MT API returned the submitted text unchanged**, or the explicitly labeled offline equivalent. Automatic exclusions also use Skipped; the reason explains what happened. A returned string that matches the input keeps its current text and language. Unknown edited content produces an explicit offline fixture failure. The offline mechanical fixture also deliberately fails `VERIFY DUCT CONNECTION`.

Gemini requests use structured JSON. Response IDs, duplicates, empty text, and response shape are validated before writes. Requests time out after 30 seconds, with one bounded retry for transient network, rate-limit, and server failures. Authentication and malformed responses fail without fallback. Successful objects remain stored when other objects fail; errors cannot overwrite valid current text.

A multi-language job has one combined progress indicator and report, with separate files and row references for every target. A failure in one target does not overwrite a successful result for another. Report headings list all selected languages; each row and the Locate instance bar show the target language. Older single-target reports remain compatible.

Every report row has exactly one primary status: Translated, Warning, Failed, or Skipped. A stored translation with overflow is Warning, with only the reason **Translated text may exceed original text bounds**. The text is saved, but warning reasons no longer append a successful-save message. Existing saved warnings receive the same clearer wording; their statuses and before/after snapshots are preserved. Counts reconcile with the job scope. The report shows one row per object instance, including a dedicated Instance column. Identical text is never merged into one status or a combined reason: each row retains its own source/output drawing references, object ID, target language, type, layer, immutable before/after text, status, reason, and Locate. Counts summarize individual instances. Status filters hide other outcomes; they do not combine them. Instance counts and Previous/Next include only matching source text with the same status as the located row, even when the report filter is All. A Warning cannot advance to a Translated or Skipped result. A single matching result disables both navigation buttons. Each visited instance retains its own reason. Locate and Back to report preserve the report filters. Export report downloads the job as JSON.

Overflow compares rendered Arial text width and line height with an object's seeded text bounds. The canvas boundary uses those exact dimensions, without extra selection padding. Amber dashed bounds remain visible while an overflowing object is selected or highlighted by Locate. This is an illustrative measurement, not a CAD geometry engine.

## Drawing interactions

- Click annotations to toggle selection. Enter/Space also selects a focused object.
- Double-click or press F2 to edit the current text. Locked objects refuse edits. Historical report snapshots never change when text is edited.
- Drag empty canvas space to pan, or choose the Pan tool. Use the wheel or zoom buttons; Fit drawing restores the overview.
- Locate opens the report's output file, centers its object, selects it, and briefly highlights it. It does not switch languages.
- Ordinary drawing files have no Report button or report table. Opening **Translation reports** on Home shows the full report. **Locate** opens the output drawing with only a compact instance navigator: Previous/Next, translated or retained text, status, reason, and **Back to report**. The navigator traverses matching source text with the same status across files. Returning restores the same job, status filter, drawing filter, search query, and report scroll position.

## Persistence and migration

Drawings, edits, copies, and reports are saved in version 2 browser `localStorage`. Completed batches persist incrementally. After a reload, a running job becomes Interrupted; completed text remains and unfinished objects show a recovery reason. No API requests automatically restart. Start another job to process remaining eligible text.

Existing version 1 workspaces migrate without a reset. English source and each saved target version become separate single-language files. Existing translations and manual edits are retained, with English text for untranslated exceptions. Geometry, stable object IDs, and copy lineage survive. Old report snapshots remain unchanged and their source/output references are remapped to the corresponding migrated files. Obsolete glossary and preset settings are omitted from version 2. Saved Unchanged report and object statuses are converted to Skipped on load, preserving reasons, text snapshots, and Locate references. Migration is saved once; the old storage key remains an unused backup.

**Reset demo data** asks for confirmation and restores the five original demo drawings, clearing current edits, copies, and reports. Storage is per browser and origin; use the same development port for the same workspace. A banner explains if saving fails because storage is unavailable or full.

## Validation

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover catalogue integrity, native-name/alias/code search, filename matching, global and English targets, provider language availability, fixed eligibility, live submission counts, repeat translations after reload, unified Skipped results and saved-status compatibility, multiple-language copy isolation, original replacement, current editing, source-language grouping, per-output progress, partial recovery, migration and report references, independent outcomes for identical labels and object IDs across drawings/targets, offline fixtures, and mocked Gemini success/authentication/rate limits/timeouts/malformed responses.

Playwright covers searchable global language selection and chip removal, keyboard dropdown interaction, hidden file-selection preservation, compact Locate navigation and preserved report filters/scroll position, global Gemini outputs and reload, submission previews with no premature requests and same-target resubmissions after reload, multiple-target selection and validation, independent language copies and batch progress, the compact dialog and removed controls, five-instance Locate demo with four statuses, per-instance reasons and persisted cross-drawing Locate references, isolation of different-status language results, same-status instance navigation and boundary controls, selection, copies, original replacement, batch progress, editing, legacy migration, partial recovery, reset, and laptop/presentation/narrow layouts. Gemini HTTP calls are intercepted using a dummy key; tests consume no real quota. Tests run on a separate Vite server at port 5175, leaving the user app on port 5173. Screenshot artifacts are written under `test-results/`.

```powershell
npm run build
npm run preview
```

## Source structure

```text
src/
  App.tsx                    State, persistence and navigation
  types.ts                   Single-language drawings and job/report contracts
  languages.ts               Global language catalogue, search and offline availability
  core.ts                    Fixed eligibility, copies, editing and migration
  jobs.ts                    Source-language batches and incremental write-back
  providers.ts               Gemini and deterministic offline providers
  core.test.ts               Core/job/migration tests
  providers.test.ts          Provider/service validation tests
  styles.css                 Interface and responsive styles
  components/
    DrawingCanvas.tsx        SVG geometry, editing, selection, pan/zoom and Locate
    Workflow.tsx             Searchable file selection, multiple targets, MT submission counts and output choices
    LanguagePicker.tsx       Searchable language dropdown and selected chips
    Report.tsx               Full report, filters and preserved view position
    InstanceNavigator.tsx    Compact Locate details, Previous/Next and report return
    UI.tsx                   Dialogs and badges
  data/
    Level_01.json
    Level_02.json
    Mechanical_Plan.json
    Site_Plan.json
    Locate_Demo.json
    translations.json        French/German/Chinese offline fixtures
    languages.json           Bundled IANA language catalogue
tests/workflows.spec.ts
.env.example
playwright.config.ts
```

The four project drawings contain 26 objects each; Locate Demo adds five. Geometry is illustrative SVG. Offline fixtures cover seeded annotations and can translate known fixture values between English, French, German and Simplified Chinese. Global targets require Gemini. Arbitrary edited text requires Gemini. Real files, CAD integration, server storage, collaboration, authentication, deployment, and drawing-context understanding remain outside this local prototype.
