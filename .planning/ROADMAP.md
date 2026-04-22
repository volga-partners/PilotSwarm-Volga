# Eval Harness v1.0 — Roadmap

## Phase 1: Schema & Types ✅→⬜
**Goal:** Define eval task schema, sample/score/result interfaces, and zod validation.
**Success Criteria:**
- `types.ts` exports EvalSample, EvalTask, Score, ObservedResult, RunResult
- Zod schemas validate fixture JSON at load time
- Schema includes: schemaVersion, stable id, matcher types, forbidden tools, order policy, call counts
- `eval-tools.ts` defines test_add, test_multiply, test_weather with full invocation logging

## Phase 2: Arg Matching & Graders ✅→⬜
**Goal:** TDD the deterministic code graders against fake traces.
**Success Criteria:**
- `match-args.ts` supports exact/subset/fuzzy/setEquals modes with key sorting, type coercion, case-insensitive enums
- `tool-selection.ts` grades correct tool name + forbidden tool checks
- `ordering.ts` grades strict/unordered sequence
- `response.ts` grades containsAny in final response
- `cms-state.ts` grades CMS session state
- `graders/index.ts` composes all graders
- Every grader has unit tests against canned traces (TDD)
- Each grader returns `{ name, pass, score: 0..1, reason, actual, expected }`

## Phase 3: Drivers & Tool Tracker ✅→⬜
**Goal:** Build fake-LLM driver for TDD and live driver for real execution. Tool tracker extracts ordered call traces.
**Success Criteria:**
- `drivers/types.ts` defines Driver interface
- `drivers/fake-driver.ts` replays scripted traces deterministically
- `drivers/live-driver.ts` wraps `withClient()` for real LLM execution
- `observers/tool-tracker.ts` extracts ordered ObservedToolCall[] from session events
- Tool tracker captures: tool name, args, order, timestamps
- Fake driver unit tested

## Phase 4: Runner & Reporters ✅→⬜
**Goal:** Core eval runner orchestrates load→drive→grade→report. Console + JSONL reporters.
**Success Criteria:**
- `loader.ts` loads JSON fixtures, validates with zod
- `runner.ts` orchestrates: load fixtures, create session via driver, collect tool trace, run graders, emit results
- `reporters/console.ts` prints summary table
- `reporters/jsonl.ts` writes per-case JSONL with run metadata (runId, gitSha, model, timestamp)
- Per-case artifact dump on failure (observed trace + response + CMS state)
- Runner tested against fake driver (TDD)

## Phase 5: Golden Dataset & Vitest Integration ✅→⬜
**Goal:** Create golden test cases and wire everything into vitest + CI.
**Success Criteria:**
- `datasets/tool-call-correctness.v1.json` with 6-8 golden cases
- Cases cover: single tool, multi-param, tool selection, no-tool, sequencing, unordered multi-call
- `eval-core.test.ts` loads fixtures, one `it()` per case
- `vitest.config.ts` with 120s timeout, eval-specific settings
- `package.json` has `test:eval` script
- `scripts/run-tests.sh` supports `--suite=eval`
- `.gitignore` excludes `.eval-results/`
- passRateFloor gate at task level
- README.md documents how to run, add cases, interpret results
- Full end-to-end green run with live LLM
