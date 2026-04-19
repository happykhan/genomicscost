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

### Known gaps between web app and Excel (as of 2026-04-19)

These are tracked as GitHub issues:

| # | Gap | Excel behaviour | Our behaviour |
|---|---|---|---|
| GAP-1 | Equipment maintenance cost | 15% of unit cost per year added to annual equipment cost | Not implemented — annual equipment cost underestimated |
| GAP-2 | Equipment age | Depreciation adjusted for existing equipment age (remaining value / remaining life) | Always depreciate from new |
| GAP-3 | Equipment % use for sequencing | Per-item scaling factor for cost attribution | 100% always attributed to sequencing |
| GAP-4 | Transport % use for sequencing | Per-item % of transport cost attributed to sequencing programme | 100% always attributed — no pct field in TransportItem |

### Acceptance tests

See `src/lib/who-gct-acceptance.test.ts` for the test suite that verifies
web app calculations match this Excel. Tests are annotated with GAP comments
where known divergences exist.
