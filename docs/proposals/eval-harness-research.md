# AI Agent Evaluation Harness — State-of-the-Art Research Report

**Date:** April 2026
**Purpose:** Research for PilotSwarm eval harness design
**Scope:** Frameworks, observability, prompt management, LLM-as-judge, orchestration testing, CI/CD, MCP, cost/perf

---

## Table of Contents

1. [LLM Evals vs Agent Evals — The Evolution](#1-llm-evals-vs-agent-evals)
2. [Agent Evaluation Frameworks & Benchmarks](#2-agent-evaluation-frameworks--benchmarks)
3. [Prompt Management & Versioning](#3-prompt-management--versioning)
4. [Observability & Tracing for Agents](#4-observability--tracing-for-agents)
5. [LLM-as-Judge Evaluation](#5-llm-as-judge-evaluation)
6. [Behavioral & Orchestration Testing](#6-behavioral--orchestration-testing)
7. [Eval Harness Architecture Patterns](#7-eval-harness-architecture-patterns)
8. [MCP for Evaluation](#8-mcp-model-context-protocol-for-evaluation)
9. [Cost & Performance Evaluation](#9-cost--performance-evaluation)
10. [Recommendations for PilotSwarm](#10-recommendations-for-pilotswarm)

---

## 1. LLM Evals vs Agent Evals

The industry has shifted decisively. What was once "LLM eval" (single-turn text quality) is now an entirely different discipline when applied to agents.

### Key Distinctions

| Dimension | LLM Evals | Agent Evals |
|-----------|-----------|-------------|
| **Scope** | Single-turn output quality | Multi-step, stateful, outcome-driven |
| **Metrics** | BLEU, ROUGE, F1, accuracy | Task completion rate, tool accuracy, trajectory quality, safety |
| **Interaction** | Passive (prompt → response) | Interactive (modifies environment, calls tools, spawns sub-agents) |
| **Failure Modes** | Wrong answer, hallucination | Runaway loops, wrong tool selection, state corruption, cost explosion |
| **Non-determinism** | Manageable (temp=0) | Fundamental (same input → different valid paths) |
| **Evaluation Unit** | Single response | Entire session trajectory |

### Industry Evolution (2024→2026)

- **2024:** Teams used LLM evals (MMLU, HELM) as proxies for agent quality. This proved inadequate — agents that scored well on benchmarks often failed in production.
- **2025:** Dedicated agent eval frameworks emerged (AgentBench, GAIA, TAU-bench). Anthropic published "Demystifying Evals for AI Agents" establishing canonical terminology (Task, Trial, Grader).
- **2026:** The field has matured around multi-dimensional evaluation: trajectory analysis, tool-use accuracy, cost efficiency, safety, and behavioral drift detection are all first-class metrics. ICLR 2026 published "A Hitchhiker's Guide to Agent Evaluation" as a definitive reference.

### Emerging Standards

- **No single universal standard yet**, but convergence around:
  - OpenTelemetry GenAI semantic conventions for tracing
  - MCP (Model Context Protocol) for tool/agent interop
  - NIST AI RMF and ISO/IEC 42001 for governance
  - Anthropic's Task/Trial/Grader vocabulary gaining industry adoption

**Sources:** [ICLR 2026 Hitchhiker's Guide](https://iclr-blogposts.github.io/2026/blog/2026/agent-evaluation/), [Anthropic Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [arxiv Survey on LLM Agent Evaluation](https://arxiv.org/html/2507.21504v1)

---

## 2. Agent Evaluation Frameworks & Benchmarks

### Tier 1: Production Eval Frameworks

#### Inspect AI (UK AISI)
- **The gold standard** for open-source agent evaluation
- Component architecture: **Datasets → Solvers → Scorers**
- 100+ prebuilt benchmarks (GAIA, SWE-Bench, GDM CTF, Cybench, etc.)
- Native support for agent tool use, sandboxed execution (Docker/K8s), multi-agent
- MIT-licensed, adopted by Anthropic, DeepMind, government agencies
- Excellent visualization (Inspect View web UI, VS Code extension)
- **Best for:** Comprehensive, safety-oriented agent evaluation with community benchmarks
- **URL:** https://inspect.aisi.org.uk

#### Braintrust
- **Evaluation-first architecture** with the strongest CI/CD integration
- SDK: Python, TypeScript, Go, Ruby, Java, C#; powerful CLI
- Offline evals (regression testing) + online evals (live production monitoring)
- Stepwise + end-to-end scoring (trajectory and outcome)
- "Trace to Dataset" — promote production failures into regression tests
- 1M spans/month free tier; Brainstore for fast trace search
- **Best for:** Eval-driven development, CI/CD gating, production regression prevention
- **URL:** https://www.braintrust.dev

#### Galileo
- Agent evaluation framework with multi-tier rubrics (7 dimensions → 25 sub-dimensions → 130 items)
- Focus on continuous evaluation pipelines integrated with CI/CD
- Strong LLM-as-judge integration
- **Best for:** Enterprise teams needing structured, rubric-based evaluation

### Tier 2: Domain-Specific Benchmarks

| Benchmark | Focus | Strength | Weakness |
|-----------|-------|----------|----------|
| **AgentBench** | Multi-domain (8 envs) | Broad agent ability assessment | Outcome-only, no trajectory analysis |
| **GAIA** | Zero-shot reasoning + tools | Multi-modal, multi-step tasks | Smaller task suite (466 tasks) |
| **SWE-bench** | Software engineering | Real GitHub issues, highest realism | Code-only, high setup barrier |
| **TAU-bench** | Tool orchestration | Tool selection accuracy, user alignment | Still maturing |
| **AgencyBench** | Long-horizon (1M+ tokens) | Real-world scale, cost/perf measurement | Requires significant compute |
| **WebArena** | Web browsing agents | Realistic web interaction | Browser-specific |

### Key Insight for PilotSwarm
PilotSwarm needs a **custom eval harness** that tests multi-agent orchestration, durable execution, crash recovery, and sub-agent spawning — capabilities not covered by any off-the-shelf benchmark. Use Inspect AI or Braintrust as the framework layer, but define PilotSwarm-specific task suites.

---

## 3. Prompt Management & Versioning

### State of the Art (2026)

Production teams now treat prompts as **deployable artifacts** — versioned, tested, and deployed independently from application code. The term **"PromptOps"** has emerged as a dedicated discipline.

### Leading Platforms

| Platform | Strengths | Best For |
|----------|-----------|----------|
| **Langfuse** | Open-source, full-lifecycle (tracing + prompts + evals), MCP server for dynamic prompt fetching, self-hostable | Teams wanting all-in-one OSS |
| **PromptLayer** | Best-in-class prompt registry, A/B testing in production, label-based version retrieval, REST API | Teams focused on prompt iteration velocity |
| **Braintrust** | Environment deployment (dev/staging/prod), eval-gated promotion, non-technical access | Teams wanting eval-driven prompt management |
| **Humanloop** | Evaluation-linked prompt tracking, production performance correlation | Quality-focused iteration |
| **Databricks MLflow** | Git-like prompt registry, aliases, CI/CD integration, RBAC | Enterprise MLOps teams |

### Best Practices

1. **Version every prompt** with semantic versioning (MAJOR.MINOR.PATCH)
2. **Centralize in a registry** — fetch by label (`prod`, `staging`) or version at runtime
3. **Decouple from code deploys** — change prompts without redeploying application
4. **Run regression evals** on every prompt change before promotion
5. **A/B test** major changes by routing traffic fractions to new variants
6. **Audit trail** — who changed what, when, why; immutable for compliance
7. **Environment separation** — dev/staging/prod with promotion gates

### PilotSwarm Relevance
PilotSwarm agent prompts (system messages, tool descriptions) are critical to agent behavior. The eval harness should:
- Version prompts alongside orchestration code
- Track which prompt version produced which eval results
- Support A/B testing prompt variants within the eval pipeline
- Langfuse's MCP server integration is particularly relevant for dynamic prompt management

**Sources:** [PromptLayer Registry](https://docs.promptlayer.com/features/prompt-registry/overview), [Braintrust Prompt Tools 2026](https://www.braintrust.dev/articles/best-prompt-management-tools-2026), [PromptOps Guide 2026](https://www.adaline.ai/blog/complete-guide-prompt-engineering-operations-promptops-2026)

---

## 4. Observability & Tracing for Agents

### OpenTelemetry GenAI Semantic Conventions

**This is now THE standard.** The OpenTelemetry GenAI SIG released semantic conventions specifically for LLM and agent tracing:

#### Key Attributes
```
gen_ai.system / gen_ai.provider.name  — LLM provider (openai, anthropic, etc.)
gen_ai.request.model                   — Requested model
gen_ai.response.model                  — Actual model used
gen_ai.operation.name                  — Operation type (chat, invoke_agent, etc.)
gen_ai.usage.input_tokens              — Input token count
gen_ai.usage.output_tokens             — Output token count
gen_ai.agent.id / name / version       — Agent identity metadata
gen_ai.tool.name / type                — Tool called by agent
gen_ai.session.id                      — Workflow/session correlation
gen_ai.finish_reason                   — Why generation terminated
```

#### Trace Tree Structure
```
Root span: user request
  └─ invoke_agent (orchestrator)
      ├─ chat (LLM call)
      ├─ execute_tool (tool invocation)
      ├─ invoke_agent (sub-agent)
      └─ final_response
```

### Observability Platform Comparison

| Platform | Primary Focus | Open Source | OTel Native | Agent Tracing | Cost Tracking |
|----------|--------------|-------------|-------------|---------------|---------------|
| **Langfuse** | All-in-one (tracing + evals + prompts) | Yes | Yes | Agent graphs, tool call detail | Yes |
| **Braintrust** | Eval + debugging + CI/CD | Partial | Yes | Full trajectory reconstruction | Good |
| **Arize Phoenix** | Production monitoring + drift | Yes (ELv2) | Native | Cross-framework | Basic |
| **LangSmith** | LangChain debugging + eval | No | Yes | Chain/agent step-by-step | Good |
| **Helicone** | Cost/latency monitoring | No | Proxy-based | Basic | Excellent |

### Key Metrics for Agent Health

1. **Task completion rate** — did the agent achieve the goal?
2. **Tool call accuracy** — right tool, right parameters, right sequence?
3. **Trajectory efficiency** — steps taken vs optimal path
4. **Latency per turn** — time-to-first-token, total turn time
5. **Token consumption** — input/output per turn, per session
6. **Error rate** — tool failures, LLM errors, orchestration errors
7. **Behavioral drift** — are agent responses changing over time?
8. **Cost per session** — total $ cost of the entire agent interaction
9. **Recovery rate** — how often does the agent recover from errors?
10. **Liveness** — is the agent still running when it should be?

### PilotSwarm-Specific Observability Needs
- **Orchestration health**: duroxide replay status, activity completion
- **Session lifecycle**: hydrate/dehydrate events, worker handoffs
- **Sub-agent tree**: parent-child relationships, spawn latency
- **Durable timer accuracy**: timer fire vs expected fire time
- **CMS state transitions**: session state machine health

**Sources:** [OTel for AI Systems (Uptrace)](https://uptrace.dev/blog/opentelemetry-ai-systems), [OTel Semantic Conventions](https://github.com/open-telemetry/semantic-conventions), [Waxell Agent Observability 2026](https://www.waxell.ai/blog/best-ai-agent-observability-tools-2026)

---

## 5. LLM-as-Judge Evaluation

### Current Best Practices

LLM-as-judge has become the **primary automated evaluation method** for agent behavior in 2026. Key practices:

#### Rubric Design
- **3-tier hierarchical rubrics**: High-level dimensions → sub-dimensions → granular items
- Example: 7 major qualities → 25 sub-dimensions → 130 granular evaluation items
- **Both trajectory and outcome metrics**: Score the execution path AND the final result

#### Judge Configuration
- **Chain-of-Thought reasoning**: Require written rationales, not just scores
- **Randomization**: Shuffle output order and mask system identities to reduce bias
- **Multiple trials**: Use pass@k (success in any of k trials) and pass^k (success in all k trials)

#### Best Judge Models (2026)
- **Claude Sonnet/Opus** and **GPT-4o** remain the strongest judges
- Known biases: position bias (prefers first option), verbosity bias (longer = better), self-preference bias
- Mitigation: randomize order, use multiple judge models, calibrate against human gold standards

#### Human Alignment
- Target **Spearman correlation ≥ 0.80** between judge scores and human ratings
- Regular gold standard checks (κ/α agreement scores)
- **Multi-model ensemble judging** for robustness
- Bootstrap confidence intervals and A/A stability checks

#### Integration Pattern
```
Agent Run → Trace Log → Judge Prompt (with rubric + trace) → Structured Score + Rationale → Dashboard
                                                           → CI/CD Gate (pass/fail threshold)
                                                           → Regression Dataset (failures → new test cases)
```

### Combining Automated + Human Review
- **Pre-deployment**: Automated LLM-judge for regression testing (CI/CD)
- **Post-deployment**: Automated continuous monitoring with human spot-checks
- **Escalation**: Flag low-confidence judge decisions for human review
- **Meta-evaluation**: Periodically "judge the judge" with human panels or stronger models

**Sources:** [Galileo Agent Evaluation Framework 2026](https://galileo.ai/blog/agent-evaluation-framework-metrics-rubrics-benchmarks), [Microsoft: Can LLM-as-Judge Be Trusted?](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/evaluating-ai-agents-can-llm-as-a-judge-evaluators-be-trusted/4480110), [Building Trustworthy LLM-as-Judge](https://utkarshgarg.com/posts/llm-as-a-judge-field-guide/)

---

## 6. Behavioral & Orchestration Testing

### Multi-Agent Orchestration Testing Patterns

#### Architectural Patterns Being Tested

| Pattern | Description | Test Focus |
|---------|-------------|------------|
| **Supervisor** | Central coordinator delegates to workers | Single point of failure, delegation accuracy |
| **Pipeline** | Sequential stage-by-stage processing | Handoff integrity, checkpointing, recovery |
| **Swarm** | Parallel peer-to-peer agents | Coordination, result synthesis, emergent behavior |
| **Hierarchical** | Multi-level manager → specialist delegation | Dynamic allocation, fault tolerance cascades |

#### Chaos Testing for Agent Systems

This is now **essential for production-grade agent systems**:

1. **Fault Injection Middleware**: Wrap agents/tools with configurable chaos that simulates:
   - Latency spikes (tool response delays)
   - Forced errors (tool failures, LLM errors)
   - Dropped messages (lost tool results)
   - Timeout simulation
   - State corruption

2. **MAS-FIRE Framework** (2026 academic research): 15 categories of faults covering:
   - Cognitive errors (reasoning failures)
   - Coordination errors (message routing, handoff)
   - Tool execution errors
   - Injected at prompt, message, or routing layer

3. **AI-Driven Fault Injection**: RL-based agents orchestrate chaos scenarios using system telemetry

#### Testing Agent Liveness & Scheduling

- **Liveness probes**: Verify agents that should keep running don't go dormant
- **Timer accuracy**: Durable timers fire within expected windows
- **Retry behavior**: Failed operations are retried with correct backoff
- **Resource cleanup**: Completed agents release resources properly
- **Crash recovery**: Agent resumes correctly after worker restart

#### PilotSwarm-Specific Testing Needs

PilotSwarm's durable execution model creates unique testing requirements:
- **Orchestration replay determinism**: Same yield sequence on replay
- **Worker handoff**: Session correctly transfers between workers
- **Dehydrate/hydrate**: Session state is preserved across dehydration cycles
- **Sub-agent lifecycle**: Parent-child relationships survive crashes
- **Timer durability**: Timers fire correctly after worker restart
- **CMS consistency**: Database state matches orchestration state

**Sources:** [How to Add Chaos Testing to Agent Pipelines](https://how2.sh/posts/how-to-add-agent-chaos-testing/), [MAS-FIRE (arXiv)](https://arxiv.org/html/2602.19843), [Multi-Agent Testing Guide 2025](https://zyrix.ai/blogs/multi-agent-ai-testing-guide-2025/)

---

## 7. Eval Harness Architecture Patterns

### The 5-Layer Architecture

Production eval harnesses in 2026 converge on a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: OPERATIONS                                         │
│ Health monitoring, cost tracking, drift detection, alerting │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: VERIFICATION                                       │
│ LLM-judge scoring, assertion checking, regression detection │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: TOOL INTEGRATION                                   │
│ Tool mocking, sandboxed execution, cascading failure handling│
├─────────────────────────────────────────────────────────────┤
│ Layer 2: CONTEXT MANAGEMENT                                 │
│ Prompt versioning, dataset curation, state management       │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: ORCHESTRATION                                      │
│ Agent execution control, loop management, termination       │
└─────────────────────────────────────────────────────────────┘
```

### Anthropic's Eval Model

Anthropic's canonical vocabulary (widely adopted by 2026):

- **Task**: A single test case with inputs and success criteria
- **Trial**: One attempt at a task (run multiple for variance)
- **Grader**: Scoring logic (code-based, LLM-based, or human)
- **Swiss Cheese Model**: Use multiple graders per task — no single grader is perfect; layering them catches more failure classes

### CI/CD Integration Patterns

| Pattern | Description | Maturity |
|---------|-------------|----------|
| **Eval-Gated Deployment** | Evals run in CI; agents only deploy if passing | Gold standard |
| **Trajectory Testing** | Record agent action sequences; check for drift | Widely adopted |
| **Shadow Deployment** | New agents run in parallel with production; compare | Growing |
| **Canary Evaluation** | Route % of traffic to new version; monitor quality | Standard |
| **Trace-to-Dataset** | Production failures automatically become test cases | Best practice |

### Handling Non-Determinism

This is THE core challenge for agent evals:

1. **Multiple-trial evaluation**: Run tasks 3-5 times; collect output distributions, not single answers
2. **Flexible grading**: Score ranges of acceptable outputs; partial credit rubrics
3. **Statistical rigor**: Bootstrap confidence intervals, A/A stability checks
4. **Version everything**: Code, prompts, model versions, tool definitions, eval datasets — all versioned together
5. **Behavioral assertions over exact match**: "Did the agent use the right tool?" not "Did it produce this exact string?"

### Dataset Management

#### Golden Datasets
- Hand-curated, human-validated test cases
- Versioned alongside code (semantic versioning)
- Represent real user journeys and edge cases
- Updated regularly as product evolves

#### Synthetic Generation
- LLM-powered generation from seed data (docs, FAQs, knowledge bases)
- Multi-agent generation for diversity
- **Always human-validated** before use as ground truth
- Schema-consistent (JSON/CSV with clear structure)
- Decontaminated against training data

#### Best Practice Pipeline
```
Seed Data → LLM Generation → Human Review → Golden Dataset v1.0
                                                    ↓
Production Traces → Failure Detection → Human Review → Golden Dataset v1.1
```

**Sources:** [Anthropic Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [Galileo Continuous Agent Evaluation](https://galileo.ai/blog/building-continuous-agent-evaluation-pipelines), [MultiAgentEval (GitHub)](https://github.com/najeed/ai-agent-eval-harness)

---

## 8. MCP (Model Context Protocol) for Evaluation

### MCP as Eval Infrastructure (2026)

MCP has become the **de facto standard** for AI agent interop (97M monthly SDK downloads, 13,000+ public servers). It's increasingly used as eval infrastructure:

### MCP Evaluation Harness Pattern

```
Eval Runner (MCP Client)
    ↓ JSON-RPC 2.0
MCP Server (Agent Under Test)
    ↓ Tool calls
Mocked/Real Tool Servers (also MCP)
    ↓ Results
Eval Runner → Grader → Score
```

#### Key Design Elements
- **Transport abstraction**: Eval harness supports Stdio, HTTP, SSE via connection factory
- **Multi-step tasks**: Evals involve multiple tool calls and multi-step reasoning
- **Verifiable outputs**: Results verified via direct comparison (deterministic where possible)
- **Session state**: MCP's session/state protocol enables stateful evaluation scenarios
- **Security**: OAuth 2.1 for agent-tool authentication (baseline in 2025 spec)

### MCP-Driven Testing Patterns

| Pattern | Purpose | MCP Feature |
|---------|---------|-------------|
| **Single Agent** | Direct tool use testing | Context tracing, single session |
| **Handoff** | Task delegation testing | Session transfer |
| **Reflection** | Self-correction testing | Conversation thread, history |
| **Orchestration** | Multi-agent collaboration | Shared context, agent memory |
| **Evaluation Harness** | Multi-step benchmark evals | XML Q/A, verifiable outputs |

### PilotSwarm + MCP Evaluation

PilotSwarm already uses MCP-like patterns (tool registration, session management). The eval harness could:
- Expose PilotSwarm sessions as MCP-compatible endpoints
- Use MCP clients to drive eval scenarios programmatically
- Mock tools via MCP servers for deterministic testing
- Leverage MCP's session state for multi-turn evaluation scenarios

**Sources:** [MCP 2026 Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/), [MCP Evaluation Harness (DeepWiki)](https://deepwiki.com/covagashi/Eplan_2026_IA_MCP_scripts/4.2-mcp-evaluation-harness), [Microsoft MCP-Driven Agent Patterns](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/orchestrating-multi-agent-intelligence-mcp-driven-patterns-in-agent-framework/4462150)

---

## 9. Cost & Performance Evaluation

### Why Agent Costs Explode

- **Multi-turn loops**: Agents make 3-10x more LLM calls than chatbots
- **Quadratic context growth**: Large context windows scale costs non-linearly
- **Output token premium**: Output tokens priced 3-8x higher than input
- **Tool call overhead**: Function schemas + results injected into context each turn
- **Sub-agent spawning**: Each sub-agent brings its own token budget

### Cost Tracking Best Practices

1. **Per-agent, per-model, per-session attribution** via telemetry stamping
2. **Budget ceilings** with auto-throttling/circuit-breakers per workflow
3. **Hierarchical dashboards** for multi-team visibility
4. **Token forecasting** using ML models (gradient boosting on agent telemetry achieves R² ~0.84)
5. **Output compression** strategies (JSON over prose, structured responses)

### Performance Metrics for Eval Harness

| Metric | Description | Target |
|--------|-------------|--------|
| **Tokens per session** | Total input + output tokens | Track trend, set ceiling |
| **Cost per task** | $ spent per eval task completion | Compare across model versions |
| **Latency per turn** | Time from send to response | p50, p95, p99 |
| **Time to first token** | Initial response latency | < 2s for interactive |
| **Tool call latency** | Time for tool execution | Per-tool tracking |
| **Session total time** | End-to-end task duration | Trend monitoring |
| **Cost efficiency** | Task completion rate / $ spent | Optimization target |

### Performance Regression Detection

- Run eval suite on every code/prompt/model change
- Statistical comparison against baseline (Mann-Whitney U, bootstrap CI)
- Alert on >10% regression in any key metric
- Maintain historical performance database for trend analysis

### Industry Findings
- Frameworks differ by **6x in latency and resource usage** at comparable quality
- One SaaS reduced LLM costs 61% via attribution + prompt optimization
- Infinite agent loops caused $47K+ bills in under two weeks without cost controls

**Sources:** [Zylos AI Agent Cost Optimization](https://zylos.ai/research/2026-02-19-ai-agent-cost-optimization-token-economics), [Microsoft Foundry Token Tracking](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/tracking-every-token-granular-cost-and-usage-metrics-for-microsoft-foundry-agent/4503143), [AgencyBench (arXiv)](https://arxiv.org/abs/2601.11044)

---

## 10. Recommendations for PilotSwarm

### What "Production Grade" Means in 2026

A production-grade eval harness in 2026 must have:

1. **Multi-dimensional evaluation**: Not just "did it work?" — measure task completion, trajectory quality, tool accuracy, cost, latency, safety
2. **CI/CD integration**: Evals run on every PR, blocking deployment on regression
3. **Non-determinism handling**: Multiple trials, statistical comparison, behavioral assertions
4. **Continuous monitoring**: Production traces evaluated in real-time, not just pre-deploy
5. **Prompt versioning**: Track which prompt version produced which results
6. **OpenTelemetry tracing**: Standard-compliant traces for cross-tool interop
7. **Cost attribution**: Per-agent, per-session cost tracking with budget controls
8. **LLM-as-judge**: Automated rubric-based scoring with human calibration
9. **Golden datasets**: Versioned, human-validated test suites with synthetic augmentation
10. **Chaos testing**: Fault injection for resilience validation

### Recommended Architecture for PilotSwarm Eval Harness

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EVAL HARNESS CLI / SDK                         │
│  `pilotswarm eval run --suite=smoke --model=claude-sonnet-4`           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  DATASET      │  │  TASK        │  │  GRADER      │                 │
│  │  MANAGER      │  │  RUNNER      │  │  PIPELINE    │                 │
│  │              │  │              │  │              │                   │
│  │ Golden sets  │  │ PilotSwarm   │  │ Code graders │                  │
│  │ Synthetic gen│  │ Client/Worker│  │ LLM judges   │                  │
│  │ Versioning   │  │ Multi-trial  │  │ Human review │                  │
│  │ CI/CD hooks  │  │ Trace capture│  │ Swiss cheese │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  PROMPT       │  │  OBSERV-     │  │  COST /      │                 │
│  │  REGISTRY     │  │  ABILITY     │  │  PERF        │                 │
│  │              │  │              │  │              │                   │
│  │ Versioned    │  │ OTel traces  │  │ Token counts │                  │
│  │ A/B variants │  │ Langfuse     │  │ Latency      │                  │
│  │ Env promotion│  │ Agent graphs │  │ Cost/$task   │                  │
│  │ Eval-linked  │  │ CMS state    │  │ Regression   │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                       CHAOS / FAULT INJECTION                          │
│  Tool failures, latency spikes, worker crashes, timer drift            │
├─────────────────────────────────────────────────────────────────────────┤
│                      REPORTING & CI/CD GATES                           │
│  Pass/fail gates, regression detection, dashboards, trend analysis     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Specific Tool Recommendations

| Component | Recommended Tool | Rationale |
|-----------|-----------------|-----------|
| **Eval Framework** | Braintrust SDK + custom harness | Best CI/CD integration, multi-language SDK, eval-driven development |
| **Observability** | Langfuse (self-hosted) | Open-source, all-in-one (tracing + prompts + evals), OTel support |
| **Tracing Standard** | OpenTelemetry GenAI conventions | Industry standard, vendor-agnostic, future-proof |
| **Benchmarks** | Inspect AI task library | Gold standard for agent benchmarks, extensible |
| **Prompt Management** | Langfuse prompt registry | Integrated with tracing, MCP server, version control |
| **LLM-as-Judge** | Custom (Claude Sonnet as judge) | Best balance of quality and cost for judging |
| **Cost Monitoring** | Built-in + Helicone (if multi-provider) | Token attribution, budget controls |
| **Chaos Testing** | Custom fault injection middleware | PilotSwarm-specific (duroxide, CMS, workers) |
| **Datasets** | Custom golden set + synthetic generation | Versioned, PilotSwarm-scenario-specific |

### PilotSwarm Eval Dimensions

Based on PilotSwarm's unique architecture, the eval harness should measure:

#### Session Lifecycle
- Session creation → prompt → response → completion (happy path)
- Session crash → worker restart → recovery → correct resumption
- Session dehydrate → hydrate → state integrity verification

#### Orchestration Quality
- Deterministic replay (no nondeterminism errors)
- Durable timer accuracy (fire within tolerance of expected time)
- Activity completion (all activities resolve correctly)
- Custom status consistency

#### Multi-Agent Behavior
- Sub-agent spawning (correct parent-child metadata)
- Sub-agent completion (results propagate to parent)
- Nested spawning (depth 2+)
- Agent tree cleanup on cancellation

#### Tool Use
- Correct tool selection by LLM
- Tool parameter accuracy
- Tool error handling
- Tool result integration into next turn

#### Cost & Performance
- Tokens per session (baseline + trend)
- Latency per turn (p50, p95)
- Cost per task type
- Model comparison (same task, different models)

### Implementation Phases

**Phase 1: Foundation**
- CLI-driven eval runner (`pilotswarm eval run`)
- Golden dataset v1 (smoke tests from existing test suite)
- Code-based graders (task completion, CMS state assertions)
- Basic cost/token tracking per eval run

**Phase 2: Intelligence**
- LLM-as-judge integration (rubric-based scoring)
- Prompt versioning + eval correlation
- CI/CD integration (eval-gated PRs)
- Multi-trial statistical comparison

**Phase 3: Production**
- Continuous production monitoring (live trace evaluation)
- Chaos testing suite (fault injection)
- Synthetic dataset generation
- Performance regression detection with historical baselines
- Langfuse/OTel integration for full observability

---

## Key Takeaways

1. **Agent evals are fundamentally different from LLM evals** — multi-step, stateful, non-deterministic, and require trajectory + outcome measurement
2. **Braintrust + Langfuse + Inspect AI** is the strongest open/semi-open toolchain for 2026
3. **OpenTelemetry GenAI conventions** are the tracing standard — adopt early
4. **LLM-as-judge with multi-tier rubrics** is the primary automated evaluation method
5. **Chaos testing** is no longer optional for production agent systems
6. **Cost controls** (budget ceilings, token attribution) prevent catastrophic spend
7. **MCP** is the interop layer — build eval harness components as MCP-compatible
8. **Non-determinism** is managed through multiple trials, flexible grading, and statistical comparison — never through retries or flaky test suppression
9. **Prompts are deployable artifacts** — version, test, and promote them like code
10. **Production ≠ pre-production** — you need continuous evaluation of live traces, not just pre-deploy testing

---

*Report compiled from 15+ web searches across academic papers, industry blogs, framework documentation, and vendor comparisons. All sources cited inline.*
