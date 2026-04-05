# Genomics Costing Tool

An open-source web application for estimating the cost of establishing and running a genomic surveillance laboratory. Implements the calculation methodology of the WHO Genomics Costing Tool, 2nd edition (2026) in a guided, mobile-friendly interface.

**Live:** https://genomicscost.vercel.app

---

## Features

- **7-step wizard** — pathogen selection, sequencing platform, consumables, equipment, personnel, facility/overheads, results
- **Multi-platform support** — Illumina, Oxford Nanopore, ThermoFisher, MGI; up to two sequencers simultaneously
- **Automatic samples-per-run calculation** — Annex 2 reads-based formula with barcoding limit constraints
- **Local currency** — enter an exchange rate to see costs alongside USD
- **Workflow cost breakdown** — by sample receipt, extraction, PCR, library prep, sequencing, bioinformatics
- **Export** — PDF print, CSV download, shareable link (full project state encoded in URL)
- **Multilingual** — English, French, Spanish, Russian (switchable via globe picker or `/fr`, `/es`, `/ru` URLs)
- **Dark mode** — system preference, print-safe CSS resets
- **Offline** — all calculations run in the browser; no data sent to any server
- **Save/load projects** — persisted in localStorage

---

## Tech stack

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Routing | React Router v7 |
| i18n | i18next + react-i18next |
| UI components | @genomicx/ui |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Build | Vite 8 |
| Unit tests | Vitest + Testing Library |
| E2E tests | Playwright |
| Deploy | Vercel (SPA rewrite in `vercel.json`) |

---

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright, starts dev server automatically)
npm run lint         # ESLint
npm run build        # production build
```

### Project structure

```
src/
  pages/wizard/       # Step1–Step7 wizard pages
  components/         # WizardShell, CostSummary
  store/              # ProjectContext (state + calculations)
  lib/                # calculations.ts, defaults.ts (pure functions)
  i18n/               # config.ts + locales/{en,fr,es,ru}.json
  data/               # catalogue.json (reference prices)
  types.ts
e2e/
  wizard.spec.ts      # Playwright E2E tests
```

---

## Calculations

| Category | Formula |
|---|---|
| Sequencing reagents | `(samplesPerYear / samplesPerRun) × kitPrice × (1 + retestPct/100)` |
| Library prep | `samplesPerYear × libPrepCostPerSample × (1 + retestPct/100)` |
| Consumables | `sum(qty × unitCost × samplesPerYear)` for enabled items |
| Equipment | `sum(unitCost × qty / lifespanYears)` for buy items |
| Personnel | `sum(annualSalary × pctTime/100)` |
| Training | `sum(trainingCostUsd)` per staff |
| Facility | `sum(monthlyCost × 12 × pctSequencing/100)` |
| Bioinformatics | Cloud: `costPerSample × samplesPerYear`; In-house: `annualServerCost` |

**Samples per run** (Annex 2 methodology):
1. `readsPerSample = genomeSizeMb × 1e6 × coverageX / readLengthBp`
2. `effectiveReads = maxReadsPerFlowcell × (1 − bufferPct/100)`
3. `samplesPerRun = min(floor(effectiveReads / readsPerSample), barcodingLimit) − controlsPerRun`

For capture-all (multi-pathogen) mode, minimum reads per sample is used directly.

---

## Adding a language

1. Copy `src/i18n/locales/en.json` → `src/i18n/locales/XX.json` and translate all values
2. In `src/i18n/config.ts` — import the file, add to `LANGUAGES` and `resources`

---

## Disclaimer

This tool is independent and open-source. It is not produced by, affiliated with, or endorsed by the World Health Organization.

---

## Licence

MIT
