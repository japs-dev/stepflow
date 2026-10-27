#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SopProject, SopStep, CalloutType } from '../src/types/sop';

// ---------------------------------------------------------
// Storage & Path Resolution
// ---------------------------------------------------------
function getProjectsDir(): string {
  // 1. Explicit CLI argument: --projects-dir <path>
  const argIdx = process.argv.indexOf('--projects-dir');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return path.resolve(process.argv[argIdx + 1]);
  }
  // 2. Environment variable
  if (process.env.STEPFLOW_PROJECTS_DIR) {
    return path.resolve(process.env.STEPFLOW_PROJECTS_DIR);
  }
  // 3. Check stepflow_config.json if customStorageDir was configured in Electron
  try {
    let userDataDir = '';
    if (process.platform === 'darwin') {
      userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'stepflow');
    } else if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      userDataDir = path.join(appData, 'stepflow');
    } else {
      userDataDir = path.join(os.homedir(), '.config', 'stepflow');
    }
    const configPath = path.join(userDataDir, 'stepflow_config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed.customStorageDir && fs.existsSync(parsed.customStorageDir)) {
        return path.join(parsed.customStorageDir, 'projects');
      }
    }
  } catch {}
  // 4. Platform default for Electron app named "stepflow"
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'stepflow', 'projects');
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'stepflow', 'projects');
  } else {
    return path.join(os.homedir(), '.config', 'stepflow', 'projects');
  }
}

const PROJECTS_DIR = getProjectsDir();

async function ensureProjectsDir(): Promise<void> {
  await fs.promises.mkdir(PROJECTS_DIR, { recursive: true });
}

function getProjectFilePath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(PROJECTS_DIR, `proj_${safeId}.json`);
}

async function loadAllProjects(): Promise<SopProject[]> {
  await ensureProjectsDir();
  const files = await fs.promises.readdir(PROJECTS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.includes('.tmp'));
  const projectMap = new Map<string, SopProject>();

  for (const file of jsonFiles) {
    try {
      const content = await fs.promises.readFile(path.join(PROJECTS_DIR, file), 'utf-8');
      const parsed = JSON.parse(content) as SopProject;
      if (parsed && parsed.id) {
        const existing = projectMap.get(parsed.id);
        if (!existing) {
          projectMap.set(parsed.id, parsed);
        } else {
          const timeA = new Date(parsed.updatedAt || parsed.createdAt || 0).getTime();
          const timeB = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          if (timeA > timeB) {
            projectMap.set(parsed.id, parsed);
          }
        }
      }
    } catch {
      // Ignore unparseable or corrupted files
    }
  }

  const projects = Array.from(projectMap.values());
  projects.sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  return projects;
}

async function loadProjectById(idOrName: string): Promise<SopProject | null> {
  await ensureProjectsDir();
  const projects = await loadAllProjects();
  const trimmed = idOrName.trim().toLowerCase();

  // 1. Exact match by ID
  const byId = projects.find((p) => p.id === idOrName);
  if (byId) return byId;

  // 2. Exact match by name (case-insensitive)
  const byName = projects.find((p) => p.name.toLowerCase() === trimmed);
  if (byName) return byName;

  // 3. Partial match by ID or name
  const partial = projects.find(
    (p) => p.id.toLowerCase().includes(trimmed) || p.name.toLowerCase().includes(trimmed)
  );
  return partial || null;
}

async function saveProject(project: SopProject): Promise<void> {
  await ensureProjectsDir();
  const filePath = getProjectFilePath(project.id);
  const tempPath = `${filePath}.${Date.now()}.tmp`;

  const now = new Date().toISOString();
  if (!project.createdAt) {
    project.createdAt = now;
  }
  project.updatedAt = now;

  await fs.promises.writeFile(tempPath, JSON.stringify(project, null, 2), 'utf-8');
  await fs.promises.rename(tempPath, filePath);
}

// ---------------------------------------------------------
// Markdown Formatter for SOPs
// ---------------------------------------------------------
function formatProjectMarkdown(project: SopProject): string {
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
  lines.push(`- **Last Updated**: ${project.updatedAt || project.createdAt}`);
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
          }px, ${totalAnnotations} visual annotations, ${badgeCount} badge numbers)*`
        );
      } else {
        lines.push('*📸 Visual Screenshot: [Pending - Ready for screenshot capture in StepFlow Studio]*');
      }

      lines.push('\n---\n');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------
// Initialize MCP Server
// ---------------------------------------------------------
const server = new Server(
  {
    name: 'stepflow-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ---------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_sops',
        description:
          'List all Standard Operating Procedures (SOPs) stored locally in StepFlow with summary metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Optional query to filter SOPs by title, tag, or description',
            },
            status: {
              type: 'string',
              enum: ['draft', 'in_review', 'published'],
              description: 'Filter SOPs by publication status',
            },
            tag: {
              type: 'string',
              description: 'Filter SOPs that contain this tag',
            },
          },
        },
      },
      {
        name: 'get_sop',
        description:
          'Retrieve the full documentation of an SOP by its ID or title. Returns human-readable markdown by default, or structured JSON.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The SOP project ID or exact title',
            },
            format: {
              type: 'string',
              enum: ['markdown', 'json'],
              description: 'Response format: "markdown" for human-readable doc (default), or "json" for raw schema',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'search_sops',
        description:
          'Full-text search across all SOP titles, step instructions, notes, callouts, and tags.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Keywords to search for',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_sop_wireframe',
        description:
          'Scaffold a new multi-step SOP in StepFlow with titles, structured instructions, and callout warnings. Steps are created with screenshot placeholders ready for capture in StepFlow Studio.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Title of the Standard Operating Procedure',
            },
            description: {
              type: 'string',
              description: 'Overview and objective of the procedure',
            },
            author: {
              type: 'string',
              description: 'Author or owning team (e.g. "DevOps Team", "Jane Doe")',
            },
            version: {
              type: 'string',
              description: 'Semantic version string, defaults to "1.0.0"',
            },
            department: {
              type: 'string',
              description: 'Department or business unit (e.g. "Engineering", "Finance")',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Categorization tags (e.g. ["Onboarding", "AWS", "Security"])',
            },
            status: {
              type: 'string',
              enum: ['draft', 'in_review', 'published'],
              description: 'Initial status (default: "draft")',
            },
            steps: {
              type: 'array',
              description: 'Sequential steps for the procedure',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Title of the step',
                  },
                  description: {
                    type: 'string',
                    description: 'Detailed instructions and context for this step',
                  },
                  type: {
                    type: 'string',
                    enum: ['screenshot', 'text_only'],
                    description: 'Step type. Use "screenshot" for visual steps (default), or "text_only"',
                  },
                  callout: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['info', 'warning', 'tip'],
                        description: 'Callout banner type',
                      },
                      text: {
                        type: 'string',
                        description: 'Callout banner text or warning message',
                      },
                    },
                    required: ['type', 'text'],
                  },
                  subSteps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        badgeNumber: { type: 'number' },
                        title: { type: 'string' },
                        note: { type: 'string' },
                      },
                      required: ['badgeNumber', 'title'],
                    },
                  },
                },
                required: ['title', 'description'],
              },
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'update_sop_metadata',
        description: 'Update metadata (name, description, tags, version, department, status) of an existing SOP.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The SOP ID or exact name',
            },
            name: { type: 'string' },
            description: { type: 'string' },
            author: { type: 'string' },
            version: { type: 'string' },
            department: { type: 'string' },
            status: {
              type: 'string',
              enum: ['draft', 'in_review', 'published'],
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'update_step',
        description:
          'Update the title, instructions, callouts (warning/tip/info), or sub-steps of a specific step in an SOP.',
        inputSchema: {
          type: 'object',
          properties: {
            sopId: {
              type: 'string',
              description: 'SOP ID or title',
            },
            stepNumber: {
              type: 'number',
              description: '1-indexed step order (e.g. 1 for Step 1, 2 for Step 2)',
            },
            stepId: {
              type: 'string',
              description: 'Direct step ID (optional if stepNumber is provided)',
            },
            title: { type: 'string' },
            description: { type: 'string' },
            callout: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['info', 'warning', 'tip'],
                },
                text: { type: 'string' },
              },
              required: ['type', 'text'],
              description: 'Callout banner. Pass null/empty to remove callout.',
            },
            subSteps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  badgeNumber: { type: 'number' },
                  title: { type: 'string' },
                  note: { type: 'string' },
                },
                required: ['badgeNumber', 'title'],
              },
            },
          },
          required: ['sopId'],
        },
      },
      {
        name: 'add_step',
        description: 'Append or insert a new step into an existing SOP.',
        inputSchema: {
          type: 'object',
          properties: {
            sopId: {
              type: 'string',
              description: 'SOP ID or title',
            },
            title: {
              type: 'string',
              description: 'Title of the new step',
            },
            description: {
              type: 'string',
              description: 'Step instructions',
            },
            type: {
              type: 'string',
              enum: ['screenshot', 'text_only'],
              description: 'Step type (default: "screenshot")',
            },
            insertAfterStepNumber: {
              type: 'number',
              description: 'Step number to insert after. If omitted, appends to the end.',
            },
            callout: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['info', 'warning', 'tip'],
                },
                text: { type: 'string' },
              },
              required: ['type', 'text'],
            },
            subSteps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  badgeNumber: { type: 'number' },
                  title: { type: 'string' },
                  note: { type: 'string' },
                },
                required: ['badgeNumber', 'title'],
              },
            },
          },
          required: ['sopId', 'title', 'description'],
        },
      },
      {
        name: 'delete_step',
        description: 'Remove a step from an SOP and renumber remaining steps.',
        inputSchema: {
          type: 'object',
          properties: {
            sopId: {
              type: 'string',
              description: 'SOP ID or title',
            },
            stepNumber: {
              type: 'number',
              description: '1-indexed step number to delete',
            },
            stepId: {
              type: 'string',
              description: 'Direct step ID to delete',
            },
          },
          required: ['sopId'],
        },
      },
      {
        name: 'export_sop_markdown',
        description: 'Export an entire SOP as clean, formatted GitHub Flavored Markdown.',
        inputSchema: {
          type: 'object',
          properties: {
            sopId: {
              type: 'string',
              description: 'SOP ID or title',
            },
          },
          required: ['sopId'],
        },
      },
    ],
  };
});

// ---------------------------------------------------------
// Tool Execution Handlers
// ---------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'list_sops': {
        const allProjects = await loadAllProjects();
        const search = (args.search as string)?.toLowerCase().trim();
        const status = args.status as string;
        const tag = (args.tag as string)?.toLowerCase().trim();

        let filtered = allProjects;
        if (status) {
          filtered = filtered.filter((p) => p.status === status);
        }
        if (tag) {
          filtered = filtered.filter((p) => p.tags?.some((t) => t.toLowerCase() === tag));
        }
        if (search) {
          filtered = filtered.filter(
            (p) =>
              p.name.toLowerCase().includes(search) ||
              p.description?.toLowerCase().includes(search) ||
              p.tags?.some((t) => t.toLowerCase().includes(search)) ||
              p.author?.toLowerCase().includes(search)
          );
        }

        const summary = filtered.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          status: p.status || 'draft',
          version: p.version || '1.0.0',
          author: p.author,
          department: p.department || '',
          tags: p.tags || [],
          stepCount: p.steps.length,
          updatedAt: p.updatedAt,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      case 'get_sop': {
        const id = args.id as string;
        const format = (args.format as string) || 'markdown';
        const project = await loadProjectById(id);

        if (!project) {
          throw new McpError(ErrorCode.InvalidRequest, `SOP with ID or title "${id}" not found.`);
        }

        if (format === 'json') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(project, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: formatProjectMarkdown(project),
            },
          ],
        };
      }

      case 'search_sops': {
        const query = (args.query as string)?.toLowerCase().trim();
        if (!query) {
          throw new McpError(ErrorCode.InvalidParams, 'Search query cannot be empty.');
        }

        const allProjects = await loadAllProjects();
        const results: Array<{
          id: string;
          name: string;
          matches: string[];
          stepCount: number;
        }> = [];

        for (const p of allProjects) {
          const matches: string[] = [];
          if (p.name.toLowerCase().includes(query)) matches.push(`Title matches: "${p.name}"`);
          if (p.description?.toLowerCase().includes(query)) matches.push('Description matches query');
          if (p.tags?.some((t) => t.toLowerCase().includes(query))) matches.push('Tags match query');

          for (const step of p.steps) {
            if (step.title.toLowerCase().includes(query)) {
              matches.push(`Step ${step.order} title: "${step.title}"`);
            }
            if (step.description.toLowerCase().includes(query)) {
              matches.push(`Step ${step.order} description matches`);
            }
            if (step.callout?.text?.toLowerCase().includes(query)) {
              matches.push(`Step ${step.order} callout (${step.callout.type}) matches`);
            }
          }

          if (matches.length > 0) {
            results.push({
              id: p.id,
              name: p.name,
              matches,
              stepCount: p.steps.length,
            });
          }
        }

        return {
          content: [
            {
              type: 'text',
              text:
                results.length === 0
                  ? `No SOPs found matching query "${query}".`
                  : JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'create_sop_wireframe': {
        const name = (args.name as string)?.trim();
        if (!name) {
          throw new McpError(ErrorCode.InvalidParams, 'SOP name is required.');
        }

        const randomSuffix = Math.random().toString(36).substring(2, 7);
        const projectId = `proj-${Date.now()}-${randomSuffix}`;
        const rawSteps = (args.steps as any[]) || [];

        const formattedSteps: SopStep[] = rawSteps.map((s, idx) => ({
          id: `step-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 5)}`,
          order: idx + 1,
          type: (s.type as 'screenshot' | 'text_only') || 'screenshot',
          title: s.title || `Step ${idx + 1}`,
          description: s.description || '',
          callout: s.callout
            ? {
                type: (s.callout.type as CalloutType) || 'info',
                text: s.callout.text || '',
              }
            : undefined,
          subSteps: s.subSteps || undefined,
        }));

        const newProject: SopProject = {
          id: projectId,
          name,
          description: (args.description as string) || '',
          author: (args.author as string) || 'Claude AI Assistant',
          version: (args.version as string) || '1.0.0',
          department: (args.department as string) || undefined,
          tags: (args.tags as string[]) || ['Workflow'],
          status: (args.status as 'draft' | 'in_review' | 'published') || 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          theme: {
            primaryColor: '#18181b',
            accentColor: '#2563eb',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            beautifySettings: {
              enabled: true,
              padding: 24,
              backgroundType: 'gradient',
              backgroundColor: '#f8fafc',
              borderRadius: 8,
              shadowBlur: 20,
            },
          },
          coverPage: {
            enabled: true,
            layout: 'modern',
            title: name,
            subtitle: (args.description as string) || 'Standard Operating Procedure',
            author: (args.author as string) || 'Claude AI Assistant',
            organization: (args.department as string) || 'Internal Ops',
            version: (args.version as string) || '1.0.0',
            date: new Date().toISOString().split('T')[0],
            showDate: true,
            showVersion: true,
            showAuthor: true,
            showOrganization: true,
            showTableOfContents: true,
            backgroundType: 'gradient',
            backgroundColor: '#0f172a',
            backgroundGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            backgroundOverlayOpacity: 0.45,
            textColor: '#ffffff',
          },
          steps: formattedSteps,
        };

        await saveProject(newProject);

        return {
          content: [
            {
              type: 'text',
              text: `✅ SOP Wireframe successfully created in StepFlow!\n\n- **Project Name**: ${newProject.name}\n- **Project ID**: \`${newProject.id}\`\n- **Steps Created**: ${newProject.steps.length}\n- **Status**: ${newProject.status}\n\nAll steps have been initialized with placeholders. Open StepFlow Studio to capture screenshots or customize annotations.`,
            },
          ],
        };
      }

      case 'update_sop_metadata': {
        const id = args.id as string;
        const project = await loadProjectById(id);
        if (!project) {
          throw new McpError(ErrorCode.InvalidRequest, `SOP "${id}" not found.`);
        }

        if (args.name !== undefined) project.name = (args.name as string).trim();
        if (args.description !== undefined) project.description = args.description as string;
        if (args.author !== undefined) project.author = args.author as string;
        if (args.version !== undefined) project.version = args.version as string;
        if (args.department !== undefined) project.department = args.department as string;
        if (args.status !== undefined) project.status = args.status as any;
        if (args.tags !== undefined) project.tags = args.tags as string[];

        await saveProject(project);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Updated metadata for SOP "${project.name}" (\`${project.id}\`).`,
            },
          ],
        };
      }

      case 'update_step': {
        const sopId = args.sopId as string;
        const project = await loadProjectById(sopId);
        if (!project) {
          throw new McpError(ErrorCode.InvalidRequest, `SOP "${sopId}" not found.`);
        }

        let targetStep: SopStep | undefined;
        if (args.stepNumber !== undefined) {
          targetStep = project.steps.find((s) => s.order === Number(args.stepNumber));
        } else if (args.stepId) {
          targetStep = project.steps.find((s) => s.id === args.stepId);
        }

        if (!targetStep) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Step could not be found with stepNumber=${args.stepNumber} or stepId=${args.stepId}. Total steps: ${project.steps.length}`
          );
        }

        if (args.title !== undefined) targetStep.title = args.title as string;
        if (args.description !== undefined) targetStep.description = args.description as string;
        if (args.callout !== undefined) {
          if (args.callout === null) {
            delete targetStep.callout;
          } else {
            const calloutObj = args.callout as any;
            targetStep.callout = {
              type: (calloutObj.type as CalloutType) || 'info',
              text: calloutObj.text || '',
            };
          }
        }
        if (args.subSteps !== undefined) {
          targetStep.subSteps = args.subSteps as any[];
        }

        await saveProject(project);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Step ${targetStep.order} ("${targetStep.title}") updated successfully in SOP "${project.name}".`,
            },
          ],
        };
      }

      case 'add_step': {
        const sopId = args.sopId as string;
        const project = await loadProjectById(sopId);
        if (!project) {
          throw new McpError(ErrorCode.InvalidRequest, `SOP "${sopId}" not found.`);
        }

        const titleInput = typeof args.title === 'string' ? args.title.trim() : '';
        const stepType = (args.type as 'screenshot' | 'text_only') || 'screenshot';
        const fallbackTitle =
          stepType === 'text_only'
            ? `Step ${project.steps.length + 1}: Important Notes`
            : `Step ${project.steps.length + 1}: Action`;

        const newStep: SopStep = {
          id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          order: project.steps.length + 1,
          type: stepType,
          title: titleInput || fallbackTitle,
          description: typeof args.description === 'string' ? args.description : '',
          callout: args.callout
            ? {
                type: ((args.callout as any).type as CalloutType) || 'info',
                text: (args.callout as any).text || '',
              }
            : undefined,
          subSteps: args.subSteps as any[],
        };

        const insertAfter = args.insertAfterStepNumber ? Number(args.insertAfterStepNumber) : null;
        if (insertAfter !== null && insertAfter >= 0 && insertAfter <= project.steps.length) {
          project.steps.splice(insertAfter, 0, newStep);
        } else {
          project.steps.push(newStep);
        }

        // Recompute orders
        project.steps.forEach((s, idx) => {
          s.order = idx + 1;
        });

        await saveProject(project);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Added Step ${newStep.order} ("${newStep.title}") to SOP "${project.name}". Total steps now: ${project.steps.length}.`,
            },
          ],
        };
      }

      case 'delete_step': {
        const sopId = args.sopId as string;
        const project = await loadProjectById(sopId);
        if (!project) {
          throw new McpError(ErrorCode.InvalidRequest, `SOP "${sopId}" not found.`);
        }

        const initialCount = project.steps.length;
        if (args.stepNumber !== undefined) {
          const num = Number(args.stepNumber);
          project.steps = project.steps.filter((s) => s.order !== num);
        } else if (args.stepId) {
          project.steps = project.steps.filter((s) => s.id !== args.stepId);
        } else {
          throw new McpError(ErrorCode.InvalidParams, 'Specify stepNumber or stepId to delete.');
        }

        if (project.steps.length === initialCount) {
          throw new McpError(ErrorCode.InvalidParams, 'No step matched the deletion criteria.');
        }

        // Re-order remaining steps
        project.steps.forEach((s, idx) => {
          s.order = idx + 1;
        });

        await saveProject(project);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Step removed from SOP "${project.name}". Remaining steps: ${project.steps.length}.`,
            },
          ],
        };
      }

      case 'export_sop_markdown': {
        const sopId = args.sopId as string;
        const project = await loadProjectById(sopId);
        if (!project) {
          throw new McpError(ErrorCode.InvalidRequest, `SOP "${sopId}" not found.`);
        }

        const md = formatProjectMarkdown(project);
        return {
          content: [
            {
              type: 'text',
              text: md,
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err: any) {
    if (err instanceof McpError) throw err;
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${err?.message || String(err)}`,
        },
      ],
    };
  }
});

// ---------------------------------------------------------
// Resources Handlers
// ---------------------------------------------------------
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const projects = await loadAllProjects();
  return {
    resources: [
      {
        uri: 'sop://projects',
        name: 'All SOP Projects',
        description: 'Catalog list of all Standard Operating Procedures in StepFlow',
        mimeType: 'application/json',
      },
      ...projects.map((p) => ({
        uri: `sop://projects/${p.id}`,
        name: p.name,
        description: p.description || `SOP with ${p.steps.length} steps`,
        mimeType: 'text/markdown',
      })),
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === 'sop://projects') {
    const projects = await loadAllProjects();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  }

  const prefix = 'sop://projects/';
  if (uri.startsWith(prefix)) {
    const id = uri.slice(prefix.length);
    const project = await loadProjectById(id);
    if (!project) {
      throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: formatProjectMarkdown(project),
        },
      ],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unsupported resource URI: ${uri}`);
});

// ---------------------------------------------------------
// Prompts Handlers
// ---------------------------------------------------------
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'wireframe-sop',
        description:
          'Interactive workflow to interview the user, structure a complete SOP with clear titles and callouts, and call create_sop_wireframe.',
        arguments: [
          {
            name: 'topic',
            description: 'The process or procedure to document',
            required: true,
          },
        ],
      },
      {
        name: 'review-sop',
        description: 'Audit an existing SOP for clarity, completeness, missing edge cases, and callout accuracy.',
        arguments: [
          {
            name: 'sopId',
            description: 'The ID or title of the SOP to review',
            required: true,
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'wireframe-sop') {
    const topic = args.topic || 'New Workflow Procedure';
    return {
      description: `Draft an SOP wireframe for "${topic}"`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please design a complete Standard Operating Procedure (SOP) for "${topic}". Break the workflow down into clear, sequential visual steps. For each step provide:\n- A concise action title\n- Step-by-step description\n- Any relevant callouts (warnings, tips, or notes)\n\nOnce structured, execute the \`create_sop_wireframe\` tool to save this directly into StepFlow so I can capture the screenshots.`,
          },
        },
      ],
    };
  }

  if (name === 'review-sop') {
    const sopId = args.sopId;
    return {
      description: `Review SOP "${sopId}"`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please fetch the SOP "${sopId}" using \`get_sop\`. Review each step for clarity, potential security/operational pitfalls, readability, and missing prerequisite steps. Suggest improvements or offer to update steps using \`update_step\`.`,
          },
        },
      ],
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
});

// ---------------------------------------------------------
// Server Startup
// ---------------------------------------------------------
async function run(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[StepFlow MCP] Server running on stdio (Projects Dir: ${PROJECTS_DIR})`);
}

run().catch((error) => {
  console.error('[StepFlow MCP] Fatal error starting server:', error);
  process.exit(1);
});
