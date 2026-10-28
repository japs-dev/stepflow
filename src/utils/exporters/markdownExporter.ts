import type { SopProject } from '../../types/sop';
import { downloadBlob, getSafeFileName } from './imageHelper';

interface ExportContentOptions {
  includeChangelog?: boolean;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
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
  const prevMap = new Map(previousSteps.map((step) => [step.id, step]));
  const currentMap = new Map(currentSteps.map((step) => [step.id, step]));

  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];

  for (const step of currentSteps) {
    const previousStep = prevMap.get(step.id);
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
    const changedSteps = buildChangedStepsLabel(entry.snapshot.steps, previousSteps);

    return {
      date: formatDateLabel(entry.createdAt),
      editor: entry.author || project.author || 'Team Member',
      changedSteps,
      summary: entry.summary || 'Updated SOP content'
    };
  });
}

export function generateMarkdownString(project: SopProject, options: ExportContentOptions = {}): string {
  const { includeChangelog = true } = options;
  const lines: string[] = [];

  lines.push(`# ${project.name}`);
  if (project.description) {
    lines.push(`\n> ${project.description}\n`);
  } else {
    lines.push('');
  }

  lines.push('### Metadata');
  lines.push(`- **ID**: \`${project.id}\``);
  lines.push(`- **Status**: ${project.status || 'draft'}`);
  lines.push(`- **Version**: ${project.version || '1.0.0'}`);
  if (project.author) lines.push(`- **Author**: ${project.author}`);
  if (project.department) lines.push(`- **Department**: ${project.department}`);
  if (project.tags && project.tags.length > 0) {
    lines.push(`- **Tags**: ${project.tags.join(', ')}`);
  }
  lines.push(`- **Last Updated**: ${project.updatedAt || project.createdAt || 'N/A'}`);
  lines.push(`- **Step Count**: ${project.steps.length}`);
  lines.push('\n---\n');

  if (includeChangelog) {
    lines.push('## Changelog\n');
    lines.push('| Change Date | Editor | Changed Steps | Publish Summary |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of buildChangelogRows(project)) {
      lines.push(
        `| ${escapeMarkdownTableCell(row.date)} | ${escapeMarkdownTableCell(row.editor)} | ${escapeMarkdownTableCell(row.changedSteps)} | ${escapeMarkdownTableCell(row.summary)} |`
      );
    }
    lines.push('\n---\n');
  }

  lines.push('## Procedure Steps\n');

  if (project.steps.length === 0) {
    lines.push('*No steps created yet.*');
  } else {
    const sortedSteps = [...project.steps].sort((a, b) => a.order - b.order);
    for (const step of sortedSteps) {
      lines.push(`### Step ${step.order}: ${step.title}`);
      if (step.description) {
        lines.push(`\n${step.description}\n`);
      }

      if (step.callout && step.callout.text) {
        const alertType =
          step.callout.type === 'warning'
            ? 'WARNING'
            : step.callout.type === 'tip'
            ? 'TIP'
            : 'NOTE';
        lines.push(`> [!${alertType}]\n> **${step.callout.type.toUpperCase()}**: ${step.callout.text}\n`);
      }

      if (step.subSteps && step.subSteps.length > 0) {
        lines.push('**Sub-steps / Details:**');
        for (const sub of step.subSteps) {
          lines.push(`- (${sub.badgeNumber}) **${sub.title}**${sub.note ? `: ${sub.note}` : ''}`);
        }
        lines.push('');
      }

      if (step.image && step.image.originalImagePath) {
        const badgeCount = step.image.annotations?.filter((a) => a.type === 'badge').length || 0;
        const totalAnnotations = step.image.annotations?.length || 0;
        lines.push(
          `*📸 Visual Screenshot: Captured (${step.image.dimensions?.width || 'auto'}x${
            step.image.dimensions?.height || 'auto'
          }px, ${totalAnnotations} visual annotations, ${badgeCount} badges)*`
        );
      } else {
        lines.push('*📸 Visual Screenshot: [Pending - Ready for screenshot capture in StepFlow Studio]*');
      }

      lines.push('\n---\n');
    }
  }

  return lines.join('\n');
}

export async function exportToMarkdown(
  project: SopProject,
  options: ExportContentOptions = {}
): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string; markdown: string }> {
  const md = generateMarkdownString(project, options);
  const safeName = getSafeFileName(project.name || 'sop-document', 'md');

  if (typeof window !== 'undefined' && window.electronAPI?.exportMarkdown) {
    const res = await window.electronAPI.exportMarkdown({ markdown: md, defaultName: safeName });
    return { ...res, markdown: md };
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, safeName);
  return { success: true, markdown: md };
}
