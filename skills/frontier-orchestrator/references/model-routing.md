# Configurable model routing

Configuration schema version: 1. Workflow version: 1.1.0.

## Configure a task without editing the skill

Select the installed skill, then supply named settings in the prompt. These are
instructions for the skill to interpret, not a native command-line syntax:

```text
@frontier-orchestrator

Plan [TASK].
Supervisor: gpt-6-sol, ultra reasoning.
Default workers: gpt-6-luna, max reasoning.
Implementer override: gpt-6-sol, ultra reasoning.
Verifier and optional specialist: use worker defaults.
Remain in Plan mode. Do not implement. Await my approval.
```

The requested result is a Sol Ultra supervisor and implementer, with Luna Max
verification and optional investigation. This example requests a configuration;
it does not establish that your account, client, or model supports it.

For Sol Ultra throughout, specify:

```text
Supervisor: gpt-6-sol, ultra reasoning.
ALL workers: gpt-6-sol, ultra reasoning. Clear per-role model/effort overrides.
```

The same model in multiple roles still uses the same supervisor/worker workflow.
Do not infer that a worker can coordinate simply because it uses a capable model.

## Persistent configuration

Edit `models.yaml` beside `SKILL.md` during setup, or name a separate task/repository
configuration file in the prompt. Do not edit skill files during ordinary ticket
execution just to apply a one-task preference. This schema is skill-specific:
Codex does not natively treat it as agent configuration.

Example:

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

Each model and reasoning field is independent. A role may override either or both.
Omitted role fields use `worker_defaults`. Changing only the model retains the
resolved effort, so check compatibility rather than silently changing the effort.
An ALL-workers instruction clears conflicting role overrides for those fields.
A default-workers instruction preserves explicit role overrides.

A supervisor-only `inherit` keeps that setting from the selected parent. It is a
skill sentinel, never a model ID or native reasoning value. Record observed parent
settings when available and preserve the inherited selection across continuation.
Workers must resolve to nonempty explicit strings; do not inherit a parent setting
by accident. Nulls, empty strings, unknown field names, or a missing named file are
configuration errors to surface, not reasons to ignore user intent.

## Resolution and persistence

For a NEW task, overlay values in this order:

1. Bundled `models.yaml` defaults.
2. One explicitly named configuration file, if any.
3. Explicit settings in the user's task prompt.

Then expand each worker's defaults and overrides. Record both the source settings
and the resolved role matrix in the plan. Do not automatically scan unrelated
repositories or load every configuration file found on disk.

For EXECUTE/RESUME, the approved plan/checkpoint is the configuration source.
Do not reload changed defaults into an approved task. A new explicit user setting
amends that source. Record the amendment, preserve existing task/evidence state,
and recheck affected routing. Reuse workers where the runtime can apply the new
settings; otherwise replace only affected workers with a concise state handoff.
This configuration change is not permission to create another manager, expand
scope, relax controls, or restart the whole plan.

## Native role profiles

The optional TOML files contain role instructions only. They deliberately omit
`model` and `model_reasoning_effort`. With these profiles, explicit native spawn
settings must select BOTH fields. Without explicit settings, the host can inherit
parent defaults, which does not satisfy this skill's worker-routing contract.

Suggested native role names:

- `frontier_implementer`
- `frontier_verifier`
- `frontier_specialist` (optional third worker, never a coordinator)

An old profile might pin a model and effort. Inspect the installed file rather
than assuming it matches this package. A pinned custom profile can override the
spawn request. Use a role-only profile with explicit routing, an inspectable
matching pinned profile, or a supported alternative. If none exists, stop before
worker work and explain the mismatch.

For clients that require pinned profiles, explicitly add the resolved pair to
that role's native TOML during authorized setup, for example:

```toml
model = "gpt-6-sol"
model_reasoning_effort = "ultra"
```

Keep the role's existing `name`, `description`, and `developer_instructions`.
Reconcile pinned profiles whenever task settings change. Do not insert skill YAML
keys into native `config.toml`, overwrite global configuration, or weaken sandbox
and approval settings. Changing a worker profile does not change the parent.

## Capability and evidence boundary

Validate the exact model/effort pair using the installed client's controls,
configuration and capability information. Syntax acceptance is not execution
verification. Preserve exact model IDs and effort values unless the runtime
explicitly documents a UI-label mapping; record any such mapping.

Do not assume Ultra means Max or xhigh. OpenAI documents effort as a string whose
available values depend on the model and client. Hosted intelligence selectors
and local model configuration can expose different capabilities.

Check a specified supervisor before substantive planning. The user may need to
select the parent model and reasoning in the client. Never create a second lead
to impersonate a parent-model change. If the parent is known to conflict, pause
for the appropriate change. If telemetry is missing, report UNVERIFIED, not MATCH.

Record requested values, configuration evidence, worker IDs, and runtime-confirmed
values separately. An explicit selection with missing telemetry is an acknowledged
visibility limitation. An unavailable selection, a rejected combination, or a
confirmed mismatch blocks execution until the user resolves it. Never substitute
another model, lower effort, or manager implementation as an implicit fallback.
