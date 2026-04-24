/**
 * Catalogue override layer.
 *
 * The bundled catalogue (src/data/catalogue.json) is treated as read-only.
 * User edits live in localStorage as a sparse diff and are merged at runtime.
 */

import bundledCatalogue from '../data/catalogue.json'

// ── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gct.catalogue.overrides'

// ── Types mirroring the JSON structure ───────────────────────────────────────

export interface BundledCatalogue {
  _meta: { source: string; extracted: string }
  platforms: BundledPlatform[]
  library_prep_kits: BundledLibPrepKit[]
  reagents: BundledReagent[]
  equipment: BundledEquipmentItem[]
  personnel_roles: { role: string }[]
  bioinformatics_cloud: {
    cloud_platforms: BundledCloudPlatform[]
    inhouse_components: { name: string; description: string | null }[]
  }
  qms_activities: { activity: string; default_cost_usd: number | null; default_quantity: number }[]
  pathogens: BundledPathogen[]
}

export interface BundledPlatform {
  id: string
  name: string
  reagent_kits: BundledReagentKit[]
}

export interface BundledReagentKit {
  name: string
  unit_price_usd: number | null
  read_length_bp: number | null
  max_reads_per_flowcell: number
  max_output_bytes: number
  max_output_mb: number
}

export interface BundledLibPrepKit {
  name: string
  pathogen_type: string
  compatible_platforms: string[]
  pack_size: number | null
  barcoding_limit: number | null
  unit_price_usd: number | null
  enrichment_included: string
  catalog_ref: string | null
}

export interface BundledReagent {
  name: string
  category: string
  pack_size: number | null
  catalog_ref: string | null
  quantity_per_sample: number
  workflow: string
}

export interface BundledEquipmentItem {
  name: string
  category: string
  workflow_step: string
  unit_cost_usd: number | null
  catalog_ref: string | null
  recommended_quantity: number | null
  comment: string | null
}

export interface BundledPathogen {
  name: string
  type: string
  genome_type: string
  genome_size_mb: number
  required_coverage_x: number
}

export interface BundledCloudPlatform {
  name: string
  description: string | null
  pricing_model: string
}

// ── Override schema ──────────────────────────────────────────────────────────
// null = deleted by user. Partial = only changed fields. Full new record for custom rows.

export interface CatalogueOverrides {
  equipment?: Record<string, Partial<BundledEquipmentItem> | null>
  library_prep_kits?: Record<string, Partial<BundledLibPrepKit> | null>
  reagents?: Record<string, Partial<BundledReagent> | null>
  pathogens?: Record<string, Partial<BundledPathogen> | null>
  bioinformatics_cloud?: Record<string, Partial<BundledCloudPlatform> | null>
  platforms?: Record<string, {
    reagent_kits?: Record<string, Partial<BundledReagentKit> | null>
  }>
}

// ── Load / save overrides ────────────────────────────────────────────────────

export function loadOverrides(): CatalogueOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as CatalogueOverrides
  } catch {
    return {}
  }
}

export function saveOverrides(overrides: CatalogueOverrides): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

// ── Merge helpers ────────────────────────────────────────────────────────────

function mergeArray<T extends { name: string }>(
  bundled: T[],
  overrides: Record<string, Partial<T> | null> | undefined,
): T[] {
  if (!overrides) return bundled

  // Start with bundled items, applying overrides or removing nulls
  const result: T[] = []
  const overrideKeys = new Set(Object.keys(overrides))

  for (const item of bundled) {
    if (!(item.name in overrides)) {
      result.push(item)
      continue
    }
    const override = overrides[item.name]
    if (override === null) {
      // Deleted — skip
      continue
    }
    // Merge partial override onto bundled
    result.push({ ...item, ...override })
    overrideKeys.delete(item.name)
  }

  // Remaining keys are custom (user-added) rows — must be full records
  for (const key of overrideKeys) {
    const override = overrides[key]
    if (override !== null && override !== undefined) {
      result.push({ name: key, ...override } as T)
    }
  }

  return result
}

// ── Build effective catalogue ────────────────────────────────────────────────

export function getEffectiveCatalogue(overrides?: CatalogueOverrides): BundledCatalogue {
  const ov = overrides ?? loadOverrides()
  const base = bundledCatalogue as unknown as BundledCatalogue

  // Merge platforms and their nested reagent kits
  const platforms = base.platforms.map(platform => {
    const platformOverrides = ov.platforms?.[platform.id]
    if (!platformOverrides?.reagent_kits) return platform

    const mergedKits = mergeArray(platform.reagent_kits, platformOverrides.reagent_kits)
    return { ...platform, reagent_kits: mergedKits }
  })

  return {
    ...base,
    platforms,
    equipment: mergeArray(base.equipment, ov.equipment),
    library_prep_kits: mergeArray(base.library_prep_kits, ov.library_prep_kits),
    reagents: mergeArray(base.reagents, ov.reagents),
    pathogens: mergeArray(base.pathogens, ov.pathogens),
    bioinformatics_cloud: {
      ...base.bioinformatics_cloud,
      cloud_platforms: mergeArray(base.bioinformatics_cloud.cloud_platforms, ov.bioinformatics_cloud),
    },
  }
}

// ── Mutation helpers ─────────────────────────────────────────────────────────

/**
 * Set an override for a specific catalogue section + item name.
 * `value` is a partial of the item (fields that differ) or `null` to soft-delete.
 */
export function setOverride(
  section: keyof CatalogueOverrides,
  key: string,
  value: Record<string, unknown> | null,
  platformId?: string,
): CatalogueOverrides {
  const ov = loadOverrides()

  if (section === 'platforms' && platformId) {
    if (!ov.platforms) ov.platforms = {}
    if (!ov.platforms[platformId]) ov.platforms[platformId] = {}
    if (!ov.platforms[platformId].reagent_kits) ov.platforms[platformId].reagent_kits = {}
    ov.platforms[platformId].reagent_kits![key] = value as Partial<BundledReagentKit> | null
  } else if (section !== 'platforms') {
    const sectionKey = section as Exclude<keyof CatalogueOverrides, 'platforms'>
    if (!ov[sectionKey]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ov as any)[sectionKey] = {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ov[sectionKey] as any)[key] = value
  }

  saveOverrides(ov)
  return ov
}

/**
 * Reset a single row back to bundled defaults (remove its override).
 */
export function resetRow(
  section: keyof CatalogueOverrides,
  key: string,
  platformId?: string,
): CatalogueOverrides {
  const ov = loadOverrides()

  if (section === 'platforms' && platformId) {
    const kits = ov.platforms?.[platformId]?.reagent_kits
    if (kits) {
      delete kits[key]
      if (Object.keys(kits).length === 0) {
        delete ov.platforms![platformId]
      }
      if (ov.platforms && Object.keys(ov.platforms).length === 0) {
        delete ov.platforms
      }
    }
  } else if (section !== 'platforms') {
    const sectionKey = section as Exclude<keyof CatalogueOverrides, 'platforms'>
    const sectionObj = ov[sectionKey] as Record<string, unknown> | undefined
    if (sectionObj) {
      delete sectionObj[key]
      if (Object.keys(sectionObj).length === 0) {
        delete ov[sectionKey]
      }
    }
  }

  saveOverrides(ov)
  return ov
}

/**
 * Wipe all user overrides.
 */
export function resetAll(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Import / export ──────────────────────────────────────────────────────────

export function exportOverrides(): string {
  return JSON.stringify(loadOverrides(), null, 2)
}

export function importOverrides(json: string): CatalogueOverrides {
  const incoming = JSON.parse(json) as CatalogueOverrides
  const existing = loadOverrides()

  // Merge incoming into existing (incoming wins on conflict)
  const merged = mergeOverrideSets(existing, incoming)
  saveOverrides(merged)
  return merged
}

function mergeOverrideSets(a: CatalogueOverrides, b: CatalogueOverrides): CatalogueOverrides {
  const result: CatalogueOverrides = { ...a }

  const simpleSections = ['equipment', 'library_prep_kits', 'reagents', 'pathogens', 'bioinformatics_cloud'] as const
  for (const section of simpleSections) {
    if (b[section]) {
      result[section] = {
        ...(a[section] as Record<string, unknown> | undefined),
        ...(b[section] as Record<string, unknown>),
      } as CatalogueOverrides[typeof section]
    }
  }

  if (b.platforms) {
    if (!result.platforms) result.platforms = {}
    for (const [pid, pov] of Object.entries(b.platforms)) {
      if (!result.platforms[pid]) result.platforms[pid] = {}
      if (pov.reagent_kits) {
        result.platforms[pid].reagent_kits = {
          ...result.platforms[pid].reagent_kits,
          ...pov.reagent_kits,
        }
      }
    }
  }

  return result
}

export function exportEffective(): string {
  return JSON.stringify(getEffectiveCatalogue(), null, 2)
}

// ── Query helpers for the UI ─────────────────────────────────────────────────

/** Check if a given item has a user override (edit, add, or delete). */
export function getOverrideStatus(
  section: keyof CatalogueOverrides,
  key: string,
  platformId?: string,
): 'none' | 'edited' | 'custom' | 'deleted' {
  const ov = loadOverrides()
  const base = bundledCatalogue as unknown as BundledCatalogue

  let overrideValue: unknown = undefined
  let isBundled = false

  if (section === 'platforms' && platformId) {
    overrideValue = ov.platforms?.[platformId]?.reagent_kits?.[key]
    const platform = base.platforms.find(p => p.id === platformId)
    isBundled = platform?.reagent_kits.some(k => k.name === key) ?? false
  } else if (section === 'equipment') {
    overrideValue = ov.equipment?.[key]
    isBundled = base.equipment.some(e => e.name === key)
  } else if (section === 'library_prep_kits') {
    overrideValue = ov.library_prep_kits?.[key]
    isBundled = base.library_prep_kits.some(k => k.name === key)
  } else if (section === 'reagents') {
    overrideValue = ov.reagents?.[key]
    isBundled = base.reagents.some(r => r.name === key)
  } else if (section === 'pathogens') {
    overrideValue = ov.pathogens?.[key]
    isBundled = base.pathogens.some(p => p.name === key)
  } else if (section === 'bioinformatics_cloud') {
    overrideValue = ov.bioinformatics_cloud?.[key]
    isBundled = base.bioinformatics_cloud.cloud_platforms.some(c => c.name === key)
  }

  if (overrideValue === undefined) return 'none'
  if (overrideValue === null) return 'deleted'
  if (!isBundled) return 'custom'
  return 'edited'
}

/** Get the bundled (original) catalogue for diffing. */
export function getBundledCatalogue(): BundledCatalogue {
  return bundledCatalogue as unknown as BundledCatalogue
}
