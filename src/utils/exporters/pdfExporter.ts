import { jsPDF } from 'jspdf';
import { DEFAULT_COVER_PAGE_SETTINGS, type SopProject, type CalloutType } from '../../types/sop';
import { renderAnnotatedImage, prepareExportProject, getSafeFileName } from './imageHelper';
import { stripMarkdown } from '../markdownHelper';

function hexToRgb(hex?: string, fallback: [number, number, number] = [37, 99, 235]): [number, number, number] {
  if (!hex) return fallback;
  const cleaned = hex.replace(/^#/, '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return fallback;
}

function getCalloutPdfColors(type?: CalloutType): {
  bg: [number, number, number];
  border: [number, number, number];
  text: [number, number, number];
  label: string;
} {
  switch (type) {
    case 'tip':
      return {
        bg: [236, 253, 245],
        border: [16, 185, 129],
        text: [6, 95, 70],
        label: 'TIP',
      };
    case 'warning':
      return {
        bg: [254, 243, 199],
        border: [245, 158, 11],
        text: [146, 64, 14],
        label: 'WARNING',
      };
    case 'info':
    default:
      return {
        bg: [239, 246, 255],
        border: [59, 130, 246],
        text: [30, 64, 175],
        label: 'NOTE',
      };
  }
}

/**
 * Builds the jsPDF Document instance
 */
export async function buildPdfDocument(project: SopProject): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 595.28 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 841.89 pt
  const margin = 36;
  const contentWidth = pageWidth - margin * 2; // 523.28 pt
  const bottomThreshold = pageHeight - 55; // Footer boundary

  const primaryRgb = hexToRgb(project.theme?.primaryColor, [15, 23, 42]);
  const accentRgb = hexToRgb(project.theme?.accentColor, [37, 99, 235]);

  const cover = project.coverPage || DEFAULT_COVER_PAGE_SETTINGS;
  const hasCoverPage = cover.enabled !== false;
  const hasToc = hasCoverPage && cover.showTableOfContents !== false;

  let tocPageIndex: number | null = null;
  const stepPageMap: Record<string, number> = {};

  const formattedDate = new Date(project.updatedAt || project.createdAt || Date.now()).toLocaleDateString(
    undefined,
    { year: 'numeric', month: 'short', day: 'numeric' }
  );

  let currentY = margin + 10;

  // ==========================================
  // 1. FRONT COVER PAGE (PAGE 1)
  // ==========================================
  if (hasCoverPage) {
    const isLightBg =
      cover.backgroundType === 'color' &&
      (cover.backgroundColor === '#ffffff' || cover.backgroundColor === '#f1f5f9');
    const titleTextRgb: [number, number, number] = isLightBg ? [15, 23, 42] : [255, 255, 255];
    const subTextRgb: [number, number, number] = isLightBg ? [71, 85, 105] : [203, 213, 225];
    const cardBgRgb: [number, number, number] = isLightBg ? [241, 245, 249] : [30, 41, 59];
    const cardBorderRgb: [number, number, number] = isLightBg ? [226, 232, 240] : [51, 65, 85];

    // Background Render
    if (cover.backgroundType === 'image' && cover.backgroundImage) {
      try {
        doc.addImage(cover.backgroundImage, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
        const overlayOpacity = cover.backgroundOverlayOpacity ?? 0.45;
        if (overlayOpacity > 0) {
          try {
            const anyDoc = doc as any;
            if (typeof anyDoc.saveGraphicsState === 'function') {
              anyDoc.saveGraphicsState();
              anyDoc.setGState(new anyDoc.GState({ opacity: overlayOpacity }));
              doc.setFillColor(0, 0, 0);
              doc.rect(0, 0, pageWidth, pageHeight, 'F');
              anyDoc.restoreGraphicsState();
            } else {
              doc.setFillColor(15, 23, 42);
              doc.rect(0, 0, pageWidth, pageHeight, 'F');
            }
          } catch {
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
          }
        }
      } catch (err) {
        console.warn('Could not render cover background image in PDF:', err);
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
      }
    } else if (cover.backgroundType === 'color') {
      const bgRgb = hexToRgb(cover.backgroundColor, [15, 23, 42]);
      doc.setFillColor(...bgRgb);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
    } else {
      // Gradient Presets mapped to rich solid base
      let bgRgb: [number, number, number] = [15, 23, 42];
      if (cover.backgroundGradient?.includes('#1e3a8a')) bgRgb = [30, 58, 138];
      else if (cover.backgroundGradient?.includes('#064e3b')) bgRgb = [6, 78, 59];
      else if (cover.backgroundGradient?.includes('#312e81')) bgRgb = [49, 46, 129];
      else if (cover.backgroundGradient?.includes('#581c87')) bgRgb = [88, 28, 135];
      else if (cover.backgroundGradient?.includes('#f8fafc')) bgRgb = [248, 250, 252];
      doc.setFillColor(...bgRgb);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
    }

    // Top Accent Bar
    doc.setFillColor(...accentRgb);
    doc.rect(0, 0, pageWidth, 6, 'F');

    // Header Pill
    doc.setFillColor(...primaryRgb);
    doc.roundedRect(margin, 52, 200, 20, 4, 4, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('STANDARD OPERATING PROCEDURE', margin + 10, 65);

    if (cover.showVersion) {
      const vStr = `v${cover.version || project.version || '1.0.0'}`;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...subTextRgb);
      doc.text(vStr, pageWidth - margin - doc.getTextWidth(vStr), 65);
    }

    // Main Title & Subtitle in Center
    const coverTitle = cover.title || project.name;
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...titleTextRgb);
    const titleLines = doc.splitTextToSize(coverTitle, contentWidth);
    let coverTextY = 220;
    doc.text(titleLines, margin, coverTextY);
    coverTextY += titleLines.length * 32 + 6;

    if (cover.subtitle || project.description) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...subTextRgb);
      const subLines = doc.splitTextToSize(cover.subtitle || project.description || '', contentWidth);
      doc.text(subLines, margin, coverTextY);
      coverTextY += subLines.length * 16 + 10;
    }

    if (cover.layout === 'modern') {
      doc.setFillColor(...accentRgb);
      doc.roundedRect(margin, coverTextY + 6, 44, 3, 1.5, 1.5, 'F');
    }

    // Bottom Metadata Card
    const metaCardY = pageHeight - 120;
    doc.setFillColor(...cardBgRgb);
    doc.setDrawColor(...cardBorderRgb);
    doc.setLineWidth(1);
    doc.roundedRect(margin, metaCardY, contentWidth, 54, 6, 6, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...subTextRgb);

    const orgOrDept = cover.organization || project.department || 'Operations';
    doc.text(`Author: ${cover.author || project.author || 'Team Member'}`, margin + 14, metaCardY + 22);
    doc.text(`Department: ${orgOrDept}`, margin + 14, metaCardY + 38);
    doc.text(`Date: ${formattedDate}`, margin + 270, metaCardY + 22);
    doc.text(`Scope: ${project.steps.length} Sequential Steps`, margin + 270, metaCardY + 38);

    // Prepare for next page (TOC or Steps)
    if (hasToc) {
      doc.addPage();
      tocPageIndex = doc.getNumberOfPages(); // page 2
      doc.addPage(); // page 3 (first step page)
      currentY = margin + 10;
    } else {
      doc.addPage(); // page 2 (first step page)
      currentY = margin + 10;
    }
  } else {
    // ==========================================
    // COMPACT HEADER ON FIRST PAGE (If Cover Disabled)
    // ==========================================
    doc.setFillColor(...accentRgb);
    doc.rect(0, 0, pageWidth, 4, 'F');

    const sopPillH = 18;
    doc.setFillColor(...primaryRgb);
    doc.roundedRect(margin, currentY, 176, sopPillH, 4, 4, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('STANDARD OPERATING PROCEDURE', margin + 10, currentY + 12);
    currentY += sopPillH + 16;

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryRgb);
    const titleLines = doc.splitTextToSize(project.name, contentWidth);
    doc.text(titleLines, margin, currentY + 16);
    currentY += 16 + titleLines.length * 26 + 10;

    if (project.description) {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const descLines = doc.splitTextToSize(project.description, contentWidth);
      doc.text(descLines, margin, currentY + 8);
      currentY += 8 + descLines.length * 14 + 12;
    }

    const metaBoxH = 28;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.roundedRect(margin, currentY, contentWidth, metaBoxH, 4, 4, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    const deptPart = project.department || cover.organization ? `   |   Dept: ${project.department || cover.organization}` : '';
    const metaText = `Author: ${project.author || 'StepFlow'}${deptPart}   |   Version: ${project.version || '1.0.0'}   |   Status: ${(project.status || 'draft').toUpperCase()}   |   Date: ${formattedDate}`;
    doc.text(metaText, margin + 12, currentY + 17);
    currentY += metaBoxH + 16;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 20;
  }

  // ==========================================
  // 2. SEQUENTIAL STEP CARDS WITH SMART PAGINATION
  // ==========================================
  const sortedSteps = [...(project.steps || [])].sort((a, b) => a.order - b.order);
  for (const step of sortedSteps) {
    // 1. Pre-calculate estimated height for this step
    let estimatedHeight = 26; // Card inner padding (top 14 + bottom 12)

    // Header (Badge + Title)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const estMaxTitleW = contentWidth - 28 - 56 - 14;
    const estTitleLines = doc.splitTextToSize(step.title, estMaxTitleW);
    const estHeaderH = Math.max(18, estTitleLines.length * 15);
    estimatedHeight += estHeaderH + 14;

    if (step.description) {
      doc.setFontSize(9.5);
      const splitDesc = doc.splitTextToSize(step.description, contentWidth - 28);
      estimatedHeight += 8 + splitDesc.length * 14 + 10;
    }

    if (step.callout && step.callout.text) {
      doc.setFontSize(8.5);
      const calloutText = `${step.callout.type.toUpperCase()}: ${step.callout.text}`;
      const splitCallout = doc.splitTextToSize(calloutText, contentWidth - 28 - 28);
      const calloutH = Math.max(28, splitCallout.length * 13 + 16);
      estimatedHeight += calloutH + 14;
    }

    if (step.subSteps && step.subSteps.length > 0) {
      estimatedHeight += step.subSteps.length * 22 + 6;
    }

    let renderedImgData: string | null = null;
    let imgRenderWidth = 0;
    let imgRenderHeight = 0;

    if (step.type === 'screenshot' && step.image?.originalImagePath) {
      try {
        if (step.image.annotatedCachePath) {
          renderedImgData = step.image.annotatedCachePath;
        } else {
          renderedImgData = await renderAnnotatedImage(step.image);
        }
        if (renderedImgData) {
          const dims = step.image.dimensions || { width: 960, height: 540 };
          const aspect = dims.height / dims.width;
          imgRenderWidth = contentWidth - 28;
          imgRenderHeight = imgRenderWidth * aspect;

          // Max height constraint for a single screenshot
          if (imgRenderHeight > 240) {
            imgRenderHeight = 240;
            imgRenderWidth = imgRenderHeight / aspect;
          }

          estimatedHeight += imgRenderHeight + 14;
        }
      } catch (err) {
        console.warn('Could not prepare step image for PDF:', err);
      }
    }

    // 2. Smart pagination: check if step fits on current page
    if (currentY + estimatedHeight > bottomThreshold) {
      doc.addPage();
      currentY = margin + 10;

      // Running page top rule & breadcrumb
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      const defaultHeader = [
        project.department || cover.organization,
        project.name,
        'Standard Operating Procedure'
      ].filter(Boolean).join(' • ');
      const runningHeader = project.headerText?.trim() || defaultHeader;
      doc.text(runningHeader, margin, currentY);
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 6, pageWidth - margin, currentY + 6);
      currentY += 18;
    }

    // Record step's starting page number for Table of Contents
    stepPageMap[step.id] = doc.getNumberOfPages();

    // 3. Render Step Card Container
    const cardStartY = currentY;
    const cardContentX = margin + 14;
    const cardContentW = contentWidth - 28;

    // Advance Y for inner contents
    currentY += 14;

    // Step Badge Pill
    const badgeText = `STEP ${String(step.order).padStart(2, '0')}`;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const badgeTextWidth = doc.getTextWidth(badgeText);
    const badgeWidth = Math.max(56, badgeTextWidth + 18);
    const badgeHeight = 18;

    doc.setFillColor(...primaryRgb);
    doc.roundedRect(cardContentX, currentY, badgeWidth, badgeHeight, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, cardContentX + (badgeWidth - badgeTextWidth) / 2, currentY + 12);

    // Step Title (wrapped gracefully)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryRgb);
    const titleX = cardContentX + badgeWidth + 12;
    const maxTitleW = cardContentW - badgeWidth - 14;
    const titleLines = doc.splitTextToSize(step.title, maxTitleW);
    doc.text(titleLines, titleX, currentY + 12.5);

    const titleBlockH = titleLines.length * 15;
    const headerH = Math.max(badgeHeight, titleBlockH);
    currentY += headerH + 14;

    // Step Description
    if (step.description) {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      const cleanDesc = stripMarkdown(step.description, { preserveNewlines: true });

      const descLines = doc.splitTextToSize(cleanDesc, cardContentW);
      doc.text(descLines, cardContentX, currentY + 8);
      currentY += 8 + descLines.length * 14 + 10;
    }

    // Callout Box
    if (step.callout && step.callout.text) {
      const cTheme = getCalloutPdfColors(step.callout.type);
      const calloutText = `${cTheme.label}: ${step.callout.text}`;
      const splitCallout = doc.splitTextToSize(calloutText, cardContentW - 28);
      const calloutHeight = Math.max(28, splitCallout.length * 13 + 16);

      // Box fill
      doc.setFillColor(...cTheme.bg);
      doc.roundedRect(cardContentX, currentY, cardContentW, calloutHeight, 4, 4, 'F');

      // Left vertical accent stripe
      doc.setFillColor(...cTheme.border);
      doc.roundedRect(cardContentX, currentY, 3.5, calloutHeight, 1.5, 1.5, 'F');

      // Callout text
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...cTheme.text);
      doc.text(splitCallout, cardContentX + 14, currentY + 14);

      currentY += calloutHeight + 14;
    }

    // Sub-Steps
    if (step.subSteps && step.subSteps.length > 0) {
      for (const sub of step.subSteps) {
        // Badge circle
        const circleRadius = 8.5;
        const circleCenterX = cardContentX + 10;
        const circleCenterY = currentY + 8;

        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.75);
        doc.circle(circleCenterX, circleCenterY, circleRadius, 'FD');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryRgb);
        const subNumStr = String(sub.badgeNumber);
        const subNumW = doc.getTextWidth(subNumStr);
        doc.text(subNumStr, circleCenterX - subNumW / 2, circleCenterY + 3);

        // Substep Title & Note
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        const subTextX = cardContentX + 24;
        doc.text(sub.title, subTextX, circleCenterY + 3);

        if (sub.note) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          const titleWidth = doc.getTextWidth(sub.title);
          doc.text(` — ${sub.note}`, subTextX + titleWidth + 4, circleCenterY + 3);
        }

        currentY += 22;
      }
      currentY += 6;
    }

    // Screenshot Image
    if (renderedImgData && imgRenderWidth > 0 && imgRenderHeight > 0) {
      // Center image horizontally within card
      const imgX = cardContentX + (cardContentW - imgRenderWidth) / 2;

      // Draw subtle border behind image
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(1);
      doc.rect(imgX - 1, currentY - 1, imgRenderWidth + 2, imgRenderHeight + 2, 'D');

      try {
        doc.addImage(renderedImgData, 'PNG', imgX, currentY, imgRenderWidth, imgRenderHeight);
      } catch (addImgErr) {
        console.warn('Could not add image into jsPDF:', addImgErr);
      }

      currentY += imgRenderHeight + 14;
    }

    currentY += 6; // Card bottom inner padding
    const cardTotalHeight = currentY - cardStartY;

    // Draw the overall card outer border
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.roundedRect(margin, cardStartY, contentWidth, cardTotalHeight, 6, 6, 'D');

    currentY += 16; // Gap between consecutive step cards
  }

  // ==========================================
  // 3. TABLE OF CONTENTS RENDERING (ON RESERVED PAGE 2)
  // ==========================================
  if (hasToc && tocPageIndex !== null) {
    doc.setPage(tocPageIndex);

    // Top Accent Bar
    doc.setFillColor(...accentRgb);
    doc.rect(0, 0, pageWidth, 4, 'F');

    let tocY = margin + 14;

    // Header Pill
    const tocPillH = 18;
    doc.setFillColor(...primaryRgb);
    doc.roundedRect(margin, tocY, 130, tocPillH, 4, 4, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TABLE OF CONTENTS', margin + 12, tocY + 12);
    tocY += tocPillH + 16;

    // Title & Subtitle
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryRgb);
    doc.text('Procedure Overview', margin, tocY + 15);
    tocY += 15 + 10;

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Comprehensive directory of sequential stages and instructional checkpoints.', margin, tocY + 8);
    tocY += 8 + 18;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(margin, tocY, pageWidth - margin, tocY);
    tocY += 20;

    // Table of contents entries
    const useTwoColumns = sortedSteps.length > 18;
    if (useTwoColumns) {
      const colGap = 16;
      const colWidth = (contentWidth - colGap) / 2;
      const half = Math.ceil(sortedSteps.length / 2);
      const rowHeight = 22;

      sortedSteps.forEach((step, idx) => {
        const colIndex = idx < half ? 0 : 1;
        const rowIndex = idx < half ? idx : idx - half;
        const colX = margin + colIndex * (colWidth + colGap);
        const itemY = tocY + rowIndex * rowHeight;

        if (itemY + rowHeight > bottomThreshold) return;

        // Step number pill
        const numStr = String(step.order).padStart(2, '0');
        const numPillW = 24;
        const numPillH = 16;
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(colX, itemY, numPillW, numPillH, 3, 3, 'F');

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryRgb);
        const numW = doc.getTextWidth(numStr);
        doc.text(numStr, colX + (numPillW - numW) / 2, itemY + 11);

        // Step Title
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        const titleStartX = colX + numPillW + 8;
        const maxTitleWidth = colWidth - numPillW - 55;
        let titleStr = step.title;
        while (doc.getTextWidth(titleStr) > maxTitleWidth && titleStr.length > 5) {
          titleStr = titleStr.slice(0, -4) + '...';
        }
        doc.text(titleStr, titleStartX, itemY + 11);

        // Page Number
        const targetPage = stepPageMap[step.id] || (hasToc ? 3 : 2);
        const pageNumStr = `p. ${targetPage}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...accentRgb);
        const pageNumWidth = doc.getTextWidth(pageNumStr);
        const pageNumX = colX + colWidth - pageNumWidth;
        doc.text(pageNumStr, pageNumX, itemY + 11);

        // Divider Line
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.5);
        doc.line(colX, itemY + rowHeight - 2, colX + colWidth, itemY + rowHeight - 2);
      });
    } else {
      const rowHeight = 28;
      for (const step of sortedSteps) {
        if (tocY + rowHeight > bottomThreshold - 10) {
          // Fits comfortably on single page overview
          break;
        }

        // Step Number Pill
        const numStr = String(step.order).padStart(2, '0');
        const numPillW = 32;
        const numPillH = 18;
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, tocY, numPillW, numPillH, 4, 4, 'F');

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryRgb);
        const numW = doc.getTextWidth(numStr);
        doc.text(numStr, margin + (numPillW - numW) / 2, tocY + 12.5);

        // Step Title
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        const titleStartX = margin + numPillW + 12;
        const maxTitleWidth = 330;
        let titleStr = step.title;
        while (doc.getTextWidth(titleStr) > maxTitleWidth && titleStr.length > 5) {
          titleStr = titleStr.slice(0, -4) + '...';
        }
        doc.text(titleStr, titleStartX, tocY + 12.5);

        // Page Number
        const targetPage = stepPageMap[step.id] || (hasToc ? 3 : 2);
        const pageNumStr = `Page ${targetPage}`;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...accentRgb);
        const pageNumWidth = doc.getTextWidth(pageNumStr);
        const pageNumX = pageWidth - margin - pageNumWidth;
        doc.text(pageNumStr, pageNumX, tocY + 12.5);

        // Dotted Leader Line
        const dotStartX = titleStartX + doc.getTextWidth(titleStr) + 8;
        const dotEndX = pageNumX - 10;
        if (dotEndX > dotStartX + 12) {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(203, 213, 225);
          let curDotX = dotStartX;
          while (curDotX < dotEndX) {
            doc.text('.', curDotX, tocY + 11.5);
            curDotX += 5;
          }
        }

        // Divider Line
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.5);
        doc.line(margin, tocY + rowHeight - 4, pageWidth - margin, tocY + rowHeight - 4);

        tocY += rowHeight;
      }
    }
  }

  // ==========================================
  // RUNNING FOOTERS ("Page X of Y")
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    // Skip running footer on Page 1 if cover page is enabled
    if (hasCoverPage && i === 1) continue;

    doc.setPage(i);

    // Separator line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);

    // Running footer notice
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);

    const defaultFooter = project.department || cover.organization
      ? `Confidential • ${project.department || cover.organization} • Internal Use Only`
      : 'Confidential • Internal Use Only • Generated by StepFlow';
    const runningFooter = project.footerText?.trim() || defaultFooter;
    doc.text(runningFooter, margin, pageHeight - 20);

    // Running page number
    const pageStr = `Page ${i} of ${totalPages}`;
    const pageStrWidth = doc.getTextWidth(pageStr);
    doc.text(pageStr, pageWidth - margin - pageStrWidth, pageHeight - 20);
  }

  return doc;
}

/**
 * Exports SOP project to a PDF document
 * Gracefully delegates to Electron IPC if present, or downloads in browser.
 */
export async function exportToPdf(
  project: SopProject
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const preparedProject = await prepareExportProject(project);
    const doc = await buildPdfDocument(preparedProject);
    const safeName = getSafeFileName(project.name, 'pdf');

    // 1. Electron bridge support
    if (typeof window !== 'undefined' && window.electronAPI?.exportPdf) {
      try {
        const pdfArrayBuffer = doc.output('arraybuffer');
        const result = await window.electronAPI.exportPdf(preparedProject, pdfArrayBuffer);
        if (result) {
          return result;
        }
      } catch (ipcErr) {
        console.warn('Electron exportPdf failed, falling back to browser export:', ipcErr);
      }
    }

    // 2. Client-side PDF generation & download
    doc.save(safeName);

    return { success: true, filePath: safeName };
  } catch (err) {
    console.error('Error generating PDF document:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Returns PDF document as a Blob
 */
export async function generatePdfBlob(project: SopProject): Promise<Blob> {
  const preparedProject = await prepareExportProject(project);
  const doc = await buildPdfDocument(preparedProject);
  return doc.output('blob');
}
