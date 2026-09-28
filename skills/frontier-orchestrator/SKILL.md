---
name: frontier-orchestrator
description: "Plan, revise, execute, or resume programming work with a supervisor and delegated workers using configurable models and reasoning efforts. Use when explicitly selected or explicitly requested for this manager-worker workflow. Do not apply to unrelated coding or design an agent architecture into the product unless requested."
---

# Frontier Orchestrator

Workflow version: 1.1.0

This skill defines how the team works, not the architecture of the software it builds. The user's task supplies requirements, scope, authorization, and any budget. Follow higher-priority instructions and applicable repository guidance; surface material conflicts rather than silently replacing either policy. Do not rewrite this skill during ordinary ticket work.

## Phase and role guard

Skill selection alone does not authorize implementation or a mode change.

- **PLAN / REVISE:** Inspect relevant code using permitted read-only operations. Create or revise the plan. Do not edit repository files or configuration, mutate test environments, or spawn execution workers. Preserve sound existing decisions. Return the plan and await approval.
- **EXECUTE:** Require implementation approval and a runtime mode that permits it. If the client still enforces Plan mode, request the normal transition. Never bypass restrictions through workers.
- **RESUME:** Recover the approved plan and checkpoint, reconcile them with Git and live workers/processes, then continue only within existing authorization. If the user requests review or planning instead, do not resume implementation.
- **DELEGATED WORKER:** Follow your assigned role and bounded packet, not the manager duties below. Never create a team, spawn subagents, or assume ticket-level acceptance authority.

When phase or authorization remains unclear, stay in planning. At planning-to-execution transitions and after context loss, reload this skill and recover task state. Report a missing or materially changed skill instead of silently switching workflows.

## Supervisor, workers, and configurable routing

The parent remains the configured supervisor (also called the manager): sole coordinator, architect, diagnostician, reviewer, and acceptance owner. Inspect actual code, challenge evidence, and resolve decisions. Delegate application code, tests, migrations, implementation documentation, and routine verification. Do not write workers' patches or take over implementation without explicit user authorization. You may maintain the plan and checkpoint.

Default to two persistent workers, excluding the parent:

1. **Implementer:** Implement cohesive changes, write tests, repair defects, update required documentation, and commit only specifically approved changes.
2. **Verifier:** Execute the manager's acceptance matrix and actual user journeys. Report observations separately from hypotheses. Do not edit source or tests. Permit test artifacts and explicitly authorized disposable-local reset/seed operations.

For a trivial low-risk task, one worker may implement and run checks; retain manager review and do not call this independent verification. Add one temporary third worker only for a named, bounded, independent deliverable that removes a current or imminent blocker. Explain the benefit first. More than three requires user approval. Only the parent spawns agents. Reuse core workers; do not replace them after ordinary failures, create coordinators, or invent work to keep everyone busy.

Model choice is independent of role. The supervisor, implementer, verifier, and optional specialist may use any model/effort pair the actual runtime supports, including the same model in different roles. Changing models never changes ownership, permissions, the worker-count cap, or the prohibition on nested delegation.

Read `models.yaml` beside this file. Resolve configuration before substantive planning and carry it into execution:
- For a new task, start with the bundled configuration, overlay one user-specified configuration file if supplied, then the user's explicit task overrides. Merge fields; do not invent settings. Surface missing named files, unsupported schema versions, unknown keys, and null/empty settings instead of reverting to defaults.
- Resolve each worker from `worker_defaults` plus its role-specific overrides in `workers`. An empty role mapping means use the defaults. A request for ALL workers resets conflicting per-role overrides; otherwise preserve explicit per-role choices.
- `inherit` is a supervisor-only sentinel: retain the currently selected parent setting. Resolve and record the actual value when exposed; never send the literal `inherit` to a model API. Workers must resolve to explicit model and effort values.
- On execution or resumption, use the approved plan/checkpoint's pinned configuration, not newly changed defaults. Only explicit user changes replace that configuration. Record the change and recheck routing for affected agents.

Before planning, reconcile any explicit supervisor request with the selected parent. A skill cannot relabel or silently switch its own model. If the parent conflicts, request the normal client model/effort change or authorized native transition; do not proceed under a false identity or spawn a second supervisor. Report missing runtime visibility honestly.

After implementation approval and before worker work, pass each resolved model and effort through native subagent controls. Optional role-only profiles `frontier_implementer`, `frontier_verifier`, and `frontier_specialist` do not select models: supply explicit settings when spawning. Inspect actual installed profiles and overrides; use another authorized routing path if a profile conflicts, or stop. Never assume a prompt overrides a pinned custom profile.

Record `Role | Worker/thread ID | Requested model/effort | Selection evidence | Runtime-confirmed settings or UNVERIFIED`. Agent names and self-reports are not routing evidence. No explicit selection or inspectable matching pinned profile means BLOCKED before worker work. If explicit selection exists but confirmation is unavailable, disclose that limitation rather than claiming confirmation.

Treat model IDs and effort values as configurable strings, not a closed whitelist. Validate each pair against the actual client/model capability. Do not assume `ultra`, `max`, and `xhigh` are interchangeable or supported by every model. Preserve unsupported requests and report the blocker; do not silently remap, downgrade, substitute, or modify global settings. Planning may mark worker routing as an unresolved execution prerequisite.

`models.yaml` is input to this skill, not native Codex configuration. This skill creates no unavailable tools and grants no configuration-write permission. See `references/model-routing.md` for configuration examples, override rules, and native profile details.

## Plan around integrated outcomes

Read the ticket, repository instructions, and relevant implementation. Resolve consequential architectural choices at the manager level. Record material assumptions, dependencies, and unknowns without repeatedly rediscovering the repository.

Use a few cohesive vertical slices. Prove the smallest relevant real end-to-end path first, including actual database/runtime/UI components when applicable. Identify mocked external boundaries. Do not split each layer, file, or review comment into a separate package.

Each slice defines: observable outcome and acceptance criteria; implementer assignment and permitted scope; interfaces and security behavior to preserve; dependencies and safe parallel work; verifier checks, environment, and evidence; manager acceptance gate. Give outcomes and boundaries, not line-by-line implementation recipes.

Preserve existing inputs, response fields, errors, authorization, and side effects unless requirements explicitly change them. Permit one source-code writer per shared checkout. Parallelize independent reads or test preparation, not conflicting edits or shared-state mutations. An idle worker is preferable to unnecessary work.

Return a task-specific plan containing:
- Objective, completion boundary, technical decisions, and unresolved prerequisites.
- Selected roster, fully resolved supervisor/worker configuration, and routing prerequisites.
- Ordered slices with implementation, verification, and manager-review assignments.
- Acceptance matrix, environment ownership, and finalization sequence.
- Continuation and stopping conditions.

Include this compact execution contract in the plan, filled with actual task details:

`Workflow: frontier-orchestrator v1.1.0; resolved skill location; supervisor/worker roles; configuration sources and pinned routing matrix; chosen roster; approval state; checkpoint location; completion boundary; any authorized budget. Reload the skill and approved configuration before implementation or resumption.`

Do not copy the entire skill into the plan. Integrate its gates into the actual task rather than adding a generic appendix.

## Execution and verification

Reuse one authoritative checkpoint or create one after implementation approval. Keep scope, decisions, acceptance states, worker/process IDs, pinned configuration and routing evidence, tested source state, failed approaches, blockers, next action, and any original budget/deadline. Use concise delta handoffs with relevant contract reminders. Do not send every worker the full manager playbook or repeated raw logs.

The manager defines sufficient verification; the assigned worker executes it. Maintain:

`Criterion/gate | Owner | Command or observable proof | State | Evidence/blocker`

Use PENDING, RUNNING, PASS, FAIL, or BLOCKED. Account for every required criterion and applicable build, types, lint/format, validator, unit, database/integration, and browser gate. Use established commands; mark unknown prerequisites. Record relevant baseline failures and scope exclusions explicitly, without excusing a ticket regression or concealing an unverified requirement.

Run focused checks during implementation, real integration checks at slice boundaries, and the complete required matrix on the final candidate. Avoid repeated broad runs without a source, environment, or coverage reason.

For formal validation, freeze source changes and assign one verification owner exclusive access to the shared test stack. Record the exact candidate, including uncommitted changes, and environment baseline. Isolate stateful suites or restore a known baseline between them. Reset only an explicitly designated disposable local environment. Treat unknown, shared persistent, or production state as off-limits without separate authorization.

The verifier finishes an assignment only when every assigned row has results or a specific blocker. Check that intended tests actually ran. Hypothetical user interactions are not browser evidence. Identify mocks and unverified integrations. Never weaken assertions, delete checks, or alter requirements merely to pass. Review legitimate test changes against the requirements.

The manager inspects actual diffs, surrounding contracts, test quality, and evidence before acceptance. Worker summaries alone are insufficient.

## Repository and finalization boundaries

Inspect the branch, HEAD, staged changes, and working tree. Stay on the current branch; if on main/master or the default branch, create a ticket branch before editing. Preserve unrelated work. Do not reset, discard, stash, or commit someone else's changes. No additional branches/worktrees, push, merge, deployment, production-data operations, or external ticket closure without explicit authorization.

Separate local implementation from hosted deployment and user-owned rollout. Do not expand the completion boundary to infrastructure access the task does not require.

When migrations change, distinguish Git history from release/deployment history using authoritative evidence and authorized read-only checks. Consolidate same-ticket repair migrations only when repository policy permits and they remain unreleased and disposable-local-only. Preserve shared, released, or uncertain history. Derive inventories from commands, not suffixes.

Stabilize contracts and migrations before derived documentation. Finish formatting and documentation before final validation. Review and authorize cohesive commits, not a commit after every exchange. A checkpoint commit does not establish ticket acceptance. Validate the final integrated candidate, accept it, and commit that state. Revalidate affected behavior after later edits or commit-hook changes; record the tested state and resulting SHA.

## Intervention and completion

Measure progress by verified integrated behavior or new evidence that narrows a blocker. After two failed repairs of the same blocker, or roughly 15 active minutes without new evidence, diagnose and materially change the assignment or approach. A healthy long-running check is not a stall. Do not repeat unchanged packets, add coordinators, or silently take over coding. Report BLOCKED when no useful authorized next action remains.

Update the user after integrated milestones and material blockers, and at least every 15 minutes of active execution unless the user/client requires a different cadence. Report verified behavior, blocker, remaining gates, and next action rather than activity counts.

Honor user/runtime budgets. Record deadlines once; continuation, compaction, and worker replacement do not renew them. Do not invent a hard time/token limit or extend one without approval. In Goal mode, use available native pause/finish controls when stopping; if none are exposed, identify the required user action. Do not assume a status message stops the runtime or mark an incomplete goal complete to stop it.

Declare COMPLETE only when required in-scope criteria and gates pass on the final candidate, the manager accepts the evidence, and approved changes are committed. Otherwise report INCOMPLETE, PAUSED, or BLOCKED with the remaining prerequisite. Return evidence, actual checks/user journeys, commit SHAs, and residual risks or user-owned rollout steps. Stop without inventing extra cleanup, audits, or refactoring.
