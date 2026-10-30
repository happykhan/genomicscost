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

### Verified depreciation method

The workbook is the canonical reference. Absolute cell `Equipment!N5` uses
`IFERROR(K5/L5,0)`: total purchase cost divided by recommended lifetime.
`Q5=N5*P5` applies the sequencing share; `O5=(I5*J5)*0.15` and `R5=O5*P5`
apply annual maintenance. Age is retained as planning information, and does not
shorten the depreciation denominator. In-house bioinformatics follows the same
straight-line method (`Bioinformatics!I43=IFERROR(F43/G43,0)`).

Previous documentation incorrectly described a remaining-life denominator.
For MiSeq cost $99,000, lifetime 8 years, age 5 and 100% sequencing use,
depreciation is $12,375 and maintenance $14,850, totalling $27,225/year.

### Import and calculation limitations

The importer reads cached formula values; it does not recalculate Excel formulas.
Save/recalculate the workbook in Excel or LibreOffice before import. Primary
sequencing and library preparation prices are imported into their native fields.
Additional library preparation reagents retain explicit annual quantities in
Step 3 and must be reviewed when throughput changes. Missing prices remain zero.

The web app is a planning model, not a complete replica of every spreadsheet
formula: workflow overhead is shared evenly across six steps, and shared costs
are allocated to pathogens by sample volume. Native workbook totals and per-category
comparisons must be checked separately; a matching sum does not establish parity.

### Acceptance tests

`src/utils/importGct.real.test.ts` reads the bundled completed workbook directly.
`src/lib/who-gct-acceptance.test.ts` and calculation tests cover model assumptions.
