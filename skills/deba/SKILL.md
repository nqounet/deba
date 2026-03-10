---
name: deba-agent
description: "AI agent CLI for requirements definition, planning, execution, review, queue processing, worktree operations, and memory maintenance. Use when you need to run Deba workflows or any Deba command, including `deba chat`, `deba plan`, `deba validate`, `deba execute`, `deba run`, `deba run-plan`, `deba review`, `deba worker`, `deba worktree-add`, and `deba maintenance` subcommands."
---

# Deba Agent

Use Deba to run an end-to-end development lifecycle:
Planning (planning), Execution (implementation), and Review (review and learning).

## Prerequisites

- Install dependencies: `npm install`
- Build before running locally: `npm run build`
- Install and authenticate an LLM CLI (`gemini` by default; `codex` is also supported via config)
- Initialize config and install skill when needed: `deba install`

## Recommended Workflow

1. Create a plan with `deba plan <request>`.
2. Validate a plan with `deba validate <filepath>` when inspecting external outputs.
3. Execute with either `deba run <request>`, `deba run-plan <filepath>`, or `deba execute --step <id> --plan <filepath>`.
4. Review and capture learning with `deba review <task_id>`.
5. Curate and promote learning via `deba maintenance promote` and related maintenance commands.

### Review and Learning Cycle

The `deba review <task_id>` command is critical for Deba's continuous learning. It handles two main scenarios based on the outcome of a task execution:

#### 1. Task Success (Approval)
When a task is successfully executed and the results are correct:
- Run `deba review <task_id> --yes` (or explicitly approve it interactively).
- Deba will record the successful episode, updating its internal "Trust Level" and approval rate.
- If the task was run in an isolated worktree (e.g., via `run-plan`), Deba will merge the worktree changes into the main branch and remove the temporary worktree.

#### 2. Task Failure or Needs Fix (Reflection)
If a task (e.g., `deba run`) fails, produces incorrect output, or halts during execution, **DO NOT** immediately fix the code manually and commit.
- You **MUST** run `deba review <task_id>`.
- When prompted, provide a detailed explanation of what went wrong, why it failed, and how it should be fixed.
- **Reflection Process**: Deba uses this feedback to run a self-reflection step via the LLM. It analyzes the failure, extracts "learnings" (proposed rules and best practices), and appends them to the **Growth Log**. It also stores this information in its semantic knowledge base.
- After reviewing and capturing the knowledge, you may proceed to fix the issue manually or run a new plan.

**Automating Review and Promotion**
- When a task is confirmed successful by the user, prefer using the `--yes` (or `-y`) option with `deba review` to automatically approve, record the success, and handle worktree merging.
- To promote the extracted learnings from failed/fixed tasks into permanent skills, use `deba maintenance promote` (with `--yes` if confident). This completes the growth cycle, turning episodic failures into reusable semantic memory.

## Best Practices & Conventions

### General Coding Conventions
- **Output Formatting**: 
  - When outputting YAML, wrap strings containing colons (:) in double quotes or use block scalars (|) to avoid parse errors.
  - If a specific format (YAML, JSON, etc.) is requested, output *only* that data. Do not include preambles, explanations, or Markdown code block markers (```) unless explicitly asked.
- **Testing & Mocking**: 
  - When mocking libraries with method chaining (builder pattern), apply `mockReturnThis()` to all intermediate methods to ensure the chain remains intact.

### Deba Specific Conventions
- **Localization**: Output error messages and logs in Japanese to facilitate user communication.
- **Execution Safety**: 
  - **Commit before Run**: Always commit changes in the main working tree before running tasks that use Git Worktrees (e.g., `deba run-plan`), as uncommitted changes are not reflected in isolated environments.
  - **Path Verification**: Always verify the existence and accuracy of file paths using `list_directory` or `glob` before performing file operations. Ask the user if paths are ambiguous.
  - **Source of Truth**: Treat the actual file system as the final authority on technical stacks. If `GEMINI.md` or other docs conflict with `package.json`, `tsconfig.json`, or project structure, follow the file system and notify the user.
- **Prompt Engineering**: 
  - Externalize prompts into `src/templates/` as Markdown files using `{{VARIABLE}}` placeholders.
  - Use clear hierarchical structures in prompts (e.g., `# Title`, `## System Role`, `## Context`).

## Command Reference

### Top-level Commands

| Command | Purpose | Important Options |
| --- | --- | --- |
| `deba install` | Initial setup: Initialize config and install the skill. | None |
| `deba chat <message>` | Send a direct prompt to the configured LLM and store a snapshot. | None |
| `deba plan <request>` | Run Planning only: generate and parse a structured implementation plan. | `--file <path...>` to include one or more context files |
| `deba worker` | Start queue worker to execute queued steps asynchronously. | None |
| `deba worktree-add <repo_path> <branch_name>` | Create a Git worktree under Deba's internal `.worktrees` directory. | `--name <worktree_name>` to override generated worktree name |
| `deba validate <filepath>` | Validate Planning output (schema + dependency DAG) and print execution batches. | None |
| `deba execute --step <id> --plan <filepath>` | Execute one specific implementation step from a plan file. | `--step <id>`, `--plan <filepath>` are required |
| `deba run <request>` | Run end-to-end flow: Planning, validation, and batch execution in isolated worktree. | `--file <path...>` to include one or more context files |
| `deba run-plan <filepath>` | Load an existing JSON/YAML plan and execute it directly. | None |
| `deba review <task_id>` | Run review, capture feedback, and update episodic/learning memory. | `-y`, `--yes` for non-interactive approval flow |

### Maintenance Commands

| Command | Purpose | Important Options |
| --- | --- | --- |
| `deba maintenance clean` | Remove temporary Deba worktrees and old snapshots. | `--days <number>` snapshot retention days (default: `7`) |
| `deba maintenance skills` | List acquired skills (semantic memory). | None |
| `deba maintenance skills-promote <rule>` | Promote a provided rule directly into skill memory. | `--project <name>` target project namespace (default: `default`) |
| `deba maintenance promote` | Interactively review pending proposals/learnings and promote accepted items. | `-y`, `--yes` to auto-approve all items |
| `deba maintenance consolidate-skills` | Refactor and consolidate stored skill files. | None |
| `deba maintenance setup-skill` | Install project `skills/deba/SKILL.md` to `~/.agents/skills/deba/SKILL.md`. | None |
| `deba maintenance setup-skr` | Install `semantic-knowledge-repository` skill. | None |
| `deba maintenance setup-config` | Initialize `~/.deba/config.toml` with default settings. | None |

## Configuration

- Config file: `~/.deba/config.toml`
- Main keys:
  - `ai.planning.provider` and `ai.execution.provider` (`gemini` or `codex`)
  - `ai.planning.model` (model for planning tasks)
  - `ai.execution.model` (lighter/faster model for execution tasks)

## Memory Model

- Episodic memory: task-level execution records and reviews
- Growth log: pending learnings extracted from reflections
- Semantic memory (skills): approved rules that are reused in future tasks

## Operational Notes

- Prefer local development invocation: `npm run deba -- <command>`
- Use `deba install` or `deba maintenance setup-skill` after updating this file to refresh installed agent metadata
