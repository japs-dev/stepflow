// StepFlow - Core Data Schema

export type StepType = 'screenshot' | 'text_only';
export type CalloutType = 'info' | 'warning' | 'tip';
export type AnnotationType = 'badge' | 'arrow' | 'rectangle' | 'blur' | 'text' | 'zoom_loupe';

export interface AnnotationItem {
  id: string;
  type: AnnotationType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  // Badges (e.g. 1, 2, 3...)
  badgeNumber?: number;
  // Styling
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  text?: string;
  blurRadius?: number;
  // Zoom Loupe
  zoomFactor?: number;
  targetArea?: { x: number; y: number; width: number; height: number };
  // Additional vector properties
  points?: number[];
  rotation?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  hasBackground?: boolean;
  radius?: number;
  redactionMode?: 'blackout' | 'blur';
}

export interface TextSettings {
  fontSize: number;
  bold: boolean;
  italic: boolean;
  hasBackground: boolean;
}

export const DEFAULT_TEXT_SETTINGS: TextSettings = {
  fontSize: 22,
  bold: true,
  italic: false,
  hasBackground: true
};

export interface LoupeSettings {
  radius: number;
  zoomFactor: number;
}

export const DEFAULT_LOUPE_SETTINGS: LoupeSettings = {
  radius: 90,
  zoomFactor: 2
};

export interface StepImageData {
  originalImagePath: string;
  annotatedCachePath?: string;
  dimensions: { width: number; height: number };
  annotations: AnnotationItem[];
}

export interface SopSubStep {
  badgeNumber: number;
  title: string;
  note?: string;
}

export interface SopStep {
  id: string;
  order: number;
  type: StepType;
  title: string;
  description: string;
  callout?: {
    type: CalloutType;
    text: string;
  };
  subSteps?: SopSubStep[];
  image?: StepImageData;
}

export type SopHistoryChangeType = 'publish' | 'restore';

export interface SopHistoryChangeSummary {
  added: number;
  removed: number;
  updated: number;
}

export interface SopHistorySnapshot {
  title: string;
  description?: string;
  version: string;
  status: SopProject['status'];
  steps: SopStep[];
}

export interface SopHistoryEntry {
  id: string;
  createdAt: string;
  author: string;
  version: string;
  summary: string;
  changeType: SopHistoryChangeType;
  changeSummary: SopHistoryChangeSummary;
  snapshot: SopHistorySnapshot;
}

export interface BeautifySettings {
  enabled: boolean;
  padding: number;
  backgroundType: 'gradient' | 'solid' | 'transparent';
  backgroundColor: string;
  borderRadius: number;
  shadowBlur: number;
}

export interface ProjectTheme {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoPath?: string;
  beautifySettings: BeautifySettings;
}

export type CoverPageLayout = 'modern' | 'executive' | 'minimal' | 'bold';

export interface CoverPageSettings {
  enabled: boolean;
  title?: string;
  subtitle?: string;
  author?: string;
  organization?: string;
  department?: string;
  version?: string;
  date?: string;
  showDate?: boolean;
  showVersion?: boolean;
  showAuthor?: boolean;
  showOrganization?: boolean;
  showTableOfContents?: boolean; // Optional index
  layout?: CoverPageLayout;
  backgroundType: 'color' | 'gradient' | 'image';
  backgroundColor?: string;
  backgroundGradient?: string;
  backgroundImage?: string; // base64 or file path
  backgroundOverlayOpacity?: number; // 0 to 1, e.g. 0.45
  textColor?: string;
  logoUrl?: string;
}

export interface ExportSettings {
  includeChangelog: boolean;
}

export const DEFAULT_COVER_PAGE_SETTINGS: CoverPageSettings = {
  enabled: true,
  layout: 'modern',
  backgroundType: 'gradient',
  backgroundColor: '#0f172a',
  backgroundGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
  backgroundOverlayOpacity: 0.45,
  textColor: '#ffffff',
  showDate: true,
  showVersion: true,
  showAuthor: true,
  showOrganization: true,
  showTableOfContents: true
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  includeChangelog: true
};

export interface SopProject {
  id: string;
  name: string;
  description?: string;
  author: string;
  version: string;
  department?: string;
  headerText?: string;
  footerText?: string;
  tags: string[];
  status: 'draft' | 'in_review' | 'published';
  createdAt: string; // ISO 8601
  updatedAt: string;
  theme: ProjectTheme;
  coverPage?: CoverPageSettings;
  exportSettings?: ExportSettings;
  history?: SopHistoryEntry[];
  steps: SopStep[];
}

// Error & FAQ Knowledge Base Data Types
export interface ErrorFaqItem {
  id: string;
  title: string;
  errorCode?: string; // e.g. "0x80040115", "ERR_CONNECTION_TIMED_OUT", "SAP-1049"
  rawOcrText: string;
  imagePath: string; // Stored in stepflow_assets/
  solution: string; // Rich markdown solution text with bullets, steps, etc.
  tags: string[]; // e.g. ["Outlook", "VPN", "Network"]
  createdAt: string; // ISO 8601
  updatedAt: string;
  matchCount?: number;
}

export interface OcrAnalysisResult {
  rawText: string;
  detectedTitle?: string;
  detectedErrorCode?: string;
  imagePath: string;
  bestMatch?: {
    item: ErrorFaqItem;
    confidence: number; // 0 to 1
  };
}

// IPC Channel API Interfaces
export interface IpcBridge {
  // Capture & Hotkeys
  triggerCapture: (isRetake?: boolean, mode?: 'fullscreen' | 'selection') => Promise<string | null>; // Returns file path or base64
  onCaptureCompleted: (callback: (imagePath: string) => void) => () => void;
  
  // Selection Rect
  submitSelectionRect?: (rect: { x: number; y: number; width: number; height: number }) => void;
  cancelSelectionRect?: () => void;

  // Window Management & Synchronization
  minimizeToOverlay: (anchor?: { x: number; y: number }) => void;
  restoreStudio: () => void;
  closeOverlay: () => void;
  setOverlaySize: (mode: 'collapsed' | 'expanded' | 'preview' | 'error_match' | 'error_new' | 'search') => void;
  onStudioRestored: (callback: () => void) => () => void;
  syncActiveProject: (project: SopProject | null) => void;
  onActiveProjectSynced: (callback: (project: SopProject | null) => void) => () => void;
  getActiveProject?: () => Promise<SopProject | null>;
  setRetakeStepId?: (stepId: string | null) => void;
  onRetakeStepIdChanged?: (callback: (stepId: string | null) => void) => () => void;
  
  // Project I/O
  listProjects: () => Promise<SopProject[]>;
  saveProject: (project: SopProject) => Promise<boolean>;
  loadProject: (id: string) => Promise<SopProject | null>;
  deleteProject: (id: string) => Promise<boolean>;
  onProjectFileChanged?: (
    callback: (data: { id: string; action: 'save' | 'delete'; project?: SopProject }) => void
  ) => () => void;

  // Error & FAQ Knowledge Base + OCR
  analyzeErrorImage: (imagePathOrBase64: string) => Promise<OcrAnalysisResult>;
  listErrorFaq: () => Promise<ErrorFaqItem[]>;
  saveErrorFaq: (item: ErrorFaqItem) => Promise<boolean>;
  deleteErrorFaq: (id: string) => Promise<boolean>;
  importPastedImage: (base64Data: string) => Promise<string>;
  onOpenSearchHud?: (callback: () => void) => () => void;
  onOcrStatus?: (
    callback: (status: {
      phase: 'preparing' | 'initializing' | 'recognizing' | 'matching' | 'complete' | 'error';
      progress: number;
      message: string;
    }) => void
  ) => () => void;
  
  // Workspace & Shared Storage
  getWorkspacePath: () => Promise<{ path: string; isCustom: boolean; defaultPath: string; mcpServerPath?: string }>;
  changeWorkspacePath: () => Promise<{ success: boolean; canceled?: boolean; newPath?: string; error?: string }>;
  resetWorkspacePath: () => Promise<{ success: boolean; defaultPath: string }>;
  openWorkspaceFolder: () => Promise<void>;
  onWorkspacePathChanged?: (callback: (data: { path: string; isCustom: boolean; defaultPath: string; mcpServerPath?: string }) => void) => () => void;

  // Portable Bundles (.stepflow archive)
  exportProjectBundle: (project: SopProject) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  importProjectBundle: () => Promise<{ success: boolean; canceled?: boolean; project?: SopProject; error?: string }>;

  // Exporting
  exportPptx: (project: SopProject, fileData?: ArrayBuffer | Uint8Array | string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportPdf: (project: SopProject, fileData?: ArrayBuffer | Uint8Array | string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportHtml: (project: SopProject, htmlContent?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportMarkdown?: (payload: { markdown: string; defaultName?: string }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: IpcBridge;
  }
}
