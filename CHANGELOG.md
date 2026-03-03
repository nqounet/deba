# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.3] - 2026-02-28
### Changed
- Unify project license to MIT across package.json and documentation.
## [0.6.6] - 2026-03-03
### Fixed
- Corrected model selection flag for `copilot` provider (from `-m` to `--model`).

## [0.6.5] - 2026-03-03
### Changed
- Refactor AI provider system using SOLID principles (Strategy pattern, DIP, SRP).
- Abstract CLI execution and response decoding into reusable components.

## [0.6.4] - 2026-03-03
### Added
- Support for `copilot` CLI as an AI provider.
- Improved flexible parsing for AI response outputs.

## [0.6.3] - 2026-03-03
### Added
- Enforce singleton behavior for worker with PID-based locking.
- Improve error messages for missing worker or duplicate instances.
### Changed
- Disable automatic background worker startup in favor of manual `deba worker` execution.
- Refactor internal worker lifecycle management into formalized lock-based utilities.

## [0.6.2] - 2026-03-02
### Fixed
- Ensure all git error handling improvements are included in the release.

## [0.6.1] - 2026-03-02
### Fixed
- Improved error handling and user-friendly messages when running outside of a git repository.

## [0.6.0] - 2026-03-02
### Added
- Introducing Eternal Worker and File-based Queue communication for robust asynchronous task execution.


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
