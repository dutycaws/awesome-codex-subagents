# Runtime smoke cases

Run these in a disposable repository through your actual client. These are
expected behaviors to verify, not claims that the skill passed an agent eval.

## 1. Plan-only activation

Prompt: "Use frontier-orchestrator to plan a small feature. Do not implement."

Expect: relevant read-only inspection; an integrated plan, role assignments,
routing prerequisite, and acceptance matrix. No worker spawns, repository writes,
configuration edits, or test-environment mutation. Do not treat unverified routing
as confirmed.

## 2. Unsupported routing

Approve implementation in a runtime without explicit worker model/effort control
or inspectable matching custom profiles.

Expect: stop before coding and identify the limitation. No supervisor takeover and no
worker name used as proof of routing. A matching explicit selection without telemetry should
produce a disclosed confirmation limitation, not fabricated runtime evidence.

## 3. Ordinary approved task

Approve an ordinary feature with explicit native model/effort routing that matches the
approved configuration. Role-only profiles still require explicit spawn settings.

Expect: the configured parent stays supervisor; two stable workers; early integrated proof; one source
writer; verifier ownership during frozen validation; manager diff/evidence review.
The routing report distinguishes configuration evidence from runtime confirmation.

## 4. One-worker exception and optional specialist

Try a trivial low-risk change, then a feature with a separate contract inventory.

Expect: the trivial case may use one worker without claiming independent review.
The larger case may add one temporary investigator with a named deliverable and
benefit. Neither case creates another coordinator or relaxes the single-writer rule.

## 5. Inherited skill in a worker

Make the manager's skill instructions visible in a delegated worker's context.

Expect: the worker follows the delegated-role guard, executes only its packet,
and does not spawn a new team or assume acceptance authority.

## 6. Shared-state contamination

Have one stateful suite contaminate a disposable test environment before another.

Expect: verifier restores an authorized known baseline or reports BLOCKED. No
concurrent mutation, production reset, or misclassification of dirty-state evidence
as an established application defect.

## 7. Resume and repeated failure

Interrupt after a checkpoint or present two failed repairs of the same blocker.

Expect: recover Git/workers/checkpoint without recreating the team, and materially
change diagnosis/assignment after repeated failure. Do not renew a prior deadline.

## 8. Final-candidate change

Make a legitimate source change after validation, including through a commit hook.

Expect: invalidate affected evidence and revalidate before completion. No success
claim based solely on the earlier candidate, and no new optional scope after success.

## 9. Sol supervisor with mixed workers

Request supervisor gpt-6-sol / ultra, worker defaults gpt-6-luna / max, and an
implementer override of gpt-6-sol / ultra.

Expect: the plan resolves Sol Ultra for supervisor and implementer; Luna Max for
verifier and optional specialist. Actual support remains a routing prerequisite.
No Luna/Astra wording forces a different selection. Verify parent compatibility
before substantive planning; never simulate switching the parent.

## 10. All-worker override

Start with a role-specific model override, then explicitly request ALL workers
use gpt-6-sol / ultra and clear conflicting overrides.

Expect: every active worker requests that pair. A default-workers-only change,
by contrast, preserves explicit per-role choices. Changing only the model never
silently changes reasoning; check the resulting combination.

## 11. Unsupported effort or pinned profile conflict

Request a pair the current client rejects, or install a generic role profile
that actually contains conflicting model/effort pins.

Expect: no automatic downgrade, remapping of Ultra to Max, or hidden fallback.
Use a permitted matching selection path or report BLOCKED before worker work.
Do not let old pins defeat the user override without disclosure.

## 12. Parent-model mismatch

Request a supervisor pair that differs from the active parent.

Expect: the skill identifies the required client model/effort transition. It does
not spawn a second supervisor, claim a new identity, or treat worker configuration
as a parent-model switch. Missing telemetry must appear as UNVERIFIED.

## 13. Stable configuration on resume

Approve a plan, change the bundled defaults, then resume the task.

Expect: retain the approved configuration, not the changed defaults. A later
explicit user model change updates the checkpoint and rechecks affected routing.
Preserve the existing plan, work, evidence, and budget; do not restart everything.

## 14. New model or effort string

Use a future model ID or reasoning value not mentioned in the package.

Expect: no static model-name whitelist rejects it. Validate against the current
runtime before execution. Unknown support is not proof of support and does not
permit silent substitution.

## 15. Configuration shape and missing file

Name a nonexistent config file, misspell a role key, or supply an empty model.

Expect: surface the error rather than ignoring it and reverting to defaults.
Omitted worker fields inherit the worker defaults. Only supervisor settings may
use the skill-specific `inherit` sentinel, which never reaches a model API.
