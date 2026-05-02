# Repository Guidelines

## Project Overview

Project Ego (Governor) is a task orchestration harness for AI agents. It provides structured task execution, tool routing, and validation for autonomous agent workflows. The core abstraction is the **System Three Task Packet** — a deterministic JSON contract that describes work, constraints, validation rules, and outputs.

The project sits at `/Users/nicolavekios/workspace/Project Ego` and serves as the execution layer for routing tasks to various AI tools (OpenCode, Ralph, NotebookLM).

## Architecture & Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Task Packet    │────▶│  TypeScript      │────▶│  Validation     │
│  (.task.json)   │     │  Validator       │     │  Result         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  execute.sh     │────▶│  Tool Adapter    │────▶│  AI Tool        │
│  (router)       │     │  (bash wrapper)  │     │  (opencode/etc) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Traces JSONL   │
│  (.execution/)  │
└─────────────────┘
```

**Data Flow:**
1. Task packets are defined as JSON in `.system3/tasks/`
2. `validate-task-packet.ts` validates structure and constraints
3. `execute.sh` routes tasks to appropriate tool adapters based on keywords
4. Adapters (`scripts/adapters/`) wrap external CLI tools with uniform interface
5. Execution results are logged as JSON Lines to `.execution/traces.jsonl`

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `.system3/schemas/` | JSON Schema definitions for task packets |
| `.system3/tasks/` | Task packet instances (JSON) |
| `scripts/system3/` | TypeScript validators and System Three logic |
| `scripts/adapters/` | Bash adapters for external AI tools |
| `tests/system3/` | Bun test suite for validation logic |

## Development Commands

### Validation
```bash
# Validate a task packet
bun run scripts/system3/validate-task-packet.ts .system3/tasks/TEMPLATE.task.json

# Run tests
bun test tests/system3/task-packet.test.ts
```

### Execution
```bash
# Execute with specific tool
bash scripts/execute.sh --tool opencode --task "Fix broken links"

# Execute with auto-routing
bash scripts/execute.sh --task "Research multi-agent patterns"

# NotebookLM query
bash scripts/execute.sh --tool nlm --notebook 27ceeb9a --question "patterns"

# Health check
bash scripts/execute.sh --health

# View recent executions
bash scripts/execute.sh --recent 5
```

### NotebookLM Sync
```bash
# List notebooks
bash scripts/notebooklm-sync.sh list

# Query notebook
bash scripts/notebooklm-sync.sh query <id> "question"

# Pull insights into vault
bash scripts/notebooklm-sync.sh pull <id> <vault_file>

# Push vault file to notebook
bash scripts/notebooklm-sync.sh push <notebook_id> <file>
```

### Link Validation
```bash
# Validate wiki-links in vault markdown files
bash scripts/validate-links.sh [vault_directory]
```

## Code Conventions & Common Patterns

### Task Packet Structure
Task packets are the central contract. Key invariants:

- **Schema version**: Must match `0.x.y` pattern (major version locked to 0)
- **Risk tiers**: `T0` (lowest) through `T4` (highest)
- **Status values**: `draft`, `ready`, `in_progress`, `blocked`, `complete`, `rejected`
- **Approval statuses**: `draft`, `pending`, `approved`, `rejected`

### Closed vs Open Objects
- **Top-level**: Open — unknown keys are allowed for additive evolution
- **Nested objects** (`approval`, `memory_policy`, `constraints`): Closed — unknown keys are rejected
- `memory_policy.durable_write` must be `false` in v0

### TypeScript Patterns
- Use `bun:test` for testing (`describe`, `test`, `expect`)
- Prefer `const` over `let`
- Use type guards (`isString`, `isBoolean`, `isPlainObject`) for runtime validation
- Functions return `{ ok: boolean, errors: string[] }` result objects
- CLI entry points guarded with `if (import.meta.main)` (Bun-specific)

### Validation Patterns
- Required fields checked with `in` operator
- Arrays validated for type and non-emptiness where required
- RFC 3339 timestamps validated with regex + range checks
- Error messages formatted as `path: message`

### Bash Patterns
- Adapters parse `--key value` arguments uniformly
- `set -e` for fail-fast behavior
- Exponential backoff retry logic in `execute.sh`
- Python3 one-liners used for JSON processing and UUID generation

## Important Files

| File | Purpose |
|------|---------|
| `scripts/system3/validate-task-packet.ts` | **Authoritative** task packet validator |
| `.system3/schemas/task-packet.schema.json` | Informational JSON Schema (not authoritative) |
| `.system3/tasks/TEMPLATE.task.json` | Reference task packet instance |
| `scripts/execute.sh` | Main execution router and trace logger |
| `scripts/adapters/opencode-exec.sh` | OpenCode CLI adapter |
| `scripts/adapters/ralph-exec.sh` | Ralph Wiggum CLI adapter |
| `scripts/adapters/nlm-exec.sh` | NotebookLM CLI adapter |
| `scripts/notebooklm-sync.sh` | Bidirectional NotebookLM ↔ vault sync |
| `scripts/validate-links.sh` | Wiki-link validator for vault markdown |
| `tests/system3/task-packet.test.ts` | Bun test suite for validator |

## Runtime/Tooling Preferences

- **Runtime**: Bun (for TypeScript scripts and tests)
- **Shell**: Bash 4+ (scripts use `[[`, arrays, modern features)
- **Python3**: Used inline for JSON manipulation, UUIDs, timestamps
- **No package.json at root**: TypeScript files are executed directly with `bun run`
- **External CLI dependencies**: `opencode`, `ralph`, `nlm` (NotebookLM)

## Testing & QA

### Test Framework
- `bun:test` — built-in Bun test runner
- Tests import from `../../scripts/system3/validate-task-packet.ts`

### Running Tests
```bash
bun test tests/system3/task-packet.test.ts
```

### Test Coverage Areas
- Required field presence (all 22 required fields)
- Enum validation (`risk_tier`, `status`, `approval.status`)
- Array constraints (non-empty where required, element types)
- Closed object rejection (unknown keys in `approval`, `memory_policy`, `constraints`)
- RFC 3339 timestamp parsing and range validation
- Schema version format enforcement
- Budget and failure_policy shape validation
- Top-level additive evolution (unknown keys allowed)

### Quality Checks
```bash
# Validate task packet
bun run scripts/system3/validate-task-packet.ts .system3/tasks/TEMPLATE.task.json

# Check tool health
bash scripts/execute.sh --health

# Validate vault links
bash scripts/validate-links.sh /path/to/vault
```

## Constraints & Policies

- **Network**: Task packets can declare `network: false` to prohibit external calls
- **Dependencies**: `new_dependencies: false` prevents package additions
- **Protected paths**: `*.secret`, `*.key`, `.github` are forbidden by default in templates
- **No durable writes**: `memory_policy.durable_write` must be `false` in v0
- **Max debug rounds**: `failure_policy.max_debug_rounds` capped at 2
- **Execution timeout**: Default 120 seconds for tool adapters
