import type { SopProject } from '../../types/sop';
import { downloadBlob, getSafeFileName } from './imageHelper';

export function generateMarkdownString(project: SopProject): string {
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
  project: SopProject
): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string; markdown: string }> {
  const md = generateMarkdownString(project);
  const safeName = getSafeFileName(project.name || 'sop-document', 'md');

  if (typeof window !== 'undefined' && window.electronAPI?.exportMarkdown) {
    const res = await window.electronAPI.exportMarkdown({ markdown: md, defaultName: safeName });
    return { ...res, markdown: md };
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, safeName);
  return { success: true, markdown: md };
}
