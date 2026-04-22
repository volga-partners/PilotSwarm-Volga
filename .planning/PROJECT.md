# PilotSwarm Eval Harness

## Vision
Production-grade evaluation harness for PilotSwarm agents — measuring tool-call correctness, multi-agent behavior, durability, and prompt quality with deterministic code graders and statistical rigor.

## Milestone: v1.0 — Eval Harness V1

### Goal
Build Phase 1 of the eval harness: a thin, TDD'd, deterministic eval runner for tool-call correctness. Integrates with existing `withClient()` infra, runs via vitest, produces actionable JSONL results, and establishes clean interfaces for Phase 2-5.

### Tech Stack
- TypeScript (source), ESM .js (tests)
- vitest (test runner)
- zod (schema validation)
- PilotSwarm SDK (`withClient()`, CMS helpers)

### Key Decisions (from 4-agent research/review pass)
1. Constraint-based matching (subset/fuzzy), not exact match
2. Eval-owned system prompts versioned in fixtures
3. JSON datasets + zod validation at load
4. Fake-LLM driver for TDD of runner/graders
5. Separate eval vitest config (120s timeout, own entrypoint)
6. 4 interfaces: Grader, Reporter, Driver, FixtureLoader
7. Single-trial + passRateFloor (not multi-trial in V1)
8. Per-case artifact capture on failure

### Non-Negotiables
- TDD: no production code without a failing test first
- No retries in evals
- Default model unless testing model-specific behavior
- No shortcuts — production-grade, industry-standard patterns
