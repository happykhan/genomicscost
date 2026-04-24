import React, { createContext, useContext, useState, useMemo, useCallback, useRef } from 'react'
import type { Project, SequencerConfig, CostBreakdown, ConsumableWorkflowStep } from '../types'
import { calculateCosts } from '../lib/calculations'
import { createDefaultProject, createDefaultCloudItems, createDefaultInhouseItems, createDefaultEquipment, buildFilteredConsumables, isConsumablesAtDefaults } from '../lib/defaults'
import { getEffectiveCatalogue } from '../lib/catalogue'
import LZString from 'lz-string'

const STORAGE_KEY = 'genomicscost-projects'

interface ProjectContextValue {
  project: Project
  updateProject: (patch: Partial<Project>) => void
  updateSequencer: (index: number, patch: Partial<SequencerConfig>) => void
  costs: CostBreakdown
  savedProjects: Project[]
  saveProject: () => void
  loadProject: (id: string) => void
  deleteProject: (id: string) => void
  newProject: () => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

// ── Migration: handle old saved projects ────────────────────────────────────
function migrateProject(raw: unknown): Project {
  const p = raw as Record<string, unknown>

  // Migrate old single-pathogen fields to pathogens array
  if (!p.pathogens && p.pathogenName !== undefined) {
    p.pathogens = [{
      pathogenName: (p.pathogenName as string) || 'Unknown',
      pathogenType: (p.pathogenType as string) || 'bacterial',
      genomeSizeMb: (p.genomeSizeMb as number) || 5,
      samplesPerYear: (p.samplesPerYear as number) || 100,
    }]
  }
  // Ensure pathogens is always an array
  if (!Array.isArray(p.pathogens) || p.pathogens.length === 0) {
    p.pathogens = [{
      pathogenName: 'SARS-CoV-2',
      pathogenType: 'viral',
      genomeSizeMb: 0.03,
      samplesPerYear: 200,
    }]
  }

  if (!p.sequencers && p.sequencer) {
    const oldSeq = p.sequencer as SequencerConfig
    p.sequencers = [{
      ...oldSeq,
      controlsPerRun: 2,
      enabled: true,
      label: 'Sequencer 1',
      captureAll: false,
      minReadsPerSample: 100_000,
    }]
    delete p.sequencer
  }
  // Ensure sequencers is always an array
  if (!Array.isArray(p.sequencers) || p.sequencers.length === 0) {
    p.sequencers = [createDefaultProject().sequencers[0]]
  }
  // Ensure each sequencer has the new fields (spread first so explicit values win over defaults)
  p.sequencers = (p.sequencers as SequencerConfig[]).map((s, i) => {
    const merged = { ...s }
    if (merged.controlsPerRun === undefined) merged.controlsPerRun = 2
    if (merged.enabled === undefined) merged.enabled = true
    if (!merged.label) merged.label = i === 0 ? 'Sequencer 1' : `Sequencer ${i + 1}`
    if (merged.captureAll === undefined) merged.captureAll = false
    if (merged.minReadsPerSample === undefined) merged.minReadsPerSample = 100_000
    if (!Array.isArray(merged.assignments)) merged.assignments = []
    return merged
  })

  // Feature 8: backfill assignments if none exist on any sequencer
  const seqs = p.sequencers as SequencerConfig[]
  const pathogensList = p.pathogens as Array<{ samplesPerYear: number }>
  const anyHasAssignments = seqs.some(s => Array.isArray(s.assignments) && s.assignments.length > 0)
  if (!anyHasAssignments && pathogensList.length > 0) {
    // Put all pathogens' full samplesPerYear on the first enabled sequencer
    const firstEnabled = seqs.findIndex(s => s.enabled)
    if (firstEnabled >= 0) {
      seqs[firstEnabled].assignments = pathogensList.map((pat, idx) => ({
        pathogenIndex: idx,
        samples: pat.samplesPerYear ?? 0,
      }))
    }
  }

  // Migrate per-person trainingCostUsd to group-level trainingGroupCostUsd
  if (p.trainingGroupCostUsd === undefined) {
    let groupTraining = 5000
    if (Array.isArray(p.personnel)) {
      const personnelArr = p.personnel as Array<Record<string, unknown>>
      const sum = personnelArr.reduce((acc, person) => acc + ((person.trainingCostUsd as number) ?? 0), 0)
      if (sum > 0) groupTraining = sum
    }
    p.trainingGroupCostUsd = groupTraining
  }
  // Strip per-person trainingCostUsd (no longer used in calculations)
  if (Array.isArray(p.personnel)) {
    p.personnel = (p.personnel as Array<Record<string, unknown>>).map(person => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { trainingCostUsd: _legacy, ...rest } = person
      return rest
    })
  }

  // Ensure adminCostPct exists
  if (p.adminCostPct === undefined) {
    p.adminCostPct = 0
  }

  // Ensure facilityPctSequencing exists (migrate from per-item pctSequencing: use first item's value or 50)
  if ((p as Record<string, unknown>).facilityPctSequencing === undefined) {
    const facilityArr = p.facility as Array<{ pctSequencing?: number }> | undefined
    const firstPct = facilityArr?.[0]?.pctSequencing
    ;(p as Record<string, unknown>).facilityPctSequencing = firstPct ?? 50
  }

  // Ensure equipment has lifespanYears
  if (Array.isArray(p.equipment)) {
    p.equipment = (p.equipment as Array<Record<string, unknown>>).map(eq => ({
      lifespanYears: (eq.category as string) === 'sequencing_platform' ? 10 : 5,
      ...eq,
    }))
  }

  // Ensure all lab equipment items are present (pre-populate from catalogue if missing)
  if (Array.isArray(p.equipment)) {
    const equipArr = p.equipment as Array<Record<string, unknown>>
    const hasLabEquipment = equipArr.some(e => e.category === 'lab_equipment')
    if (!hasLabEquipment) {
      const catalogue = getEffectiveCatalogue()
      const defaultLabEquip = createDefaultEquipment(catalogue)
      p.equipment = [...equipArr, ...defaultLabEquip]
    }
  }

  // Migrate old BioinformaticsConfig (flat fields) to new structure with cloudItems/inhouseItems
  if (p.bioinformatics) {
    const bio = p.bioinformatics as Record<string, unknown>
    if (!bio.type) bio.type = 'hybrid'
    if (!Array.isArray(bio.cloudItems)) {
      bio.cloudItems = createDefaultCloudItems()
      // If old config had a cloud platform and cost, enable that item
      if (bio.cloudPlatform && (bio.costPerSampleUsd as number) > 0) {
        const items = bio.cloudItems as Array<Record<string, unknown>>
        const match = items.find(item => (item.name as string) === bio.cloudPlatform)
        if (match) {
          match.pricePerUnit = bio.costPerSampleUsd
          match.quantity = 1
          match.enabled = true
        }
      }
    }
    if (!Array.isArray(bio.inhouseItems)) {
      bio.inhouseItems = createDefaultInhouseItems()
      // If old config had an annual server cost, enable the first in-house item with that cost
      if ((bio.annualServerCostUsd as number) > 0) {
        const items = bio.inhouseItems as Array<Record<string, unknown>>
        if (items.length > 0) {
          items[0].pricePerUnit = bio.annualServerCostUsd
          items[0].enabled = true
        }
      }
    }
  }

  // Ensure facility has the 12 standard items (for existing projects, keep their rows)
  if (!Array.isArray(p.facility) || (p.facility as unknown[]).length === 0) {
    p.facility = createDefaultProject().facility
  }

  // Migrate consumable workflow?: string to workflows?: Record<step, boolean>
  if (Array.isArray(p.consumables)) {
    const VALID_STEPS: ConsumableWorkflowStep[] = [
      'sample_receipt', 'nucleic_acid_extraction', 'pcr_testing', 'ngs_library_preparation', 'sequencing',
    ]
    p.consumables = (p.consumables as Array<Record<string, unknown>>).map(c => {
      // Already migrated — has workflows object and no old workflow string
      if (c.workflows && typeof c.workflows === 'object' && !Array.isArray(c.workflows)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { workflow: _old, ...rest } = c
        return rest
      }
      // Has old workflow string — convert it
      if (typeof c.workflow === 'string' && VALID_STEPS.includes(c.workflow as ConsumableWorkflowStep)) {
        const { workflow: oldWf, ...rest } = c
        return { ...rest, workflows: { [oldWf as string]: true } }
      }
      // No workflow field at all — leave as-is (no workflows set)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { workflow: _discard, ...rest } = c
      return rest
    })
  }

  return p as unknown as Project
}

function loadSavedProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown[]
    return parsed.map(migrateProject)
  } catch {
    return []
  }
}

function persistProjects(projects: Project[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export let shareProjectLoaded = false

function loadInitialProject(): Project {
  try {
    const hash = window.location.hash
    const match = hash.match(/^#share=(.+)$/)
    if (match) {
      // Try lz-string first (new format), fall back to btoa (legacy links)
      const raw = LZString.decompressFromEncodedURIComponent(match[1])
        ?? JSON.parse(decodeURIComponent(escape(atob(match[1]))))
      const decoded = typeof raw === 'string' ? JSON.parse(raw) : raw
      window.history.replaceState(null, '', window.location.pathname)
      shareProjectLoaded = true
      return migrateProject(decoded)
    }
  } catch { /* malformed share URL — fall through */ }
  return migrateProject(createDefaultProject())
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(loadInitialProject)
  const [savedProjects, setSavedProjects] = useState<Project[]>(loadSavedProjects)

  const costs = useMemo(() => calculateCosts(project), [project])

  // Build a fingerprint of pathogen types and enabled sequencer platforms
  // to detect when the consumable filter inputs change.
  const getFilterKey = useCallback((p: Project) => {
    const ptKey = p.pathogens.map(pat => pat.pathogenType).sort().join(',')
    const plKey = p.sequencers
      .filter(s => s.enabled)
      .map(s => s.platformId)
      .sort()
      .join(',')
    return `${ptKey}|${plKey}`
  }, [])

  const prevFilterKeyRef = useRef(getFilterKey(project))

  const updateProject = useCallback((patch: Partial<Project>) => {
    setProject(prev => {
      const next = { ...prev, ...patch }

      // Auto-populate consumables when pathogen types or sequencer platforms change,
      // but only if the user hasn't manually customised their consumables.
      const prevKey = prevFilterKeyRef.current
      const nextKey = getFilterKey(next)
      if (prevKey !== nextKey && isConsumablesAtDefaults(next.consumables)) {
        prevFilterKeyRef.current = nextKey
        return { ...next, consumables: buildFilteredConsumables(next.pathogens, next.sequencers) }
      }
      prevFilterKeyRef.current = nextKey
      return next
    })
  }, [getFilterKey])

  const updateSequencer = useCallback((index: number, patch: Partial<SequencerConfig>) => {
    setProject(prev => {
      const nextSeqs = prev.sequencers.map((s, i) => i === index ? { ...s, ...patch } : s)
      const next = { ...prev, sequencers: nextSeqs }

      // Also check for consumable auto-populate on sequencer changes
      const prevKey = prevFilterKeyRef.current
      const nextKey = getFilterKey(next)
      if (prevKey !== nextKey && isConsumablesAtDefaults(next.consumables)) {
        prevFilterKeyRef.current = nextKey
        return { ...next, consumables: buildFilteredConsumables(next.pathogens, next.sequencers) }
      }
      prevFilterKeyRef.current = nextKey
      return next
    })
  }, [getFilterKey])

  const saveProject = useCallback(() => {
    setSavedProjects(prev => {
      const existing = prev.findIndex(p => p.id === project.id)
      let next: Project[]
      if (existing >= 0) {
        next = [...prev]
        next[existing] = project
      } else {
        next = [project, ...prev]
      }
      persistProjects(next)
      return next
    })
  }, [project])

  const loadProject = useCallback((id: string) => {
    setSavedProjects(prev => {
      const found = prev.find(p => p.id === id)
      if (found) setProject(migrateProject(found))
      return prev
    })
  }, [])

  const deleteProject = useCallback((id: string) => {
    setSavedProjects(prev => {
      const next = prev.filter(p => p.id !== id)
      persistProjects(next)
      return next
    })
  }, [])

  const newProject = useCallback(() => {
    setProject(migrateProject(createDefaultProject()))
  }, [])

  return (
    <ProjectContext.Provider value={{ project, updateProject, updateSequencer, costs, savedProjects, saveProject, loadProject, deleteProject, newProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}
