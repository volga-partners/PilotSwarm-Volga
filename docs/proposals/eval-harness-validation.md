# PilotSwarm Eval Harness — Architecture Decision Validation Report

**Date:** April 2026  
**Scope:** 7 architectural decisions for the PilotSwarm Eval Harness  
**Method:** Targeted web research against current (April 2026) industry state

---

## Executive Summary

| # | Decision | Status | Confidence |
|---|----------|--------|------------|
| 1 | Langfuse (self-hosted) for prompt mgmt + observability | 🟢 GREEN | High |
| 2 | OTel GenAI conventions for tracing | 🟡 YELLOW | Medium |
| 3 | Swiss Cheese grading (code + LLM-as-judge) | 🟢 GREEN | High |
| 4 | SDK-native eval runner (TypeScript) | 🟢 GREEN | High |
| 5 | Chaos testing for agent systems | 🟢 GREEN | High |
| 6 | Eval-gated CI/CD for agents | 🟡 YELLOW | Medium-High |
| 7 | Cross-check: gaps & blind spots | 🟡 YELLOW | — |

**Overall verdict: The architecture is sound. No RED flags. Two YELLOW items require mitigation plans, not redesigns.**

---

## 1. Langfuse (Self-Hosted) for Prompt Management + Observability

### Status: 🟢 GREEN — Confirmed as the right choice

#### Evidence FOR
- **Market leader for self-hosted LLM observability.** MIT-licensed, 20k+ GitHub stars, active development. Multiple 2026 comparison articles rank it #1 for data sovereignty and framework-agnostic tracing.
- **Deep tracing model.** Traces → spans → scores maps perfectly to PilotSwarm's orchestration → activity → turn hierarchy.
- **TypeScript SDK is production-quality.** Official `@langfuse/otel` npm package with Zod-based schema validation, type safety, and first-class Node.js support.
- **MCP server available.** Official Langfuse MCP server supports prompt management (read/write versions, labels, metadata). Community-extended Python server adds full observability data access.
- **Cost:** Self-hosted is free. Cloud starts at ~$59/mo. Braintrust starts at $249/mo, LangSmith enterprise self-hosting requires expensive contracts.

#### Evidence AGAINST / Risks
- **ClickHouse operational overhead.** Self-hosting requires ClickHouse (memory/IO-intensive, 8GB+ RAM recommended). Schema migrations during upgrades are error-prone. Backup/restore is manual and complicated.
- **UI less polished than LangSmith** (per multiple comparisons), though functional and improving.
- **LangChain integration requires manual setup** (not an issue for PilotSwarm since we use Copilot SDK, not LangChain).

#### Alternatives Considered
- **LangSmith:** Best for LangChain-native stacks. Closed-source, no meaningful self-hosting for non-enterprise. Vendor lock-in. Not suitable.
- **Braintrust:** Eval-first approach is strong, but no self-hosted option, $249/mo entry, and less tracing depth. We get eval from our own harness.
- **Arize Phoenix:** Hybrid OSS+commercial, good observability, but less mature TypeScript SDK.
- **Laminar:** Mentioned in 2026 comparisons as a newer entrant — less proven, smaller community.

#### Gotchas for PilotSwarm
- ClickHouse needs persistent volumes in k8s. Plan EFS/NFS mounts.
- Aurora cold-start (10-20s) if using zero-capacity pausing — make retry logic robust.
- Keep ClickHouse, Langfuse, and MCP server versions aligned during upgrades.
- Redis/Valkey mandatory for performance in self-hosted deployment.

#### Recommended Adjustments
- **None required.** Budget ops time for ClickHouse maintenance and upgrade testing.
- Consider Langfuse Cloud for dev/staging to reduce infrastructure burden, self-host only for production.

---

## 2. OTel GenAI Conventions for Tracing

### Status: 🟡 YELLOW — Right direction, but conventions still experimental

#### Evidence FOR
- **Industry convergence.** Datadog, Grafana, Honeycomb, New Relic, and AI frameworks (LangChain, CrewAI, AutoGen) all adopting OTel GenAI conventions.
- **Rich attribute schema.** Covers model calls, agent operations, tool calls, token/cost tracking, quality scores — exactly what PilotSwarm needs.
- **Langfuse supports OTel ingestion.** Official `@langfuse/otel` Node.js package. OTLP endpoint at `/api/public/otel/v1/traces`.
- **Future-proof.** When conventions stabilize, existing instrumentation will "just work" with any OTel-compatible backend.

#### Evidence AGAINST / Risks
- **Still experimental as of April 2026.** Attribute names and schema may change. Opt-in required via `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`. The transition plan is TBD.
- **Langfuse OTel integration has known quality issues:**
  - SDK version mismatches cause silent trace drops.
  - Protobuf format errors (400s) if content-type headers are wrong.
  - Batch exporter timeouts with large batches or slow networks.
  - Conflicts when multiple span processors (e.g., Langfuse + Sentry) coexist.
- **Breaking changes risk.** If conventions change before stabilization, our instrumentation code needs updating.

#### Alternatives Considered
- **Langfuse native SDK tracing** (non-OTel): More stable, but locks us to Langfuse. Loses portability.
- **Proprietary tracing (Datadog/New Relic):** Vendor lock-in, expensive, no self-hosting.

#### Gotchas for PilotSwarm
- Pin OTel SDK versions carefully. Don't mix v1.x and v2.x packages.
- Use `@langfuse/otel` span processor, not custom wrappers.
- Tune batch exporter: lower `max_export_batch_size`, increase `export_timeout_millis`.
- Test OTel integration in CI to catch breaking changes early.

#### Recommended Adjustments
- **Build an abstraction layer** over OTel instrumentation so attribute name changes don't require harness-wide rewrites. A thin `traceAgent()` / `traceTurn()` wrapper that maps to OTel attributes.
- **Dual-path:** Use Langfuse native SDK for critical paths (guaranteed stability), OTel for the broader tracing pipeline. Converge to OTel-only once conventions stabilize.
- **Pin `OTEL_SEMCONV_STABILITY_OPT_IN` explicitly** in all deployments.

---

## 3. Swiss Cheese Grading (Code Graders + LLM-as-Judge)

### Status: 🟢 GREEN — Best practice, well-validated

#### Evidence FOR
- **Industry consensus.** Anthropic's "Demystifying Evals for AI Agents" (2026), Microsoft Azure Foundry blog, Langfuse guides, and multiple evaluation framework docs all recommend multi-layer grading: code-based (deterministic) + LLM-as-judge (semantic) + human spot-check.
- **"Swiss Cheese" model (layered defenses) is the dominant pattern** — no single grading method catches everything, but stacked graders provide high coverage.
- **LLM-as-judge best practices are mature:**
  - Structured rubrics with chain-of-thought prompting.
  - Multi-axis grading (accuracy, helpfulness, safety separately).
  - Multiple trials + aggregation for non-determinism.
  - "Evaluate the evaluators" with gold-standard samples.
- **Agent-specific grading emerging.** Best practice is to evaluate the entire agent trajectory (tool calls, reasoning steps, state management), not just final output.

#### Evidence AGAINST / Risks
- **LLM judge non-determinism.** Scores vary across runs. Must average over 3-5 trials minimum.
- **Bias propagation.** LLM judges may mirror the evaluated model's biases (especially same-family models). Use a different model family for judging.
- **False confidence.** Over-reliance on automated scoring misses edge cases. Human spot-checks are mandatory.
- **Cost.** LLM-as-judge calls add ~2-5x the cost of the original agent call per eval.

#### Alternatives Considered
- **Pure code graders:** Fast and cheap but can't evaluate semantic quality, style, or reasoning.
- **Pure LLM-as-judge:** Flexible but expensive and non-deterministic.
- **Human-only grading:** Gold standard but doesn't scale. Useful as calibration, not primary.
- **No new paradigms supersede Swiss Cheese** — the literature reinforces layered approaches.

#### Gotchas for PilotSwarm
- Use a different model family for LLM judging (e.g., if agents run GPT-4o, judge with Claude or vice versa).
- For multi-agent sub-agent spawning, grade both parent trajectory and child outcomes.
- Budget for the extra LLM costs of judging in CI — it's real.

#### Recommended Adjustments
- **Add trajectory grading** as a first-class concept: score the sequence of tool calls and reasoning, not just final output.
- **Implement judge consistency monitoring:** Track inter-run agreement for the same eval. Alert if variance exceeds threshold.
- **Gold-standard injection:** Randomly insert hand-labeled cases in every eval run to benchmark judge accuracy.

---

## 4. SDK-Native Eval Runner (TypeScript)

### Status: 🟢 GREEN — Custom runner justified for our use case

#### Evidence FOR
- **PilotSwarm-specific requirements justify custom:**
  - Durable execution (duroxide) integration — no off-the-shelf framework understands our replay/activity model.
  - Multi-agent sub-agent spawning with parent-child CMS state.
  - Crash recovery scenarios as first-class eval targets.
  - Direct integration with existing `withClient()` test harness.
- **Braintrust TS SDK is capable but overkill/misfit:**
  - Strong at generic LLM evals (declarative, built-in scorers, dashboards).
  - But it's a SaaS platform ($249/mo), not a library. No self-hosted option.
  - Doesn't understand duroxide orchestration, CMS state, or PilotSwarm's activity model.
- **Inspect AI is Python-only for eval logic.** TypeScript only in its visualization UI. Not viable as our eval runner.

#### Evidence AGAINST / Risks
- **Maintenance burden.** Custom eval runner is code we own forever. Features like result dashboards, dataset management, and regression detection need to be built.
- **Wheel reinvention risk.** If Braintrust or similar release a TypeScript-native, self-hostable eval SDK, we'd want to migrate.
- **Reporting gap.** Off-the-shelf tools provide rich comparison UIs for free. We need to build or delegate this to Langfuse.

#### Alternatives Considered
- **Braintrust SDK:** Good TS support, but SaaS-only and doesn't fit our durable execution model.
- **Inspect AI (AISI):** Best-in-class for safety/compliance evals, but Python-centric. Could be used as a complementary tool for safety benchmarks, not as our primary runner.
- **DeepEval / RAGAS:** Python-centric, focused on RAG metrics. Not applicable.
- **Vitest (current test runner):** Already our integration test backbone. The eval harness extends it, not replaces it.

#### Gotchas for PilotSwarm
- Keep the eval runner thin: define scenarios → run via `withClient()` → collect OTel traces → score with graders → report to Langfuse. Don't build a platform.
- Use Langfuse for dashboards and comparison UI rather than building our own.
- Consider Braintrust's `autoevals` npm package for reusable scoring functions (Levenshtein, BLEU, LLM-as-judge) without buying the platform.

#### Recommended Adjustments
- **Use `autoevals` from npm** for standard scoring functions instead of reimplementing them.
- **Delegate all visualization to Langfuse** — don't build dashboards.
- **Keep a clean interface** so we could swap to an external runner if one emerges that fits.

---

## 5. Chaos Testing for Agent Systems

### Status: 🟢 GREEN — Cutting-edge and well-aligned with PilotSwarm's architecture

#### Evidence FOR
- **Emerging as a required practice.** Multiple 2026 articles and frameworks specifically address chaos testing for AI agents.
- **MAS-FIRE framework** (arXiv, 2026): Defines 15 fault types for multi-agent systems (cognitive, coordination, message routing). Directly applicable to PilotSwarm sub-agent architecture.
- **Durable execution makes chaos testing MORE valuable, not less.** Duroxide's replay model means we can inject faults and verify that replay + crash recovery work correctly under adverse conditions.
- **Existing PilotSwarm chaos tests** (L9 `chaos.test.js`) already validate fault injection. The eval harness extends this to eval-scenario-level chaos.
- **BalaganAgent** (GitHub): Open-source chaos engineering tool specifically for AI agents.

#### Evidence AGAINST / Risks
- **No mature, production-ready chaos framework for TypeScript agents** yet. Most tools are Python-centric or academic.
- **Combinatorial explosion.** 15 fault types × N agent configurations = massive test matrix. Must prioritize.
- **Cost.** Chaos scenarios that trigger LLM re-runs are expensive.

#### Alternatives Considered
- **No alternatives that supersede chaos testing.** It's a unique validation category.
- **Temporal-style resilience testing patterns** (from durable execution community) complement agent-specific chaos.

#### Gotchas for PilotSwarm
- Leverage duroxide's deterministic replay for "replay under fault" testing — inject a fault, then verify replay produces the same result.
- Focus chaos on: tool unavailability, LLM timeout, CMS write failure, worker crash mid-turn, sub-agent spawn failure, blob store unavailability.
- Run chaos tests on a separate budget/schedule from regular evals (they're expensive).

#### Recommended Adjustments
- **Build a fault injection middleware** that wraps PilotSwarm's activity layer. Inject faults at the duroxide activity boundary, not deep inside CopilotSession.
- **Prioritize the 5 most impactful fault scenarios** first, expand later.
- **Study MAS-FIRE taxonomy** to ensure we cover cognitive + coordination faults, not just infrastructure faults.

---

## 6. Eval-Gated CI/CD for Agents

### Status: 🟡 YELLOW — Right pattern, but cost/speed needs a concrete plan

#### Evidence FOR
- **Industry standard in 2026.** Multiple guides (Kinde, TrueFoundry, Harness, LaikaTest, Google Codelabs) document eval-gated CI/CD as the norm for LLM/agent deployment.
- **Key pattern:** Run evals on every PR → check against golden dataset → block merge if thresholds breached → log metrics/costs.
- **Versioned artifacts:** Prompts, datasets, model configs treated as first-class deployable artifacts with rollback capability.
- **Canary/shadow deployments** emerging for gradual rollout validation.

#### Evidence AGAINST / Risks
- **Cost is the #1 concern.** Running full agent evals (multi-turn, multi-agent, with LLM-as-judge) on every PR is expensive. A single PilotSwarm eval scenario with sub-agent spawning could cost $1-5+ in LLM API calls. 50 scenarios × 3 trials = $150-750 per PR.
- **Speed.** Agent evals are slow (minutes, not seconds). Blocking PRs for 10-30 minutes of eval time hurts developer velocity.
- **Flakiness.** LLM non-determinism means evals can fail spuriously. Without proper averaging and tolerance, devs lose trust in the gate.
- **No established "fast-check" standard.** The industry hasn't converged on a cheap, fast pre-merge smoke check for agents.

#### Alternatives Considered
- **Post-merge evals only:** Faster CI but riskier — regressions reach main branch.
- **Nightly eval runs:** Cheap but slow feedback loop.
- **Hybrid (tiered) approach:** Fast code-only checks on PR, full agent evals on merge-to-main or nightly. This is emerging as the pragmatic pattern.

#### Gotchas for PilotSwarm
- PilotSwarm's existing test suite already runs LLM-backed integration tests pre-deploy. The eval harness adds a heavier layer on top.
- duroxide orchestration changes require full eval (not just unit tests) because replay behavior is the thing being validated.

#### Recommended Adjustments
- **Implement a tiered CI strategy:**
  - **Tier 1 (every PR, <2 min):** Code graders only. Schema validation, type checks, determinism lint, prompt diff detection. No LLM calls.
  - **Tier 2 (merge to main, <15 min):** Smoke eval suite — 5-10 critical scenarios with single-trial LLM runs. Cost budget: ~$10-20.
  - **Tier 3 (nightly/pre-release, <60 min):** Full eval suite — all scenarios, 3-5 trials, chaos variants, LLM-as-judge. Cost budget: ~$100-200.
- **Set explicit cost budgets per tier** and alert on overruns.
- **Use cached/mocked LLM responses** for Tier 1 where possible.
- **Track eval flakiness** as a metric. If a scenario fails >10% of the time without code changes, it's a bad scenario, not a product bug.

---

## 7. Cross-Check: What Are We Missing?

### Status: 🟡 YELLOW — Several gaps to close

#### Items We Should Add

##### A. Trajectory Evaluation (HIGH PRIORITY)
The 2026 literature strongly emphasizes evaluating agent **trajectories** (the sequence of tool calls, reasoning steps, and state transitions), not just final outputs. PilotSwarm's CMS already records this data. The eval harness should score trajectories as a first-class concept.

**Sources:** Anthropic's "Demystifying Evals," Galileo Agent Evaluation Framework, ICLR 2026 Agent Evaluation blogpost.

##### B. Cost-Per-Outcome Tracking (MEDIUM PRIORITY)
"Cost per successful outcome" is now a primary production metric for agent systems. The eval harness should track and report:
- Token usage per eval scenario
- LLM API cost per successful outcome
- Cost trends across eval runs (regression detection)

**Sources:** LLMOps guides, Kinde CI/CD for Evals, Mavik Labs Agent Evaluation Harnesses.

##### C. Safety/Red-Team Eval Layer (MEDIUM PRIORITY)
Multiple sources highlight that production agent evaluation must include safety testing:
- Policy violation detection
- Prompt injection resilience
- Tool misuse scenarios
- Escalation/rollback behavior

PilotSwarm already has session policy guards (L10 tests), but the eval harness should formalize these as scored safety scenarios.

**Sources:** Inspect AI Cyber, AISI safety benchmarks, TrueFoundry Agent DevOps.

##### D. Human-in-the-Loop Calibration (LOW PRIORITY for v1)
Industry best practice includes periodic human review of eval results to calibrate automated scoring. Not needed for v1, but the architecture should support it:
- Export eval results for human annotation
- Compare human vs. automated scores
- Use human-labeled data to improve judge prompts

**Sources:** LangChain Agent Evaluation Readiness Checklist, Agenta LLM-as-Judge Guide.

##### E. Regression vs. Capability Eval Separation (MEDIUM PRIORITY)
LangChain's readiness checklist explicitly separates:
- **Capability evals:** "Can the agent do new things?"
- **Regression evals:** "Did existing behavior break?"

The eval harness should maintain two distinct eval suites with different triggers and thresholds.

##### F. Observability Checklist (LOW PRIORITY)
A 2026 "AI Agent Observability Checklist" pattern includes:
- Real-time health dashboards
- Drift detection on production traces
- Alert on scoring degradation

This is post-v1 but should be planned for.

---

## Summary of Recommended Adjustments

| Decision | Adjustment | Priority |
|----------|-----------|----------|
| Langfuse | Budget ops time for ClickHouse; consider cloud for dev/staging | Low |
| OTel GenAI | Build abstraction layer; dual-path native+OTel; pin semconv opt-in | High |
| Swiss Cheese | Add trajectory grading; judge consistency monitoring; gold-standard injection | Medium |
| SDK-native runner | Use `autoevals` for scoring; delegate viz to Langfuse; keep interface swappable | Medium |
| Chaos testing | Build fault injection at activity boundary; prioritize top-5 faults; study MAS-FIRE | Medium |
| Eval-gated CI/CD | Implement 3-tier strategy (code/smoke/full); set cost budgets; track flakiness | High |
| Cross-check gaps | Add trajectory eval, cost tracking, safety layer, regression/capability split | High |

---

## Sources

### Langfuse
- [Langfuse vs LangSmith 2026](https://markaicode.com/vs/langfuse-vs-langsmith/)
- [Top 7 LLM Observability Tools 2026](https://dev.to/nebulagg/top-7-llm-observability-tools-in-2026-which-one-actually-fits-your-stack-2d0g)
- [Laminar vs Langfuse vs LangSmith](https://laminar.sh/blog/2026-01-29-laminar-vs-langfuse-vs-langsmith-llm-observability-compared)
- [Langfuse MCP Server Docs](https://langfuse.com/docs/api-and-data-platform/features/mcp-server)
- [Self-Hosting Langfuse v3 on AWS](https://dev.to/aws-builders/self-hosting-langfuse-v3-on-aws-using-cdk-508a)
- [Langfuse OTel Troubleshooting](https://devmanushraky.com/blog/langfuse-opentelemetry-integration-troubleshooting-guide)

### OTel GenAI
- [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OTel GenAI Conventions README](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/README.md)
- [OTel for AI Systems (Uptrace)](https://uptrace.dev/blog/opentelemetry-ai-systems)
- [OTel for AI Agents (Zylos)](https://zylos.ai/research/2026-02-28-opentelemetry-ai-agent-observability)

### LLM-as-Judge
- [Microsoft Azure Foundry: Can LLM Judges Be Trusted?](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/evaluating-ai-agents-can-llm%E2%80%91as%E2%80%91a%E2%80%91judge-evaluators-be-trusted/4480110)
- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Evidently: LLM-as-a-Judge Complete Guide](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
- [Agenta: LLM-as-Judge Best Practices](https://agenta.ai/blog/llm-as-a-judge-guide-to-llm-evaluation-best-practices)

### Eval Frameworks
- [Braintrust SDK (GitHub)](https://github.com/braintrustdata/braintrust-sdk-javascript)
- [autoevals (npm)](https://www.npmjs.com/package/autoevals)
- [Inspect AI (UK AISI)](https://inspect.aisi.org.uk/)
- [Agent Eval Tools Compared](https://agent-harness.ai/blog/agent-eval-tools-compared-choosing-the-right-testing-platform/)

### Chaos Testing
- [MAS-FIRE: Fault Injection for LLM Multi-Agent Systems (arXiv)](https://arxiv.org/abs/2602.19843)
- [BalaganAgent (GitHub)](https://github.com/arielshad/balagan-agent)
- [Chaos Engineering for AI Agents (Aicademy)](https://blog.aicademy.ac/chaos-engineering-for-ai-agents)
- [Durable Execution Patterns for AI Agents (Zylos)](https://zylos.ai/research/2026-02-17-durable-execution-ai-agents)

### CI/CD
- [LLMOps: CI/CD, Eval Gates & Deployment](https://myengineeringpath.dev/genai-engineer/llmops/)
- [Kinde: CI/CD for Evals in GitHub Actions](https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/ci-cd-for-evals-running-prompt-and-agent-regression-tests-in-github-actions/)
- [TrueFoundry: Agent DevOps](https://www.truefoundry.com/blog/agent-gateway-series-part-7-of-7-agent-devops-ci-cd-evals-and-canary-deployments)

### Cross-Check
- [LangChain Agent Evaluation Readiness Checklist](https://blog.langchain.com/agent-evaluation-readiness-checklist/)
- [Agent Evaluation Harnesses in 2026 (Mavik Labs)](https://www.maviklabs.com/blog/agent-evaluation-harnesses-2026/)
- [ICLR 2026: Hitchhiker's Guide to Agent Evaluation](https://iclr-blogposts.github.io/2026/blog/2026/agent-evaluation/)
- [Galileo Agent Evaluation Framework](https://galileo.ai/blog/agent-evaluation-framework-metrics-rubrics-benchmarks)
