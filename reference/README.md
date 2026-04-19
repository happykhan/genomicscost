# Reference Materials

## WHO-GCT-B09722-eng-2nd-edition.xlsx

The official WHO Genomics Costing Tool, second edition Excel workbook.

**Source:** WHO publication B09722-eng, 2026  
**Licence:** CC BY-NC-SA 3.0 IGO  
**Contact:** eulab@who.int  
**Manual:** https://iris.who.int/handle/10665/384933

This file is the canonical reference for all cost calculations in this web
app. When in doubt about methodology, consult this workbook.

### Sheet structure

| Sheet | Purpose |
|---|---|
| Cover | Intro, language selector |
| Data entry | Primary user inputs (sequencer, pathogen, coverage) |
| Reagents and consumables | Per-workflow consumable costs |
| Equipment | Capital equipment + depreciation + maintenance |
| Personnel and training | Staff salaries and time allocation |
| Facility and transport | Rent, utilities, shipping |
| Bioinformatics | Cloud / in-house / hybrid compute costs |
| Quality management | Accreditation, EQA, QC costs |
| Results - USD | Final cost summary (matches our Step 7) |
| Results - local currency | Same results converted via exchange rate |
| Annex1_Library Prep | Library prep kit catalogue |
| Annex2_Equipment | Equipment catalogue with prices |
| Annex3_Reagents and Consumables | Reagent catalogue |
| Annex4_Coverage Sample Calc | Run sizing calculator (Annex 2 methodology) |

### Confirmed-correct calculations (vs Annex 2)

- Run sizing formula: steps 1–6 of Annex 2 match `calculateSamplesPerRun()` exactly
- Min reads table (Table A2.1) matches `minReadsForPathogen()` exactly
- Default coverage for SARS-CoV-2 = 10× (Table A3.1) — doesn't affect run sizing since
  min reads (100 000) always dominates for genome ≤ 0.03 Mb

### Known gaps between web app and Excel (as of 2026-04-19)

| # | Gap | Excel behaviour | Our behaviour |
|---|---|---|---|
| GAP-1 | Equipment maintenance cost | 15% of unit cost/yr × pct_sequencing added as annual operational cost | Not implemented — annual equipment cost underestimated by ~40% |
| GAP-2 | Equipment age in depreciation | remaining_life = lifespan − age; depreciation = total_cost / remaining_life | Always depreciate from new (ignores age field) |
| GAP-3 | Equipment % use for sequencing | Per-item scaling factor (e.g. 85%) applied to both depreciation and maintenance | 100% always attributed to sequencing |
| GAP-4 | Transport % use for sequencing | Per-item % of transport cost attributed to sequencing programme | 100% always attributed — no pct field in TransportItem |
| GAP-5 | Incidental consumable costs | 7% of total reagent/consumable costs auto-added (gloves, lab coat, PPE, etc.) | Not implemented |
| GAP-6 | Toggle misaligns with WHO | Excel ALWAYS includes equipment operational cost (depreciation + maintenance) in annual total. "Running cost" in WHO = operational including equipment | Our "Running cost" toggle *excludes* equipment depreciation — this is not a WHO concept |

### Equipment operational cost formula (from manual Fig. 6 + Annex 2)

```
remaining_life    = lifespan_years − age_years
depreciation/yr   = (unit_cost × qty) / remaining_life × (pct_sequencing / 100)
maintenance/yr    = (unit_cost × qty) × 0.15 × (pct_sequencing / 100)
annual_op_cost    = depreciation/yr + maintenance/yr
```

Example from manual (Illumina MiSeq, qty=1, cost=$99 000, lifespan=10, age=2, pct=85%):
- depreciation = 99,000 / 8 × 0.85 = $10,519/yr
- maintenance  = 99,000 × 0.15 × 0.85 = $12,623/yr
- annual_op    = $23,142/yr

### Acceptance tests

See `src/lib/who-gct-acceptance.test.ts` for the test suite that verifies
web app calculations match this Excel. Tests are annotated with GAP comments
where known divergences exist.
