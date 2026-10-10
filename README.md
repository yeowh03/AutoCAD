# CAD Translate — Translation Studio

A functional, AutoCAD-inspired prototype of an enhanced drawing translation workflow. It demonstrates selection and whole-drawing translation, batch jobs, preview/filtering, safe outputs, glossary protection, language versions, progress, and reports that navigate back into the drawing.

**Gemini simulates the output of Autodesk MT.** This prototype does not integrate with Autodesk, AutoCAD, real DWG files, or a production translation engine.

## Run locally

Requires **Node.js 22.12 or newer** and npm. From this folder:

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:5173** (or the URL printed by Vite). The application works immediately in **Offline demo** mode. It does not need an API key, internet access at runtime, or a backend server. Fonts, drawings, icons, and translation fixtures are local.

## Optional Gemini configuration

Create `.env.local` from the example:

```powershell
Copy-Item .env.example .env.local
```

Set these values, then restart the development server:

```dotenv
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-3.5-flash-lite
```

Create a valid key in [Google AI Studio](https://aistudio.google.com/apikey). Model access, quotas, and billing depend on your account. The default is documented in Google's [model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite); change `VITE_GEMINI_MODEL` if necessary.

With a key configured, **Gemini simulation** becomes the default provider. Use the header selector or translation setup to explicitly choose Offline demo instead. Real service errors are reported; they never silently trigger offline translation.

### Browser key visibility

This prototype intentionally calls Gemini directly from the browser, as selected for the local demo. **Every `VITE_*` value is included in browser-accessible code.** Use a dedicated, restricted demo key, keep `.env.local` out of source control, and avoid publishing a build containing a valuable key. A production implementation should route service requests through an authenticated server.

## Demo walkthroughs

1. **Single drawing:** Open `Level_01.dwg` → choose French → Translate All → optionally configure filters → Review preview → Add French to this DWG → Start translation. Watch progress, filter Warnings in the report, Locate a result, switch English/French, and select Bilingual display.
2. **Selection:** Open `Mechanical_Plan.dwg`, click three annotations (the first row is suitable), and choose Translate Selection. The preview and report contain only those objects. Click an object again or use Clear to remove it from the selection.
3. **Separate copy:** Open `Site_Plan.dwg` → Translate All → Review preview → Create translated copy. Home shows both `Site_Plan.dwg` and `Site_Plan_FR.dwg`. The source drawing has no new translations. Name collisions become `_FR_2`, `_FR_3`, etc.
4. **Batch:** On Home choose Translate Drawings → select multiple files → Continue → choose a reusable preset and click Load Preset → Review preview → choose same-file languages or copies → Start translation. Review per-file progress, drawing filters, and cross-drawing instance navigation. Architectural Notes works well with the two level drawings and Site Plan; Mechanical Notes is intended for Mechanical Plan.
5. **Glossary:** Translate `INSTALL AHU-01 ABOVE CEILING` and `CONNECT DN100 TO HVAC SYSTEM` in Mechanical Plan. AHU-01, DN100, and HVAC stay unchanged. In Project glossary, add a French preferred translation for `Fire Pump Room`, then translate an eligible occurrence to verify exact preferred wording.

Offline mode also includes a deliberate service failure for **VERIFY DUCT CONNECTION**, four locked objects (one per drawing), unsupported proxy notes, and translations whose rendered text exceeds narrow original bounds. Exception simulation does not inject failures into live Gemini responses.

## Drawing interactions

- Click text to toggle selection; selected bounds turn cyan.
- Double-click text to open the ordinary drawing text editor. Keyboard users can focus an object and press **F2** to edit, or **Enter/Space** to select it.
- Drag empty canvas space to pan, or select the Pan tool to drag anywhere. Use the wheel or zoom buttons to zoom; Fit drawing restores the overview.
- Locate opens the correct output drawing, centers the object, selects its language, and temporarily highlights it. Skipped objects display their source. The report remains available beneath the canvas.
- Repeated report text has an instance link and Previous/Next controls, including instances across files.
- Edit the selected target language without changing the English source. In bilingual mode the editor explicitly identifies its language. Editing English invalidates all translations for that object. Locked objects refuse edits.
- An amber dot means a missing target translation falls back to English. Amber dashed bounds indicate possible overflow. Bilingual layout is illustrative rather than CAD-accurate.

## Settings and safety behavior

- Default types: MText, DBText, MultiLeader, and BlockAttribute. Dimensions and Table Cells are optional. All layers are initially enabled; numeric, dimension/level, and short-code exclusions are enabled.
- Custom exclusion patterns are case-insensitive regular expressions. Invalid, excessively long, and common dangerous nested patterns are rejected. Filters are deterministic; no AI interprets drawing semantics.
- Presets save type/layer/pattern filters. Target language, provider, output mode, and replacement remain explicit job choices.
- Protected glossary terms apply to every target language. Preferred translations belong to a particular target language. Longest matching phrases are kept locally. Only the surrounding text pieces go to MT, and their results are joined around the unchanged terms or user-defined preferred values. There are no placeholder tokens or instructions to MT about preserving terms. Translating pieces independently can reduce sentence fluency or prevent natural word reordering.
- Existing target values and manual edits are preserved by default. Explicitly enable Replace existing translations to regenerate them. Failed attempts retain any prior target text.
- Preview partitions the actual detected scope into Included, Excluded/preserved, and Locked/blocked. Locked content never gets sent for translation. The final report records locked writes as failures.
- Glossary-only protected text is **Skipped — Listed in glossary (do not translate); not sent to MT API**, even when it also looks like a short code. Text actually returned unchanged by Gemini is **Unchanged — MT API returned the submitted text unchanged**. Existing saved translations have a separate **Existing translation preserved; not sent to MT API** reason. Offline results explicitly name the offline MT simulation.
- Report statuses are mutually exclusive: Translated, Skipped, Unchanged, Failed, or Warning. A successfully stored translation with overflow is counted as Warning. Summary counts sum to the detected scope; they are not overlapping totals.
- Jobs process drawings and small batches sequentially, with up to five text pieces per request. Gemini responses are validated against segment IDs. If any piece fails, the whole object retains its previous text. Requests time out after 30 seconds; transient network, rate-limit, and server failures get one bounded retry. Other items continue after a failure.
- Copies are independent JSON-backed records with virtual folder paths such as `Translations/FR/`. They do not create real filesystem folders or genuine DWG files. Export report downloads a JSON job snapshot.

## Local persistence and recovery

Drawings, edits, copies, language versions, glossary, presets, and the latest 20 reports persist in versioned browser `localStorage`. Each completed batch is saved. Closing/reloading during translation preserves completed output and marks unfinished objects interrupted; it does not resume API requests automatically. Run a new fill-missing job to translate remaining content.

Reports describe their completed job snapshot. Later canvas edits do not rewrite historical reports. Reset demo data asks for confirmation and restores the original drawings and glossary, clearing local changes and reports. Browser storage is per origin and browser; use the same development port to see the same workspace. If storage is unavailable or full, a banner explains that changes only remain in memory.

## Validation

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` runs unit tests covering eligibility, glossary exclusion and segment reassembly, copy isolation, source protection, recovery, offline fixtures, and mocked Gemini responses/errors. Playwright covers the five complete demos, canvas editing and persistence, interrupted recovery, reset, laptop/narrow layouts, and the Gemini UI contract with intercepted HTTP responses. The test server uses a dummy key, and tests use offline data or mocked requests; they do not consume Gemini quota. Browser tests use a separate server on port 5175, so the normal demo can stay running on port 5173. Screenshot artifacts are written into `test-results/` for visual review.

To serve the production build locally:

```powershell
npm run build
npm run preview
```

## Source structure

```text
src/
  App.tsx                    Application state and navigation
  main.tsx                   React entry point
  styles.css                 Interface and responsive styling
  types.ts                   Drawing, settings, job and report contracts
  core.ts                    Filtering, glossary, copies, edits, persistence
  jobs.ts                    Sequential jobs and incremental write-back
  providers.ts               Gemini and deterministic offline providers
  core.test.ts               Core/job tests
  providers.test.ts          Provider and service error tests
  components/
    DrawingCanvas.tsx        SVG geometry, selection, pan/zoom, locate
    Workflow.tsx             Shared scope/settings/preview/output flow
    Report.tsx               Filters, navigation, instances, export
    GlossaryEditor.tsx       Protected/preferred terminology controls
    UI.tsx                   Dialogs, language selectors, badges
  data/
    Level_01.json
    Level_02.json
    Mechanical_Plan.json
    Site_Plan.json
    translations.json        French/German/Chinese offline fixtures
tests/workflows.spec.ts      End-to-end demo scenarios and visual artifacts
public/favicon.svg
.env.example
playwright.config.ts
vite.config.ts
```

## Prototype boundaries

The four drawings contain 26 objects each, and geometry is illustrative SVG. Offline fixtures support the seeded English annotations in French, German, and Simplified Chinese; arbitrary edited source text requires Gemini and produces an explicit failure in offline mode. Protected/preferred terms remain user-controlled. Text overflow is a font-measurement heuristic, and language completeness is relative to default eligible annotations. There is no DWG parsing, Autodesk integration, CAD geometry engine, collaboration, authentication, server storage, or AI drawing/context understanding.
