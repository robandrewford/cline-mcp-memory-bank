# Cline Memory Bank

A Model Context Protocol server that provides persistent project context management for AI-assisted development.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Setup Steps](#setup-steps)
- [Features](#features)
  - [Tools](#tools)
  - [Resources](#resources)
  - [Memory Bank Integration](#memory-bank-integration)
- [File Structure](#file-structure)
- [System Prompt for Cline](#system-prompt-suggestion)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Memory Bank MCP server helps maintain consistent project context across development sessions by providing structured tools and resources for managing:

- Project context and technical details
- Current session state and tasks
- Progress tracking and milestones
- Technical decisions and rationale

## Installation

### Prerequisites

- Node.js (v16 or later)
- VS Code with Cline extension installed
- TypeScript (for development)

### Setup Steps

1. Clone and build the server:
```bash
# Clone the repository
git clone https://github.com/dazeb/cline-memory-bank
cd cline-memory-bank

# Install dependencies
npm install

# Build the server
npm run build

# Make globally available (optional)
npm link
```

2. Configure Cline Extension:

Add the following to your Cline MCP settings (`~/.config/Code - Insiders/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "memory-bank": {
      "command": "node",
      "args": [
        "/path/to/memory-bank-server/build/index.js"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Replace `/path/to/memory-bank-server` with the actual path to your server installation.

## Features

### Tools

1. `initialize_memory_bank`
   - Creates Memory Bank structure for a new project
   - Creates required markdown files with initial templates
   ```typescript
   use_mcp_tool('memory-bank', 'initialize_memory_bank', {
     projectPath: '/path/to/project'
   });
   ```

2. `update_context`
   - Updates active context with current session information
   - Tracks mode, tasks, and session state
   ```typescript
   use_mcp_tool('memory-bank', 'update_context', {
     projectPath: '/path/to/project',
     content: {
       currentSession: {
         date: '2025-03-13',
         mode: 'development',
         task: 'Implementing new feature'
       }
     }
   });
   ```

3. `record_decision`
   - Records technical decisions with rationale
   - Maintains history of architectural choices
   ```typescript
   use_mcp_tool('memory-bank', 'record_decision', {
     projectPath: '/path/to/project',
     decision: {
       title: 'Authentication System',
       description: 'Implementing JWT-based authentication',
       rationale: 'Better scalability and stateless operation',
       alternatives: [
         'Session-based auth',
         'OAuth only'
       ]
     }
   });
   ```

4. `track_progress`
   - Updates project progress and milestones
   - Manages task status and blockers
   ```typescript
   use_mcp_tool('memory-bank', 'track_progress', {
     projectPath: '/path/to/project',
     progress: {
       completed: ['Setup project', 'Initialize database'],
       inProgress: ['Implement auth', 'Create API routes'],
       blocked: ['Deploy to production']
     }
   });
   ```

### Resources

1. `memory://project/context`
   - Project overview and technical stack
   - Architecture principles and guidelines

2. `memory://active/context`
   - Current session state and tasks
   - Active considerations and notes

3. `memory://progress`
   - Project milestones and task tracking
   - Work status and blockers

4. `memory://decisions`
   - Technical decisions and rationale
   - Architecture choices and alternatives

### System Prompt Suggestion

Add to Cline system prompt under settings.

```
Before proceeding with any task:
1. Check active context (memory://active/context) to understand:
   - Current project state
   - Ongoing tasks
   - Recent decisions

2. Review project context (memory://project/context) for:
   - Technical stack details
   - Project guidelines
   - Architecture decisions

3. Consult decision log (memory://decisions) when:
   - Making architectural choices
   - Implementing new features
   - Modifying existing patterns

4. Update progress tracking (memory://progress):
   - Mark completed items
   - Add new in-progress tasks
   - Note blocked items

Key Rules:
- Always check memory bank before starting new tasks
- Record significant technical decisions with rationale
- Keep active context updated with current work
- Track progress changes in real-time
- Reference previous decisions when making related changes
```
## File Structure

When initialized, the Memory Bank creates the following structure in your project:

```
project-root/
└── memory-bank/
    ├── projectContext.md    # Technical stack and guidelines
    ├── activeContext.md     # Current session state
    ├── progress.md         # Project progress tracking
    └── decisionLog.md      # Technical decisions
```

## Using with Cline

1. Initialize a new Memory Bank:
   ```
   use_mcp_tool('memory-bank', 'initialize_memory_bank', {
     projectPath: process.cwd()  // or specific path
   });
   ```

2. Access project context:
   ```
   access_mcp_resource('memory-bank', 'memory://project/context');
   ```

3. Update session context:
   ```
   use_mcp_tool('memory-bank', 'update_context', {
     projectPath: process.cwd(),
     content: {
       currentSession: {
         date: new Date().toISOString().split('T')[0],
         mode: 'development',
         task: 'Current task description'
       }
     }
   });
   ```

4. Record technical decisions:
   ```
   use_mcp_tool('memory-bank', 'record_decision', {
     projectPath: process.cwd(),
     decision: {
       title: 'Decision Title',
       description: 'What was decided',
       rationale: 'Why it was decided'
     }
   });
   ```

## Development

To modify or enhance the server:

1. Update source in `src/index.ts`
2. Run tests: `npm test`
3. Build: `npm run build`
4. Restart Cline extension to load changes

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT © dazeb
