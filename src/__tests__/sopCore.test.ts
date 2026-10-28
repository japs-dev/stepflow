import { describe, it, expect } from 'vitest';
import {
  isDefaultStepTitle,
  updateStepOrderAndTitle,
  normalizeProjectSteps,
  deduplicateProjects,
  calculateHistoryChangeSummary,
} from '../store/useSopStore';
import { stripMarkdown } from '../utils/markdownHelper';
import { prepareExportProject } from '../utils/exporters/imageHelper';
import { generateMarkdownString } from '../utils/exporters/markdownExporter';
import type { SopProject, SopStep } from '../types/sop';

describe('StepFlow Core Utilities & Invariants', () => {
  describe('isDefaultStepTitle', () => {
    it('identifies default generated titles correctly', () => {
      expect(isDefaultStepTitle('Step 1: Action')).toBe(true);
      expect(isDefaultStepTitle('Step 2: Action')).toBe(true);
      expect(isDefaultStepTitle('Step 5: Important Notes')).toBe(true);
      expect(isDefaultStepTitle('Step 10')).toBe(true);
      expect(isDefaultStepTitle('Step 3 Captured')).toBe(true);
      expect(isDefaultStepTitle('')).toBe(true);
      expect(isDefaultStepTitle(null)).toBe(true);
      expect(isDefaultStepTitle(undefined)).toBe(true);
    });

    it('preserves custom edited user titles', () => {
      expect(isDefaultStepTitle('Navigate to Billing Settings')).toBe(false);
      expect(isDefaultStepTitle('Click the Generate Invoice button')).toBe(false);
      expect(isDefaultStepTitle('Step Overview & Analysis')).toBe(false);
    });
  });

  describe('updateStepOrderAndTitle', () => {
    it('updates default titles to reflect new order numbers', () => {
      const step: SopStep = {
        id: 'step-1',
        order: 1,
        type: 'screenshot',
        title: 'Step 1: Action',
        description: 'First action',
      };

      const reordered = updateStepOrderAndTitle(step, 4);
      expect(reordered.order).toBe(4);
      expect(reordered.title).toBe('Step 4: Action');
    });

    it('leaves custom user titles untouched when reordering', () => {
      const step: SopStep = {
        id: 'step-2',
        order: 2,
        type: 'screenshot',
        title: 'Confirm Identity via SSO',
        description: 'Custom instructions',
      };

      const reordered = updateStepOrderAndTitle(step, 5);
      expect(reordered.order).toBe(5);
      expect(reordered.title).toBe('Confirm Identity via SSO');
    });
  });

  describe('normalizeProjectSteps', () => {
    it('ensures steps are sequentially indexed from 1..N and normalizes image paths', () => {
      const mockProject: SopProject = {
        id: 'proj-test',
        name: 'Test Project',
        version: '1.0.0',
        author: 'Tester',
        tags: [],
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        theme: {
          primaryColor: '#000',
          accentColor: '#fff',
          fontFamily: 'sans-serif',
          beautifySettings: {
            enabled: true,
            padding: 16,
            backgroundType: 'solid',
            backgroundColor: '#000',
            borderRadius: 8,
            shadowBlur: 10,
          },
        },
        steps: [
          {
            id: 's-b',
            order: 99,
            type: 'screenshot',
            title: 'Step 99: Action',
            description: '',
            image: {
              originalImagePath: '/Users/test/image.png',
              dimensions: { width: 1280, height: 720 },
              annotations: [],
            },
          },
          {
            id: 's-a',
            order: 42,
            type: 'text_only',
            title: 'Custom User Header',
            description: 'Note',
          },
        ],
      };

      const normalized = normalizeProjectSteps(mockProject);
      expect(normalized.steps[0].order).toBe(1);
      expect(normalized.steps[0].title).toBe('Step 1: Action');
      expect(normalized.steps[0].image?.originalImagePath).toContain('stepflow-asset://local/');

      expect(normalized.steps[1].order).toBe(2);
      expect(normalized.steps[1].title).toBe('Custom User Header');
    });
  });

  describe('deduplicateProjects', () => {
    it('deduplicates projects by ID keeping the most recently updated entry', () => {
      const older: SopProject = {
        id: 'proj-1',
        name: 'Old Version',
        version: '1.0.0',
        author: 'Author',
        tags: [],
        status: 'draft',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        theme: {} as any,
        steps: [],
      };

      const newer: SopProject = {
        id: 'proj-1',
        name: 'New Version',
        version: '1.0.1',
        author: 'Author',
        tags: [],
        status: 'published',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T12:00:00Z',
        theme: {} as any,
        steps: [],
      };

      const another: SopProject = {
        id: 'proj-2',
        name: 'Another Project',
        version: '1.0.0',
        author: 'Author',
        tags: [],
        status: 'draft',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        theme: {} as any,
        steps: [],
      };

      const deduped = deduplicateProjects([older, another, newer]);
      expect(deduped.length).toBe(2);
      const proj1 = deduped.find((p) => p.id === 'proj-1');
      expect(proj1?.name).toBe('New Version');
    });
  });

  describe('calculateHistoryChangeSummary', () => {
    it('reports added, removed, and updated step counts correctly', () => {
      const previous: SopStep[] = [
        {
          id: 'step-1',
          order: 1,
          type: 'text_only',
          title: 'Initial step',
          description: 'A'
        },
        {
          id: 'step-2',
          order: 2,
          type: 'text_only',
          title: 'Removed later',
          description: 'B'
        }
      ];

      const next: SopStep[] = [
        {
          id: 'step-1',
          order: 1,
          type: 'text_only',
          title: 'Initial step',
          description: 'A updated'
        },
        {
          id: 'step-3',
          order: 2,
          type: 'text_only',
          title: 'New step',
          description: 'C'
        }
      ];

      const summary = calculateHistoryChangeSummary(previous, next);
      expect(summary.added).toBe(1);
      expect(summary.removed).toBe(1);
      expect(summary.updated).toBe(1);
    });
  });

  describe('stripMarkdown', () => {
    it('removes markdown formatting for plain-text representations', () => {
      const raw = '### Heading\n\nThis is **bold** and *italic* with `inline code` and [a link](https://stepflow.app).';
      const stripped = stripMarkdown(raw);
      expect(stripped).toBe('Heading This is bold and italic with inline code and a link.');
    });

    it('preserves line breaks when preserveNewlines option is specified', () => {
      const raw = '- Item 1\n- Item 2\n> Important quote';
      const stripped = stripMarkdown(raw, { preserveNewlines: true });
      expect(stripped).toContain('• Item 1');
      expect(stripped).toContain('• Item 2');
      expect(stripped).toContain('Important quote');
    });
  });

  describe('prepareExportProject Resilience (P0 Fix Verification)', () => {
    it('never emits undefined steps even if image processing fails or is unavailable in Node', async () => {
      const mockProject: SopProject = {
        id: 'export-test',
        name: 'Export Test',
        version: '1.0.0',
        author: 'Author',
        tags: [],
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        theme: {} as any,
        steps: [
          {
            id: 's-1',
            order: 1,
            type: 'screenshot',
            title: 'Screenshot Step',
            description: 'Visual step description',
            image: {
              originalImagePath: 'stepflow-asset://local/non_existent.png',
              dimensions: { width: 1280, height: 720 },
              annotations: [],
            },
          },
          {
            id: 's-2',
            order: 2,
            type: 'text_only',
            title: 'Text Step',
            description: 'Check step',
          },
        ],
      };

      const prepared = await prepareExportProject(mockProject);
      expect(prepared.steps.length).toBe(2);
      expect(prepared.steps[0]).toBeDefined();
      expect(prepared.steps[0].id).toBe('s-1');
      expect(prepared.steps[0].order).toBe(1);
      expect(prepared.steps[1]).toBeDefined();
      expect(prepared.steps[1].id).toBe('s-2');
      expect(prepared.steps[1].order).toBe(2);
      // Ensure no undefined entries in array
      expect(prepared.steps.every(Boolean)).toBe(true);
    });
  });

  describe('Markdown Exporter', () => {
    it('generates clean markdown with headers, metadata, callouts, and substeps', () => {
      const project: SopProject = {
        id: 'sop-md',
        name: 'Deployment Standard Operating Procedure',
        description: 'Guides staging deployment.',
        version: '2.1.0',
        author: 'Lead DevOps',
        department: 'Infrastructure',
        tags: ['devops', 'release'],
        status: 'published',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        theme: {} as any,
        steps: [
          {
            id: 'step-1',
            order: 1,
            type: 'text_only',
            title: 'Verify Environment Variables',
            description: 'Ensure all secrets are present in Vault.',
            callout: {
              type: 'warning',
              text: 'Never commit production tokens to git.',
            },
            subSteps: [
              { badgeNumber: 1, title: 'Check DATABASE_URL' },
              { badgeNumber: 2, title: 'Verify KMS Key', note: 'Must match region' },
            ],
          },
        ],
      };

      const md = generateMarkdownString(project);
      expect(md).toContain('# Deployment Standard Operating Procedure');
      expect(md).toContain('> Guides staging deployment.');
      expect(md).toContain('**Version**: 2.1.0');
      expect(md).toContain('**Author**: Lead DevOps');
      expect(md).toContain('**Department**: Infrastructure');
      expect(md).toContain('### Step 1: Verify Environment Variables');
      expect(md).toContain('> [!WARNING]');
      expect(md).toContain('**WARNING**: Never commit production tokens to git.');
      expect(md).toContain('- (1) **Check DATABASE_URL**');
      expect(md).toContain('- (2) **Verify KMS Key**: Must match region');
    });

    it('omits changelog section when includeChangelog option is disabled', () => {
      const project: SopProject = {
        id: 'sop-md-no-log',
        name: 'No Changelog SOP',
        version: '1.0.0',
        author: 'Author',
        tags: [],
        status: 'draft',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        theme: {} as any,
        steps: [],
      };

      const md = generateMarkdownString(project, { includeChangelog: false });
      expect(md).not.toContain('## Changelog');
      expect(md).toContain('## Procedure Steps');
    });
  });
});
