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

class MemoryBankServer {
  private server: Server;
  private memoryBankPath: string;

  constructor() {
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
          description: 'Add a new technical decision with rationale',
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
                  title: { type: 'string' },
                  description: { type: 'string' },
                  rationale: { type: 'string' },
                  alternatives: { type: 'array', items: { type: 'string' } },
                },
                required: ['title', 'description', 'rationale'],
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

  private async handleInitializeMemoryBank(args: any) {
    const projectPath = args.projectPath;
    if (!projectPath) {
      throw new McpError(ErrorCode.InvalidParams, 'Project path is required');
    }

    try {
      const memoryBankPath = path.join(projectPath, this.memoryBankPath);
      await fs.mkdir(memoryBankPath, { recursive: true });

      const files: MemoryBankFile[] = [
        {
          path: 'projectContext.md',
          content: '# Project Context\n\n## Overview\n\n## Technical Stack\n\n## Architecture Principles\n',
        },
        {
          path: 'activeContext.md',
          content: '# Active Context\n\n## Current Session\n\n## Tasks\n\n## Open Questions\n',
        },
        {
          path: 'progress.md',
          content: '# Progress Log\n\n## Current Phase\n\n## Completed Tasks\n\n## In Progress\n',
        },
        {
          path: 'decisionLog.md',
          content: '# Decision Log\n\n## Technical Decisions\n\n## Pending Decisions\n',
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

  private addDecision(current: string, decision: any): string {
    const date = new Date().toISOString().split('T')[0];
    const alternatives = decision.alternatives
      ? `\n\nAlternatives Considered:\n${decision.alternatives.map((alt: string) => `- ${alt}`).join('\n')}`
      : '';

    return `${current}\n\n### ${decision.title} (${date})\n${decision.description}\n\nRationale:\n${decision.rationale}${alternatives}`;
  }

  private updateProgress(current: string, progress: any): string {
    const date = new Date().toISOString().split('T')[0];
    const completed = progress.completed.map((task: string) => `- ✓ ${task}`).join('\n');
    const inProgress = progress.inProgress.map((task: string) => `- → ${task}`).join('\n');
    const blocked = progress.blocked
      ? `\n\nBlocked:\n${progress.blocked.map((task: string) => `- ⚠ ${task}`).join('\n')}`
      : '';

    return `${current}\n\n## Update (${date})\n\nCompleted:\n${completed}\n\nIn Progress:\n${inProgress}${blocked}`;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Memory Bank MCP server running on stdio');
  }
}

const server = new MemoryBankServer();
server.run().catch(console.error);
