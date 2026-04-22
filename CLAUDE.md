# CLAUDE.md

## Git Conventions

- **Never commit or push the `project-management/` directory or any of its files.** This directory is local-only for task tracking and Trello sync.
- Do not add `Co-Authored-By` lines to commit messages
- Commit message style: `type: description` (e.g. `fix:`, `feat:`, `chore:`, `docs:`, `release:`)
- Branch naming: `type/description` (e.g. `fix/tui-ux-improvements`)
- Clear, self-documenting code; Add helpful comments where needed
- Small, focused functions

## Git Workflow

- Branch naming: `feature/`, `fix/`, `chore/` prefixes
- Atomic, well-scoped commits
- PR-based workflow
- don't create PRs for small changes and don't directly PR to main

## Agent Workflow Rules

- **Orchestrator stays clean**: Never make inline code changes in the orchestrator thread. Always delegate to subagents. Orchestrator only coordinates: spawn agents, merge worktrees, track state.
- **Sonnet for most agents**: Use `model="sonnet"` explicitly on all subagent spawns. Only use Opus for reasoning-intensive tasks (complex architecture, novel problem-solving, complex debugging, complex refactoring, etc.)
- **Frontend design skill**: All UI executor agents must include the frontend-design skill guidance in their prompt. Dashboard uses Plus Jakarta Sans, JetBrains Mono, dark mission-control theme.
- **Real-time research**: All research agents must use WebSearch to verify recommendations. Never rely solely on training data.

## Development Workflow

- **Primary workflow**: Use `/gsd:autonomous` for multi-phase features — it chains discuss/plan/execute/verify per phase without micromanagement. Superpowers quality skills (TDD, code review) fire automatically within each phase, giving both velocity and quality.
- **Skip heavy tooling**: Built-in auto-memory (`MEMORY.md`) + GSD's `.planning/` artifacts + git history cover cross-session context.
