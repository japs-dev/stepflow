import PptxGenJS from 'pptxgenjs';
import { DEFAULT_COVER_PAGE_SETTINGS, type SopProject, type CalloutType } from '../../types/sop';
import { renderAnnotatedImage, prepareExportProject, getSafeFileName } from './imageHelper';
import { stripMarkdown } from '../markdownHelper';

interface ExportContentOptions {
  includeChangelog?: boolean;
}

/**
 * Strips '#' from hex color strings and ensures 6 characters
 */
function cleanHex(color?: string, fallback = '2563EB'): string {
  if (!color) return fallback;
  const hex = color.replace(/^#/, '').trim();
  if (hex.length === 3) {
    return hex
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
  }
  return hex.toUpperCase() || fallback;
}

/**
 * Returns callout styling config for PPTX shapes
 */
function getCalloutTheme(type?: CalloutType): { bg: string; border: string; label: string; textCol: string } {
  switch (type) {
    case 'tip':
      return { bg: 'ECFDF5', border: '10B981', label: 'TIP', textCol: '065F46' };
    case 'warning':
      return { bg: 'FFFBEB', border: 'F59E0B', label: 'WARNING', textCol: '92400E' };
    case 'info':
    default:
      return { bg: 'EFF6FF', border: '3B82F6', label: 'NOTE', textCol: '1E40AF' };
  }
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
    const label = `S${step.order}`;
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
      removed.push(`S${previousStep.order}`);
    }
  }

  const parts: string[] = [];
  if (added.length) parts.push(`Added ${added.join(', ')}`);
  if (updated.length) parts.push(`Updated ${updated.join(', ')}`);
  if (removed.length) parts.push(`Removed ${removed.join(', ')}`);
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

/**
 * Builds the PPTX Presentation instance
 */
export async function buildPptxPresentation(project: SopProject, options: ExportContentOptions = {}): Promise<PptxGenJS> {
  const { includeChangelog = true } = options;
  const pptx = new PptxGenJS();

  // 16:9 widescreen layout: 10.0" x 5.625"
  pptx.layout = 'LAYOUT_16x9';

  const primaryHex = cleanHex(project.theme?.primaryColor, '0F172A');
  const accentHex = cleanHex(project.theme?.accentColor, '2563EB');
  const fontFace = 'Arial';

  // Presentation metadata
  pptx.title = project.name;
  pptx.author = project.author || 'StepFlow SOP';
  pptx.subject = project.description || 'Standard Operating Procedure';
  pptx.company = 'StepFlow';

  // Define Master Slide
  pptx.defineSlideMaster({
    title: 'MASTER_STEPFLOW',
    background: { color: 'FFFFFF' },
    objects: [
      // Top accent bar
      {
        rect: {
          x: 0,
          y: 0,
          w: '100%',
          h: 0.08,
          fill: { color: accentHex },
        },
      },
      // Running footer text
      {
        text: {
          text:
            project.footerText?.trim() ||
            (project.department
              ? `${project.department} • ${project.name}`
              : `StepFlow SOP • ${project.name}`),
          options: {
            x: 0.6,
            y: 5.25,
            w: 6.0,
            h: 0.3,
            fontSize: 8,
            color: '94A3B8',
            fontFace,
          },
        },
      },
    ],
    slideNumber: {
      x: 8.5,
      y: 5.25,
      w: 1.0,
      h: 0.3,
      fontSize: 8,
      color: '94A3B8',
      fontFace,
      align: 'right',
    },
  });

  const cover = project.coverPage || DEFAULT_COVER_PAGE_SETTINGS;
  const hasCoverPage = cover.enabled !== false;
  const hasToc = hasCoverPage && cover.showTableOfContents !== false;
  const sortedSteps = [...(project.steps || [])].sort((a, b) => a.order - b.order);

  const formattedDate = new Date(project.updatedAt || project.createdAt || Date.now()).toLocaleDateString(
    undefined,
    { year: 'numeric', month: 'short', day: 'numeric' }
  );

  // ==========================================
  // 1. TITLE / COVER SLIDE
  // ==========================================
  if (hasCoverPage) {
    const titleSlide = pptx.addSlide();

    const isLightCover =
      cover.backgroundType === 'color' &&
      (cover.backgroundColor === '#ffffff' || cover.backgroundColor === '#f1f5f9');
    let titleTextCol = isLightCover ? primaryHex : 'FFFFFF';
    let subTextCol = isLightCover ? '475569' : 'CBD5E1';
    let cardBgCol = isLightCover ? 'FFFFFF' : '1E293B';
    let cardBorderCol = isLightCover ? 'E2E8F0' : '334155';

    // Apply Background
    if (cover.backgroundType === 'image' && cover.backgroundImage) {
      titleSlide.addImage({
        data: cover.backgroundImage,
        x: 0,
        y: 0,
        w: 10.0,
        h: 5.625,
      });
      const overlayAlpha = Math.round((cover.backgroundOverlayOpacity ?? 0.45) * 100);
      if (overlayAlpha > 0) {
        titleSlide.addShape('rect', {
          x: 0,
          y: 0,
          w: 10.0,
          h: 5.625,
          fill: { color: '000000', transparency: 100 - overlayAlpha },
        });
      }
      titleTextCol = 'FFFFFF';
      subTextCol = 'CBD5E1';
      cardBgCol = '1E293B';
      cardBorderCol = '334155';
    } else if (cover.backgroundType === 'color') {
      const bgCol = cleanHex(cover.backgroundColor, '0F172A');
      titleSlide.background = { color: bgCol };
    } else {
      // Gradient presets mapped to clean background colors
      let bgCol = '0F172A';
      if (cover.backgroundGradient?.includes('#1e3a8a')) bgCol = '1E3A8A';
      else if (cover.backgroundGradient?.includes('#064e3b')) bgCol = '064E3B';
      else if (cover.backgroundGradient?.includes('#312e81')) bgCol = '312E81';
      else if (cover.backgroundGradient?.includes('#581c87')) bgCol = '581C87';
      else if (cover.backgroundGradient?.includes('#f8fafc')) {
        bgCol = 'F8FAFC';
        titleTextCol = primaryHex;
        subTextCol = '475569';
        cardBgCol = 'FFFFFF';
        cardBorderCol = 'E2E8F0';
      }
      titleSlide.background = { color: bgCol };
    }

    // Decorative top accent bar
    titleSlide.addShape('rect', {
      x: 0,
      y: 0,
      w: 10.0,
      h: 0.12,
      fill: { color: accentHex },
    });

    // SOP Label Pill
    titleSlide.addShape('roundRect', {
      x: 0.8,
      y: 0.8,
      w: 2.8,
      h: 0.32,
      fill: { color: primaryHex },
      rectRadius: 0.06,
    });
    titleSlide.addText('STANDARD OPERATING PROCEDURE', {
      x: 0.8,
      y: 0.8,
      w: 2.8,
      h: 0.32,
      fontSize: 9,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
      valign: 'middle',
      fontFace,
    });

    if (cover.showVersion) {
      const vStr = `v${cover.version || project.version || '1.0.0'}`;
      titleSlide.addText(vStr, {
        x: 7.2,
        y: 0.8,
        w: 2.0,
        h: 0.32,
        fontSize: 10,
        bold: true,
        color: subTextCol,
        align: 'right',
        valign: 'middle',
        fontFace,
      });
    }

    // SOP Main Title
    const coverTitle = cover.title || project.name;
    titleSlide.addText(coverTitle, {
      x: 0.8,
      y: 1.35,
      w: 8.4,
      h: 1.2,
      fontSize: 28,
      bold: true,
      color: titleTextCol,
      fontFace,
      valign: 'top',
    });

    // SOP Description / Subtitle
    const coverSub = cover.subtitle || project.description;
    if (coverSub) {
      titleSlide.addText(coverSub, {
        x: 0.8,
        y: 2.5,
        w: 8.4,
        h: 1.0,
        fontSize: 12.5,
        color: subTextCol,
        fontFace,
        valign: 'top',
      });
    }

    // Metadata Card at bottom
    titleSlide.addShape('roundRect', {
      x: 0.8,
      y: 4.0,
      w: 8.4,
      h: 0.9,
      fill: { color: cardBgCol },
      line: { color: cardBorderCol, width: 1 },
      rectRadius: 0.08,
    });

    const statusLabel = (project.status || 'draft').toUpperCase();
    const statusColor =
      project.status === 'published'
        ? '10B981'
        : project.status === 'in_review'
        ? 'F59E0B'
        : '64748B';

    titleSlide.addText(
      [
        { text: 'Author: ', options: { bold: true, color: titleTextCol } },
        { text: `${cover.author || project.author || 'StepFlow'}\n`, options: { color: subTextCol } },
        { text: 'Department: ', options: { bold: true, color: titleTextCol } },
        { text: `${cover.organization || project.department || 'Operations'}`, options: { color: subTextCol } },
      ],
      {
        x: 1.1,
        y: 4.1,
        w: 3.5,
        h: 0.7,
        fontSize: 10.5,
        fontFace,
        valign: 'middle',
      }
    );

    titleSlide.addText(
      [
        { text: 'Date: ', options: { bold: true, color: titleTextCol } },
        { text: `${formattedDate}\n`, options: { color: subTextCol } },
        { text: 'Status: ', options: { bold: true, color: titleTextCol } },
        { text: `${statusLabel} (${project.steps.length} Steps)`, options: { bold: true, color: statusColor } },
      ],
      {
        x: 5.0,
        y: 4.1,
        w: 3.8,
        h: 0.7,
        fontSize: 10.5,
        fontFace,
        valign: 'middle',
      }
    );
  }

  // ==========================================
  // 2. TABLE OF CONTENTS / AGENDA SLIDE
  // ==========================================
  if (hasToc) {
    const ITEMS_PER_SLIDE = 14;
    const totalTocPages = Math.max(1, Math.ceil(sortedSteps.length / ITEMS_PER_SLIDE));

    for (let page = 0; page < totalTocPages; page++) {
      const pageSteps = sortedSteps.slice(page * ITEMS_PER_SLIDE, (page + 1) * ITEMS_PER_SLIDE);
      const tocSlide = pptx.addSlide({ masterName: 'MASTER_STEPFLOW' });

      // Header Pill
      tocSlide.addShape('roundRect', {
        x: 0.8,
        y: 0.45,
        w: 2.5,
        h: 0.28,
        fill: { color: primaryHex },
        rectRadius: 0.05,
      });
      const headerTitle = totalTocPages > 1
        ? `TABLE OF CONTENTS (${page + 1}/${totalTocPages})`
        : 'TABLE OF CONTENTS';
      tocSlide.addText(headerTitle, {
        x: 0.8,
        y: 0.45,
        w: 2.5,
        h: 0.28,
        fontSize: 8,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
        valign: 'middle',
        fontFace,
      });

      tocSlide.addText('Procedure Directory', {
        x: 0.8,
        y: 0.82,
        w: 8.4,
        h: 0.4,
        fontSize: 20,
        bold: true,
        color: primaryHex,
        fontFace,
        valign: 'top',
      });

      // Render 2 columns of step cards
      const half = Math.ceil(pageSteps.length / 2);
      const colWidth = 4.05;
      const gap = 0.3;

      pageSteps.forEach((step, idx) => {
        const colIndex = idx < half ? 0 : 1;
        const rowIndex = idx < half ? idx : idx - half;

        const itemX = 0.8 + colIndex * (colWidth + gap);
        const itemY = 1.35 + rowIndex * 0.52;

        // Row background
        tocSlide.addShape('roundRect', {
          x: itemX,
          y: itemY,
          w: colWidth,
          h: 0.44,
          fill: { color: 'F8FAFC' },
          line: { color: 'E2E8F0', width: 0.75 },
          rectRadius: 0.05,
        });

        // Step badge
        tocSlide.addShape('roundRect', {
          x: itemX + 0.1,
          y: itemY + 0.08,
          w: 0.68,
          h: 0.28,
          fill: { color: primaryHex },
          rectRadius: 0.04,
        });
        tocSlide.addText(`STEP ${String(step.order).padStart(2, '0')}`, {
          x: itemX + 0.1,
          y: itemY + 0.08,
          w: 0.68,
          h: 0.28,
          fontSize: 7.5,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
          valign: 'middle',
          fontFace,
        });

        // Step title
        tocSlide.addText(step.title, {
          x: itemX + 0.88,
          y: itemY + 0.08,
          w: colWidth - 1.6,
          h: 0.28,
          fontSize: 9.5,
          bold: true,
          color: '1E293B',
          fontFace,
          valign: 'middle',
        });

        // Step type tag
        const typeLabel = step.type === 'screenshot' ? 'Visual' : 'Check';
        tocSlide.addText(typeLabel, {
          x: itemX + colWidth - 0.7,
          y: itemY + 0.08,
          w: 0.6,
          h: 0.28,
          fontSize: 8,
          color: '64748B',
          align: 'right',
          fontFace,
          valign: 'middle',
        });
      });
    }
  }

  if (includeChangelog) {
    // ==========================================
    // 3. CHANGELOG TABLE SLIDE(S)
    // ==========================================
    const changelogRows = buildChangelogRows(project);
    const changelogRowsPerSlide = 9;
    const changelogPages = Math.max(1, Math.ceil(changelogRows.length / changelogRowsPerSlide));

    for (let page = 0; page < changelogPages; page++) {
      const pageRows = changelogRows.slice(page * changelogRowsPerSlide, (page + 1) * changelogRowsPerSlide);
      const changelogSlide = pptx.addSlide({ masterName: 'MASTER_STEPFLOW' });

    changelogSlide.addShape('roundRect', {
      x: 0.8,
      y: 0.45,
      w: 2.2,
      h: 0.28,
      fill: { color: primaryHex },
      rectRadius: 0.05,
    });
    const changelogHeader = changelogPages > 1
      ? `CHANGELOG (${page + 1}/${changelogPages})`
      : 'CHANGELOG';
    changelogSlide.addText(changelogHeader, {
      x: 0.8,
      y: 0.45,
      w: 2.2,
      h: 0.28,
      fontSize: 8,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
      valign: 'middle',
      fontFace,
    });

    changelogSlide.addText('Document Revision Log', {
      x: 0.8,
      y: 0.82,
      w: 8.4,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: primaryHex,
      fontFace,
      valign: 'top',
    });

    const tableX = 0.8;
    const tableY = 1.35;
    const tableW = 8.4;
    const headerH = 0.34;
    const rowH = 0.38;

    const dateW = 1.7;
    const editorW = 1.3;
    const changedW = 2.1;
    const summaryW = tableW - dateW - editorW - changedW;

    changelogSlide.addShape('rect', {
      x: tableX,
      y: tableY,
      w: tableW,
      h: headerH,
      fill: { color: 'F1F5F9' },
      line: { color: 'E2E8F0', width: 1 }
    });

    const headerFont = 8;
    changelogSlide.addText('CHANGE DATE', {
      x: tableX + 0.06,
      y: tableY + 0.08,
      w: dateW - 0.08,
      h: 0.2,
      fontSize: headerFont,
      bold: true,
      color: '475569',
      fontFace,
    });
    changelogSlide.addText('EDITOR', {
      x: tableX + dateW + 0.06,
      y: tableY + 0.08,
      w: editorW - 0.08,
      h: 0.2,
      fontSize: headerFont,
      bold: true,
      color: '475569',
      fontFace,
    });
    changelogSlide.addText('CHANGED STEPS', {
      x: tableX + dateW + editorW + 0.06,
      y: tableY + 0.08,
      w: changedW - 0.08,
      h: 0.2,
      fontSize: headerFont,
      bold: true,
      color: '475569',
      fontFace,
    });
    changelogSlide.addText('PUBLISH SUMMARY', {
      x: tableX + dateW + editorW + changedW + 0.06,
      y: tableY + 0.08,
      w: summaryW - 0.08,
      h: 0.2,
      fontSize: headerFont,
      bold: true,
      color: '475569',
      fontFace,
    });

      pageRows.forEach((row, idx) => {
        const rowY = tableY + headerH + idx * rowH;
        changelogSlide.addShape('rect', {
        x: tableX,
        y: rowY,
        w: tableW,
        h: rowH,
        fill: { color: idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' },
        line: { color: 'E2E8F0', width: 0.75 }
      });

        const cellFont = 8;
        changelogSlide.addText(row.date, {
        x: tableX + 0.06,
        y: rowY + 0.08,
        w: dateW - 0.08,
        h: rowH - 0.12,
        fontSize: cellFont,
        color: '1E293B',
        fontFace,
        fit: 'shrink'
      });
        changelogSlide.addText(row.editor, {
        x: tableX + dateW + 0.06,
        y: rowY + 0.08,
        w: editorW - 0.08,
        h: rowH - 0.12,
        fontSize: cellFont,
        color: '1E293B',
        fontFace,
        fit: 'shrink'
      });
        changelogSlide.addText(row.changedSteps, {
        x: tableX + dateW + editorW + 0.06,
        y: rowY + 0.08,
        w: changedW - 0.08,
        h: rowH - 0.12,
        fontSize: cellFont,
        color: '1E293B',
        fontFace,
        fit: 'shrink'
      });
        changelogSlide.addText(row.summary, {
        x: tableX + dateW + editorW + changedW + 0.06,
        y: rowY + 0.08,
        w: summaryW - 0.08,
        h: rowH - 0.12,
        fontSize: cellFont,
        color: '1E293B',
        fontFace,
        fit: 'shrink'
      });
      });
    }
  }

  // ==========================================
  // 4. STEP SLIDES
  // ==========================================
  for (const step of sortedSteps) {
    if (step.type === 'text_only') {
      // ------------------------------------------
      // Text-Only Slide (Prerequisite / Checkpoint)
      // ------------------------------------------
      const slide = pptx.addSlide({ masterName: 'MASTER_STEPFLOW' });

      // Badge: STEP 0X / CHECKPOINT
      slide.addShape('roundRect', {
        x: 0.8,
        y: 0.45,
        w: 1.4,
        h: 0.28,
        fill: { color: primaryHex },
        rectRadius: 0.05,
      });
      slide.addText(`STEP ${String(step.order).padStart(2, '0')}`, {
        x: 0.8,
        y: 0.45,
        w: 1.4,
        h: 0.28,
        fontSize: 10,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
        valign: 'middle',
        fontFace,
      });

      // Step Title
      slide.addText(step.title, {
        x: 2.35,
        y: 0.45,
        w: 7.0,
        h: 0.35,
        fontSize: 18,
        bold: true,
        color: primaryHex,
        fontFace,
        valign: 'middle',
      });

      // Main Content Card
      const cardHeight = step.callout ? 2.8 : 3.8;
      slide.addShape('roundRect', {
        x: 0.8,
        y: 0.95,
        w: 8.4,
        h: cardHeight,
        fill: { color: 'F8FAFC' },
        line: { color: 'E2E8F0', width: 1 },
        rectRadius: 0.08,
      });

      // Cleaned markdown description
      const cleanDesc = stripMarkdown(step.description, { preserveNewlines: true });

      slide.addText(cleanDesc, {
        x: 1.1,
        y: 1.1,
        w: 7.8,
        h: cardHeight - 0.3,
        fontSize: 12,
        color: '334155',
        fontFace,
        valign: 'top',
        lineSpacing: 18,
      });

      // Callout Box at bottom if present
      if (step.callout && step.callout.text) {
        const cTheme = getCalloutTheme(step.callout.type);
        slide.addShape('roundRect', {
          x: 0.8,
          y: 3.9,
          w: 8.4,
          h: 0.85,
          fill: { color: cTheme.bg },
          line: { color: cTheme.border, width: 1.5 },
          rectRadius: 0.06,
        });

        slide.addText(
          [
            { text: `${cTheme.label}: `, options: { bold: true, color: cTheme.textCol } },
            { text: step.callout.text, options: { color: cTheme.textCol } },
          ],
          {
            x: 1.0,
            y: 3.95,
            w: 8.0,
            h: 0.75,
            fontSize: 11,
            fontFace,
            valign: 'middle',
          }
        );
      }
    } else {
      // ------------------------------------------
      // Standard Stepped Slide (16:9 Split Layout)
      // 35% Left Column | 65% Right Column
      // ------------------------------------------
      const slide = pptx.addSlide({ masterName: 'MASTER_STEPFLOW' });

      const leftX = 0.6;
      const leftW = 3.2; // ~35% of slide width
      let currentLeftY = 0.45;

      // Left Column: Step Badge (STEP 01)
      slide.addShape('roundRect', {
        x: leftX,
        y: currentLeftY,
        w: 1.1,
        h: 0.28,
        fill: { color: primaryHex },
        rectRadius: 0.05,
      });
      slide.addText(`STEP ${String(step.order).padStart(2, '0')}`, {
        x: leftX,
        y: currentLeftY,
        w: 1.1,
        h: 0.28,
        fontSize: 9,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
        valign: 'middle',
        fontFace,
      });
      currentLeftY += 0.36;

      // Left Column: Step Title
      slide.addText(step.title, {
        x: leftX,
        y: currentLeftY,
        w: leftW,
        h: 0.65,
        fontSize: 15,
        bold: true,
        color: primaryHex,
        fontFace,
        valign: 'top',
      });
      currentLeftY += 0.68;

      // Left Column: Instructions prose
      if (step.description) {
        slide.addText(step.description, {
          x: leftX,
          y: currentLeftY,
          w: leftW,
          h: 1.1,
          fontSize: 10,
          color: '334155',
          fontFace,
          valign: 'top',
          lineSpacing: 14,
        });
        currentLeftY += 1.15;
      }

      // Left Column: Callout box (Tip/Warning/Info)
      if (step.callout && step.callout.text) {
        const cTheme = getCalloutTheme(step.callout.type);
        slide.addShape('roundRect', {
          x: leftX,
          y: currentLeftY,
          w: leftW,
          h: 0.72,
          fill: { color: cTheme.bg },
          line: { color: cTheme.border, width: 1.2 },
          rectRadius: 0.05,
        });

        slide.addText(
          [
            { text: `${cTheme.label}: `, options: { bold: true, color: cTheme.textCol } },
            { text: step.callout.text, options: { color: cTheme.textCol } },
          ],
          {
            x: leftX + 0.1,
            y: currentLeftY + 0.05,
            w: leftW - 0.2,
            h: 0.62,
            fontSize: 9,
            fontFace,
            valign: 'middle',
          }
        );
        currentLeftY += 0.78;
      }

      // Left Column: Sub-step bullet points
      if (step.subSteps && step.subSteps.length > 0) {
        const subItems: PptxGenJS.TextProps[] = [];
        step.subSteps.forEach((sub) => {
          subItems.push({
            text: `[${sub.badgeNumber}] ${sub.title}${sub.note ? ` — ${sub.note}` : ''}\n`,
            options: {
              fontSize: 9,
              bold: false,
              color: '1E293B',
              breakLine: true,
            },
          });
        });

        slide.addText(subItems, {
          x: leftX,
          y: currentLeftY,
          w: leftW,
          h: 1.2,
          fontFace,
          valign: 'top',
        });
      }

      // Right Column: 65% width with auto-scaled screenshot & drop shadow
      const rightX = 4.0;
      const rightW = 5.4;
      const rightH = 4.4;

      if (step.image?.originalImagePath) {
        try {
          const renderedImg = step.image.annotatedCachePath || (await renderAnnotatedImage(step.image));
          if (renderedImg) {
            const isBase64Data = renderedImg.startsWith('data:image/') && renderedImg.includes(';base64,');
            const isLocalPath = !renderedImg.startsWith('data:');

            if (isBase64Data || isLocalPath) {
              const imgOptions: PptxGenJS.ImageProps = {
                x: rightX,
                y: 0.55,
                w: rightW,
                h: rightH,
                sizing: { type: 'contain', w: rightW, h: rightH },
                shadow: {
                  type: 'outer',
                  color: '000000',
                  opacity: 0.18,
                  blur: 8,
                  offset: 3,
                  angle: 90,
                },
                ...(isBase64Data ? { data: renderedImg } : { path: renderedImg }),
              };
              slide.addImage(imgOptions);
            } else {
              // Unrendered SVG or non-base64 data URI: safe fallback shape
              slide.addShape('roundRect', {
                x: rightX,
                y: 0.55,
                w: rightW,
                h: rightH,
                fill: { color: 'F1F5F9' },
                line: { color: 'CBD5E1', width: 1, dashType: 'dash' },
                rectRadius: 0.08,
              });
              slide.addText('Screenshot Preview', {
                x: rightX,
                y: 2.2,
                w: rightW,
                h: 0.6,
                fontSize: 13,
                color: '94A3B8',
                align: 'center',
                fontFace,
              });
            }
          }
        } catch (imgErr) {
          console.warn('Failed to embed screenshot in PPTX slide:', imgErr);
        }
      } else {
        // Fallback placeholder card
        slide.addShape('roundRect', {
          x: rightX,
          y: 0.55,
          w: rightW,
          h: rightH,
          fill: { color: 'F1F5F9' },
          line: { color: 'CBD5E1', width: 1, dashType: 'dash' },
          rectRadius: 0.08,
        });
        slide.addText('No Screenshot Available', {
          x: rightX,
          y: 2.2,
          w: rightW,
          h: 0.6,
          fontSize: 13,
          color: '94A3B8',
          align: 'center',
          fontFace,
        });
      }
    }
  }

  return pptx;
}

/**
 * Exports presentation to PPTX file
 * Supports Electron save dialog or browser download.
 */
export async function exportToPptx(
  project: SopProject,
  options: ExportContentOptions = {}
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const preparedProject = await prepareExportProject(project);
    const pptx = await buildPptxPresentation(preparedProject, options);
    const safeName = getSafeFileName(project.name, 'pptx');

    // 1. Electron bridge support
    if (typeof window !== 'undefined' && window.electronAPI?.exportPptx) {
      try {
        const pptxBuffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
        const result = await window.electronAPI.exportPptx(preparedProject, pptxBuffer);
        if (result) {
          return result;
        }
      } catch (ipcErr) {
        console.warn('Electron exportPptx failed, falling back to browser export:', ipcErr);
      }
    }

    // 2. Client-side PPTX generation & browser download
    await pptx.writeFile({ fileName: safeName });

    return { success: true, filePath: safeName };
  } catch (err) {
    console.error('Error generating PPTX presentation:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Returns PPTX presentation as a Blob for programmatic access
 */
export async function generatePptxBlob(project: SopProject): Promise<Blob> {
  const preparedProject = await prepareExportProject(project);
  const pptx = await buildPptxPresentation(preparedProject);
  const buffer = await pptx.write({ outputType: 'blob' });
  return buffer as Blob;
}
