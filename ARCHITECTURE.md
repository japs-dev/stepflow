# StepFlow — Architecture & Desired State Specification

This document defines the canonical architecture, release scope, invariants, and code-quality standards for **StepFlow**. All contributors and AI agents must verify changes against this specification.

---

## 1. Release Scope & Feature Gating

StepFlow uses a single source of truth for feature rollout in [`src/config/releaseFeatures.ts`](file:///Users/joeyaipassa/Coding/Projects/SOP_creator/src/config/releaseFeatures.ts):

```ts
export const RELEASE_FEATURES = {
  errorFaq: false,
} as const;
```

### Release 1 (Active): SOP Creation, Annotation & Multi-Format Export
- **Project Library**: Create (`+ New` opens a new project immediately on the Front Cover without a blocking modal), rename, duplicate, delete, search, and import/export `.stepflow` project bundles.
- **3-Pane Studio Editor**:
  - **Left Pane (`StepOutline`)**: Cover Page, Table of Contents, and draggable step cards (`@dnd-kit`), with a corner collapse button (`Cmd/Ctrl+B`).
  - **Center Pane (`CenterViewport`)**: Corner expand buttons when sidebars are collapsed, interactive zoom/pan bar, `AnnotationToolbar`, `KonvaCanvas` (arrow, rectangle, circle, text, blur, highlight, step-number badge, magnifier loupe, crop), and Markdown text-step live preview.
  - **Right Pane (`StepInspector`)**: Corner collapse button (`Cmd/Ctrl+I`), `RichInstructionsEditor` for Markdown instructions, callout selector, Beautify frame controls, and Retake Full Screen / Retake Selection controls.
- **Floating Capture Pill (`FloatingDot`)**:
  - Cursor-anchored hover expansion (`translate3d` synchronized with intrinsic label width transitions so the hovered button never shifts under the cursor).
  - Left draggable status zone (`titlebar-drag`) separated from the right contiguous interactive button zone (`titlebar-no-drag`).
  - In Release 1 (`RELEASE_FEATURES.errorFaq === false`), only SOP capture actions (`Screen`, `Area`, `Open Studio`) are rendered; when no project is active, the standby badge displays `'SOP'`.
- **Exporters**: PDF (`jsPDF`), PowerPoint (`pptxgenjs`), interactive standalone HTML, Markdown ZIP (`jszip`), and portable `.stepflow` bundle.

### Release 2 (Gated behind `RELEASE_FEATURES.errorFaq = true`): Error Log / FAQ & Offline OCR
- When `RELEASE_FEATURES.errorFaq` is `false`:
  - **Main Process (`electron/main.ts`)**: Imports `RELEASE_FEATURES` directly (no duplicate boolean flags). Skips registering `CommandOrControl+Shift+F`, short-circuits `analyze-error-image`, `list-error-faq`, `save-error-faq`, and `delete-error-faq`, and never initializes the Tesseract worker.
  - **Project Library (`ProjectLibrary.tsx`)**: Hides the Error & FAQ navigation items/tabs, Spotlight HUD triggers, and Error FAQ modals.
  - **Floating Pill (`FloatingDot.tsx`)**: Excludes the `Search` (`⌘⇧F`) action button, disables drag-and-drop / clipboard paste OCR triggers, and does not transition into `error_match`, `error_new`, or `search` overlay modes.

---

## 2. Architectural Invariants & Best Practices

### 2.1 Asset Protocol & Image Handling
- **Canonical Asset URL**: All local screenshot and image files on disk must be referenced in renderer state using `stepflow-asset://local/<encodeURIComponent(posixPath)>` via [`normalizeImagePathForRenderer`](file:///Users/joeyaipassa/Coding/Projects/SOP_creator/src/store/useSopStore.ts) (renderer) and `toStepflowAssetUrl` / `resolveStepflowAssetPath` (main process).
- **Native Dimensions**: Exporters ([`imageHelper.ts`](file:///Users/joeyaipassa/Coding/Projects/SOP_creator/src/utils/exporters/imageHelper.ts)) must use the image's true `naturalWidth` and `naturalHeight` when compositing annotations so non-16:9 or cropped captures never stretch or misalign annotations.
- **Shared Image Import**: `import-pasted-image` in `electron/main.ts` is a core asset utility (used by SOP image uploads, crops, and cover images as well as FAQ) and must remain available regardless of `RELEASE_FEATURES.errorFaq`.

### 2.2 Multi-Window State Synchronization
- Both `studioWindow` and `overlayWindow` run independent Zustand instances of [`useSopStore`](file:///Users/joeyaipassa/Coding/Projects/SOP_creator/src/store/useSopStore.ts) synchronized via Electron IPC (`save-project`, `sync-active-project`, `project-updated-external`, `active-project-synced`).
- **Debounce Cancellation**: Immediate broadcasts (`broadcastProjectUpdate`) must always cancel any pending debounced broadcast (`pendingProjectBroadcastTimer`) so stale timers can never overwrite newer step additions, deletions, or reorders.
- **Project Deduplication**: Project lists loaded from disk or `localStorage` must be deduplicated by `project.id` (keeping the most recently updated entry) via `deduplicateProjects`.

### 2.3 Zero Duplicated or Redundant Code
- **Platform Shortcut Labels**: Use a single shared helper (e.g., `isMacPlatform()` / `getCmdLabel()`) rather than redefining `const isMac = typeof window !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(...)` across components.
- **Asset URL Formatting**: Components must use [`normalizeImagePathForRenderer`](file:///Users/joeyaipassa/Coding/Projects/SOP_creator/src/store/useSopStore.ts) instead of defining local `formatAssetUrl` wrappers.
- **Markdown Utilities**: Components and exporters must use [`src/utils/markdownHelper.tsx`](file:///Users/joeyaipassa/Coding/Projects/SOP_creator/src/utils/markdownHelper.tsx) (`renderMarkdownBlocks`, `stripMarkdown`) instead of inline duplicate Markdown parsers or regex chains.
- **Feature Flags**: Import [`RELEASE_FEATURES`](file:///Users/joeyaipassa/Coding/Projects/SOP_creator/src/config/releaseFeatures.ts) everywhere instead of hardcoding local feature booleans.

### 2.4 Atomic Persistence & Write Serialization
- **Per-Project Queue**: `save-project` serializes all writes to `proj_<id>.json` through a per-project Promise queue (`queueProjectSave`) to prevent concurrent write corruption.
- **Unique Atomic Temp Files**: Atomic writes always write to `proj_<id>.<timestamp>.<random>.tmp` before renaming over the target file.
- **Flush on Exit/Minimize**: Pending debounced updates are flushed immediately (`flushPendingProjectBroadcast`) on window unload, project switch, or minimize to pill.
- **Clean Empty State**: If a user deletes all projects, empty storage is respected on subsequent launches instead of resurrecting `SAMPLE_PROJECT`.

### 2.5 Asset Security & File Integrity
- **Safe Asset Validation**: Every asset served via `stepflow-asset://` or packaged into `.stepflow` bundles must pass `isSafeAssetFile()` (verifying allowed image extensions and containment within `stepflow_assets/` or the team workspace via `fs.realpathSync`).
- **Zip-Slip Protection**: Bundle imports extract only whitelisted image extensions to flat basename destinations within `stepflow_assets/`.
- **Orphan Asset Cleanup**: Unreferenced screenshots older than 1 hour are cleaned up automatically in the background on startup and project deletion without interrupting active editing.
