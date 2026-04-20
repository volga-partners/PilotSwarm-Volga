# Eval Harness

The PilotSwarm Eval Harness (`packages/eval-harness/`) is a production-grade evaluation system for PilotSwarm agents. It measures tool-call correctness, argument accuracy, sequencing, response quality, and session state through deterministic code graders.

## Overview

The eval harness answers: **given a prompt and available tools, does the LLM call the right tools with the right arguments in the right order?**

It is separate from the integration test suite (`packages/sdk/test/local/`). Integration tests verify system behavior (events fire, CMS persists, orchestration replays). Evals verify LLM behavior (tool selection, arg accuracy, sequencing quality).

## Running

```bash
# Fast — FakeDriver, no LLM, no .env needed
./scripts/run-tests.sh --suite=eval

# Direct
cd packages/eval-harness && npx vitest run
```

## Key Design Decisions

1. **Constraint-based matching** — `subset` is the default arg match mode, not `exact`. LLMs add harmless extra args; exact match produces false failures.
2. **Eval-owned system prompts** — each fixture specifies its own `systemMessage`. This is not "compensating for product behavior" — it's defining the system under test.
3. **FakeDriver for CI** — the default test suite uses scripted traces (no LLM calls, <1s total). LiveDriver is available for real model evaluation.
4. **Word-boundary response matching** — `containsAny`/`containsAll` use regex `\b...\b` to prevent false positives.
5. **AbortSignal cancellation** — timeouts cancel the driver, not just race against it. No leaked LLM calls.
6. **Async-ready reporters** — `void | Promise<void>` interface, ready for Langfuse without breaking changes.
7. **Incremental JSONL writes** — crash mid-run → partial results preserved.
8. **Specificity-ordered matching** — most-constrained expected calls matched first to avoid greedy mis-pairing.

## Fixture Schema

See `packages/eval-harness/src/types.ts` for the full Zod schema. Quick reference:

### EvalTask (top-level)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | `1` (literal) | ✅ | Must be `1` |
| `id` | string | ✅ | Stable task identifier |
| `name` | string | ✅ | Display name |
| `description` | string | ✅ | What this task evaluates |
| `version` | string | ✅ | Semver of the dataset |
| `passRateFloor` | number (0..1) | | Minimum pass rate for the task |
| `samples` | EvalSample[] | ✅ | At least one sample |

### EvalSample

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | ✅ | | Stable sample identifier |
| `description` | string | ✅ | | What this sample tests |
| `input.prompt` | string | ✅ | | User message to send |
| `input.systemMessage` | string | | | System prompt for the session |
| `expected.toolCalls` | EvalToolCall[] | | | Expected tool calls |
| `expected.toolSequence` | `"strict"` \| `"unordered"` | | `"unordered"` | Ordering requirement |
| `expected.forbiddenTools` | string[] | | | Tools that must NOT be called |
| `expected.noToolCall` | boolean | | | If true, asserts zero tool calls |
| `expected.minCalls` / `maxCalls` | number | | | Call count bounds |
| `expected.response.containsAny` | string[] | | | At least one must appear (word-boundary) |
| `expected.response.containsAll` | string[] | | | All must appear (word-boundary) |
| `expected.cms.stateIn` | string[] | | | CMS session state must be one of these |
| `tools` | string[] | | all | Which eval tools to register |
| `tags` | string[] | | | For filtering/grouping |
| `timeoutMs` | number | | `120000` | Per-sample timeout |

### EvalToolCall

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | | Tool name |
| `args` | object | | Expected arguments |
| `match` | `"exact"` \| `"subset"` \| `"fuzzy"` \| `"setEquals"` | `"subset"` | Matching mode |
| `order` | number | | Position in sequence (for `strict` mode) |

### Schema Invariants

The schema rejects contradictory configurations at load time:
- `noToolCall: true` + non-empty `toolCalls` → error
- `minCalls > maxCalls` → error

## Graders

| Score Name | What It Checks | Type |
|------------|---------------|------|
| `tool-names` | Were the right tools called? (multiset — handles duplicate calls) | Fractional (0..1) |
| `forbidden-tools` | Were forbidden tools avoided? | Binary |
| `call-count` | Were min/max call constraints met? | Binary |
| `no-tool-compliance` | If `noToolCall: true`, were zero tools called? | Binary |
| `tool-args:<name>` | Per expected tool call, did the arguments match? | Per match mode |
| `tool-ordering` | Were tools called in the right order? | Fractional |
| `response` | Does the final response contain expected strings? | Fractional |
| `cms-state` | Is the session in an expected CMS state? | Binary |

## Drivers

| Driver | When to Use | Requirements |
|--------|------------|--------------|
| `FakeDriver` | CI, TDD, fast iteration | None |
| `LiveDriver` | Real model evaluation | PostgreSQL + GITHUB_TOKEN |

LiveDriver limitations:
- Does not support `input.context` (multi-turn priors)
- Creates isolated test env per sample (schema isolation)
- Requires PilotSwarm SDK as peer dependency

## Reporters

| Reporter | Output | Persistence |
|----------|--------|-------------|
| `ConsoleReporter` | `✅`/`❌`/`⚠️` summary to stdout | None |
| `JsonlReporter` | `.eval-results/<runId>.jsonl` | Incremental (crash-safe) |

JsonlReporter also writes failure artifacts: `.eval-results/<runId>/<caseId>.json`

## Public API

```typescript
import {
  // Runner
  EvalRunner,
  loadEvalTask,
  loadEvalTaskFromDir,

  // Drivers
  FakeDriver,
  LiveDriver,

  // Reporters
  ConsoleReporter,
  JsonlReporter,

  // Graders (for custom pipelines)
  gradeEvalCase,
  matchArgs,

  // Fixtures (for custom tools)
  createEvalToolTracker,

  // Types
  type EvalTask,
  type EvalSample,
  type Score,
  type RunResult,
  type Driver,
  type Reporter,
} from "pilotswarm-eval-harness";
```

## Roadmap

| Phase | What | Status |
|-------|------|--------|
| **V1** | Runner + code graders + golden dataset | ✅ Shipped |
| **V2** | Multi-trial stats + parameter matrix (model × config) | Planned |
| **V3** | Crash recovery + durability evals | Planned |
| **V4** | Multi-agent + multi-turn evals | Planned |
| **V5** | LLM-as-judge + Langfuse + CI gates | Planned |

## Related Docs

- [Eval Harness V1 Plan](proposals/eval-harness-v1-plan.md) — Phase-wise implementation plan
- [Eval Harness Design](proposals/eval-harness-design.md) — Full architecture (Phases 1-5)
- [Eval Harness Proposal](proposals/eval-harness-proposal.md) — 22-dimension evaluation framework
- [Eval Harness Research](proposals/eval-harness-research.md) — 2026 industry research
- [Eval Harness Validation](proposals/eval-harness-validation.md) — Architecture decision validation
