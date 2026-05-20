# depslice â€” Agent Instructions

You have access to the `depslice` MCP server. Use it proactively to save context and tokens.

## Core rule

**Never read multiple files one-by-one when you can use a depslice tool instead.**

## When to use each tool

### `map_dependencies` â€” orient first
Call this at the start of any task that involves understanding or modifying existing code.
It gives you the full dependency tree (file names, structure) without loading source.
Use it to decide *which* files you actually need to read.

```
# Before touching anything, understand the landscape
map_dependencies(targetFile: "src/index.ts", root: "/path/to/project")
```

### `analyze_feature` â€” load context surgically
Once you know which entry point is relevant, call this to get the full source of that module and all its dependencies in one shot.
This replaces 5â€“20 individual file reads with a single tool call.

```
# Load everything needed to understand the auth flow
analyze_feature(entryFile: "src/auth/index.ts", root: "/path/to/project")
```

### `find_dependents` â€” assess impact before changing
Before modifying any shared file (utility, type, hook, lib), call this to know the blast radius.
With transitive: true you see the full upstream chain.

```
# Before changing a shared utility
find_dependents(targetFile: "src/utils/format.ts", root: "/path/to/project", transitive: true)
```

## Recommended workflow

```
1. map_dependencies  â†’  understand structure, find the right entry point
2. analyze_feature   â†’  load source of the relevant module
3. find_dependents   â†’  before any change, check impact
4. Read/Edit         â†’  now read or edit individual files as needed
```

## The `root` parameter

Always pass `root` as the absolute path to the project you are analyzing.
Example: if the user is working on `/Users/alice/projects/my-app`, pass `root: "/Users/alice/projects/my-app"`.
File paths like `entryFile` and `targetFile` are resolved relative to `root`.

## What depslice does NOT do

- It does not run tests or build the project
- It does not resolve `node_modules` imports (only local relative and aliased imports)
- It does not support dynamic imports with runtime variables

