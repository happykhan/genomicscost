import { describe, it, expect } from 'vitest'
import i18n from './config'

void i18n

const LOCALES = ['en', 'fr', 'es', 'ru'] as const

// Keys that must be translated in every locale (value must differ from the key itself)
const REQUIRED_KEYS = [
  // Existing critical keys
  'btn_print',
  'btn_save',
  'btn_next',
  'btn_back',
  'home_title',
  'step7_title',
  'label_cost_per_sample',
  'label_annual_total',
  // New keys added in this session
  'home_what_configure',
  'btn_open',
  'btn_home',
  'label_live_cost_estimate',
  'label_salaries',
  'label_plus_training',
  'step6_desc',
  'col_label',
  'col_annual_attr',
  'opt_none_custom',
  'note_min_reads_usage',
  'note_controls_subtracted',
  'label_cost_breakdown',
  'col_category',
  'col_annual_usd',
  'col_annual_currency',
  'col_pct_of_total',
  'col_workflow_step',
  'col_cost_per_sample_usd',
  'col_cost_per_sample_currency',
  'label_total',
  'label_establishment_cost_desc',
  'opt_select_pathogen',
  'opt_capture_all_display',
  'label_genome_size_auto',
  'label_approach',
  'label_optional',
  'toast_project_saved',
  'label_unnamed_project',
  'label_no_country',
  'label_no_pathogen',
  'label_total_annual',
  'label_max_output',
  'step7_desc',
  'btn_export_csv',
  'btn_share',
  'toast_link_copied',
  'note_coverage_help',
  'note_buffer_pct_help',
  'note_retest_pct_help',
  // Price editor keys
  'btn_edit_prices',
  'btn_export_excel',
  'label_price_editor_title',
  'toast_prices_saved',
  // Error keys
  'error_copy_link',
  'error_parse_csv',
  // Tooltip keys (sample)
  'tooltip_pathogen_type',
  'tooltip_coverage',
  'tooltip_buffer_pct',
  'tooltip_annual_salary',
  'tooltip_facility_monthly',
  'tooltip_bioinformatics',
  // Chart keys
  'chart_cost_per_sample_by_category',
  'chart_total_annual_by_category',
  'chart_cost_per_sample_by_workflow',
  'chart_total_annual_by_workflow',
]

describe('i18n — all locales have required keys', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      for (const key of REQUIRED_KEYS) {
        it(`"${key}" is translated`, () => {
          const val = i18n.t(key, { lng: locale })
          // Must not fall back to the raw key
          expect(val).not.toBe(key)
          // Must not be empty
          expect(val.trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})

describe('i18n — interpolation', () => {
  it('col_annual_currency interpolates currency', () => {
    expect(i18n.t('col_annual_currency', { lng: 'en', currency: 'KES' })).toBe('Annual (KES)')
    expect(i18n.t('col_annual_currency', { lng: 'fr', currency: 'KES' })).toBe('Annuel (KES)')
    expect(i18n.t('col_annual_currency', { lng: 'es', currency: 'KES' })).toBe('Anual (KES)')
  })

  it('col_cost_per_sample_currency interpolates currency', () => {
    expect(i18n.t('col_cost_per_sample_currency', { lng: 'en', currency: 'NGN' })).toBe('Cost/sample (NGN)')
  })

  it('label_plus_training interpolates amount', () => {
    expect(i18n.t('label_plus_training', { lng: 'en', amount: '1,000' })).toBe('+ $1,000 training')
  })
})

describe('i18n — non-English locales differ from English', () => {
  const translatedKeys = [
    'home_what_configure',
    'btn_home',
    'label_live_cost_estimate',
    'label_cost_breakdown',
    'col_category',
    'col_workflow_step',
    'label_establishment_cost_desc',
  ]

  for (const key of translatedKeys) {
    it(`"${key}" differs between en and fr`, () => {
      expect(i18n.t(key, { lng: 'fr' })).not.toBe(i18n.t(key, { lng: 'en' }))
    })
    it(`"${key}" differs between en and es`, () => {
      expect(i18n.t(key, { lng: 'es' })).not.toBe(i18n.t(key, { lng: 'en' }))
    })
    it(`"${key}" differs between en and ru`, () => {
      expect(i18n.t(key, { lng: 'ru' })).not.toBe(i18n.t(key, { lng: 'en' }))
    })
  }
})
