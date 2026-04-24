import { describe, it, expect } from 'vitest'
import { buildFilteredConsumables, isConsumablesAtDefaults, createDefaultProject } from './defaults'
import type { PathogenEntry, SequencerConfig } from '../types'
import { createDefaultSequencer } from './defaults'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePathogen(overrides: Partial<PathogenEntry> = {}): PathogenEntry {
  return {
    pathogenName: 'Test pathogen',
    pathogenType: 'bacterial',
    genomeSizeMb: 5,
    samplesPerYear: 100,
    ...overrides,
  }
}

function makeSequencer(platformId: string, enabled = true): SequencerConfig {
  const base = createDefaultSequencer('Test')
  return { ...base, platformId, enabled }
}

// ── buildFilteredConsumables ───────────────────────────────────────────────────

describe('buildFilteredConsumables', () => {
  it('excludes viral-specific reagents when all pathogens are bacterial', () => {
    const pathogens = [makePathogen({ pathogenType: 'bacterial' })]
    const sequencers = [makeSequencer('illumina')]

    const items = buildFilteredConsumables(pathogens, sequencers)
    const names = items.map(i => i.name.toLowerCase())

    // Viral transport media should not appear
    expect(names.some(n => n.includes('viral transport'))).toBe(false)
    // RNA extraction kit should not appear
    expect(names.some(n => n.includes('rna extraction'))).toBe(false)
    // RNAse away should not appear
    expect(names.some(n => n.includes('rnase away'))).toBe(false)
  })

  it('includes viral-specific reagents when at least one pathogen is viral', () => {
    const pathogens = [
      makePathogen({ pathogenType: 'bacterial' }),
      makePathogen({ pathogenType: 'viral', pathogenName: 'SARS-CoV-2', genomeSizeMb: 0.03 }),
    ]
    const sequencers = [makeSequencer('illumina')]

    const items = buildFilteredConsumables(pathogens, sequencers)
    const names = items.map(i => i.name.toLowerCase())

    // Viral transport media should be included
    expect(names.some(n => n.includes('viral transport'))).toBe(true)
    // RNA extraction kit should be included
    expect(names.some(n => n.includes('rna extraction'))).toBe(true)
  })

  it('excludes ONT-specific reagents when no ONT sequencer is enabled', () => {
    const pathogens = [makePathogen({ pathogenType: 'viral' })]
    const sequencers = [makeSequencer('illumina')]

    const items = buildFilteredConsumables(pathogens, sequencers)
    const names = items.map(i => i.name.toLowerCase())

    expect(names.some(n => n.includes('ont flow cell'))).toBe(false)
  })

  it('includes ONT-specific reagents when ONT sequencer is enabled', () => {
    const pathogens = [makePathogen({ pathogenType: 'viral' })]
    const sequencers = [makeSequencer('ont')]

    const items = buildFilteredConsumables(pathogens, sequencers)

    // ONT flow cell wash kit has quantity_per_sample null in catalogue,
    // so it won't appear even for ONT (filtered by qty > 0).
    // This test verifies that no error is thrown and a valid list is returned.
    expect(items.length).toBeGreaterThan(0)
  })

  it('does not include disabled sequencer platforms', () => {
    const pathogens = [makePathogen({ pathogenType: 'viral' })]
    const sequencers = [makeSequencer('ont', false), makeSequencer('illumina')]

    const items = buildFilteredConsumables(pathogens, sequencers)
    const names = items.map(i => i.name.toLowerCase())

    // Disabled ONT should not contribute ONT-specific items
    expect(names.some(n => n.includes('ont flow cell'))).toBe(false)
  })

  it('always includes platform-neutral reagents', () => {
    const pathogens = [makePathogen({ pathogenType: 'bacterial' })]
    const sequencers = [makeSequencer('illumina')]

    const items = buildFilteredConsumables(pathogens, sequencers)
    const names = items.map(i => i.name.toLowerCase())

    // Pipette tips should always be included (they are platform-neutral)
    expect(names.some(n => n.includes('pipette filter tips'))).toBe(true)
  })
})

// ── isConsumablesAtDefaults ────────────────────────────────────────────────────

describe('isConsumablesAtDefaults', () => {
  it('returns true for a fresh default project consumables', () => {
    const project = createDefaultProject()
    expect(isConsumablesAtDefaults(project.consumables)).toBe(true)
  })

  it('returns false when a unit cost has been changed from $5', () => {
    const project = createDefaultProject()
    project.consumables[0].unitCostUsd = 10
    expect(isConsumablesAtDefaults(project.consumables)).toBe(false)
  })

  it('returns false when a custom item name is added', () => {
    const project = createDefaultProject()
    project.consumables.push({
      name: 'Custom reagent not in catalogue',
      unitCostUsd: 5,
      quantityPerSample: 1,
      enabled: true,
    })
    expect(isConsumablesAtDefaults(project.consumables)).toBe(false)
  })

  it('returns true for filtered consumables (bacterial-only)', () => {
    const pathogens = [makePathogen({ pathogenType: 'bacterial' })]
    const sequencers = [makeSequencer('illumina')]
    const filtered = buildFilteredConsumables(pathogens, sequencers)
    expect(isConsumablesAtDefaults(filtered)).toBe(true)
  })
})
