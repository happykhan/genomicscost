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
  workflows?: string[]
  unit_price_usd?: number | null
}

export interface BundledEquipmentItem {
  name: string
  category: string
  workflow_step: string
  workflow_steps?: string[]
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

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Detect whether a parsed JSON blob is in the full effective catalogue format
 * (arrays) or the sparse overrides format (dicts / partial objects).
 */
export function detectImportFormat(parsed: unknown): 'overrides' | 'effective' {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Not a valid catalogue JSON — expected overrides or full-catalogue format.')
  }

  const obj = parsed as Record<string, unknown>

  // Effective format: `platforms` is an array of platform objects
  if ('platforms' in obj && Array.isArray(obj.platforms)) {
    return 'effective'
  }

  // Overrides format: `platforms` is a plain object (dict), or absent but
  // at least one other sparse-dict section is present
  if ('platforms' in obj && obj.platforms !== null && typeof obj.platforms === 'object' && !Array.isArray(obj.platforms)) {
    return 'overrides'
  }

  const overrideSections = ['equipment', 'library_prep_kits', 'reagents', 'pathogens', 'bioinformatics_cloud']
  const hasSection = overrideSections.some(s => s in obj)
  if (hasSection) {
    return 'overrides'
  }

  // Empty object is valid overrides (no changes)
  if (Object.keys(obj).length === 0) {
    return 'overrides'
  }

  throw new Error('Not a valid catalogue JSON — expected overrides or full-catalogue format.')
}

// ── Diff effective catalogue against bundled ─────────────────────────────────

/**
 * Compare an effective (full) catalogue against the bundled defaults and
 * produce the minimal CatalogueOverrides that, when merged with bundled,
 * reproduces the effective catalogue exactly.
 */
export function diffAgainstBundled(effective: BundledCatalogue): CatalogueOverrides {
  const base = bundledCatalogue as unknown as BundledCatalogue
  const result: CatalogueOverrides = {}

  // Helper: diff two arrays keyed by `name`, returning a sparse override dict.
  // `keyFields` are never included in the diff (they are identity, not data).
  function diffNamedArray<T extends { name: string }>(
    bundledArr: T[],
    effectiveArr: T[],
    keyFields: (keyof T)[] = ['name'],
  ): Record<string, Partial<T> | null> | undefined {
    const overrides: Record<string, Partial<T> | null> = {}
    const bundledMap = new Map(bundledArr.map(item => [item.name, item]))
    const effectiveMap = new Map(effectiveArr.map(item => [item.name, item]))

    // Items in bundled but absent in effective => soft-delete
    for (const [name] of bundledMap) {
      if (!effectiveMap.has(name)) {
        overrides[name] = null
      }
    }

    // Items in effective
    for (const [name, effItem] of effectiveMap) {
      const bundledItem = bundledMap.get(name)
      if (!bundledItem) {
        // Custom addition — store the full record, minus the name key
        // (the name is already the dict key)
        const { ...rest } = effItem
        overrides[name] = rest as Partial<T>
        continue
      }

      // Both exist — diff field by field
      const diff: Record<string, unknown> = {}
      const allKeys = new Set([...Object.keys(bundledItem), ...Object.keys(effItem)])
      for (const k of allKeys) {
        if ((keyFields as string[]).includes(k)) continue
        const bVal = (bundledItem as Record<string, unknown>)[k]
        const eVal = (effItem as Record<string, unknown>)[k]
        if (!valuesEqual(bVal, eVal)) {
          diff[k] = eVal
        }
      }
      if (Object.keys(diff).length > 0) {
        overrides[name] = diff as Partial<T>
      }
    }

    return Object.keys(overrides).length > 0 ? overrides : undefined
  }

  // Simple sections
  result.equipment = diffNamedArray(base.equipment, effective.equipment)
  result.library_prep_kits = diffNamedArray(base.library_prep_kits, effective.library_prep_kits)
  result.reagents = diffNamedArray(base.reagents, effective.reagents)
  result.pathogens = diffNamedArray(base.pathogens, effective.pathogens)

  // Bioinformatics cloud platforms
  result.bioinformatics_cloud = diffNamedArray(
    base.bioinformatics_cloud.cloud_platforms,
    effective.bioinformatics_cloud.cloud_platforms,
  )

  // Platforms and nested reagent kits
  for (const effPlatform of effective.platforms) {
    const bundledPlatform = base.platforms.find(p => p.id === effPlatform.id)
    if (!bundledPlatform) continue
    const kitOverrides = diffNamedArray(bundledPlatform.reagent_kits, effPlatform.reagent_kits)
    if (kitOverrides) {
      if (!result.platforms) result.platforms = {}
      result.platforms[effPlatform.id] = { reagent_kits: kitOverrides }
    }
  }

  // Clean up undefined sections
  const sections = ['equipment', 'library_prep_kits', 'reagents', 'pathogens', 'bioinformatics_cloud'] as const
  for (const s of sections) {
    if (result[s] === undefined) delete result[s]
  }

  return result
}

/** Deep-equal check for JSON-serialisable values. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => valuesEqual(v, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>)
    const bKeys = Object.keys(b as Record<string, unknown>)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every(k =>
      valuesEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    )
  }
  return false
}

// ── Import result type ──────────────────────────────────────────────────────

export interface ImportResult {
  overrides: CatalogueOverrides
  format: 'overrides' | 'effective'
  stats: { edits: number; additions: number; deletions: number }
}

export function importOverrides(json: string): ImportResult {
  const parsed = JSON.parse(json)
  const format = detectImportFormat(parsed)
  const overrides = format === 'effective'
    ? diffAgainstBundled(parsed as BundledCatalogue)
    : (parsed as CatalogueOverrides)

  const existing = loadOverrides()
  const merged = mergeOverrideSets(existing, overrides)
  saveOverrides(merged)

  // Compute stats from the incoming overrides (not the merged result)
  const stats = countOverrideStats(overrides)

  return { overrides: merged, format, stats }
}

/** Count edits, additions, and deletions in an overrides object. */
function countOverrideStats(ov: CatalogueOverrides): { edits: number; additions: number; deletions: number } {
  const base = bundledCatalogue as unknown as BundledCatalogue
  let edits = 0
  let additions = 0
  let deletions = 0

  function countSection<T extends { name: string }>(
    bundledArr: T[],
    section: Record<string, Partial<T> | null> | undefined,
  ) {
    if (!section) return
    const bundledNames = new Set(bundledArr.map(item => item.name))
    for (const [key, value] of Object.entries(section)) {
      if (value === null) deletions++
      else if (bundledNames.has(key)) edits++
      else additions++
    }
  }

  countSection(base.equipment, ov.equipment)
  countSection(base.library_prep_kits, ov.library_prep_kits)
  countSection(base.reagents, ov.reagents)
  countSection(base.pathogens, ov.pathogens)
  countSection(base.bioinformatics_cloud.cloud_platforms, ov.bioinformatics_cloud)

  if (ov.platforms) {
    for (const [pid, pov] of Object.entries(ov.platforms)) {
      if (!pov.reagent_kits) continue
      const bundledPlatform = base.platforms.find(p => p.id === pid)
      if (bundledPlatform) {
        countSection(bundledPlatform.reagent_kits, pov.reagent_kits)
      } else {
        // All kits are additions for an unknown platform
        for (const value of Object.values(pov.reagent_kits)) {
          if (value === null) deletions++
          else additions++
        }
      }
    }
  }

  return { edits, additions, deletions }
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
