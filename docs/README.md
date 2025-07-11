Add the contents of `.clinerules` to your system prompt of choice.

You can add it to your codebase as a `.clinerules` file or to your system prompt within Cline.

When initialized, the Memory Bank creates the following structure in your project:

```
graph LR
    Root[Project Root] --> Bank[memory-bank]
    Bank --> PC[projectContext.md]
    Bank --> AC[activeContext.md]
    Bank --> P[progress.md]
    Bank --> DL[decisionLog.md]
    PC --> Stack[Technical Stack]
    AC --> Tasks[Active Tasks]
    P --> Status[Project Status]
    DL --> History[Decision History]
```