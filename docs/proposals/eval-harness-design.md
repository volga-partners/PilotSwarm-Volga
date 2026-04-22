# PilotSwarm Eval Harness — Design Document

**Date:** April 9, 2026
**Status:** Brainstorming → Architecture Decisions Locked

---

## Executive Summary

A production-grade, industry-standard evaluation harness for PilotSwarm that serves both prompt engineers (fast iteration, A/B testing) and platform engineers (deployment validation, regression suites). Built on 2026 best practices: Swiss Cheese grading, OTel tracing, Langfuse observability, and CI/CD-gated deployments.

---

## Architecture Decisions (Locked + Validated)

| Decision | Choice | Status | Rationale |
|----------|--------|--------|-----------|
| **Prompt Management** | Langfuse (self-hosted) | 🟢 | All-in-one: prompt registry + tracing + evals; MCP server; OTel-native; self-hostable. Budget ClickHouse ops time. |
| **Eval Execution** | SDK-native runner (`packages/eval`) | 🟢 | TypeScript, uses PilotSwarmClient directly, CLI + programmatic, reuses `withClient()`. Use `autoevals` npm for standard scorers; delegate visualization to Langfuse. |
| **Grading Strategy** | Swiss Cheese layering | 🟢 | Code graders (deterministic, free) + LLM-as-judge (behavioral, nuanced) + trajectory scoring per-task. Judge consistency monitoring + gold-standard injection. |
| **Observability** | OTel GenAI → Langfuse (with abstraction layer) | 🟡→🟢 | OTel conventions still experimental — build thin abstraction (`traceAgent()`/`traceTurn()`) so attribute changes don't require harness-wide rewrites. Dual-path: Langfuse native SDK for critical paths + OTel for broader pipeline. Converge to OTel-only once conventions stabilize. Grafana via OTel Collector later. |
| **Chaos Testing** | Full suite from Phase 1 | 🟢 | Extends existing `chaos.test.js`; fault injection at duroxide activity boundary (not deep in CopilotSession). MAS-FIRE taxonomy for fault classification. |
| **CI/CD** | 3-tier eval-gated CI/CD | 🟡→🟢 | **Tier 1** (every PR, <2min, $0): code graders only. **Tier 2** (merge-to-main, <15min, ~$10-20): smoke eval with single-trial LLM. **Tier 3** (nightly, <60min, ~$100-200): full suite, 3-5 trials, LLM-judge, chaos. |
| **Datasets** | Golden datasets + synthetic generation | 🟢 | Seed from existing 50+ tests; versioned; trace-to-dataset pipeline for continuous improvement |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EVAL HARNESS CLI / SDK                              │
│  CLI: pilotswarm eval run --suite=smoke --model=claude-sonnet-4             │
│  SDK: import { EvalRunner, EvalSuite } from "pilotswarm-eval"               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌──────────────────┐         │
│  │  DATASET MANAGER  │  │  TASK RUNNER      │  │  GRADER PIPELINE │         │
│  │                   │  │                   │  │                  │         │
│  │  Golden sets      │  │  PilotSwarmClient │  │  Layer 1: Code   │         │
│  │  (versioned JSON) │  │  + Worker         │  │  (CMS, tools,    │         │
│  │  Synthetic gen    │  │  Multi-trial      │  │   orch health)   │         │
│  │  Trace-to-dataset │  │  Trace capture    │  │  Layer 2: LLM    │         │
│  │  Suite filtering  │  │  Timeout/abort    │  │  (Claude judge,  │         │
│  │                   │  │  Parallel runs    │  │   rubrics, CoT)  │         │
│  └───────────────────┘  └───────────────────┘  │  Layer 3: Stats  │         │
│                                                │  (multi-trial,   │         │
│  ┌───────────────────┐  ┌───────────────────┐  │   regression)    │         │
│  │  PROMPT REGISTRY  │  │  OBSERVABILITY    │  └──────────────────┘         │
│  │  (Langfuse)       │  │  (OTel→Langfuse)  │                               │
│  │                   │  │                   │  ┌──────────────────┐         │
│  │  Versioned prompts│  │  OTel GenAI spans │  │  COST / PERF     │         │
│  │  A/B variants     │  │  Session traces   │  │                  │         │
│  │  Label promotion  │  │  Tool call detail │  │  Token counts    │         │
│  │  (dev→stg→prod)   │  │  Agent tree       │  │  Latency p50/95  │         │
│  │  Eval correlation │  │  CMS transitions  │  │  Cost per task   │         │
│  │  .agent.md fallbk │  │  → Grafana (later)│  │  Budget ceilings │         │
│  └───────────────────┘  └───────────────────┘  │  Regression det. │         │
│                                                └──────────────────┘         │
├─────────────────────────────────────────────────────────────────────────────┤
│                       CHAOS / FAULT INJECTION MIDDLEWARE                    │
│  Worker crash mid-turn │ Tool timeout/failure │ Timer drift                 │
│  CMS unavailability │ Sub-agent crash │ Network partition                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                      REPORTING & CI/CD GATES                                │
│  PR gate (smoke, code-graded, <3min) │ Nightly (full suite, LLM-judged)     │
│  Regression detection (Mann-Whitney U) │ Dashboards │ Trace-to-dataset      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
packages/eval/
  src/
    index.ts               — Public API exports
    runner.ts              — EvalRunner: orchestrates task execution + grading
    suite.ts               — EvalSuite: loads/filters tasks from datasets
    task.ts                — EvalTask: single eval scenario definition
    graders/
      index.ts             — Grader registry + Swiss Cheese pipeline
      code-grader.ts       — Deterministic code-based graders
      llm-judge.ts         — LLM-as-judge with rubrics + CoT
      statistical.ts       — Multi-trial aggregation, regression detection
    drivers/
      sdk-driver.ts        — Uses PilotSwarmClient directly (primary)
      mcp-driver.ts        — Drives sessions via MCP server (secondary)
    datasets/
      loader.ts            — Dataset loading, versioning, filtering
      synthetic.ts         — LLM-powered synthetic dataset generation
    tracing/
      otel-instrumentation.ts  — OTel GenAI span creation
      langfuse-exporter.ts     — Langfuse trace export
    chaos/
      fault-injector.ts    — Fault injection middleware
      scenarios.ts         — Pre-built chaos scenarios
    reporting/
      reporter.ts          — Report generation (JSON, markdown, dashboard)
      ci-gate.ts           — Pass/fail logic for CI/CD
      regression.ts        — Statistical regression detection
    prompts/
      langfuse-client.ts   — Langfuse prompt fetching + caching
      version-tracker.ts   — Correlates prompt versions to eval results
    cost/
      token-tracker.ts     — Per-session token/cost accounting
      budget.ts            — Budget ceiling enforcement
  datasets/
    v1/
      smoke.json           — Smoke test scenarios (seeded from existing tests)
      tools.json           — Tool calling scenarios
      sub-agents.json      — Sub-agent spawning/lifecycle scenarios
      orchestration.json   — Durability, timers, replay, warm resume scenarios
      chaos.json           — Fault injection scenarios
      security.json        — Prompt injection, guardrails, authority claims
      timers.json          — Wait/cron/interrupt/affinity scenarios
      facts.json           — Facts pipeline, lineage, namespace ACLs
      policies.json        — Session policy enforcement, system agent lifecycle
      inline-control.json  — Inline tool execution, turn boundaries
      context.json         — Context usage, compaction, CAN state carry
      versioning.json      — Orchestration version migration scenarios
      recovery.json        — Lossy handoff, concurrent sessions, failed runtime
      dehydration.json     — Blob store roundtrip, checkpoint, artifacts
      prompt-layering.json — Prompt composition order, mode replace/append
      model-selection.json — Provider resolution, model switch, fallback
    schemas/
      task.schema.json     — JSON Schema for eval task format
  rubrics/
    task-completion.md     — LLM judge rubric: did the agent complete the task?
    trajectory-quality.md  — LLM judge rubric: was the execution path efficient?
    tool-selection.md      — LLM judge rubric: correct tool for the job?
    recovery-quality.md    — LLM judge rubric: how well did it recover from faults?
  bin/
    pilotswarm-eval.ts     — CLI entry point
  package.json
  tsconfig.json
```

---

## Eval Task Format (JSON)

```json
{
  "id": "smoke-tool-calling-001",
  "version": "1.0.0",
  "suite": "smoke",
  "name": "Tool calling — basic arithmetic",
  "description": "Agent should use test_add tool to add two numbers",

  "setup": {
    "tools": ["test_add"],
    "model": "default",
    "systemMessage": null,
    "agent": null,
    "timeout_ms": 120000
  },

  "steps": [
    {
      "action": "send_and_wait",
      "message": "What is 17 + 25?",
      "timeout_ms": 60000
    }
  ],

  "graders": [
    {
      "type": "code",
      "name": "tool_was_called",
      "check": "events.some(e => e.type === 'tool.call' && e.tool === 'test_add')"
    },
    {
      "type": "code",
      "name": "correct_answer",
      "check": "response.toLowerCase().includes('42')"
    },
    {
      "type": "code",
      "name": "session_completed",
      "check": "cms.state === 'idle' || cms.state === 'completed'"
    },
    {
      "type": "llm_judge",
      "rubric": "task-completion",
      "model": "claude-sonnet-4"
    }
  ],

  "trials": 3,
  "tags": ["tool-use", "arithmetic", "smoke", "pr-gate"],
  "cost_budget_tokens": 5000
}
```

---

## Eval Dimensions (PilotSwarm-Specific)

### 1. Session Lifecycle
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Create → send → response → idle | CMS state, events recorded | Response quality |
| Crash → recovery → resume | Recovery time, state integrity | Behavioral continuity |
| Dehydrate → hydrate → state OK | State hash comparison | — |
| Multi-turn memory | Context references previous turns | Memory accuracy |

### 2. Orchestration Health
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Deterministic replay | No nondeterminism errors | — |
| Durable timer accuracy | Fire within ±5% of expected | — |
| Activity completion | All activities resolve | — |
| Custom status consistency | Status matches expected | — |

### 3. Multi-Agent Behavior
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Sub-agent spawn | Parent-child metadata correct | Task delegation quality |
| Sub-agent completion | Results propagate to parent | Result integration quality |
| Nested spawn (depth 2+) | Tree structure correct | — |
| Agent tree cleanup | All children cancelled on parent cancel | — |

### 4. Tool Use
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Correct tool selection | Right tool called | Reasoning quality |
| Parameter accuracy | Params match expected | — |
| Tool error handling | Error caught, retry or degrade | Recovery strategy quality |
| Multi-tool sequences | Correct order, correct data flow | Orchestration quality |

### 5. Cost & Performance
| Metric | Measurement | Alert Threshold |
|--------|-------------|-----------------|
| Tokens per session | Input + output | >2x baseline |
| Latency per turn | p50, p95, p99 | >3x baseline |
| Cost per task | $ per eval task | >2x baseline |
| Model comparison | Same task, different models | — |

### 6. Prompt Quality
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Prompt version A vs B | Task completion rate | Quality score delta |
| Prompt regression | Score comparison vs baseline | Behavioral drift detection |
| Agent prompt effectiveness | Tool use accuracy | Instruction following |

### 7. Security & Guardrails *(NEW — from codebase audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Prompt injection in user message | Guardrail fires, `block` or `allow_guarded` | — |
| Prompt injection in tool output | Untrusted content wrapped `[UNTRUSTED ...]` | — |
| Unsafe authority claim detection | `containsUnsafeAuthorityClaim()` returns true | — |
| Refusal text generated on block | Refusal message present | Refusal quality |
| Sub-agent prompt injection | Child prompt can't override parent framework instructions | Escalation detection |

### 8. Timer & Scheduling Semantics *(NEW — from orchestration audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Wait interrupt — user message wakes waiting session | Session resumes, timer cancelled | Response coherence |
| Wait affinity — `preserveWorkerAffinity: true` | Same worker handles resume | — |
| Cron set + cancel | Cron fires at correct intervals, cancel stops it | — |
| Cron + wait coexistence | Both timers active simultaneously | — |
| Idle timer fires correctly | Session goes idle after timeout | — |
| Input-grace timer | Grace period before input_required timeout | — |

### 9. Facts & Knowledge Pipeline *(NEW — from SDK + docs audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Store → read → delete fact roundtrip | Fact persisted, retrieved, removed | — |
| Namespace ACLs (`skills/`, `asks/`, `intake/`) | Writes rejected outside allowed namespaces | — |
| Lineage access — child reads parent's facts | Ancestor facts visible | — |
| Shared vs session-scoped facts isolation | Session facts don't leak to siblings | — |
| Facts cleanup on session delete | Descendant facts removed | — |
| Intake → Facts Manager promotion | Intake fact promoted to shared, original cleaned | — |

### 10. Session Policies & System Agents *(NEW — from SDK audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Session creation policy — allowlist enforcement | Disallowed agents rejected | — |
| Session creation policy — generic rejection | Non-agent sessions rejected if policy says so | — |
| System session delete protection | System sessions survive `deleteSession()` | — |
| `maxSessionsPerRuntime` cap enforcement | Session creation fails at cap | — |
| System agent auto-start on worker boot | System agents running after `worker.start()` | — |
| System agent idempotent restart | Re-start doesn't create duplicates (stable UUIDs) | — |

### 11. Inline Control Tools & Turn Boundaries *(NEW — from test + proposal audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| `spawn_agent` executes inline (no turn abort) | Parent turn continues after spawn | Task continuity |
| `message_agent` executes inline | Parent receives ack, continues reasoning | — |
| `wait_for_agents` suspends turn | Turn pauses until children complete | — |
| Multiple inline spawns in one turn | All children created, parent reasoning continues | Task delegation quality |
| Explicit turn boundary (`complete_agent`) | Turn ends only when agent explicitly completes | — |

### 12. Context Window & Compaction *(NEW — from SDK audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Context usage events propagate to session info | Usage numbers in `getInfo()` | — |
| Compaction triggers near context limit | Compaction snapshot recorded | — |
| Post-compaction behavior correctness | Agent continues coherently after compaction | Memory retention quality |
| ContinueAsNew carries state correctly | All state fields survive CAN checkpoint | — |
| Warm resume after CAN | Queued actions (spawns, prompts) survive | Behavioral continuity |

### 13. Orchestration Versioning & Migration *(NEW — from orchestration audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Session created under v1.0.30 resumes under v1.0.36 | No nondeterminism errors | Behavioral consistency |
| Timer state migrates across versions | Active timers fire correctly post-upgrade | — |
| CAN state format migration | All fields carry across version boundary | — |

### 14. Lossy Handoff & Recovery *(NEW — from test audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Closed CopilotSession → 3x retry → `session.lossy_handoff` | Event recorded, UI text rendered | — |
| Lost warm session recovery | Session recovered without infinite retry | Behavioral continuity |
| Concurrent session isolation | 6+ parallel sessions don't corrupt each other | — |
| Failed runtime status override | `Failed` status overrides stale CMS state | — |
| Terminal child rejects new messages | Send to completed child returns error | — |

### 15. Dehydration & Blob Store *(NEW — from SDK audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Dehydrate → hydrate roundtrip fidelity | State hash matches pre-dehydration | — |
| Checkpoint persistence (filesystem/S3) | Checkpoint exists and is readable | — |
| Missing/corrupt archive handling | Graceful fallback, no crash | — |
| Artifact persistence and retrieval | `write_artifact` → download succeeds | — |

### 16. Prompt Layering Correctness *(NEW — from SDK audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Framework → app → agent → runtime ordering | Sections appear in correct order | — |
| Framework instructions override conflicts | Framework wins over agent on conflict | Instruction following |
| `mode: "replace"` replaces all lower layers | Only replacement content present | — |
| `mode: "append"` adds to existing layers | Both original and appended content present | — |
| App default toggle (include/exclude) | App section present/absent as configured | — |

### 17. Management & Admin Operations *(NEW — from SDK audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| `renameSession` persists and title-locks | CMS title updated, `titleLocked = true` | — |
| `cancelSession` with reason | Session state → cancelled, reason recorded | — |
| `sendCommand` routes to orchestration | Command executed, response returned | — |
| `getExecutionHistory` accuracy | Events match CMS records | — |
| `dumpSession` completeness | Parent + child trees dumped | — |

### 18. Model Provider & Selection *(NEW — from SDK audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Qualified `provider:model` resolves correctly | Correct provider endpoint used | — |
| Bare model name resolution | Falls back to default provider | — |
| Invalid/missing provider filtered out | Provider excluded, no crash | — |
| Default model fallback | Missing model → default used | — |
| Model switch mid-session | `set_model` command changes model for next turn | Response quality |

### 19. Sweeper & Resource Manager *(NEW — from SDK audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Sweeper finds zombie/orphan sessions | Correct sessions identified | — |
| Sweeper skips system sessions | System sessions untouched | — |
| Resource manager stats accuracy | Stats match actual DB/blob state | — |
| Destructive ops require confirmation (dry-run) | Dry-run reports, no deletion | — |

### 20. Child Update Batching *(NEW — from test audit)*
| Scenario | Code Grader | LLM Judge |
|----------|-------------|-----------|
| Child updates batched within 30s digest window | Single digest, not per-update | — |
| Latest child update wins (within batch) | Most recent status in digest | — |
| Digest merges into next parent prompt | Digest content present in parent turn | — |

---

## Eval Dimension Summary

| # | Dimension | Scenarios | Priority | Phase |
|---|-----------|-----------|----------|-------|
| 1 | Session Lifecycle | 4 | P0 | 1 |
| 2 | Orchestration Health | 4 | P0 | 1 |
| 3 | Multi-Agent Behavior | 4 | P0 | 1 |
| 4 | Tool Use | 4 | P0 | 1 |
| 5 | Cost & Performance | 4 | P0 | 1 |
| 6 | Prompt Quality | 3 | P1 | 2 |
| 7 | Security & Guardrails | 5 | P0 | 1 |
| 8 | Timer & Scheduling | 6 | P0 | 1 |
| 9 | Facts & Knowledge | 6 | P1 | 2 |
| 10 | Session Policies & System Agents | 6 | P1 | 1 |
| 11 | Inline Control Tools | 5 | P1 | 2 |
| 12 | Context Window & Compaction | 5 | P1 | 2 |
| 13 | Orchestration Versioning | 3 | P1 | 2 |
| 14 | Lossy Handoff & Recovery | 5 | P0 | 1 |
| 15 | Dehydration & Blob Store | 4 | P1 | 1 |
| 16 | Prompt Layering | 5 | P1 | 2 |
| 17 | Management & Admin | 5 | P2 | 3 |
| 18 | Model Provider & Selection | 5 | P1 | 2 |
| 19 | Sweeper & Resource Manager | 4 | P2 | 3 |
| 20 | Child Update Batching | 3 | P2 | 3 |
| | **TOTAL** | **90** | | |

---

## Langfuse Integration Design

### Prompt Lifecycle
```
.agent.md (committed default)
       ↓ bootstrap
Langfuse Prompt Registry
       ↓ versioned + labeled
  ┌─────────────────────┐
  │ sweeper-agent v3    │ ← label: "prod"
  │ sweeper-agent v4    │ ← label: "staging"
  │ sweeper-agent v5    │ ← label: "dev" (latest)
  └─────────────────────┘
       ↓ at session creation
PilotSwarm SDK:
  1. Check Langfuse for agent prompt (by label)
  2. If found → use it (hot-swap, no redeploy)
  3. If not found → fall back to .agent.md file
  4. Compose via existing prompt layering pipeline
```

### Trace Correlation
```
Eval Run #42
  ├─ Prompt: sweeper-agent v5
  ├─ Model: claude-sonnet-4
  ├─ Task: "spawn-cron-agent-001"
  ├─ Traces: [OTel spans → Langfuse]
  │    ├─ session.create (2ms)
  │    ├─ turn.1 (llm_call: 1.2s, 450 tokens)
  │    ├─ tool.call: spawn_agent (340ms)
  │    ├─ turn.2 (llm_call: 0.8s, 320 tokens)
  │    └─ session.complete (total: 3.1s, 770 tokens)
  ├─ Graders:
  │    ├─ code: agent_spawned ✅
  │    ├─ code: cron_interval_correct ✅
  │    ├─ llm_judge: task_completion 4/5
  │    └─ llm_judge: trajectory_quality 5/5
  └─ Score: PASS (0.92)
```

---

## OTel Instrumentation Design

### Span Hierarchy
```
eval.run (eval suite execution)
  └─ eval.task (single task)
      └─ eval.trial (one attempt)
          └─ pilotswarm.session (session lifecycle)
              ├─ pilotswarm.turn (orchestration turn)
              │   ├─ gen_ai.chat (LLM call)
              │   │   ├─ gen_ai.request.model
              │   │   ├─ gen_ai.usage.input_tokens
              │   │   ├─ gen_ai.usage.output_tokens
              │   │   └─ gen_ai.finish_reason
              │   ├─ gen_ai.execute_tool (tool invocation)
              │   │   ├─ gen_ai.tool.name
              │   │   └─ gen_ai.tool.result
              │   └─ pilotswarm.activity (duroxide activity)
              ├─ pilotswarm.spawn_agent (sub-agent creation)
              │   └─ gen_ai.agent.id / name
              ├─ pilotswarm.timer (durable timer)
              └─ pilotswarm.cms_transition (state change)
          └─ eval.grade (grading)
              ├─ eval.code_grader (deterministic check)
              └─ eval.llm_judge (LLM-as-judge call)
```

### Key Attributes (PilotSwarm-specific extensions)
```
pilotswarm.session.id          — Session UUID
pilotswarm.orchestration.id    — Duroxide orchestration ID
pilotswarm.orchestration.version — Orchestration version (e.g., 1.0.36)
pilotswarm.worker.id           — Worker that processed the turn
pilotswarm.cms.state           — CMS session state
pilotswarm.agent.parent_id     — Parent session for sub-agents
pilotswarm.agent.nesting_level — Depth in agent tree
pilotswarm.timer.expected_ms   — Expected timer duration
pilotswarm.timer.actual_ms     — Actual timer duration
pilotswarm.chaos.fault_type    — Injected fault type (if any)
```

---

## Chaos / Fault Injection Design

### Fault Injection Middleware

```typescript
interface FaultInjector {
  // Wraps a tool handler with fault injection
  wrapTool(tool: Tool, config: FaultConfig): Tool;

  // Injects worker-level faults
  injectWorkerFault(type: "crash" | "slow" | "oom"): void;

  // Injects CMS-level faults
  injectCmsFault(type: "unavailable" | "slow" | "corrupt"): void;

  // Injects timer drift
  injectTimerDrift(driftMs: number): void;
}

interface FaultConfig {
  type: "timeout" | "error" | "slow" | "drop";
  probability: number;  // 0.0 - 1.0
  delayMs?: number;     // for "slow" type
  errorMessage?: string; // for "error" type
}
```

### Pre-Built Chaos Scenarios
| Scenario | Faults Injected | Grading Focus |
|----------|----------------|---------------|
| `worker-crash-recovery` | Kill worker mid-turn | Session resumes, no data loss |
| `tool-timeout-cascade` | All tools timeout for 30s | Agent retries or degrades gracefully |
| `cms-partition` | CMS unavailable for 10s | Orchestration buffers, no crash |
| `timer-drift` | Timers fire 50% late | Cron still executes correctly |
| `sub-agent-crash` | Child agent's worker crashes | Parent detects, re-spawns or reports |
| `concurrent-writes` | Multiple workers write same session | No state corruption |

---

## CLI Interface

```bash
# Run all suites
pilotswarm eval run

# Run specific suite
pilotswarm eval run --suite=smoke

# Run with specific model
pilotswarm eval run --suite=tools --model=claude-sonnet-4

# Run with specific prompt version (from Langfuse)
pilotswarm eval run --suite=agents --prompt-label=staging

# Run multiple trials
pilotswarm eval run --suite=chaos --trials=5

# Run only PR-gate tasks (fast, code-graded only)
pilotswarm eval run --tag=pr-gate --skip-llm-judge

# Run with chaos injection
pilotswarm eval run --suite=chaos --inject-faults

# Generate synthetic dataset
pilotswarm eval generate --from-agents --count=50 --output=datasets/v2/synthetic.json

# Compare two eval runs
pilotswarm eval compare --baseline=run-001 --candidate=run-002

# Show eval history and trends
pilotswarm eval history --suite=smoke --last=30

# Seed golden dataset from existing tests
pilotswarm eval seed --from-tests --output=datasets/v1/

# List available suites and tasks
pilotswarm eval list
```

---

## CI/CD Integration

### PR Gate (GitHub Actions)
```yaml
eval-smoke:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm run build
    - run: pilotswarm eval run --tag=pr-gate --skip-llm-judge --format=json > eval-results.json
    - run: pilotswarm eval gate --input=eval-results.json --threshold=1.0
      # Fails PR if any code-graded task fails
```

### Nightly Full Suite
```yaml
eval-nightly:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  steps:
    - run: pilotswarm eval run --trials=3 --format=json > eval-results.json
    - run: pilotswarm eval compare --baseline=last-passing --candidate=eval-results.json
    - run: pilotswarm eval report --input=eval-results.json --output=eval-report.md
    # Posts regression alerts to Slack/Discord if scores drop
```

---

## Implementation Phases

### Phase 1: Foundation (P0 dimensions — 42 scenarios)
- [ ] `packages/eval` package scaffolding
- [ ] EvalRunner + EvalTask + EvalSuite core
- [ ] SDK driver (uses PilotSwarmClient directly)
- [ ] Code graders (CMS state, tool calls, orchestration health, events)
- [ ] Golden dataset v1 — seeded from existing tests, covering:
  - Session lifecycle (4 scenarios)
  - Orchestration health (4 scenarios)
  - Multi-agent behavior (4 scenarios)
  - Tool use (4 scenarios)
  - Cost & performance (4 scenarios)
  - Security & guardrails (5 scenarios)
  - Timer & scheduling semantics (6 scenarios)
  - Session policies & system agents (6 scenarios)
  - Lossy handoff & recovery (5 scenarios)
  - Dehydration & blob store (4 scenarios — partial code graders)
- [ ] Chaos fault injection middleware (at duroxide activity boundary)
- [ ] Basic CLI (`pilotswarm eval run`)
- [ ] Token/cost tracking per run
- [ ] JSON + markdown reporting
- [ ] 3-tier CI gate: Tier 1 code-only on PRs

### Phase 2: Intelligence (P1 dimensions — 38 scenarios)
- [ ] LLM-as-judge integration (Claude Sonnet)
- [ ] Rubric library (task completion, trajectory, tool selection, recovery)
- [ ] Multi-trial execution with statistical aggregation
- [ ] Langfuse integration (prompt registry + tracing)
- [ ] OTel GenAI instrumentation in PilotSwarm SDK (with abstraction layer)
- [ ] Prompt version correlation (which prompt → which score)
- [ ] Regression detection (Mann-Whitney U against baselines)
- [ ] Tier 2 CI gate: smoke eval on merge-to-main
- [ ] Tier 3 CI gate: nightly full suite
- [ ] Synthetic dataset generation
- [ ] Additional eval suites:
  - Prompt quality (3 scenarios)
  - Facts & knowledge pipeline (6 scenarios)
  - Inline control tools & turn boundaries (5 scenarios)
  - Context window & compaction (5 scenarios)
  - Orchestration versioning & migration (3 scenarios)
  - Prompt layering correctness (5 scenarios)
  - Model provider & selection (5 scenarios)
  - Trajectory scoring as first-class grading dimension
  - Judge consistency monitoring + gold-standard injection

### Phase 3: Production (P2 dimensions + operational — 22 scenarios)
- [ ] Continuous production monitoring (live trace evaluation)
- [ ] Trace-to-dataset pipeline (failures → golden dataset candidates)
- [ ] MCP driver (eval via MCP server for external agent testing)
- [ ] Grafana dashboards (via OTel Collector fanout)
- [ ] A/B prompt testing in eval pipeline
- [ ] Performance trend database + historical analysis
- [ ] Shadow deployment support (new version vs production comparison)
- [ ] Multi-model comparison matrix
- [ ] Eval-as-a-service (expose eval harness for PilotSwarm app developers)
- [ ] Additional eval suites:
  - Management & admin operations (5 scenarios)
  - Sweeper & resource manager (4 scenarios)
  - Child update batching (3 scenarios)
  - Human-in-the-loop calibration workflows
  - Regression vs. capability eval separation
  - Safety/red-team eval layer

---

## Industry Standards Compliance

| Standard | Status | Notes |
|----------|--------|-------|
| **Anthropic Task/Trial/Grader** model | ✅ Adopted | Core vocabulary for eval structure |
| **Swiss Cheese** multi-grader model | ✅ Adopted | Code + LLM + statistical layers |
| **OpenTelemetry GenAI** conventions | ✅ Adopted | Trace wire format |
| **Langfuse** integration | ✅ Planned | Prompts + tracing + eval backend |
| **MAS-FIRE** chaos categories | ✅ Phase 1 | Fault injection framework |
| **NIST AI RMF** | Partial | Safety eval dimensions covered |
| **Eval-gated deployment** | ✅ Adopted | PR gate + nightly |

---

## Key Design Principles

1. **Agent evals ≠ LLM evals** — we evaluate trajectories, not just outputs
2. **No retries, no flaky suppression** — if it fails, it's a real bug
3. **Swiss Cheese grading** — no single grader is perfect; layer them
4. **Non-determinism is managed, not eliminated** — multiple trials + statistical rigor
5. **Prompts are deployable artifacts** — version, test, promote like code
6. **Cost is a first-class metric** — every eval tracks tokens and dollars
7. **Chaos is not optional** — durable execution requires fault injection
8. **Existing infrastructure is reused** — withClient(), CMS helpers, MCP server
9. **OTel from day one** — future-proof tracing standard
10. **Production ≠ pre-production** — continuous monitoring of live traces
