---
name: deba-agent
description: "AI agent CLI for requirements definition, planning, execution, review, queue processing, worktree operations, and memory maintenance. Use when you need to run Deba workflows or any Deba command, including `deba chat`, `deba plan`, `deba validate`, `deba execute`, `deba run`, `deba run-plan`, `deba review`, `deba worker`, `deba worktree-add`, and `deba maintenance` subcommands."
---

# Deba Agent

Use Deba to run an end-to-end development lifecycle:
Phase A (planning), Phase B (implementation), and Phase C (review and learning).

## Prerequisites

- Install dependencies: `npm install`
- Build before running locally: `npm run build`
- Install and authenticate an LLM CLI (`gemini` by default; `codex` is also supported via config)
- Initialize config when needed: `deba maintenance setup-config`

## Recommended Workflow

1. Create a plan with `deba plan <request>`.
2. Validate a plan with `deba validate <filepath>` when inspecting external outputs.
3. Execute with either `deba run <request>`, `deba run-plan <filepath>`, or `deba execute --step <id> --plan <filepath>`.
4. Review and capture learning with `deba review <task_id>`.
5. Curate and promote learning via `deba maintenance promote` and related maintenance commands.

### Handling Failures and TDD Workflow

If a task (e.g., `deba run`) fails or halts during the execution phase (Phase B), **DO NOT** immediately fix the code manually and commit. You MUST run `deba review <task_id>` to record the failure. Provide a detailed explanation of what went wrong and how it should be fixed as your review feedback. This ensures Deba learns from the mistake, extracts a reusable skill for future tasks, and maintains its growth cycle. After reviewing, you may proceed to fix the issue.

**Automating Review and Promotion**
- When a task is confirmed successful by the user, or when you have provided a clear fix and verified the Reflection results as useful, prefer using the `--yes` (or `-y`) option with `review` and `maintenance promote` commands to streamline the growth cycle.
- Use `--yes` when you are confident that the learning extracted is accurate and aligns with project standards.

## Command Reference

### Top-level Commands

| Command | Purpose | Important Options |
| --- | --- | --- |
| `deba chat <message>` | Send a direct prompt to the configured LLM and store a snapshot. | None |
| `deba plan <request>` | Run Phase A only: generate and parse a structured implementation plan. | `--file <path...>` to include one or more context files |
| `deba worker` | Start queue worker to execute queued steps asynchronously. | None |
| `deba worktree-add <repo_path> <branch_name>` | Create a Git worktree under Deba's internal `.worktrees` directory. | `--name <worktree_name>` to override generated worktree name |
| `deba validate <filepath>` | Validate Phase A output (schema + dependency DAG) and print execution batches. | None |
| `deba execute --step <id> --plan <filepath>` | Execute one specific implementation step from a plan file. | `--step <id>`, `--plan <filepath>` are required |
| `deba run <request>` | Run end-to-end flow: Phase A, validation, and batch execution in isolated worktree. | `--file <path...>` to include one or more context files |
| `deba run-plan <filepath>` | Load an existing JSON/YAML plan and execute it directly. | None |
| `deba review <task_id>` | Run Phase C review, capture feedback, and update episodic/learning memory. | `-y`, `--yes` for non-interactive approval flow |

### Maintenance Commands

| Command | Purpose | Important Options |
| --- | --- | --- |
| `deba maintenance clean` | Remove temporary Deba worktrees and old snapshots. | `--days <number>` snapshot retention days (default: `7`) |
| `deba maintenance skills` | List acquired skills (semantic memory). | None |
| `deba maintenance skills-promote <rule>` | Promote a provided rule directly into skill memory. | `--project <name>` target project namespace (default: `default`) |
| `deba maintenance promote` | Interactively review pending proposals/learnings and promote accepted items. | `-y`, `--yes` to auto-approve all items |
| `deba maintenance consolidate-skills` | Refactor and consolidate stored skill files. | None |
| `deba maintenance setup-skill` | Install project `SKILL.md` to `~/.agents/skills/deba/SKILL.md`. | None |
| `deba maintenance setup-config` | Initialize `~/.deba/config.toml` with default settings. | None |

## Configuration

- Config file: `~/.deba/config.toml`
- Main keys:
  - `ai.provider` (`gemini` or `codex`)
  - `ai.model` (default planning model)
  - `ai.flash_model` (lighter/faster model for supporting tasks)

## Memory Model

- Episodic memory: task-level execution records and reviews
- Growth log: pending learnings extracted from reflections
- Semantic memory (skills): approved rules that are reused in future tasks

## Prompt Development Guidelines

When modifying or adding prompts:
- All prompts must be stored as Markdown files in `src/templates/`.
- Use `{{VARIABLE}}` for dynamic content injection.
- Prompts must start with an H1 title and use hierarchical sections (H2, H3).
- Strictly follow the output format policy: **JSON** for mechanical planning (Phase A), **YAML** for human-centric learning and review (Phase C/Skills).

## Operational Notes

- Prefer local development invocation: `npm run deba -- <command>`
- Use `deba maintenance setup-skill` after updating this file to refresh installed agent metadata
