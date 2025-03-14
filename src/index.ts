#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';

interface MemoryBankFile {
  path: string;
  content: string;
}

interface ProjectInfo {
  name: string;
  version: string;
  description: string;
  license: string;
  dependencies: string[];
  devDependencies: string[];
}

interface Decision {
  title: string;
  description: string;
  rationale: string;
  alternatives?: string[];
  date?: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  impact?: string;
  relatedDecisions?: string[];
}

interface TechStack {
  runtime: string;
  frameworks: string[];
  languages: Set<string>;
  configs: string[];
}

interface SessionState {
  questionCount: number;
  lastPrompted: string;
  currentPhase: string;
  taskUpdates: {
    completed: Set<string>;
    inProgress: Set<string>;
    blocked: Set<string>;
  };
}

class MemoryBankServer {
  private sessionState: SessionState;
  private server: Server;
  private memoryBankPath: string;

  constructor() {
    this.sessionState = {
      questionCount: 0,
      lastPrompted: new Date().toISOString().split('T')[0],
      currentPhase: 'Development',
      taskUpdates: {
        completed: new Set<string>(),
        inProgress: new Set<string>(),
        blocked: new Set<string>()
      }
    };

    this.server = new Server(
      {
        name: 'memory-bank-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.memoryBankPath = 'memory-bank';
    this.setupToolHandlers();
    this.setupResourceHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'initialize_memory_bank',
          description: 'Initialize Memory Bank structure for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to project root directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'update_context',
          description: 'Update active context with current session information',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to project root directory',
              },
              content: {
                type: 'object',
                description: 'Current session context to update',
                properties: {
                  currentSession: {
                    type: 'object',
                    properties: {
                      date: { type: 'string' },
                      mode: { type: 'string' },
                      task: { type: 'string' },
                    },
                    required: ['date', 'mode', 'task'],
                  },
                },
                required: ['currentSession'],
              },
            },
            required: ['projectPath', 'content'],
          },
        },
        {
          name: 'record_decision',
          description: 'Add a new technical decision with rationale and metadata',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to project root directory',
              },
              decision: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Title of the decision' },
                  description: { type: 'string', description: 'What was decided' },
                  rationale: { type: 'string', description: 'Why this decision was made' },
                  status: { 
                    type: 'string',
                    description: 'Current status of the decision',
                    enum: ['proposed', 'accepted', 'rejected', 'superseded'],
                    default: 'accepted'
                  },
                  impact: { 
                    type: 'string',
                    description: 'Areas of the project affected by this decision'
                  },
                  alternatives: { 
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Alternative options that were considered'
                  },
                  relatedDecisions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Titles of related decisions'
                  },
                  date: {
                    type: 'string',
                    description: 'Optional decision date (defaults to current date)',
                    pattern: '^\\d{4}-\\d{2}-\\d{2}$'
                  }
                },
                required: ['title', 'description', 'rationale', 'status'],
              },
            },
            required: ['projectPath', 'decision'],
          },
        },
        {
          name: 'track_progress',
          description: 'Update project progress and milestones',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to project root directory',
              },
              progress: {
                type: 'object',
                properties: {
                  completed: { type: 'array', items: { type: 'string' } },
                  inProgress: { type: 'array', items: { type: 'string' } },
                  blocked: { type: 'array', items: { type: 'string' } },
                },
                required: ['completed', 'inProgress'],
              },
            },
            required: ['projectPath', 'progress'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'initialize_memory_bank':
            return await this.handleInitializeMemoryBank(request.params.arguments);
          case 'update_context':
            return await this.handleUpdateContext(request.params.arguments);
          case 'record_decision':
            return await this.handleRecordDecision(request.params.arguments);
          case 'track_progress':
            return await this.handleTrackProgress(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: unknown) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'memory://project/context',
          name: 'Project Context',
          description: 'Project overview, technical stack, and guidelines',
          mimeType: 'text/markdown',
        },
        {
          uri: 'memory://active/context',
          name: 'Active Context',
          description: 'Current session state and tasks',
          mimeType: 'text/markdown',
        },
        {
          uri: 'memory://progress',
          name: 'Progress Log',
          description: 'Project milestones and task tracking',
          mimeType: 'text/markdown',
        },
        {
          uri: 'memory://decisions',
          name: 'Decision Log',
          description: 'Technical decisions and rationale',
          mimeType: 'text/markdown',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const projectPath = process.env.PROJECT_PATH;
      if (!projectPath) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'PROJECT_PATH environment variable not set'
        );
      }

      try {
        const content = await this.readMemoryBankFile(
          projectPath,
          this.getFileNameFromUri(request.params.uri)
        );

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      } catch (error: unknown) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async getProjectInfo(projectPath: string): Promise<ProjectInfo> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      return {
        name: packageJson.name || 'Unknown',
        version: packageJson.version || '0.1.0',
        description: packageJson.description || 'No description provided',
        license: packageJson.license || 'Not specified',
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {})
      };
    } catch (error) {
      return {
        name: 'Unknown',
        version: '0.1.0',
        description: 'No description provided',
        license: 'Not specified',
        dependencies: [],
        devDependencies: []
      };
    }
  }

  private async detectTechStack(projectPath: string): Promise<TechStack> {
    const stack: TechStack = {
      runtime: 'Node.js',
      frameworks: [],
      languages: new Set<string>(),
      configs: []
    };

    try {
      const files = await fs.readdir(projectPath, { recursive: true });
      
      // Detect languages and configs
      files.forEach((file: string) => {
        const ext = path.extname(file).toLowerCase();
        if (ext) stack.languages.add(ext.substring(1));
        
        const basename = path.basename(file);
        if (basename.includes('config') || basename.startsWith('.')) {
          stack.configs.push(basename);
        }
      });

      // Detect frameworks from package.json
      const packageJson = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
      const { dependencies = {}, devDependencies = {} } = JSON.parse(packageJson);
      
      const allDeps = { ...dependencies, ...devDependencies };
      if (allDeps['react']) stack.frameworks.push('React');
      if (allDeps['next']) stack.frameworks.push('Next.js');
      if (allDeps['express']) stack.frameworks.push('Express');
      if (allDeps['vue']) stack.frameworks.push('Vue.js');
      if (allDeps['angular']) stack.frameworks.push('Angular');

      return stack;
    } catch (error) {
      return stack;
    }
  }

  private generateInitialDecisions(info: ProjectInfo, stack: TechStack): Decision[] {
    const decisions: Decision[] = [
      {
        title: 'Initial Project Structure',
        description: `Initialized ${info.name} with a modular architecture using ${stack.runtime}`,
        rationale: 'Established foundation for scalable and maintainable development',
        status: 'accepted',
        impact: 'Project-wide',
        date: new Date().toISOString().split('T')[0]
      }
    ];

    // Add framework-specific decisions
    if (stack.frameworks.length > 0) {
      decisions.push({
        title: 'Framework Selection',
        description: `Selected ${stack.frameworks.join(', ')} as primary framework(s)`,
        rationale: 'Chosen based on project requirements and team expertise',
        status: 'accepted',
        impact: 'Technical architecture',
        date: new Date().toISOString().split('T')[0]
      });
    }

    return decisions;
  }

  private formatDecisionLog(decisions: Decision[]): string {
    return `# Decision Log

## Technical Decisions

${decisions.map(d => `### ${d.title} (${d.date || 'No date'})
${d.description}

**Status:** ${d.status}
${d.impact ? `**Impact:** ${d.impact}\n` : ''}
Rationale:
${d.rationale}

${d.alternatives ? `Alternatives Considered:\n${d.alternatives.map(alt => `- ${alt}`).join('\n')}\n` : ''}
${d.relatedDecisions ? `Related Decisions:\n${d.relatedDecisions.map(rd => `- ${rd}`).join('\n')}` : ''}`).join('\n\n')}

## Pending Decisions
`;
  }

  private formatProjectContext(info: ProjectInfo, stack: TechStack): string {
    return `# Project Context

## Overview
${info.name} - ${info.description}
- Version: ${info.version}
- License: ${info.license}

## Technical Stack
- Runtime: ${stack.runtime}
${stack.frameworks.length ? `- Frameworks:\n${stack.frameworks.map(f => `  - ${f}`).join('\n')}` : ''}
- Languages: ${Array.from(stack.languages).join(', ')}
- Key Dependencies:
${info.dependencies.map(d => `  - ${d}`).join('\n')}

## Development Dependencies
${info.devDependencies.map(d => `- ${d}`).join('\n')}

## Configuration Files
${stack.configs.map(c => `- ${c}`).join('\n')}

## Architecture Principles
- Project follows modular architecture
- Separation of concerns
- DRY (Don't Repeat Yourself)
- SOLID principles

## Development Setup
### Prerequisites
- Node.js
- npm or yarn
- Required global dependencies

### Build Process
1. Install dependencies
2. Configure environment
3. Build project
4. Run tests

### Development Workflow
1. Branch from main
2. Implement changes
3. Write tests
4. Submit PR
`;
  }

  private async handleInitializeMemoryBank(args: any) {
    const projectPath = args.projectPath;
    if (!projectPath) {
      throw new McpError(ErrorCode.InvalidParams, 'Project path is required');
    }

    try {
      const memoryBankPath = path.join(projectPath, this.memoryBankPath);
      await fs.mkdir(memoryBankPath, { recursive: true });

      // Gather project information
      const projectInfo = await this.getProjectInfo(projectPath);
      const techStack = await this.detectTechStack(projectPath);
      const projectContext = this.formatProjectContext(projectInfo, techStack);

      // Generate initial decisions
      const initialDecisions = this.generateInitialDecisions(projectInfo, techStack);
      
      const currentDate = new Date().toISOString().split('T')[0];
      const currentTime = new Date().toLocaleTimeString();
      
      const files: MemoryBankFile[] = [
        {
          path: 'projectContext.md',
          content: projectContext,
        },
        {
          path: 'activeContext.md',
          content: `# Active Context

## Current Session
Started: ${currentDate} ${currentTime}
Mode: Development
Current Task: Initial Setup

## Tasks
### In Progress
- [ ] Project initialization
- [ ] Environment setup

## Open Questions
- What are the primary project goals?
- What are the key technical requirements?

## Recent Updates
- ${currentDate}: Project initialized`,
        },
        {
          path: 'progress.md',
          content: `# Progress Log

## Current Phase
Initialization

## Completed Tasks
- Repository setup (${currentDate})
- Basic project structure (${currentDate})

## In Progress
- Development environment configuration
- Initial documentation

## Upcoming
- Code implementation
- Testing setup

## Blockers
[None currently identified]`,
        },
        {
          path: 'decisionLog.md',
          content: this.formatDecisionLog([
            ...initialDecisions,
            {
              title: 'Development Workflow',
              description: 'Established initial development workflow and practices',
              rationale: 'Ensure consistent development process and code quality',
              status: 'accepted',
              impact: 'Development process',
              date: currentDate,
              alternatives: [
                'Ad-hoc development process',
                'Waterfall methodology'
              ]
            },
            {
              title: 'Documentation Strategy',
              description: 'Implemented automated documentation with memory bank',
              rationale: 'Maintain up-to-date project context and decision history',
              status: 'accepted',
              impact: 'Project documentation',
              date: currentDate
            }
          ]),
        },
      ];

      for (const file of files) {
        await fs.writeFile(
          path.join(memoryBankPath, file.path),
          file.content,
          'utf8'
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Memory Bank initialized successfully',
          },
        ],
      };
    } catch (error: unknown) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to initialize Memory Bank: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleUpdateContext(args: any) {
    const { projectPath, content } = args;
    if (!projectPath || !content) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project path and content are required'
      );
    }

    try {
      const filePath = path.join(projectPath, this.memoryBankPath, 'activeContext.md');
      const currentContent = await fs.readFile(filePath, 'utf8');
      const updatedContent = this.mergeContext(currentContent, content);
      await fs.writeFile(filePath, updatedContent, 'utf8');

      return {
        content: [
          {
            type: 'text',
            text: 'Active context updated successfully',
          },
        ],
      };
    } catch (error: unknown) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update context: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleRecordDecision(args: any) {
    const { projectPath, decision } = args;
    if (!projectPath || !decision) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project path and decision are required'
      );
    }

    try {
      const filePath = path.join(projectPath, this.memoryBankPath, 'decisionLog.md');
      const currentContent = await fs.readFile(filePath, 'utf8');
      const updatedContent = this.addDecision(currentContent, decision);
      await fs.writeFile(filePath, updatedContent, 'utf8');

      return {
        content: [
          {
            type: 'text',
            text: 'Decision recorded successfully',
          },
        ],
      };
    } catch (error: unknown) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to record decision: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleTrackProgress(args: any) {
    const { projectPath, progress } = args;
    if (!projectPath || !progress) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Project path and progress are required'
      );
    }

    try {
      const filePath = path.join(projectPath, this.memoryBankPath, 'progress.md');
      const currentContent = await fs.readFile(filePath, 'utf8');
      const updatedContent = this.updateProgress(currentContent, progress);
      await fs.writeFile(filePath, updatedContent, 'utf8');

      return {
        content: [
          {
            type: 'text',
            text: 'Progress updated successfully',
          },
        ],
      };
    } catch (error: unknown) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update progress: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async readMemoryBankFile(projectPath: string, fileName: string): Promise<string> {
    const filePath = path.join(projectPath, this.memoryBankPath, fileName);
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error: unknown) {
      throw new Error(`Failed to read file ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getFileNameFromUri(uri: string): string {
    const mapping: { [key: string]: string } = {
      'memory://project/context': 'projectContext.md',
      'memory://active/context': 'activeContext.md',
      'memory://progress': 'progress.md',
      'memory://decisions': 'decisionLog.md',
    };

    const fileName = mapping[uri];
    if (!fileName) {
      throw new Error(`Invalid URI: ${uri}`);
    }

    return fileName;
  }

  private mergeContext(current: string, update: any): string {
    const date = new Date().toISOString().split('T')[0];
    return `${current}\n\n## Session Update (${date})\n- Mode: ${update.currentSession.mode}\n- Task: ${update.currentSession.task}`;
  }

  private addDecision(current: string, decision: Decision): string {
    const date = decision.date || new Date().toISOString().split('T')[0];
    const alternatives = decision.alternatives
      ? `\n\nAlternatives Considered:\n${decision.alternatives.map((alt: string) => `- ${alt}`).join('\n')}`
      : '';
    const impact = decision.impact ? `\n**Impact:** ${decision.impact}` : '';
    const related = decision.relatedDecisions
      ? `\n\nRelated Decisions:\n${decision.relatedDecisions.map((rd: string) => `- ${rd}`).join('\n')}`
      : '';

    // Find the appropriate section based on status
    const statusSection = decision.status === 'proposed' ? '## Pending Decisions' : '## Technical Decisions';
    const sections = current.split('\n\n## ');
    const targetSectionIndex = sections.findIndex(s => s.startsWith('Technical Decisions') || s.startsWith('Pending Decisions'));
    
    if (targetSectionIndex === -1) return current; // Fallback if sections not found

    const newDecision = `### ${decision.title} (${date})
${decision.description}

**Status:** ${decision.status}${impact}

Rationale:
${decision.rationale}${alternatives}${related}`;

    sections[targetSectionIndex] = sections[targetSectionIndex].trim() + '\n\n' + newDecision;
    return sections.join('\n\n## ');
  }

  private async checkAndPromptProgress(): Promise<void> {
    if (this.sessionState.questionCount >= 10) {
      this.sessionState.questionCount = 0; // Reset counter
      this.sessionState.lastPrompted = new Date().toISOString().split('T')[0];
      
      // Auto-save progress
      await this.saveProgressUpdate();
    }
  }

  private async saveProgressUpdate(): Promise<void> {
    const projectPath = process.env.PROJECT_PATH;
    if (!projectPath) return;

    const progress = {
      completed: Array.from(this.sessionState.taskUpdates.completed),
      inProgress: Array.from(this.sessionState.taskUpdates.inProgress),
      blocked: Array.from(this.sessionState.taskUpdates.blocked)
    };

    await this.handleTrackProgress({
      projectPath,
      progress
    });

    // Clear the sets after saving
    this.sessionState.taskUpdates.completed.clear();
    this.sessionState.taskUpdates.inProgress.clear();
    this.sessionState.taskUpdates.blocked.clear();
  }

  private updateProgress(current: string, progress: any): string {
    const date = new Date().toISOString().split('T')[0];
    
    // Add tasks to session state
    progress.completed?.forEach((task: string) => this.sessionState.taskUpdates.completed.add(task));
    progress.inProgress?.forEach((task: string) => this.sessionState.taskUpdates.inProgress.add(task));
    progress.blocked?.forEach((task: string) => this.sessionState.taskUpdates.blocked.add(task));

    const completed = progress.completed.map((task: string) => `- ✓ ${task}`).join('\n');
    const inProgress = progress.inProgress.map((task: string) => `- → ${task}`).join('\n');
    const blocked = progress.blocked
      ? `\n\nBlocked:\n${progress.blocked.map((task: string) => `- ⚠ ${task}`).join('\n')}`
      : '';

    this.sessionState.questionCount++; // Increment question counter
    this.checkAndPromptProgress(); // Check if we should prompt for progress save

    return `${current}\n\n## Update (${date})\nPhase: ${this.sessionState.currentPhase}\nQuestions Processed: ${this.sessionState.questionCount}\n\nCompleted:\n${completed}\n\nIn Progress:\n${inProgress}${blocked}`;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Initialize with current phase
    this.sessionState.currentPhase = 'Development';
    console.error('Memory Bank MCP server running on stdio');
  }
}

const server = new MemoryBankServer();
server.run().catch(console.error);
