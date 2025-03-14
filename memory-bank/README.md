# Memory Bank Files (Demo Only)

⚠️ **Note: These files are for demonstration purposes only**

The files in this directory (activeContext.md, decisionLog.md, progress.md, projectContext.md) are example templates. You should delete this folder before initializing the memory bank for your project.

When you initialize the memory bank for your project using:
```typescript
use_mcp_tool('memory-bank', 'initialize_memory_bank', {
  projectPath: '/path/to/your/project'
});
```

A new memory-bank folder will be created with fresh files tailored to your project's specifics, including:
- Detected technical stack
- Project dependencies
- Configuration files
- Initial decisions and progress tracking
