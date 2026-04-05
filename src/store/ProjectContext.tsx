import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'
import type { Project, SequencerConfig, CostBreakdown } from '../types'
import { calculateCosts } from '../lib/calculations'
import { createDefaultProject } from '../lib/defaults'

const STORAGE_KEY = 'genomicscost-projects'

interface ProjectContextValue {
  project: Project
  updateProject: (patch: Partial<Project>) => void
  updateSequencer: (patch: Partial<SequencerConfig>) => void
  costs: CostBreakdown
  savedProjects: Project[]
  saveProject: () => void
  loadProject: (id: string) => void
  deleteProject: (id: string) => void
  newProject: () => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

function loadSavedProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Project[]
  } catch {
    return []
  }
}

function persistProjects(projects: Project[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(createDefaultProject)
  const [savedProjects, setSavedProjects] = useState<Project[]>(loadSavedProjects)

  const costs = useMemo(() => calculateCosts(project), [project])

  const updateProject = useCallback((patch: Partial<Project>) => {
    setProject(prev => ({ ...prev, ...patch }))
  }, [])

  const updateSequencer = useCallback((patch: Partial<SequencerConfig>) => {
    setProject(prev => ({ ...prev, sequencer: { ...prev.sequencer, ...patch } }))
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
      if (found) setProject(found)
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
    setProject(createDefaultProject())
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
