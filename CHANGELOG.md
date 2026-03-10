# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.12] - 2026-03-10
### Security & Safety
- Prevented path traversal in `applyFileChange` by validating that output paths strictly reside within the project boundary.
- Mitigated OS command injection risks in the test runner by migrating from `child_process.exec` to `spawn` (`shell: false`/`shell: true` depending on OS) and strictly enforcing the `sanitizeTestCommand` whitelist immediately prior to execution.
- Added automatic scrubbing (`scrubErrorMessage`) to prevent sensitive paths (project root, home directory) and potential secrets (e.g. API keys) within test failure logs from being sent to LLMs during the self-repair loop.
- Added prompt file filtering to exclude massive/sensitive targets like `.env`, `.git`, `node_modules/`, and lockfiles to prevent context bloat and potential secret leakage.

### Added
- Added a hard session token limit (approx. 500,000 tokens) with pre-execution estimation in `UsageTracker` to prevent unbounded looping and excessive LLM API costs.

## [0.11.9] - 2026-03-10
### Changed
- Updated terminology from Phase A/B/C to Planning/Execution/Review for better alignment with the system's architecture.
- Updated documentation in `README.md` and `skills/deba/SKILL.md` to reflect these terminology changes and explain the review/learning cycle.
- Updated tool configuration in `mise.toml`.

## [0.11.8] - 2026-03-10
### Changed
- No changes (version bump only).

## [0.11.7] - 2026-03-10
### Added
- Added `semantic-knowledge-repository` setup to the `maintenance` command.
### Changed
- Addressed review feedback for the `setupSKRCommand`.

## [0.11.6] - 2026-03-10
### Changed
- Refactored prompt handling by decoupling `prompt.ts` with dependency injection.
- Extracted logic from CLI commands into services for better modularity (Review, Worker).
- Refactored Git utilities by removing `utils/git.ts` re-export and using direct imports.
- Updated `AGENTS.md` to include Git/GitHub operation restrictions.
- Updated documentation for installation and new configuration structure.
### Fixed
- Addressed code review feedback on prompt injection and readability.
- Added a note in `README.md` about commenting out configuration.

## [0.11.5] - 2026-03-09
### Changed
- Refactored Phase A/B to Planning/Execution and introduced the Trust module for improved task validation.
- Moved `SKILL.md` to the `skills/deba/` directory for better organization.
### Fixed
- Addressed path traversal vulnerabilities in test commands to enhance security.
- Excluded `.wt/` directory from Vitest to avoid unnecessary test runs.

## [0.11.4] - 2026-03-08
### Added
- Enhanced review UX, queue reliability, and git performance.
- Improved worktree isolation, multi-file support, and worker reliability.
### Changed
- Modularized core logic for improved maintainability.
- Addressed code review feedback on security and quality.
- Enhanced security and robustness in worktree and file operations.
### Fixed
- Fixed build failure by importing missing `touchTask` in `workerCommand`.
### Removed
- Removed deprecated designs and completed plans from documentation.

## [0.11.3] - 2026-03-08
### Added
- Added `GEMINI.md` referencing `AGENTS.md`.
### Changed
- Refactored AI configuration to separate `ai.planning` and `ai.execution`, allowing independent provider/model settings for different phases.
- Decoupled `generateContent` from configuration loading to follow SOLID principles (Dependency Inversion).

## [0.11.2] - 2026-03-08
### Added
- Implement dependency tracking in the execution phase. Steps that depend on failed or ambiguous (AMBIGUITY) steps will now be correctly skipped to prevent unnecessary resource usage.
- Improved execution summary messages to clearly indicate skipped or incomplete steps.

## [0.11.1] - 2026-03-08
### Fixed
- Adjust `TEMPLATES_DIR` path to point to `src/templates` to ensure templates are correctly loaded when running the build.

## [0.11.0] - 2026-03-07
### Added
- Integrated episodic skills into `SKILL.md` for better portability and knowledge sharing.
- Added "Best Practices & Conventions" section to `SKILL.md`, including:
  - Strict output formatting rules (YAML quoting, no preambles).
  - Safety protocols (pre-execution commits, path verification).
  - Knowledge prioritization (File system as the source of truth).
  - Testing strategies for method chaining.
- Japanese localization support for core logs and error messages.

## [0.10.0] - 2026-03-01
### Changed
- Major refactoring for stability and feature parity with design documents.

## [0.4.3] - 2026-02-28
### Changed
- Unify project license to MIT across package.json and documentation.

## [0.4.2] - 2026-02-28
### Fixed
- Resolve merge conflict in `Spinner` utility and align with test expectations.

## [0.4.1] - 2026-02-28
### Added
- Implement centralized spinner for consistent progress feedback.
### Changed
- Improved documentation in `AGENTS.md` regarding worktree execution.

## [0.4.0] - 2026-02-28
### Added
- LLM usage logging functionality.
- New design documents for growth system and eternal session worker.

## [0.3.2] - 2026-02-28
### Fixed
- Achieve 100% function coverage across all modules and commands.
- Add comprehensive unit tests for various modules.

## [0.3.1] - 2026-02-26
### Fixed
- Restore `buildReflectionPrompt` implementation.
- Add unit tests for CLI entry point.

## [0.3.0] - 2026-02-25
### Added
- Initial implementation of the growth system and learning loop.
- Core CLI commands: `run`, `plan`, `review`, `worker`.
