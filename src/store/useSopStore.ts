import { create } from 'zustand';
import {
  SopProject,
  SopStep,
  SopHistoryEntry,
  SopHistoryChangeSummary,
  CalloutType,
  BeautifySettings,
  AnnotationItem,
  CoverPageSettings,
  DEFAULT_COVER_PAGE_SETTINGS,
  DEFAULT_EXPORT_SETTINGS,
  ErrorFaqItem,
  OcrAnalysisResult,
} from '../types/sop';
import { SAMPLE_PROJECT, DEFAULT_THEME } from './sampleData';
import { RELEASE_FEATURES } from '../config/releaseFeatures';

const LOCAL_STORAGE_KEY = 'stepflow_projects';
const ACTIVE_PROJECT_KEY = 'stepflow_active_project_id';
const STORAGE_INITIALIZED_KEY = 'stepflow_storage_initialized';

export interface SopState {
  // State
  projects: SopProject[];
  activeProject: SopProject | null;
  activeStepId: string | null;
  activeView: 'library' | 'studio' | 'overlay';
  isCapturing: boolean;
  recentCapture: string | null;
  lastDeletedStep: { step: SopStep; index: number } | null;
  retakeStepId: string | null;
  selectedHistoryEntryId: string | null;

  // Error FAQ State
  errorFaqItems: ErrorFaqItem[];
  activeErrorAnalysis: OcrAnalysisResult | null;
  isAnalyzingOcr: boolean;
  isSearchHudOpen: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  loadErrorFaq: () => Promise<void>;
  saveErrorFaqItem: (item: ErrorFaqItem) => Promise<boolean>;
  deleteErrorFaqItem: (id: string) => Promise<boolean>;
  setActiveErrorAnalysis: (result: OcrAnalysisResult | null) => void;
  setIsAnalyzingOcr: (isAnalyzing: boolean) => void;
  setIsSearchHudOpen: (isOpen: boolean) => void;
  analyzeImageWithOcr: (imagePathOrBase64: string) => Promise<OcrAnalysisResult | null>;
  createProject: (name?: string, description?: string, author?: string) => SopProject;
  selectProject: (id: string | null) => void;
  syncActiveProjectFromExternal: (project: SopProject | null) => void;
  saveCurrentProject: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => SopProject | null;
  updateProjectById: (id: string, updates: Partial<SopProject>) => void;
  updateProjectDetails: (details: Partial<SopProject>) => void;
  publishProjectVersion: (summary: string) => SopHistoryEntry | null;
  restoreProjectVersion: (historyEntryId: string) => boolean;
  updateCoverPageSettings: (settings: Partial<CoverPageSettings>) => void;
  addStep: (imagePath?: string, title?: string, description?: string) => SopStep;
  addTextStep: (title?: string, description?: string) => SopStep;
  updateStep: (stepId: string, updates: Partial<SopStep>) => void;
  deleteStep: (stepId: string) => void;
  revertDeletedStep: () => void;
  clearLastDeletedStep: () => void;
  reorderSteps: (startIndex: number, endIndex: number) => void;
  retakeStepImage: (stepId: string, newImagePath: string) => void;
  setRetakeStepId: (stepId: string | null) => void;
  setStepAnnotations: (stepId: string, annotations: AnnotationItem[]) => void;
  setStepCallout: (stepId: string, callout?: { type: CalloutType; text: string }) => void;
  updateBeautifySettings: (settings: Partial<BeautifySettings>) => void;
  setActiveView: (view: 'library' | 'studio' | 'overlay') => void;
  setActiveStepId: (stepId: string | null) => void;
  setSelectedHistoryEntryId: (id: string | null) => void;
  setIsCapturing: (capturing: boolean) => void;
  setRecentCapture: (capture: string | null) => void;
}

// Helper to deduplicate projects by ID, keeping the latest updated version
export function deduplicateProjects(projects: SopProject[]): SopProject[] {
  const map = new Map<string, SopProject>();
  for (const p of projects) {
    if (!p || !p.id) continue;
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
    } else {
      const timeExisting = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const timeNew = new Date(p.updatedAt || p.createdAt || 0).getTime();
      if (timeNew >= timeExisting) {
        map.set(p.id, p);
      }
    }
  }
  return Array.from(map.values());
}

// Helper to save projects to storage and IPC if present
function persistProjects(projects: SopProject[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    const deduped = deduplicateProjects(projects);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(deduped));
  } catch (err) {
    console.warn('Failed to save to localStorage (likely quota exceeded):', err);
    // If quota is exceeded, attempt to save without heavy fields as emergency fallback
    try {
      const stripped = deduplicateProjects(projects).map((p) => ({
        ...p,
        steps: p.steps.map((s) => ({
          ...s,
          image: s.image?.originalImagePath?.startsWith('data:')
            ? { ...s.image, originalImagePath: '' }
            : s.image,
        })),
      }));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stripped));
    } catch {
      // Disk storage via Electron IPC remains authoritative
    }
  }
}

let pendingProjectBroadcast: { project: SopProject; projects: SopProject[] } | null = null;
let pendingProjectBroadcastTimer: ReturnType<typeof setTimeout> | null = null;

export function flushPendingProjectBroadcast() {
  if (pendingProjectBroadcastTimer) {
    clearTimeout(pendingProjectBroadcastTimer);
    pendingProjectBroadcastTimer = null;
  }
  if (pendingProjectBroadcast) {
    const pending = pendingProjectBroadcast;
    pendingProjectBroadcast = null;
    broadcastProjectUpdate(pending.project, pending.projects);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingProjectBroadcast();
  });
}

function broadcastProjectUpdate(project: SopProject, projects: SopProject[]) {
  if (pendingProjectBroadcastTimer) {
    clearTimeout(pendingProjectBroadcastTimer);
    pendingProjectBroadcastTimer = null;
  }
  pendingProjectBroadcast = null;

  const deduped = deduplicateProjects(projects);
  persistProjects(deduped);
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
  } catch (err) {
    console.error('Failed to save active project id to localStorage:', err);
  }
  if (typeof window !== 'undefined' && window.electronAPI?.saveProject) {
    window.electronAPI.saveProject(project).catch(console.error);
  }
  if (typeof window !== 'undefined' && window.electronAPI?.syncActiveProject) {
    window.electronAPI.syncActiveProject(project);
  }
}

function scheduleProjectUpdateBroadcast(project: SopProject, projects: SopProject[], delayMs = 300) {
  pendingProjectBroadcast = { project, projects };
  if (pendingProjectBroadcastTimer) {
    clearTimeout(pendingProjectBroadcastTimer);
  }
  pendingProjectBroadcastTimer = setTimeout(() => {
    const pending = pendingProjectBroadcast;
    pendingProjectBroadcast = null;
    pendingProjectBroadcastTimer = null;
    if (!pending) return;
    broadcastProjectUpdate(pending.project, pending.projects);
  }, delayMs);
}

export function normalizeImagePathForRenderer(pathValue?: string | null): string | undefined {
  if (!pathValue) return undefined;

  const trimmed = pathValue.trim();
  if (!trimmed) return undefined;

  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('stepflow-asset://')) {
    let raw = trimmed.replace(/^stepflow-asset:\/\//i, '');
    if (raw.toLowerCase().startsWith('local/')) {
      raw = raw.slice('local/'.length);
    }
    raw = raw.replace(/^\/+/, '');
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // Keep raw if not valid percent-encoding
    }
    let safePath = decoded.replace(/\\/g, '/');
    if (!safePath.startsWith('/') && !/^[a-zA-Z]:\//.test(safePath) && !safePath.startsWith('//')) {
      safePath = `/${safePath}`;
    }
    return `stepflow-asset://local/${encodeURIComponent(safePath)}`;
  }

  // Treat absolute filesystem paths as local assets streamed via custom protocol.
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('/')) {
    const safePath = trimmed.replace(/\\/g, '/');
    return `stepflow-asset://local/${encodeURIComponent(safePath)}`;
  }

  return trimmed;
}

/**
 * Checks if a step title is a default/auto-generated title (e.g. "Step 10: Action", "Step 10", "Step 10: Important Notes")
 */
export function isDefaultStepTitle(title?: string | null): boolean {
  if (!title || !title.trim()) return true;
  const trimmed = title.trim();
  return (
    /^Step\s+\d+(\s*[:\-–—]\s*(Action|Important Notes|Visual Step|Documentation Step))?\s*:?$/i.test(trimmed) ||
    /^Step\s+\d+\s*Captured$/i.test(trimmed)
  );
}

/**
 * Updates step order and dynamically updates the default title to match the new order,
 * while leaving custom titles completely untouched.
 */
export function updateStepOrderAndTitle(step: SopStep, newOrder: number): SopStep {
  let newTitle = step.title;

  if (isDefaultStepTitle(step.title)) {
    if (!step.title || !step.title.trim()) {
      newTitle = step.type === 'text_only' ? `Step ${newOrder}: Important Notes` : `Step ${newOrder}: Action`;
    } else {
      newTitle = step.title.replace(/^Step\s+\d+/i, `Step ${newOrder}`);
    }
  }

  return {
    ...step,
    order: newOrder,
    title: newTitle
  };
}

/**
 * Normalizes all steps in a project so that order numbers are 1..N and any default titles
 * match their new order position.
 */
export function normalizeProjectSteps(project: SopProject): SopProject {
  const updatedSteps = project.steps.map((step, idx) => {
    const normalizedStep = updateStepOrderAndTitle(step, idx + 1);

    if (!normalizedStep.image?.originalImagePath) {
      return normalizedStep;
    }

    const normalizedImagePath = normalizeImagePathForRenderer(normalizedStep.image.originalImagePath);
    if (!normalizedImagePath || normalizedImagePath === normalizedStep.image.originalImagePath) {
      return normalizedStep;
    }

    return {
      ...normalizedStep,
      image: {
        ...normalizedStep.image,
        originalImagePath: normalizedImagePath,
      },
    };
  });

  return {
    ...project,
    exportSettings: {
      ...DEFAULT_EXPORT_SETTINGS,
      ...(project.exportSettings || {})
    },
    steps: updatedSteps
  };
}

function serializeStepForCompare(step: SopStep): string {
  const copy: SopStep = JSON.parse(JSON.stringify(step));
  return JSON.stringify(copy);
}

export function calculateHistoryChangeSummary(
  previousSteps: SopStep[],
  nextSteps: SopStep[]
): SopHistoryChangeSummary {
  const previousById = new Map(previousSteps.map((step) => [step.id, step]));
  const nextById = new Map(nextSteps.map((step) => [step.id, step]));

  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const [stepId, nextStep] of nextById.entries()) {
    const previousStep = previousById.get(stepId);
    if (!previousStep) {
      added += 1;
      continue;
    }
    if (serializeStepForCompare(previousStep) !== serializeStepForCompare(nextStep)) {
      updated += 1;
    }
  }

  for (const stepId of previousById.keys()) {
    if (!nextById.has(stepId)) {
      removed += 1;
    }
  }

  return { added, removed, updated };
}

export function incrementPatchVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return '1.0.0';

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  return `${major}.${minor}.${patch + 1}`;
}

function loadInitialProjects(): { projects: SopProject[]; activeProject: SopProject | null } {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const isInitialized = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_INITIALIZED_KEY) === 'true' : false;

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          // Explicitly empty projects list; do not resurrect sample project
          return { projects: [], activeProject: null };
        }
        const deduped = deduplicateProjects(parsed);
        const normalized = deduped.map(normalizeProjectSteps);
        const savedActiveId = localStorage.getItem(ACTIVE_PROJECT_KEY);
        const active = savedActiveId ? normalized.find((p: SopProject) => p.id === savedActiveId) || normalized[0] : normalized[0];
        return { projects: normalized, activeProject: active || null };
      }
    } else if (isInitialized) {
      // Storage was already initialized previously and user currently has no projects
      return { projects: [], activeProject: null };
    }
  } catch (err) {
    console.error('Failed to load from localStorage:', err);
  }
  // True first run: seed sample project and mark storage initialized
  try {
    localStorage.setItem(STORAGE_INITIALIZED_KEY, 'true');
  } catch {}
  persistProjects([SAMPLE_PROJECT]);
  return { projects: [SAMPLE_PROJECT], activeProject: SAMPLE_PROJECT };
}

const { projects: initialProjects, activeProject: initialActiveProject } = loadInitialProjects();
const initialSavedActiveId = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;

export const useSopStore = create<SopState>((set, get) => ({
  projects: initialProjects,
  activeProject: initialActiveProject,
  activeStepId: initialActiveProject?.steps[0]?.id || (initialActiveProject ? 'cover' : null),
  activeView: (initialActiveProject && initialSavedActiveId) ? 'studio' : 'library',
  isCapturing: false,
  recentCapture: null,
  lastDeletedStep: null,
  retakeStepId: null,
  selectedHistoryEntryId: null,

  // Error FAQ State
  errorFaqItems: [],
  activeErrorAnalysis: null,
  isAnalyzingOcr: false,
  isSearchHudOpen: false,

  loadProjects: async () => {
    try {
      let loadedProjects: SopProject[] = [];
      let ipcLoaded = false;
      if (typeof window !== 'undefined' && window.electronAPI?.listProjects) {
        try {
          const ipcProjects = await window.electronAPI.listProjects();
          if (Array.isArray(ipcProjects)) {
            ipcLoaded = true;
            if (ipcProjects.length > 0) {
              loadedProjects = ipcProjects;
              try {
                localStorage.setItem(STORAGE_INITIALIZED_KEY, 'true');
              } catch {}
            } else {
              const isInitialized = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_INITIALIZED_KEY) === 'true';
              if (isInitialized) {
                // User has run before and has legitimately empty project list on disk
                loadedProjects = [];
              } else {
                // First-time launch in Electron: seed sample project to disk
                loadedProjects = [SAMPLE_PROJECT];
                try {
                  localStorage.setItem(STORAGE_INITIALIZED_KEY, 'true');
                } catch {}
                if (window.electronAPI?.saveProject) {
                  window.electronAPI.saveProject(SAMPLE_PROJECT).catch(console.error);
                }
              }
            }
          }
        } catch (ipcErr) {
          console.warn('IPC listProjects failed, using local store:', ipcErr);
        }
      }

      if (!ipcLoaded) {
        const { projects } = loadInitialProjects();
        loadedProjects = projects;
      }
      loadedProjects = deduplicateProjects(loadedProjects).map(normalizeProjectSteps);
      persistProjects(loadedProjects);

      const savedActiveId = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;
      let active = loadedProjects.find((p) => p.id === savedActiveId);

      if (!active && typeof window !== 'undefined' && window.electronAPI?.getActiveProject) {
        const ipcActive = await window.electronAPI.getActiveProject();
        if (ipcActive) {
          active = loadedProjects.find((p) => p.id === ipcActive.id) || normalizeProjectSteps(ipcActive);
        }
      }

      if (active) {
        try {
          localStorage.setItem(ACTIVE_PROJECT_KEY, active.id);
        } catch {}
        set({
          projects: loadedProjects,
          activeProject: active,
          activeStepId: active.steps[0]?.id || 'cover',
          activeView: 'studio'
        });
      } else {
        set({
          projects: loadedProjects,
          activeProject: null,
          activeStepId: null,
          activeView: 'library'
        });
      }
    } catch (err) {
      console.warn('Could not load projects, using local store:', err);
      const { projects, activeProject } = loadInitialProjects();
      set({
        projects,
        activeProject,
        activeStepId: activeProject?.steps[0]?.id || (activeProject ? 'cover' : null),
        activeView: activeProject ? 'studio' : 'library'
      });
    }
  },

  createProject: (name?: string, description?: string, author?: string) => {
    const newProject: SopProject = {
      id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: name?.trim() || 'Untitled SOP Project',
      description: description?.trim() || '',
      author: author?.trim() || 'Team Member',
      version: '1.0.0',
      tags: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      theme: { ...DEFAULT_THEME },
      coverPage: {
        ...DEFAULT_COVER_PAGE_SETTINGS,
        title: name?.trim() || 'Standard Operating Procedure',
        subtitle: description?.trim() || ''
      },
      exportSettings: {
        ...DEFAULT_EXPORT_SETTINGS
      },
      history: [],
      steps: []
    };

    const updatedProjects = [newProject, ...get().projects];
    broadcastProjectUpdate(newProject, updatedProjects);

    set({
      projects: updatedProjects,
      activeProject: newProject,
      activeStepId: 'cover',
      activeView: 'studio'
    });

    return newProject;
  },

  selectProject: (id: string | null) => {
    flushPendingProjectBroadcast();
    if (!id) {
      try {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
      } catch {}
      if (typeof window !== 'undefined' && window.electronAPI?.syncActiveProject) {
        window.electronAPI.syncActiveProject(null);
      }
      set({
        activeProject: null,
        activeStepId: null,
        activeView: 'library'
      });
      return;
    }
    const found = get().projects.find((p) => p.id === id);
    if (found) {
      const normalized = normalizeProjectSteps(found);
      try {
        localStorage.setItem(ACTIVE_PROJECT_KEY, id);
      } catch {}
      if (typeof window !== 'undefined' && window.electronAPI?.syncActiveProject) {
        window.electronAPI.syncActiveProject(normalized);
      }
      set({
        activeProject: normalized,
        activeStepId: normalized.steps[0]?.id || 'cover',
        activeView: 'studio'
      });
    }
  },

  syncActiveProjectFromExternal: (project: SopProject | null) => {
    if (!project) {
      set({ activeProject: null, activeStepId: null });
      return;
    }
    const normalized = normalizeProjectSteps(project);
    const { projects, activeStepId, retakeStepId } = get();
    const existingIndex = projects.findIndex((p) => p.id === normalized.id);
    let updatedProjects: SopProject[];
    if (existingIndex >= 0) {
      updatedProjects = projects.map((p) => (p.id === normalized.id ? normalized : p));
    } else {
      updatedProjects = [normalized, ...projects];
    }
    persistProjects(updatedProjects);
    try {
      localStorage.setItem(ACTIVE_PROJECT_KEY, normalized.id);
    } catch {}

    const targetId = retakeStepId || activeStepId;
    const exists = targetId
      ? targetId === 'cover' || targetId === 'index' || targetId === 'history' || normalized.steps.some((s) => s.id === targetId)
      : false;
    const resolvedActiveStepId = exists
      ? targetId
      : (normalized.steps[normalized.steps.length - 1]?.id || null);

    set({
      activeProject: normalized,
      projects: updatedProjects,
      activeStepId: resolvedActiveStepId
    });
  },

  saveCurrentProject: async () => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const updatedProject = {
      ...activeProject,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);

    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  deleteProject: async (id: string) => {
    // If there is a pending debounced broadcast for the deleted project, cancel it immediately
    if (pendingProjectBroadcast?.project.id === id) {
      if (pendingProjectBroadcastTimer) {
        clearTimeout(pendingProjectBroadcastTimer);
        pendingProjectBroadcastTimer = null;
      }
      pendingProjectBroadcast = null;
    } else {
      flushPendingProjectBroadcast();
    }

    const { projects, activeProject } = get();
    const updatedProjects = projects.filter((p) => p.id !== id);
    persistProjects(updatedProjects);
    try {
      localStorage.setItem(STORAGE_INITIALIZED_KEY, 'true');
    } catch {}

    if (typeof window !== 'undefined' && window.electronAPI?.deleteProject) {
      try {
        await window.electronAPI.deleteProject(id);
      } catch (err) {
        console.error('IPC deleteProject error:', err);
      }
    }

    const nextActive = activeProject?.id === id ? null : activeProject;
    if (nextActive) {
      try {
        localStorage.setItem(ACTIVE_PROJECT_KEY, nextActive.id);
      } catch {}
      if (typeof window !== 'undefined' && window.electronAPI?.syncActiveProject) {
        window.electronAPI.syncActiveProject(nextActive);
      }
    } else {
      try {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
      } catch {}
      if (typeof window !== 'undefined' && window.electronAPI?.syncActiveProject) {
        window.electronAPI.syncActiveProject(null);
      }
    }

    set({
      projects: updatedProjects,
      activeProject: nextActive,
      activeStepId: nextActive ? nextActive.steps[0]?.id || 'cover' : null,
      activeView: nextActive ? 'studio' : 'library'
    });
  },

  duplicateProject: (id: string) => {
    const { projects } = get();
    const target = projects.find((p) => p.id === id);
    if (!target) return null;

    const duplicated: SopProject = {
      ...JSON.parse(JSON.stringify(target)),
      id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: `${target.name} (Copy)`,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = [duplicated, ...projects];
    persistProjects(updatedProjects);
    if (typeof window !== 'undefined' && window.electronAPI?.saveProject) {
      window.electronAPI.saveProject(duplicated).catch(console.error);
    }

    set({ projects: updatedProjects });
    return duplicated;
  },

  updateProjectById: (id: string, updates: Partial<SopProject>) => {
    const { projects, activeProject } = get();
    const target = projects.find((p) => p.id === id);
    if (!target) return;

    const updatedProject: SopProject = {
      ...target,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (updates.name && (!updatedProject.coverPage?.title || updatedProject.coverPage.title === target.name)) {
      updatedProject.coverPage = {
        ...DEFAULT_COVER_PAGE_SETTINGS,
        ...(updatedProject.coverPage || {}),
        title: updates.name
      };
    }

    const updatedProjects = projects.map((p) =>
      p.id === id ? updatedProject : p
    );

    persistProjects(updatedProjects);
    if (typeof window !== 'undefined' && window.electronAPI?.saveProject) {
      window.electronAPI.saveProject(updatedProject).catch(console.error);
    }

    if (activeProject?.id === id) {
      broadcastProjectUpdate(updatedProject, updatedProjects);
      set({
        activeProject: updatedProject,
        projects: updatedProjects
      });
    } else {
      set({ projects: updatedProjects });
    }
  },

  updateProjectDetails: (details: Partial<SopProject>) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const updatedProject: SopProject = {
      ...activeProject,
      ...details,
      updatedAt: new Date().toISOString()
    };

    if (details.name && (!updatedProject.coverPage?.title || updatedProject.coverPage.title === activeProject.name)) {
      updatedProject.coverPage = {
        ...DEFAULT_COVER_PAGE_SETTINGS,
        ...(updatedProject.coverPage || {}),
        title: details.name
      };
    }

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    scheduleProjectUpdateBroadcast(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  publishProjectVersion: (summary: string) => {
    const { activeProject, projects } = get();
    if (!activeProject) return null;

    const history = activeProject.history || [];
    const previousSnapshot = history[0]?.snapshot;
    const previousSteps = previousSnapshot?.steps || [];
    const normalizedSummary = summary.trim() || 'Updated SOP content';

    const nextVersion = incrementPatchVersion(activeProject.version || '1.0.0');
    const now = new Date().toISOString();

    const historyEntry: SopHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      author: (activeProject.author || 'Team Member').trim() || 'Team Member',
      version: nextVersion,
      summary: normalizedSummary,
      changeType: 'publish',
      changeSummary: calculateHistoryChangeSummary(previousSteps, activeProject.steps),
      snapshot: {
        title: activeProject.name,
        description: activeProject.description,
        version: nextVersion,
        status: 'published',
        steps: JSON.parse(JSON.stringify(activeProject.steps))
      }
    };

    const updatedProject: SopProject = {
      ...activeProject,
      version: nextVersion,
      status: 'published',
      history: [historyEntry, ...history],
      updatedAt: now
    };

    const updatedProjects = projects.map((project) =>
      project.id === updatedProject.id ? updatedProject : project
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects,
      selectedHistoryEntryId: historyEntry.id
    });

    return historyEntry;
  },

  restoreProjectVersion: (historyEntryId: string) => {
    const { activeProject, projects } = get();
    if (!activeProject) return false;

    const history = activeProject.history || [];
    const restoreEntry = history.find((entry) => entry.id === historyEntryId);
    if (!restoreEntry) return false;

    const now = new Date().toISOString();
    const restoredSteps = JSON.parse(JSON.stringify(restoreEntry.snapshot.steps)) as SopStep[];
    const changeSummary = calculateHistoryChangeSummary(activeProject.steps, restoredSteps);

    const rollbackEntry: SopHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      author: (activeProject.author || 'Team Member').trim() || 'Team Member',
      version: activeProject.version,
      summary: `Restored version ${restoreEntry.version}`,
      changeType: 'restore',
      changeSummary,
      snapshot: {
        title: activeProject.name,
        description: activeProject.description,
        version: restoreEntry.version,
        status: activeProject.status,
        steps: restoredSteps
      }
    };

    const updatedProject: SopProject = {
      ...activeProject,
      version: restoreEntry.version,
      status: 'draft',
      steps: restoredSteps,
      history: [rollbackEntry, ...history],
      updatedAt: now
    };

    const updatedProjects = projects.map((project) =>
      project.id === updatedProject.id ? updatedProject : project
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects,
      selectedHistoryEntryId: rollbackEntry.id,
      activeStepId: updatedProject.steps[0]?.id || 'cover'
    });

    return true;
  },

  updateCoverPageSettings: (settings: Partial<CoverPageSettings>) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const currentCoverPage = activeProject.coverPage || DEFAULT_COVER_PAGE_SETTINGS;
    const updatedCoverPage: CoverPageSettings = {
      ...currentCoverPage,
      ...settings
    };

    const updatedProject: SopProject = {
      ...activeProject,
      coverPage: updatedCoverPage,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    scheduleProjectUpdateBroadcast(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  addStep: (imagePath?: string, title?: string, description?: string) => {
    let currentProject = get().activeProject;
    
    // Auto-create project if none is active
    if (!currentProject) {
      currentProject = get().createProject('New Capture SOP');
    }

    const normalizedImagePath = normalizeImagePathForRenderer(imagePath);

    const nextOrder = currentProject.steps.length + 1;
    const newStep: SopStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order: nextOrder,
      type: 'screenshot',
      title: title || `Step ${nextOrder}: Action`,
      description: description || '',
      image: normalizedImagePath
        ? {
            originalImagePath: normalizedImagePath,
            dimensions: { width: 1280, height: 720 },
            annotations: [],
            annotatedCachePath: undefined
          }
        : undefined
    };

    const updatedSteps = [...currentProject.steps, newStep];
    const updatedProject = {
      ...currentProject,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = get().projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects,
      activeStepId: newStep.id
    });

    return newStep;
  },

  addTextStep: (title?: string, description?: string) => {
    let currentProject = get().activeProject;
    if (!currentProject) {
      currentProject = get().createProject('New SOP Project');
    }

    const nextOrder = currentProject.steps.length + 1;
    const newStep: SopStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order: nextOrder,
      type: 'text_only',
      title: title || `Step ${nextOrder}: Important Notes`,
      description: description || 'Write step instructions, prerequisites, or outcomes here...'
    };

    const updatedSteps = [...currentProject.steps, newStep];
    const updatedProject = {
      ...currentProject,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = get().projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects,
      activeStepId: newStep.id
    });

    return newStep;
  },

  updateStep: (stepId: string, updates: Partial<SopStep>) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const updatedSteps = activeProject.steps.map((s) =>
      s.id === stepId ? { ...s, ...updates } : s
    );

    const updatedProject: SopProject = {
      ...activeProject,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    scheduleProjectUpdateBroadcast(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  deleteStep: (stepId: string) => {
    const { activeProject, projects, activeStepId } = get();
    if (!activeProject) return;

    const stepIndex = activeProject.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;
    const deletedStep = activeProject.steps[stepIndex];

    const remainingSteps = activeProject.steps
      .filter((s) => s.id !== stepId)
      .map((s, idx) => updateStepOrderAndTitle(s, idx + 1));

    let nextActiveStepId = activeStepId;
    if (activeStepId === stepId) {
      nextActiveStepId = remainingSteps[stepIndex]?.id || remainingSteps[stepIndex - 1]?.id || remainingSteps[0]?.id || 'cover';
    }

    const updatedProject: SopProject = {
      ...activeProject,
      steps: remainingSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects,
      activeStepId: nextActiveStepId,
      lastDeletedStep: { step: deletedStep, index: stepIndex }
    });
  },

  revertDeletedStep: () => {
    const { activeProject, projects, lastDeletedStep } = get();
    if (!activeProject || !lastDeletedStep) return;

    const { step, index } = lastDeletedStep;
    const reinsertedSteps = Array.from(activeProject.steps);
    const targetIndex = Math.max(0, Math.min(index, reinsertedSteps.length));
    reinsertedSteps.splice(targetIndex, 0, step);

    const renumberedSteps = reinsertedSteps.map((s, idx) => updateStepOrderAndTitle(s, idx + 1));

    const updatedProject: SopProject = {
      ...activeProject,
      steps: renumberedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects,
      activeStepId: step.id,
      lastDeletedStep: null
    });
  },

  clearLastDeletedStep: () => {
    set({ lastDeletedStep: null });
  },

  setRetakeStepId: (stepId: string | null) => {
    if (typeof window !== 'undefined' && window.electronAPI?.setRetakeStepId) {
      window.electronAPI.setRetakeStepId(stepId);
    }
    set({ retakeStepId: stepId });
  },

  reorderSteps: (startIndex: number, endIndex: number) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;
    if (
      startIndex < 0 ||
      startIndex >= activeProject.steps.length ||
      endIndex < 0 ||
      endIndex >= activeProject.steps.length
    ) {
      return;
    }

    const reordered = Array.from(activeProject.steps);
    const [removed] = reordered.splice(startIndex, 1);
    reordered.splice(endIndex, 0, removed);

    const updatedSteps = reordered.map((step, idx) => updateStepOrderAndTitle(step, idx + 1));

    const updatedProject: SopProject = {
      ...activeProject,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects,
      activeStepId: removed.id
    });
  },

  retakeStepImage: (stepId: string, newImagePath: string) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const normalizedImagePath = normalizeImagePathForRenderer(newImagePath) || newImagePath;

    const updatedSteps = activeProject.steps.map((s) => {
      if (s.id === stepId) {
        return {
          ...s,
          image: {
            originalImagePath: normalizedImagePath,
            dimensions: s.image?.dimensions || { width: 1280, height: 720 },
            annotations: s.image?.annotations || [],
            annotatedCachePath: undefined
          }
        };
      }
      return s;
    });

    const updatedProject: SopProject = {
      ...activeProject,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  setStepAnnotations: (stepId: string, annotations: AnnotationItem[]) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const updatedSteps = activeProject.steps.map((s) => {
      if (s.id === stepId && s.image) {
        return {
          ...s,
          image: {
            ...s.image,
            annotations,
            annotatedCachePath: undefined
          }
        };
      }
      return s;
    });

    const updatedProject: SopProject = {
      ...activeProject,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    scheduleProjectUpdateBroadcast(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  setStepCallout: (stepId: string, callout?: { type: CalloutType; text: string }) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const updatedSteps = activeProject.steps.map((s) =>
      s.id === stepId ? { ...s, callout } : s
    );

    const updatedProject: SopProject = {
      ...activeProject,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  updateBeautifySettings: (settings: Partial<BeautifySettings>) => {
    const { activeProject, projects } = get();
    if (!activeProject) return;

    const currentTheme = activeProject.theme || DEFAULT_THEME;
    const currentBeautify = currentTheme.beautifySettings || DEFAULT_THEME.beautifySettings;

    const updatedProject: SopProject = {
      ...activeProject,
      theme: {
        ...currentTheme,
        beautifySettings: {
          ...currentBeautify,
          ...settings
        }
      },
      updatedAt: new Date().toISOString()
    };

    const updatedProjects = projects.map((p) =>
      p.id === updatedProject.id ? updatedProject : p
    );

    broadcastProjectUpdate(updatedProject, updatedProjects);
    set({
      activeProject: updatedProject,
      projects: updatedProjects
    });
  },

  setActiveView: (view: 'library' | 'studio' | 'overlay') => {
    set({ activeView: view });
  },

  setActiveStepId: (stepId: string | null) => {
    set({ activeStepId: stepId });
  },

  setSelectedHistoryEntryId: (id: string | null) => {
    set({ selectedHistoryEntryId: id });
  },

  setIsCapturing: (capturing: boolean) => {
    set({ isCapturing: capturing });
  },

  setRecentCapture: (capture: string | null) => {
    set({ recentCapture: normalizeImagePathForRenderer(capture) || null });
  },

  loadErrorFaq: async () => {
    if (!RELEASE_FEATURES.errorFaq) {
      set({ errorFaqItems: [] });
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.listErrorFaq) {
        const items = await window.electronAPI.listErrorFaq();
        set({ errorFaqItems: items || [] });
      }
    } catch (err) {
      console.error('Failed to load error FAQ items:', err);
    }
  },

  saveErrorFaqItem: async (item: ErrorFaqItem): Promise<boolean> => {
    if (!RELEASE_FEATURES.errorFaq) {
      return false;
    }
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.saveErrorFaq) {
        const success = await window.electronAPI.saveErrorFaq(item);
        if (success) {
          const { errorFaqItems } = get();
          const existingIdx = errorFaqItems.findIndex((i) => i.id === item.id);
          let updated: ErrorFaqItem[];
          if (existingIdx >= 0) {
            updated = [...errorFaqItems];
            updated[existingIdx] = item;
          } else {
            updated = [item, ...errorFaqItems];
          }
          set({ errorFaqItems: updated });
        }
        return success;
      }
      return false;
    } catch (err) {
      console.error('Failed to save error FAQ item:', err);
      return false;
    }
  },

  deleteErrorFaqItem: async (id: string): Promise<boolean> => {
    if (!RELEASE_FEATURES.errorFaq) {
      return false;
    }
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.deleteErrorFaq) {
        const success = await window.electronAPI.deleteErrorFaq(id);
        if (success) {
          const { errorFaqItems } = get();
          set({ errorFaqItems: errorFaqItems.filter((i) => i.id !== id) });
        }
        return success;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete error FAQ item:', err);
      return false;
    }
  },

  setActiveErrorAnalysis: (result: OcrAnalysisResult | null) => {
    set({ activeErrorAnalysis: result });
  },

  setIsAnalyzingOcr: (isAnalyzing: boolean) => {
    set({ isAnalyzingOcr: isAnalyzing });
  },

  setIsSearchHudOpen: (isOpen: boolean) => {
    if (!RELEASE_FEATURES.errorFaq) {
      set({ isSearchHudOpen: false });
      return;
    }
    set({ isSearchHudOpen: isOpen });
  },

  analyzeImageWithOcr: async (imagePathOrBase64: string): Promise<OcrAnalysisResult | null> => {
    if (!RELEASE_FEATURES.errorFaq) {
      set({ isAnalyzingOcr: false, activeErrorAnalysis: null });
      return null;
    }
    set({ isAnalyzingOcr: true });
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.analyzeErrorImage) {
        const result = await window.electronAPI.analyzeErrorImage(imagePathOrBase64);
        set({ activeErrorAnalysis: result, isAnalyzingOcr: false });
        return result;
      }
      set({ isAnalyzingOcr: false });
      return null;
    } catch (err) {
      console.error('Failed to analyze image with OCR:', err);
      set({ isAnalyzingOcr: false });
      return null;
    }
  }
}));
