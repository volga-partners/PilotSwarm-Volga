# AGENTS.md

## Rules

- **Never commit or push the `project-management/` directory or any of its files.** This directory is local-only for task tracking and Trello sync — it must not enter version control.

## Agent Orchestration Rules

These rules govern how subagents are spawned for all PilotSwarm development work.

### Implementation & Fix Agents
- **Model**: `claude-opus-4.7` — always.
- **TDD**: Every implementation/fix agent **MUST** invoke the `test-driven-development` skill. No production code without a failing test first.
- **No shortcuts**: Never apply patched fixes or workarounds. Think about how future development on top of this will be affected. Production-grade, industry-standard, best-practice implementations only.

### Non-Implementation Agents (Testing, Review, Audits)
- **Dual-model**: Always spawn **2 agents** — one with `claude-opus-4.7`, one with `gpt-5.4` — to get both perspectives and catch blind spots.
- This prevents race conditions where 2 agents change the same file. Non-impl agents only read and analyze, never write.

### Research Agents
- **Dual-model**: Always spawn **2 agents** — `claude-opus-4.7` + `gpt-5.4`.
- **Web search**: Research agents must use web search to ground recommendations in current (2026) industry standards and best practices.
- Research agents inform implementation — they never implement directly.

### Orchestrator Discipline
- **Keep orchestrator thread clean**: No inline code changes. Orchestrator only coordinates: spawn agents, merge results, track state.
- **Race condition prevention**: Never have 2+ agents writing to the same file simultaneously. Implementation agents run sequentially for shared files.

### General
- **Commit discipline**: Never commit, push, or deploy without explicit user permission.
- **`project-management/` is gitignored**: Never commit this directory.
