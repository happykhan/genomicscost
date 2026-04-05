import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'
import type { Project, SequencerConfig, CostBreakdown } from '../types'
import { calculateCosts } from '../lib/calculations'
import { createDefaultProject, createDefaultSequencer } from '../lib/defaults'

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

// ── Migration: handle old saved projects that had singular `sequencer` ────────
function migrateProject(raw: unknown): Project {
  const p = raw as Record<string, unknown>
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
    p.sequencers = [createDefaultSequencer('Sequencer 1')]
  }
  // Ensure each sequencer has the new fields (spread first so explicit values win over defaults)
  p.sequencers = (p.sequencers as SequencerConfig[]).map((s, i) => {
    const merged = { ...s }
    if (merged.controlsPerRun === undefined) merged.controlsPerRun = 2
    if (merged.enabled === undefined) merged.enabled = true
    if (!merged.label) merged.label = i === 0 ? 'Sequencer 1' : 'Sequencer 2'
    if (merged.captureAll === undefined) merged.captureAll = false
    if (merged.minReadsPerSample === undefined) merged.minReadsPerSample = 100_000
    return merged
  })
  // Ensure personnel have trainingCostUsd
  if (Array.isArray(p.personnel)) {
    p.personnel = (p.personnel as Array<Record<string, unknown>>).map(person => ({
      trainingCostUsd: 1000,
      ...person,
    }))
  }
  // Ensure equipment has lifespanYears
  if (Array.isArray(p.equipment)) {
    p.equipment = (p.equipment as Array<Record<string, unknown>>).map(eq => ({
      lifespanYears: (eq.category as string) === 'sequencing_platform' ? 10 : 5,
      ...eq,
    }))
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

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(() => migrateProject(createDefaultProject()))
  const [savedProjects, setSavedProjects] = useState<Project[]>(loadSavedProjects)

  const costs = useMemo(() => calculateCosts(project), [project])

  const updateProject = useCallback((patch: Partial<Project>) => {
    setProject(prev => ({ ...prev, ...patch }))
  }, [])

  const updateSequencer = useCallback((index: number, patch: Partial<SequencerConfig>) => {
    setProject(prev => {
      const next = prev.sequencers.map((s, i) => i === index ? { ...s, ...patch } : s)
      return { ...prev, sequencers: next }
    })
  }, [])

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

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}
