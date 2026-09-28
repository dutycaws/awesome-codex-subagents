# Frontier Orchestrator skill, version 1.1.0

A reusable supervisor-worker workflow with configurable models and reasoning
levels. The parent plans, diagnoses, reviews, and accepts; one to three workers
implement and verify. Role responsibilities do not depend on model names.

This skill replaces version 1.0.0. It is an instruction-based workflow, not a
new runtime, enforced spending limit, or guarantee of model routing.

## What changed

- Supervisor and worker model/effort settings now live outside the workflow rules.
- Configure worker defaults and per-role implementer/verifier/specialist overrides.
- Override settings for one task in the prompt without editing the installed skill.
- Keep approved settings pinned across planning, execution, and resumption.
- Generic role-only native profiles replace the Luna-specific profiles.
- Unsupported model/effort combinations block execution; no silent fallback.
- Existing phase guards, two-worker default, optional third worker, integration,
  validation, migration, acceptance, and stopping controls remain in place.

## Package contents

```text
skills/frontier-orchestrator/
  SKILL.md
  models.yaml
  agents/openai.yaml
  references/model-routing.md
  optional-codex-agents/
    frontier_implementer.toml
    frontier_verifier.toml
    frontier_specialist.toml
  README.md
  TEST_CASES.md
  VALIDATION.md
```

`models.yaml` is configuration INPUT FOR THIS SKILL, not native Codex configuration.
The skill reads it and instructs the parent to apply settings through actual
subagent controls. `agents/openai.yaml` controls skill presentation/invocation;
it does not select supervisor or worker models.

## Installation or upgrade

The repository copy at `skills/frontier-orchestrator/` is the canonical source.
From the repository root, link the entire directory into Codex's personal skills
directory using the [skills guide](../README.md). Review an existing destination
before replacing it. The link keeps `models.yaml` and `references/` beside
`SKILL.md`, and future pulls update the installed skill.

Codex normally discovers skill changes automatically; restart the client if the
skill selector does not refresh. A local installation does not imply cross-machine
sync or availability in hosted ChatGPT. For a client-managed installation, provide
the entire skill directory and verify the client retains the supporting files.

Optional: install the generic TOML roles into ONE native custom-agent location:

```text
~/.codex/agents/
```

or:

```text
<repository>/.codex/agents/
```

Review old `luna_implementer` and `luna_verifier` profiles during upgrade. This
workflow no longer selects them by default. Do not delete unrelated profiles or
overwrite global `config.toml`. No installation or configuration changes occur
merely by downloading this package.

The new profiles intentionally omit model and reasoning pins. The supervisor MUST
supply explicit values when spawning. If your client only supports pinned profiles,
add the resolved pair during authorized setup as described in
`references/model-routing.md`. Do not weaken inherited
sandbox or approval controls to make routing or verification work.

## Default model settings

The editable bundled `models.yaml` defaults retain the currently selected parent
model/effort (`inherit`) and request `gpt-6-luna` / `max` for every worker.
Those defaults preserve the earlier worker preference without hard-coding it into
the workflow or role profiles. A task can override any role independently.

To request Sol Ultra as supervisor and implementer, with Luna Max verification:

```yaml
schema_version: 1
supervisor:
  model: gpt-6-sol
  reasoning_effort: ultra
worker_defaults:
  model: gpt-6-luna
  reasoning_effort: max
workers:
  implementer:
    model: gpt-6-sol
    reasoning_effort: ultra
  verifier: {}
  specialist: {}
```

To request Sol Ultra for all workers, change `worker_defaults` to that pair and
clear any conflicting per-role overrides. Empty role maps use the worker defaults.
Use exact model/effort values that your actual client supports. The example does
not prove that Ultra is available for a given model, account, or client.

## Short prompts

Select the installed skill with the client's skill selector. In ChatGPT use `@`;
in Codex CLI/IDE use `$frontier-orchestrator` or `/skills`. The text below assumes
`@` selection. It is not a new native parameter syntax.

### Planning with task-specific models

```text
@frontier-orchestrator

Plan [TASK]. Required outcomes: [CRITERIA]. Constraints: [LIMITS].
Supervisor: gpt-6-sol, ultra reasoning.
Default workers: gpt-6-luna, max reasoning.
Implementer override: gpt-6-sol, ultra reasoning.
Verifier and optional specialist: use worker defaults.
Remain in Plan mode. Record the resolved model/effort matrix in the plan.
Do not implement or launch execution workers. Await my approval.
```

Select the requested parent model and effort in the client. The skill checks that
selection; writing a model name in a prompt does not change the model currently
running the conversation. A known mismatch requires the normal client transition,
not a second supervisor agent.

### Planning with a persistent configuration

```text
@frontier-orchestrator

Plan [TASK] using the bundled model configuration.
Remain in Plan mode and await my approval.
```

Or name your own configuration file explicitly. Unknown paths and invalid settings
must produce a visible configuration problem, not silently revert to defaults.

### Approval

```text
@frontier-orchestrator

Implement the approved plan using its pinned model/effort configuration.
You remain the supervisor. Re-read the skill, reconcile supervisor selection,
check worker routing, and begin the first integrated slice after the normal
mode transition. Preserve the approved scope and acceptance criteria.
```

### Resumption

```text
@frontier-orchestrator

Resume the approved implementation from its checkpoint. Preserve its pinned
model/effort configuration, scope, and budget. Reconcile Git, live workers,
and evidence. Do not recreate the team or reload changed defaults into this task.
```

## Runtime boundary and safety

Model names and effort levels are independent configuration fields. The skill
accepts strings without a baked-in model list, but the runtime must support each
pair. Do not assume `ultra`, `max`, and `xhigh` are interchangeable.

Native custom-agent pins can override explicit spawn requests. Inspect the actual
installed profile. An input file or worker name is not evidence of effective
routing. Record requested, selected/configured, and runtime-confirmed settings
separately; disclose missing telemetry. Stop on unavailable controls, rejected
combinations, or a known mismatch rather than substituting another model.

A selected Ultra mode does not relax the skill's team-size or no-nested-delegation
rules. Any unresolved incompatibility with runtime behavior must remain visible.

Keep repository-specific rules in `AGENTS.md`, workflow rules in this skill,
task decisions and pinned routing in the plan, and changing state in one checkpoint.
Resolve material conflicts instead of inventing competing plans or policy files.

Goal-mode operation retains the same approval, continuation, and stopping rules.
Specify budgets separately. The skill cannot enforce a hard runtime time/token cap.

## Validation

See `VALIDATION.md` for checks actually run on this package. `TEST_CASES.md` supplies
runtime smoke cases for your client; these are expected behaviors, not executed
agent evaluations. No desktop run, native model invocation, or model/effort routing
test has occurred on your machine.

## Official references

Checked September 28, 2026:

```text
https://learn.chatgpt.com/docs/build-skills
https://learn.chatgpt.com/docs/skills-and-plugins
https://learn.chatgpt.com/docs/agent-configuration/subagents
https://learn.chatgpt.com/docs/config-file/config-reference
```
