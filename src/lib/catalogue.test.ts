import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadOverrides,
  saveOverrides,
  getEffectiveCatalogue,
  setOverride,
  resetRow,
  resetAll,
  exportOverrides,
  importOverrides,
  exportEffective,
  getOverrideStatus,
  getBundledCatalogue,
} from './catalogue'
import type { CatalogueOverrides } from './catalogue'

beforeEach(() => {
  localStorage.clear()
})

describe('loadOverrides / saveOverrides', () => {
  it('returns empty object when nothing stored', () => {
    expect(loadOverrides()).toEqual({})
  })

  it('round-trips through localStorage', () => {
    const ov: CatalogueOverrides = {
      equipment: { 'Test Item': { unit_cost_usd: 999 } },
    }
    saveOverrides(ov)
    expect(loadOverrides()).toEqual(ov)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('gct.catalogue.overrides', 'not json!')
    expect(loadOverrides()).toEqual({})
  })
})

describe('getEffectiveCatalogue', () => {
  it('returns bundled data when no overrides', () => {
    const effective = getEffectiveCatalogue()
    const bundled = getBundledCatalogue()
    expect(effective.equipment.length).toBe(bundled.equipment.length)
    expect(effective.platforms.length).toBe(bundled.platforms.length)
  })

  it('merges equipment overrides', () => {
    const bundled = getBundledCatalogue()
    const targetName = bundled.equipment[0].name
    const originalCost = bundled.equipment[0].unit_cost_usd

    const ov: CatalogueOverrides = {
      equipment: { [targetName]: { unit_cost_usd: 12345 } },
    }
    const effective = getEffectiveCatalogue(ov)
    const item = effective.equipment.find(e => e.name === targetName)

    expect(item).toBeDefined()
    expect(item!.unit_cost_usd).toBe(12345)
    expect(item!.unit_cost_usd).not.toBe(originalCost)
    // Other fields should remain unchanged
    expect(item!.category).toBe(bundled.equipment[0].category)
  })

  it('removes deleted items', () => {
    const bundled = getBundledCatalogue()
    const targetName = bundled.reagents[0].name
    const ov: CatalogueOverrides = {
      reagents: { [targetName]: null },
    }
    const effective = getEffectiveCatalogue(ov)
    expect(effective.reagents.find(r => r.name === targetName)).toBeUndefined()
    expect(effective.reagents.length).toBe(bundled.reagents.length - 1)
  })

  it('adds custom rows', () => {
    const bundled = getBundledCatalogue()
    const ov: CatalogueOverrides = {
      equipment: {
        'Custom Lab Gadget': {
          name: 'Custom Lab Gadget',
          category: 'lab_equipment',
          workflow_step: 'sequencing',
          unit_cost_usd: 500,
          catalog_ref: null,
          recommended_quantity: 1,
          comment: null,
        },
      },
    }
    const effective = getEffectiveCatalogue(ov)
    expect(effective.equipment.length).toBe(bundled.equipment.length + 1)
    const custom = effective.equipment.find(e => e.name === 'Custom Lab Gadget')
    expect(custom).toBeDefined()
    expect(custom!.unit_cost_usd).toBe(500)
  })

  it('handles reagent kit overrides within platforms', () => {
    const bundled = getBundledCatalogue()
    const platform = bundled.platforms[0]
    const kitName = platform.reagent_kits[0].name
    const ov: CatalogueOverrides = {
      platforms: {
        [platform.id]: {
          reagent_kits: {
            [kitName]: { unit_price_usd: 9999 },
          },
        },
      },
    }
    const effective = getEffectiveCatalogue(ov)
    const effPlatform = effective.platforms.find(p => p.id === platform.id)!
    const kit = effPlatform.reagent_kits.find(k => k.name === kitName)!
    expect(kit.unit_price_usd).toBe(9999)
    // Other fields unchanged
    expect(kit.max_reads_per_flowcell).toBe(platform.reagent_kits[0].max_reads_per_flowcell)
  })

  it('deletes a reagent kit from a platform', () => {
    const bundled = getBundledCatalogue()
    const platform = bundled.platforms[0]
    const kitName = platform.reagent_kits[0].name
    const ov: CatalogueOverrides = {
      platforms: {
        [platform.id]: {
          reagent_kits: { [kitName]: null },
        },
      },
    }
    const effective = getEffectiveCatalogue(ov)
    const effPlatform = effective.platforms.find(p => p.id === platform.id)!
    expect(effPlatform.reagent_kits.find(k => k.name === kitName)).toBeUndefined()
    expect(effPlatform.reagent_kits.length).toBe(platform.reagent_kits.length - 1)
  })
})

describe('setOverride', () => {
  it('sets an equipment override', () => {
    const bundled = getBundledCatalogue()
    const name = bundled.equipment[0].name
    setOverride('equipment', name, { unit_cost_usd: 777 })
    const ov = loadOverrides()
    expect(ov.equipment?.[name]).toEqual({ unit_cost_usd: 777 })
  })

  it('sets a platform reagent kit override', () => {
    const bundled = getBundledCatalogue()
    const pid = bundled.platforms[0].id
    const kitName = bundled.platforms[0].reagent_kits[0].name
    setOverride('platforms', kitName, { unit_price_usd: 100 }, pid)
    const ov = loadOverrides()
    expect(ov.platforms?.[pid]?.reagent_kits?.[kitName]).toEqual({ unit_price_usd: 100 })
  })

  it('soft-deletes by setting null', () => {
    const bundled = getBundledCatalogue()
    const name = bundled.reagents[0].name
    setOverride('reagents', name, null)
    const ov = loadOverrides()
    expect(ov.reagents?.[name]).toBeNull()
  })
})

describe('resetRow', () => {
  it('removes an equipment override', () => {
    const bundled = getBundledCatalogue()
    const name = bundled.equipment[0].name
    setOverride('equipment', name, { unit_cost_usd: 777 })
    expect(loadOverrides().equipment?.[name]).toBeDefined()

    resetRow('equipment', name)
    expect(loadOverrides().equipment).toBeUndefined()
  })

  it('removes a platform reagent kit override', () => {
    const bundled = getBundledCatalogue()
    const pid = bundled.platforms[0].id
    const kitName = bundled.platforms[0].reagent_kits[0].name
    setOverride('platforms', kitName, { unit_price_usd: 100 }, pid)

    resetRow('platforms', kitName, pid)
    expect(loadOverrides().platforms).toBeUndefined()
  })

  it('cleans up empty section objects', () => {
    setOverride('equipment', 'A', { unit_cost_usd: 1 })
    setOverride('equipment', 'B', { unit_cost_usd: 2 })
    resetRow('equipment', 'A')
    // B should still be there
    expect(loadOverrides().equipment).toEqual({ B: { unit_cost_usd: 2 } })
    resetRow('equipment', 'B')
    // Section should be cleaned up
    expect(loadOverrides().equipment).toBeUndefined()
  })
})

describe('resetAll', () => {
  it('clears all overrides', () => {
    setOverride('equipment', 'X', { unit_cost_usd: 1 })
    setOverride('reagents', 'Y', null)
    resetAll()
    expect(loadOverrides()).toEqual({})
  })
})

describe('export / import round-trip', () => {
  it('exports current overrides as JSON string', () => {
    setOverride('equipment', 'TestEquip', { unit_cost_usd: 42 })
    const json = exportOverrides()
    const parsed = JSON.parse(json)
    expect(parsed.equipment.TestEquip.unit_cost_usd).toBe(42)
  })

  it('imports and merges overrides', () => {
    setOverride('equipment', 'ExistingItem', { unit_cost_usd: 10 })
    const incoming: CatalogueOverrides = {
      equipment: { 'NewItem': { unit_cost_usd: 20 } },
      reagents: { 'SomeReagent': { quantity_per_sample: 5 } },
    }
    importOverrides(JSON.stringify(incoming))
    const ov = loadOverrides()
    expect(ov.equipment?.ExistingItem).toEqual({ unit_cost_usd: 10 })
    expect(ov.equipment?.NewItem).toEqual({ unit_cost_usd: 20 })
    expect(ov.reagents?.SomeReagent).toEqual({ quantity_per_sample: 5 })
  })

  it('incoming overrides win on conflict', () => {
    setOverride('equipment', 'SharedItem', { unit_cost_usd: 10 })
    const incoming: CatalogueOverrides = {
      equipment: { 'SharedItem': { unit_cost_usd: 99 } },
    }
    importOverrides(JSON.stringify(incoming))
    expect(loadOverrides().equipment?.SharedItem).toEqual({ unit_cost_usd: 99 })
  })

  it('full round-trip: export -> reset -> import restores state', () => {
    setOverride('equipment', 'A', { unit_cost_usd: 1 })
    setOverride('reagents', 'B', { quantity_per_sample: 2 })
    const exported = exportOverrides()
    resetAll()
    expect(loadOverrides()).toEqual({})
    importOverrides(exported)
    const restored = loadOverrides()
    expect(restored.equipment?.A).toEqual({ unit_cost_usd: 1 })
    expect(restored.reagents?.B).toEqual({ quantity_per_sample: 2 })
  })
})

describe('exportEffective', () => {
  it('returns full merged catalogue as JSON string', () => {
    const json = exportEffective()
    const parsed = JSON.parse(json)
    expect(parsed.platforms).toBeDefined()
    expect(parsed.equipment).toBeDefined()
    expect(parsed.reagents).toBeDefined()
  })
})

describe('getOverrideStatus', () => {
  it('returns none when no overrides exist', () => {
    const bundled = getBundledCatalogue()
    expect(getOverrideStatus('equipment', bundled.equipment[0].name)).toBe('none')
  })

  it('returns edited for modified bundled item', () => {
    const bundled = getBundledCatalogue()
    const name = bundled.equipment[0].name
    setOverride('equipment', name, { unit_cost_usd: 111 })
    expect(getOverrideStatus('equipment', name)).toBe('edited')
  })

  it('returns deleted for soft-deleted item', () => {
    const bundled = getBundledCatalogue()
    const name = bundled.equipment[0].name
    setOverride('equipment', name, null)
    expect(getOverrideStatus('equipment', name)).toBe('deleted')
  })

  it('returns custom for user-added item', () => {
    setOverride('equipment', 'Brand New Custom Thing', { unit_cost_usd: 50 })
    expect(getOverrideStatus('equipment', 'Brand New Custom Thing')).toBe('custom')
  })

  it('handles platform reagent kit statuses', () => {
    const bundled = getBundledCatalogue()
    const pid = bundled.platforms[0].id
    const kitName = bundled.platforms[0].reagent_kits[0].name

    expect(getOverrideStatus('platforms', kitName, pid)).toBe('none')

    setOverride('platforms', kitName, { unit_price_usd: 1 }, pid)
    expect(getOverrideStatus('platforms', kitName, pid)).toBe('edited')

    setOverride('platforms', kitName, null, pid)
    expect(getOverrideStatus('platforms', kitName, pid)).toBe('deleted')

    setOverride('platforms', 'Custom Kit XYZ', { unit_price_usd: 50 }, pid)
    expect(getOverrideStatus('platforms', 'Custom Kit XYZ', pid)).toBe('custom')
  })
})
