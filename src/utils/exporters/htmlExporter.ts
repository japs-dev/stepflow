import { DEFAULT_COVER_PAGE_SETTINGS, type SopProject } from '../../types/sop';
import { getSafeFileName, downloadBlob, prepareExportProject } from './imageHelper';

interface ExportContentOptions {
  includeChangelog?: boolean;
}

function escapeHtml(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateLabel(value?: string): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function buildChangedStepsLabel(
  currentSteps: Array<{ id: string; order: number; title: string }>,
  previousSteps: Array<{ id: string; order: number; title: string }>
): string {
  const previousMap = new Map(previousSteps.map((step) => [step.id, step]));
  const currentMap = new Map(currentSteps.map((step) => [step.id, step]));

  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];

  for (const step of currentSteps) {
    const previousStep = previousMap.get(step.id);
    const label = `Step ${step.order}: ${step.title}`;
    if (!previousStep) {
      added.push(label);
      continue;
    }
    if (JSON.stringify(previousStep) !== JSON.stringify(step)) {
      updated.push(label);
    }
  }

  for (const previousStep of previousSteps) {
    if (!currentMap.has(previousStep.id)) {
      removed.push(`Step ${previousStep.order}: ${previousStep.title}`);
    }
  }

  const parts: string[] = [];
  if (added.length) parts.push(`Added: ${added.join(', ')}`);
  if (updated.length) parts.push(`Updated: ${updated.join(', ')}`);
  if (removed.length) parts.push(`Removed: ${removed.join(', ')}`);

  return parts.join(' | ') || 'No step-level changes';
}

function buildChangelogRows(project: SopProject): Array<{ date: string; editor: string; changedSteps: string; summary: string }> {
  const history = project.history || [];
  if (history.length === 0) {
    return [
      {
        date: formatDateLabel(project.updatedAt || project.createdAt),
        editor: project.author || 'Team Member',
        changedSteps: 'No published history yet',
        summary: 'Initial draft state'
      }
    ];
  }

  return history.map((entry, index) => {
    const previousEntry = history[index + 1];
    const previousSteps = previousEntry?.snapshot.steps || [];

    return {
      date: formatDateLabel(entry.createdAt),
      editor: entry.author || project.author || 'Team Member',
      changedSteps: buildChangedStepsLabel(entry.snapshot.steps, previousSteps),
      summary: entry.summary || 'Updated SOP content'
    };
  });
}

function parseMarkdownToHtml(content?: string): string {
  if (!content) return '';
  const lines = content.split('\n');
  const htmlOut: string[] = [];
  let inList = false;
  let inOrderedList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Headers
    if (line.startsWith('### ')) {
      if (inList) { htmlOut.push('</ul>'); inList = false; }
      if (inOrderedList) { htmlOut.push('</ol>'); inOrderedList = false; }
      htmlOut.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { htmlOut.push('</ul>'); inList = false; }
      if (inOrderedList) { htmlOut.push('</ol>'); inOrderedList = false; }
      htmlOut.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { htmlOut.push('</ul>'); inList = false; }
      if (inOrderedList) { htmlOut.push('</ol>'); inOrderedList = false; }
      htmlOut.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { htmlOut.push('</ul>'); inList = false; }
      if (inOrderedList) { htmlOut.push('</ol>'); inOrderedList = false; }
      htmlOut.push(`<blockquote>${escapeHtml(line.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { htmlOut.push('<ul>'); inList = true; }
      const itemText = escapeHtml(line.slice(2))
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      htmlOut.push(`<li>${itemText}</li>`);
      continue;
    }

    // Ordered list
    const ordMatch = line.match(/^\d+\.\s+(.*)/);
    if (ordMatch) {
      if (!inOrderedList) { htmlOut.push('<ol>'); inOrderedList = true; }
      const itemText = escapeHtml(ordMatch[1])
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      htmlOut.push(`<li>${itemText}</li>`);
      continue;
    }

    // Regular text
    if (inList) { htmlOut.push('</ul>'); inList = false; }
    if (inOrderedList) { htmlOut.push('</ol>'); inOrderedList = false; }

    if (line.length > 0) {
      const formatted = escapeHtml(line)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      htmlOut.push(`<p>${formatted}</p>`);
    }
  }

  if (inList) htmlOut.push('</ul>');
  if (inOrderedList) htmlOut.push('</ol>');

  return htmlOut.join('\n');
}

/**
 * Builds the standalone interactive HTML string
 */
export async function buildHtmlPlayerString(rawProject: SopProject, options: ExportContentOptions = {}): Promise<string> {
  const { includeChangelog = true } = options;
  const needsPrep = rawProject.steps?.some(
    (s) => s.type === 'screenshot' && s.image?.originalImagePath && !s.image?.annotatedCachePath
  );
  const project = needsPrep ? await prepareExportProject(rawProject) : rawProject;

  const primaryColor = project.theme?.primaryColor || '#0f172a';
  const accentColor = project.theme?.accentColor || '#2563eb';
  const fontFamily =
    project.theme?.fontFamily || 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const sortedSteps = [...(project.steps || [])]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      ...s,
      renderedDescription: parseMarkdownToHtml(s.description),
    }));

  // Omit redundant raw image data from the embedded client JSON payload to avoid doubling the export file size
  const clientSteps = sortedSteps.map((s) => ({
    ...s,
    image: s.image
      ? {
          ...s.image,
          originalImagePath: s.image.annotatedCachePath ? '' : s.image.originalImagePath,
        }
      : undefined,
  }));
  const sortedProject = { ...project, steps: clientSteps };
  const safeProjectJson = JSON.stringify(sortedProject)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const formattedDate = new Date(project.updatedAt || project.createdAt || Date.now()).toLocaleDateString(
    undefined,
    { year: 'numeric', month: 'short', day: 'numeric' }
  );

  const cover = project.coverPage || DEFAULT_COVER_PAGE_SETTINGS;
  const hasCoverPage = cover.enabled !== false;
  const hasToc = hasCoverPage && cover.showTableOfContents !== false;

  const displayTitle = hasCoverPage ? (cover.title || project.name) : project.name;
  const displaySubtitle = (hasCoverPage ? (cover.subtitle || project.description) : project.description) || '';
  const displayAuthor = (hasCoverPage && cover.author) || project.author || 'StepFlow';
  const displayDepartment = (hasCoverPage && cover.organization) || project.department || '';
  const displayVersion = (hasCoverPage && cover.version) || project.version || '1.0.0';

  let coverStyle = '';
  let isCustomCover = false;
  let isLightCover = false;
  let overlayHtml = '';

  if (hasCoverPage) {
    if (cover.backgroundType === 'image' && cover.backgroundImage) {
      const safeBg = cover.backgroundImage.startsWith('data:')
        ? cover.backgroundImage
        : encodeURI(cover.backgroundImage).replace(/'/g, '%27');
      coverStyle = `background-image: url('${safeBg}'); background-size: cover; background-position: center;`;
      isCustomCover = true;
      const opacity = cover.backgroundOverlayOpacity ?? 0.45;
      overlayHtml = `<div class="cover-overlay" style="opacity: ${opacity};"></div>`;
    } else if (cover.backgroundType === 'color' && cover.backgroundColor) {
      coverStyle = `background: ${cover.backgroundColor};`;
      if (cover.backgroundColor === '#ffffff' || cover.backgroundColor === '#f1f5f9') {
        isLightCover = true;
      } else {
        isCustomCover = true;
      }
    } else if (cover.backgroundGradient) {
      coverStyle = `background: ${cover.backgroundGradient};`;
      if (cover.backgroundGradient.includes('#f8fafc')) {
        isLightCover = true;
      } else {
        isCustomCover = true;
      }
    }
  }

  let tocSectionHtml = '';
  if (hasToc) {
    const items = sortedSteps
      .map(
        (s) => `
        <a href="#step-card-${s.id}" class="toc-item">
          <span class="toc-badge">${String(s.order).padStart(2, '0')}</span>
          <span class="toc-step-title">${escapeHtml(s.title)}</span>
          <span class="toc-type-tag">${s.type === 'screenshot' ? 'Visual' : 'Check'}</span>
        </a>
      `
      )
      .join('\n');

    tocSectionHtml = `
      <section class="toc-card">
        <div class="toc-header">
          <div class="toc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Table of Contents
          </div>
          <span style="font-size: 12px; color: var(--text-muted);">${sortedSteps.length} Procedures</span>
        </div>
        <div class="toc-grid">
          ${items}
        </div>
      </section>
    `;
  }

  const changelogRows = buildChangelogRows(project)
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.editor)}</td>
          <td>${escapeHtml(row.changedSteps)}</td>
          <td>${escapeHtml(row.summary)}</td>
        </tr>
      `
    )
    .join('');

  const changelogSectionHtml = `
    <section class="changelog-card">
      <div class="changelog-header">
        <div class="changelog-title">Document Changelog</div>
      </div>
      <div class="changelog-table-wrap">
        <table class="changelog-table">
          <thead>
            <tr>
              <th>Change Date</th>
              <th>Editor</th>
              <th>Changed Steps</th>
              <th>Publish Summary</th>
            </tr>
          </thead>
          <tbody>
            ${changelogRows}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Overview mode static HTML generation
  const overviewCardsHtml = sortedSteps
    .map((step, index) => {
      let calloutHtml = '';
      if (step.callout && step.callout.text) {
        const type = step.callout.type || 'info';
        const label = type.toUpperCase();
        calloutHtml = `
          <div class="callout callout-${type}">
            <span class="callout-badge">${label}</span>
            <div class="callout-text">${escapeHtml(step.callout.text)}</div>
          </div>
        `;
      }

      let subStepsHtml = '';
      if (step.subSteps && step.subSteps.length > 0) {
        const items = step.subSteps
          .map(
            (s) => `
            <li class="substep-row">
              <span class="substep-badge">${s.badgeNumber}</span>
              <div class="substep-desc">
                <span class="substep-title">${escapeHtml(s.title)}</span>
                ${s.note ? `<span class="substep-note">${escapeHtml(s.note)}</span>` : ''}
              </div>
            </li>
          `
          )
          .join('');
        subStepsHtml = `<ul class="substep-list">${items}</ul>`;
      }

      let visualHtml = '';
      const stepImgSrc = step.image?.annotatedCachePath || step.image?.originalImagePath;
      if (step.type === 'screenshot' && stepImgSrc) {
        visualHtml = `
          <div class="step-image-wrap">
            <img src="${stepImgSrc}" alt="${escapeHtml(step.title)}" class="step-image" loading="lazy" />
          </div>
        `;
      }

      return `
        <article class="step-card" id="step-card-${step.id}">
          <header class="step-card-header">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
              <span class="step-pill">STEP ${String(step.order).padStart(2, '0')}</span>
              <h2 class="step-title">${escapeHtml(step.title)}</h2>
            </div>
            <button class="nav-btn btn-interactive-jump" onclick="jumpToStep(${index})" title="Open interactive walkthrough at this step">
              Interactive View ↗
            </button>
          </header>
          ${step.renderedDescription ? `<div class="step-prose">${step.renderedDescription}</div>` : ''}
          ${calloutHtml}
          ${visualHtml}
          ${subStepsHtml}
        </article>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.name)} — StepFlow SOP</title>
  <style>
    :root {
      --primary: ${primaryColor};
      --accent: ${accentColor};
      --font-stack: ${fontFamily};

      /* Light Theme */
      --bg-base: #f8fafc;
      --bg-surface: #ffffff;
      --bg-elevated: #f1f5f9;
      --border-color: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --card-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
    }

    [data-theme="dark"] {
      --bg-base: #090d16;
      --bg-surface: #111827;
      --bg-elevated: #1e293b;
      --border-color: #1f2937;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --card-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-stack);
      background-color: var(--bg-base);
      color: var(--text-main);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      transition: background-color 0.2s ease, color 0.2s ease;
    }

    /* Top Navigation Bar */
    .top-nav {
      position: sticky;
      top: 0;
      z-index: 50;
      height: 56px;
      background-color: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      backdrop-filter: blur(8px);
    }

    .nav-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-pill {
      background: var(--primary);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .brand-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 320px;
    }

    /* Mode Switcher Tabs */
    .mode-switcher {
      display: flex;
      background-color: var(--bg-elevated);
      padding: 3px;
      border-radius: 8px;
      gap: 2px;
    }

    .mode-btn {
      border: none;
      background: none;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 14px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .mode-btn:hover {
      color: var(--text-main);
    }

    .mode-btn.active {
      background-color: var(--bg-surface);
      color: var(--text-main);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .icon-btn {
      border: 1px solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      width: 34px;
      height: 34px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.15s;
    }

    .icon-btn:hover {
      background-color: var(--bg-elevated);
    }

    /* Containers */
    .app-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
      min-height: calc(100vh - 56px);
      display: flex;
      flex-direction: column;
    }

    /* Walkthrough Mode Layout */
    .walkthrough-view {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 20px;
    }

    .walkthrough-body {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 24px;
      flex: 1;
    }

    @media (max-width: 960px) {
      .walkthrough-body {
        grid-template-columns: 1fr;
      }
    }

    .walkthrough-sidebar {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: var(--card-shadow);
      height: fit-content;
    }

    .step-badge-large {
      display: inline-block;
      width: fit-content;
      background: var(--primary);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 20px;
      letter-spacing: 0.05em;
    }

    .step-title-large {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-main);
      line-height: 1.3;
    }

    .step-desc-large {
      font-size: 13.5px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    .step-desc-large h1, .step-desc-large h2, .step-desc-large h3 {
      color: var(--text-main);
      margin: 12px 0 6px 0;
    }

    .step-desc-large ul, .step-desc-large ol {
      padding-left: 20px;
      margin: 8px 0;
    }

    .step-desc-large blockquote {
      border-left: 3px solid var(--accent);
      padding-left: 10px;
      margin: 8px 0;
      font-style: italic;
    }

    /* Main Visual Card */
    .walkthrough-main {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-shadow: var(--card-shadow);
      min-height: 480px;
      position: relative;
    }

    .step-image-wrap {
      position: relative;
      width: 100%;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border-color);
      background: var(--bg-elevated);
    }

    .step-image {
      display: block;
      width: 100%;
      height: auto;
      user-select: none;
    }

    /* Interactive Hotspot Pin */
    .hotspot-pin {
      position: absolute;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      color: #ffffff;
      font-size: 13px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%);
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      transition: transform 0.2s ease, filter 0.2s ease;
      z-index: 10;
    }

    .hotspot-pin:hover {
      transform: translate(-50%, -50%) scale(1.15);
      filter: brightness(1.1);
    }

    /* Simulation Mode Pulsing Ring */
    .simulation-active .hotspot-pin {
      animation: pulse-ring 1.8s cubic-bezier(0.24, 0, 0.38, 1) infinite;
    }

    @keyframes pulse-ring {
      0% {
        box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7), 0 4px 10px rgba(0, 0, 0, 0.4);
      }
      70% {
        box-shadow: 0 0 0 16px rgba(37, 99, 235, 0), 0 4px 10px rgba(0, 0, 0, 0.4);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(37, 99, 235, 0), 0 4px 10px rgba(0, 0, 0, 0.4);
      }
    }

    /* Callout Box */
    .callout {
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
    }

    .callout-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .callout-info {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      color: #1e40af;
    }
    [data-theme="dark"] .callout-info {
      background: rgba(30, 64, 175, 0.2);
      color: #93c5fd;
    }

    .callout-warning {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      color: #92400e;
    }
    [data-theme="dark"] .callout-warning {
      background: rgba(146, 64, 14, 0.2);
      color: #fcd34d;
    }

    .callout-tip {
      background: #ecfdf5;
      border-left: 4px solid #10b981;
      color: #065f46;
    }
    [data-theme="dark"] .callout-tip {
      background: rgba(6, 95, 70, 0.2);
      color: #6ee7b7;
    }

    /* Sub-steps List */
    .substep-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }

    .substep-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
    }

    .substep-badge {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      font-size: 11px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .substep-desc {
      display: flex;
      flex-direction: column;
    }

    .substep-title {
      font-weight: 600;
      color: var(--text-main);
    }

    .substep-note {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Bottom Control Bar */
    .bottom-bar {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: var(--card-shadow);
      margin-top: auto;
    }

    .progress-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      max-width: 320px;
    }

    .progress-bar-bg {
      flex: 1;
      height: 6px;
      background: var(--bg-elevated);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .btn-nav-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .nav-btn {
      border: 1px solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
      padding: 7px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .nav-btn:hover:not(:disabled) {
      background-color: var(--bg-elevated);
    }

    .nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .nav-btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .nav-btn-primary:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    /* Simulation Mode Header Banner */
    .simulation-banner {
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(56, 189, 248, 0.1) 100%);
      border: 1px solid rgba(37, 99, 235, 0.3);
      border-radius: 12px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .sim-instruction {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Toast Notification */
    .sim-toast {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #10b981;
      color: #ffffff;
      padding: 10px 24px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.5);
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s ease;
      z-index: 100;
    }

    .sim-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* Simulation Celebration Modal */
    .sim-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: 20px;
    }

    .sim-modal-dialog {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 18px;
      padding: 32px 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4);
      animation: modal-pop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes modal-pop {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .sim-modal-icon {
      font-size: 48px;
      margin-bottom: 12px;
      line-height: 1;
    }

    .sim-modal-title {
      font-size: 20px;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 8px;
    }

    .sim-modal-desc {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .sim-modal-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Overview Mode Styling */
    .overview-view {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 900px;
      margin: 0 auto;
      width: 100%;
    }

    .doc-header-card {
      position: relative;
      overflow: hidden;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 36px 40px;
      box-shadow: var(--card-shadow);
    }

    .doc-header-card.custom-cover {
      color: #ffffff;
    }

    .doc-header-card.custom-cover .doc-title {
      color: #ffffff;
    }

    .doc-header-card.custom-cover .doc-desc {
      color: rgba(255, 255, 255, 0.85);
    }

    .doc-header-card.custom-cover .doc-meta {
      color: rgba(255, 255, 255, 0.8);
      border-top-color: rgba(255, 255, 255, 0.2);
    }

    .doc-header-card.custom-cover .doc-meta strong {
      color: #ffffff;
    }

    .doc-header-card.light-cover {
      color: #0f172a;
    }

    .doc-header-card.light-cover .doc-title {
      color: #0f172a;
    }

    .doc-header-card.light-cover .doc-desc {
      color: #475569;
    }

    .doc-header-card.light-cover .doc-meta {
      color: #64748b;
      border-top-color: #e2e8f0;
    }

    .doc-header-card.light-cover .doc-meta strong {
      color: #0f172a;
    }

    .cover-overlay {
      position: absolute;
      inset: 0;
      background: #000;
      pointer-events: none;
      z-index: 1;
    }

    .cover-content {
      position: relative;
      z-index: 2;
    }

    .toc-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px 28px;
      box-shadow: var(--card-shadow);
    }

    .toc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .toc-title {
      font-size: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-main);
    }

    .toc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 10px;
    }

    .changelog-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 20px 24px;
      box-shadow: var(--card-shadow);
    }

    .changelog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .changelog-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
    }

    .changelog-table-wrap {
      width: 100%;
      overflow-x: auto;
    }

    .changelog-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .changelog-table th,
    .changelog-table td {
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      padding: 9px 10px;
      vertical-align: top;
      color: var(--text-main);
    }

    .changelog-table th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      font-weight: 700;
      background: var(--bg-elevated);
    }

    .toc-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 10px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      text-decoration: none;
      color: var(--text-main);
      transition: all 0.15s ease;
      cursor: pointer;
    }

    .toc-item:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    .toc-badge {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: var(--primary);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .toc-step-title {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .toc-type-tag {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--text-muted);
      background: var(--bg-surface);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .doc-title {
      font-size: 28px;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 8px;
    }

    .doc-desc {
      font-size: 15px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }

    .doc-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      font-size: 12.5px;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
      padding-top: 16px;
    }

    .step-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 32px;
      box-shadow: var(--card-shadow);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .step-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .step-pill {
      background: var(--primary);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 12px;
      letter-spacing: 0.05em;
    }

    .step-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-main);
    }

    .step-prose {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* Print Styles */
    @media print {
      body { background: #ffffff !important; color: #000000 !important; }
      .top-nav, .bottom-bar, .mode-switcher, .simulation-banner, .sim-toast, .btn-interactive-jump, .sim-modal-backdrop { display: none !important; }
      .app-container { padding: 0 !important; }
      .overview-view { display: flex !important; max-width: 100% !important; }
      .walkthrough-view { display: none !important; }
      .step-card, .doc-header-card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Top Navigation Bar -->
  <header class="top-nav">
    <div class="nav-brand">
      <span class="brand-pill">StepFlow</span>
      <span class="brand-title">${escapeHtml(project.name)}</span>
    </div>

    <!-- Mode Switcher -->
    <div class="mode-switcher">
      <button class="mode-btn active" id="btn-mode-walkthrough" onclick="setMode('walkthrough')">
        📖 Walkthrough
      </button>
      <button class="mode-btn" id="btn-mode-overview" onclick="setMode('overview')">
        📄 Overview SOP
      </button>
      <button class="mode-btn" id="btn-mode-simulation" onclick="setMode('simulation')">
        🎯 Training Sim
      </button>
    </div>

    <div class="nav-actions">
      <button class="icon-btn" onclick="toggleTheme()" title="Toggle Dark/Light Mode">
        🌓
      </button>
      <button class="icon-btn" onclick="window.print()" title="Print SOP">
        🖨️
      </button>
    </div>
  </header>

  <main class="app-container">

    <!-- Mode 1 & 3: Walkthrough & Simulation View -->
    <div id="walkthrough-container" class="walkthrough-view">

      <!-- Simulation Instruction Banner -->
      <div id="simulation-banner" class="simulation-banner" style="display: none;">
        <div class="sim-instruction">
          <span>🎯</span>
          <span>Simulation Task: Read the instructions and click the pulsing target hotspot on the screenshot.</span>
        </div>
        <span id="sim-progress-badge" class="brand-pill" style="background: #10b981;">0 / ${project.steps.length} DONE</span>
      </div>

      <div class="walkthrough-body">
        <!-- Sidebar Card -->
        <aside class="walkthrough-sidebar">
          <span class="step-badge-large" id="step-badge">STEP 01</span>
          <h1 class="step-title-large" id="step-title">Loading...</h1>
          <div class="step-desc-large" id="step-desc"></div>
          <div id="step-callout"></div>
          <div id="step-substeps"></div>
          <div id="simulation-action-wrap" style="display: none; margin-top: 12px;">
            <button class="nav-btn nav-btn-primary" style="width: 100%; justify-content: center;" onclick="handleSimulationComplete()">
              ✓ Mark Step as Completed
            </button>
          </div>
        </aside>

        <!-- Main Viewport -->
        <section class="walkthrough-main" id="step-viewport">
          <div id="image-wrapper" class="step-image-wrap" style="display: none;">
            <img id="main-image" src="" alt="Step Screenshot" class="step-image" />
            <div id="hotspots-overlay"></div>
          </div>
          <div id="text-only-fallback" style="display: none; text-align: center; padding: 40px 20px;">
            <div id="fallback-icon" style="font-size: 36px; margin-bottom: 12px;">📋</div>
            <h3 id="fallback-title" style="font-size: 18px; font-weight: 700; color: var(--text-main);">Documentation Checkpoint</h3>
            <p id="fallback-desc" style="font-size: 13px; color: var(--text-muted); max-width: 440px; margin: 8px auto;">
              This step provides essential operating prerequisites and guidelines before proceeding.
            </p>
          </div>
        </section>
      </div>

      <!-- Bottom Control Bar -->
      <footer class="bottom-bar">
        <div class="progress-wrap">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="progress-fill" style="width: 0%;"></div>
          </div>
          <span class="progress-text" id="progress-text">Step 1 of ${project.steps.length}</span>
        </div>

        <div class="btn-nav-group">
          <button class="nav-btn" id="btn-prev" onclick="changeStep(-1)">
            ← Previous
          </button>
          <button class="nav-btn nav-btn-primary" id="btn-next" onclick="changeStep(1)">
            Next →
          </button>
        </div>
      </footer>
    </div>

    <!-- Mode 2: Overview Document View -->
    <div id="overview-container" class="overview-view" style="display: none;">
      <header class="doc-header-card ${isCustomCover ? 'custom-cover' : ''} ${isLightCover ? 'light-cover' : ''}" style="${coverStyle}">
        ${overlayHtml}
        <div class="cover-content">
          ${hasCoverPage && cover.showVersion ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <span class="brand-pill" style="margin-bottom: 0;">SOP DOCUMENT</span>
              <span style="font-size: 12px; font-weight: 700; opacity: 0.85;">v${escapeHtml(displayVersion)}</span>
            </div>
          ` : ''}
          <h1 class="doc-title">${escapeHtml(displayTitle)}</h1>
          ${displaySubtitle ? `
            <p class="doc-desc">${escapeHtml(displaySubtitle)}</p>
          ` : ''}
          <div class="doc-meta">
            <span><strong>Author:</strong> ${escapeHtml(displayAuthor)}</span>
            ${displayDepartment ? `<span><strong>Department:</strong> ${escapeHtml(displayDepartment)}</span>` : ''}
            <span><strong>Version:</strong> ${escapeHtml(displayVersion)}</span>
            <span><strong>Status:</strong> ${escapeHtml((project.status || 'draft').toUpperCase())}</span>
            <span><strong>Updated:</strong> ${formattedDate}</span>
            <span><strong>Total Steps:</strong> ${project.steps.length}</span>
          </div>
        </div>
      </header>
      ${tocSectionHtml}
      ${includeChangelog ? changelogSectionHtml : ''}
      ${overviewCardsHtml}
      <footer style="margin-top: 40px; padding: 20px 0; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted);">
        <span>${escapeHtml(project.footerText?.trim() || (project.department || cover.organization ? `Confidential • ${project.department || cover.organization} • Internal Use Only` : 'Confidential • Internal Use Only • Generated by StepFlow'))}</span>
        <span>${project.steps.length} Sequential Steps</span>
      </footer>
    </div>

  </main>

  <!-- Simulation Toast Notification -->
  <div id="sim-toast" class="sim-toast">✓ Step Completed!</div>

  <!-- Simulation Celebration Modal -->
  <div id="sim-modal" class="sim-modal-backdrop" style="display: none;">
    <div class="sim-modal-dialog">
      <div class="sim-modal-icon">🎉</div>
      <h2 class="sim-modal-title">Simulation Complete!</h2>
      <p class="sim-modal-desc">
        Congratulations! You have successfully completed all steps in <strong id="sim-modal-proj-name"></strong>.
      </p>
      <div class="sim-modal-actions">
        <button class="nav-btn nav-btn-primary" style="justify-content: center;" onclick="restartSimulation()">
          🔄 Restart Simulation
        </button>
        <button class="nav-btn" style="justify-content: center;" onclick="openFullOverview()">
          📄 View Full SOP
        </button>
        <button class="nav-btn" style="justify-content: center;" onclick="closeSimModal()">
          Close
        </button>
      </div>
    </div>
  </div>

  <script>
    const PROJECT = ${safeProjectJson};
    let currentStepIndex = 0;
    let currentMode = 'walkthrough'; // 'walkthrough' | 'overview' | 'simulation'

    function initTheme() {
      try {
        const saved = localStorage.getItem('stepflow_theme');
        if (saved === 'dark' || saved === 'light') {
          document.documentElement.setAttribute('data-theme', saved);
        }
      } catch (e) {}
    }

    function toggleTheme() {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try {
        localStorage.setItem('stepflow_theme', next);
      } catch (e) {}
    }

    function setMode(mode) {
      currentMode = mode;
      document.querySelectorAll('.mode-btn').forEach(function(btn) {
        btn.classList.remove('active');
      });
      const activeBtn = document.getElementById('btn-mode-' + mode);
      if (activeBtn) activeBtn.classList.add('active');

      const walkthroughEl = document.getElementById('walkthrough-container');
      const overviewEl = document.getElementById('overview-container');
      const simBanner = document.getElementById('simulation-banner');

      if (mode === 'overview') {
        walkthroughEl.style.display = 'none';
        overviewEl.style.display = 'flex';
      } else {
        walkthroughEl.style.display = 'flex';
        overviewEl.style.display = 'none';

        if (mode === 'simulation') {
          simBanner.style.display = 'flex';
          document.body.classList.add('simulation-active');
        } else {
          simBanner.style.display = 'none';
          document.body.classList.remove('simulation-active');
        }
      }

      renderCurrentStep();
    }

    function changeStep(delta) {
      if (!PROJECT.steps || PROJECT.steps.length === 0) return;
      const newIdx = currentStepIndex + delta;
      if (newIdx >= 0 && newIdx < PROJECT.steps.length) {
        currentStepIndex = newIdx;
        renderCurrentStep();
      }
    }

    function jumpToStep(idx) {
      if (!PROJECT.steps || PROJECT.steps.length === 0) return;
      if (idx >= 0 && idx < PROJECT.steps.length) {
        currentStepIndex = idx;
        setMode('walkthrough');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function renderCurrentStep() {
      const total = (PROJECT.steps && PROJECT.steps.length) || 0;
      if (total === 0) {
        document.getElementById('step-badge').innerText = 'STEP 00';
        document.getElementById('step-title').innerText = 'No Steps Available';
        document.getElementById('step-desc').innerText = 'This SOP document currently does not contain any steps.';
        document.getElementById('image-wrapper').style.display = 'none';
        document.getElementById('text-only-fallback').style.display = 'none';
        document.getElementById('btn-prev').disabled = true;
        document.getElementById('btn-next').disabled = true;
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('progress-text').innerText = '0 of 0 Steps';
        return;
      }

      const step = PROJECT.steps[currentStepIndex];
      if (!step) return;

      // Update badge & title
      document.getElementById('step-badge').innerText = 'STEP ' + String(step.order || (currentStepIndex + 1)).padStart(2, '0');
      document.getElementById('step-title').innerText = step.title || 'Untitled Step';

      // Update description with markdown pre-rendered HTML
      document.getElementById('step-desc').innerHTML = step.renderedDescription || (step.description ? escapeHtml(step.description) : '');

      // Callout
      const calloutEl = document.getElementById('step-callout');
      if (step.callout && step.callout.text) {
        const type = escapeHtml(step.callout.type || 'info');
        calloutEl.innerHTML = '<div class="callout callout-' + type + '">' +
          '<span class="callout-badge">' + type.toUpperCase() + '</span>' +
          '<div>' + escapeHtml(step.callout.text) + '</div>' +
          '</div>';
      } else {
        calloutEl.innerHTML = '';
      }

      // Substeps
      const substepsEl = document.getElementById('step-substeps');
      if (step.subSteps && step.subSteps.length > 0) {
        const items = step.subSteps.map(function(s) {
          return '<li class="substep-row">' +
            '<span class="substep-badge">' + s.badgeNumber + '</span>' +
            '<div class="substep-desc">' +
            '<span class="substep-title">' + escapeHtml(s.title) + '</span>' +
            (s.note ? '<span class="substep-note">' + escapeHtml(s.note) + '</span>' : '') +
            '</div>' +
            '</li>';
        }).join('');
        substepsEl.innerHTML = '<ul class="substep-list">' + items + '</ul>';
      } else {
        substepsEl.innerHTML = '';
      }

      // Image & Hotspots
      const imgWrap = document.getElementById('image-wrapper');
      const textFallback = document.getElementById('text-only-fallback');
      const mainImg = document.getElementById('main-image');
      const overlay = document.getElementById('hotspots-overlay');
      const simActionWrap = document.getElementById('simulation-action-wrap');

      overlay.innerHTML = '';

      const imgSrc = (step.image && (step.image.annotatedCachePath || step.image.originalImagePath)) || '';

      if (step.type === 'screenshot' && imgSrc) {
        imgWrap.style.display = 'block';
        textFallback.style.display = 'none';
        simActionWrap.style.display = 'none';

        if (mainImg.getAttribute('src') !== imgSrc) {
          mainImg.src = imgSrc;
        }

        const dims = step.image.dimensions || { width: 960, height: 540 };
        const annotations = step.image.annotations || [];
        const badges = annotations.filter(function(a) { return a.type === 'badge'; });

        // In Simulation mode, overlay interactive pulsing target pins
        if (currentMode === 'simulation') {
          if (badges.length > 0) {
            simActionWrap.style.display = 'none';
            badges.forEach(function(a) {
              const pin = document.createElement('div');
              pin.className = 'hotspot-pin';
              pin.innerText = a.badgeNumber || '1';
              pin.style.left = ((a.x / dims.width) * 100).toFixed(2) + '%';
              pin.style.top = ((a.y / dims.height) * 100).toFixed(2) + '%';
              pin.style.backgroundColor = a.fillColor || 'var(--accent)';

              pin.onclick = function() {
                handleSimulationComplete();
              };

              overlay.appendChild(pin);
            });
          } else {
            // No badge on this visual step: provide action button to complete step
            simActionWrap.style.display = 'block';
          }
        }
      } else {
        imgWrap.style.display = 'none';
        textFallback.style.display = 'block';

        const fallbackIcon = document.getElementById('fallback-icon');
        const fallbackTitle = document.getElementById('fallback-title');
        const fallbackDesc = document.getElementById('fallback-desc');

        if (step.type === 'screenshot') {
          if (fallbackIcon) fallbackIcon.innerText = '📸';
          if (fallbackTitle) fallbackTitle.innerText = 'Screenshot Pending';
          if (fallbackDesc) fallbackDesc.innerText = 'No screenshot has been captured for this procedure step yet.';
        } else {
          if (fallbackIcon) fallbackIcon.innerText = '📋';
          if (fallbackTitle) fallbackTitle.innerText = 'Documentation Checkpoint';
          if (fallbackDesc) fallbackDesc.innerText = 'This step provides essential operating prerequisites and guidelines before proceeding.';
        }

        if (currentMode === 'simulation') {
          simActionWrap.style.display = 'block';
        } else {
          simActionWrap.style.display = 'none';
        }
      }

      // Progress bar & buttons
      const pct = Math.round(((currentStepIndex + 1) / total) * 100);
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('progress-text').innerText = 'Step ' + (currentStepIndex + 1) + ' of ' + total + ' (' + pct + '%)';

      document.getElementById('btn-prev').disabled = currentStepIndex === 0;
      document.getElementById('btn-next').disabled = currentStepIndex === total - 1;

      // Update simulation banner badge
      const simBadge = document.getElementById('sim-progress-badge');
      if (simBadge) {
        simBadge.innerText = (currentStepIndex + 1) + ' / ' + total + ' COMPLETED';
      }
    }

    function handleSimulationComplete() {
      const toast = document.getElementById('sim-toast');
      toast.innerText = '✓ Step ' + (currentStepIndex + 1) + ' Completed!';
      toast.classList.add('show');

      setTimeout(function() {
        toast.classList.remove('show');
      }, 1400);

      if (currentStepIndex < PROJECT.steps.length - 1) {
        setTimeout(function() {
          changeStep(1);
        }, 350);
      } else {
        setTimeout(function() {
          openSimModal();
        }, 400);
      }
    }

    function openSimModal() {
      const modal = document.getElementById('sim-modal');
      const nameEl = document.getElementById('sim-modal-proj-name');
      if (nameEl) nameEl.innerText = PROJECT.name || 'this SOP';
      if (modal) modal.style.display = 'flex';
    }

    function closeSimModal() {
      const modal = document.getElementById('sim-modal');
      if (modal) modal.style.display = 'none';
    }

    function restartSimulation() {
      closeSimModal();
      currentStepIndex = 0;
      setMode('simulation');
      renderCurrentStep();
    }

    function openFullOverview() {
      closeSimModal();
      setMode('overview');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Keyboard navigation
    window.addEventListener('keydown', function(e) {
      if (currentMode === 'overview') return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        changeStep(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        changeStep(-1);
      } else if (e.key.toLowerCase() === 'd') {
        toggleTheme();
      } else if (e.key === 'Escape') {
        closeSimModal();
      }
    });

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Setup image error fallback
    const mainImg = document.getElementById('main-image');
    if (mainImg) {
      mainImg.onerror = function() {
        document.getElementById('image-wrapper').style.display = 'none';
        document.getElementById('text-only-fallback').style.display = 'block';
        const fallbackIcon = document.getElementById('fallback-icon');
        const fallbackTitle = document.getElementById('fallback-title');
        const fallbackDesc = document.getElementById('fallback-desc');
        if (fallbackIcon) fallbackIcon.innerText = '🖼️';
        if (fallbackTitle) fallbackTitle.innerText = 'Image Unavailable';
        if (fallbackDesc) fallbackDesc.innerText = 'The screenshot for this step could not be displayed.';
      };
    }

    // Initial theme and render
    initTheme();
    renderCurrentStep();
  </script>
</body>
</html>`;
}

/**
 * Exports SOP project to a standalone interactive HTML file
 * Dual support for Electron bridge and web browser download.
 */
export async function exportToHtml(
  project: SopProject,
  options: ExportContentOptions = {}
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const preparedProject = await prepareExportProject(project);
    const htmlString = await buildHtmlPlayerString(preparedProject, options);
    const safeName = getSafeFileName(project.name, 'html');

    // 1. Electron bridge support
    if (typeof window !== 'undefined' && window.electronAPI?.exportHtml) {
      try {
        const result = await window.electronAPI.exportHtml(preparedProject, htmlString);
        if (result) {
          return result;
        }
      } catch (ipcErr) {
        console.warn('Electron exportHtml failed, falling back to browser export:', ipcErr);
      }
    }

    // 2. Client-side HTML generation & browser download
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, safeName);

    return { success: true, filePath: safeName };
  } catch (err) {
    console.error('Error generating HTML presentation:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
