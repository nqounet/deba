# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
