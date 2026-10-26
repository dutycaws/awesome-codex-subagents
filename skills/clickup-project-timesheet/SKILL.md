---
name: clickup-project-timesheet
description: Produce simple ClickUp client timesheets with side-by-side contractor and project totals, per-SOW hourly caps and absorbed-cost discounts, backed by auditable time entries. Use for Battlestar/Arrakis time exports, SOW allocation and optional QBO handoff. Does not change ClickUp or create QBO transactions.
---

# ClickUp Project Timesheet

Build a read-only, point-in-time `.xlsx` report from ClickUp REST API v2. Treat task IDs and time-entry IDs as immutable join keys. Never infer a project code from a task name, tag, folder, list, assignee, or description.

## Establish the run contract

Before calling ClickUp:

1. Read applicable repository instructions and protect all credentials and customer data.
2. Resolve a concrete half-open reporting interval: local `start_date` at 00:00 through, but not including, local `end_date` at 00:00. Default the timezone to `America/Chicago` unless the user specifies another one. If no defensible period can be inferred, ask for it.
3. Copy [assets/project-config.example.json](assets/project-config.example.json) to a run-local, uncommitted config and fill in only non-secret workspace/space/list identifiers or exact names. Preserve the two required tab names: `Project Battlestar` and `Project Arrakis`.
4. Use `CLICKUP_API_TOKEN` or `--token-file`. If neither is supplied, the script may select exactly one plausible ClickUp token file from the current repository's `secrets/` directory. If zero or more than one candidate exists, stop. Never print, copy, commit, or place the token in a command argument, workbook, config, log, or exception.
5. Confirm the output path. For Codex-created workbooks, use the active task's `outputs/<thread-id>/` directory.

The config schema and selection rules are in [references/report-contract.md](references/report-contract.md).

## Apply the client layout and negotiated caps

Use [assets/client-timesheet-template.xlsx](assets/client-timesheet-template.xlsx) as the primary presentation template. Read [references/client-timesheet.md](references/client-timesheet.md) for configuration, mapping and cap arithmetic. The default output replaces the wide person-by-code matrix with two parallel tables: `Contractor / Hours Logged / Dollars` and `Project Name / Hours / Project Cost`.

Confirmed preferences: $245/hour is an editable default; each SOW has its own negotiated **hour cap per reporting period**, and excess costs are absorbed and shown as a discount. The 297-hour example is an editable reference, not an established cap for every SOW. Obtain each actual SOW cap and its evidence before finalizing net costs. Aggregate all client categories belonging to a SOW before applying its cap; unused capacity from another SOW does not offset overage.

Client detail column I (`Hours logged`) is the sole editable source of report hours, initialized from exact ClickUp duration milliseconds. Preserve original milliseconds and raw exports as audit evidence. Record hour-change reasons in Client detail T. All contractor hours, project hours and SOW hours must roll up from these detail rows; never edit summary hours or SOW aggregate hours directly. Keep report hours unrounded, and retain zero-hour roster/category rows.

Project Cost on the client sheet is net of the SOW cap. Apply a shared SOW cap once, then allocate its net cost proportionally to detail hours across its client projects. Allocate cents by differences of rounded cumulative shares so project rows sum exactly to the SOW's net cost. The right-hand `Discount included` is informational and must not be deducted again. Contractor Dollars remain gross. QBO whole-hour rounding is separate; never count contractor and project summaries as two sources of hours.

## Use the bundled workbook runtime

Use the spreadsheet skill and its bundled `@oai/artifact-tool` runtime. Do not add a repository-local package dependency.

1. Call the workspace-dependency loader and note its Node executable and `node_modules` directory.
2. Create a run-local temporary directory.
3. Copy this skill's `scripts/` directory into it.
4. Link the loaded `node_modules` directory at the temporary directory's root, so the copied script can resolve `@oai/artifact-tool`.
5. Run the copied script from that temporary directory.

Example shape; replace every path and date with the resolved run values:

```bash
node scripts/clickup-project-timesheet.mjs \
  --config /absolute/path/to/uncommitted-project-config.json \
  --start 2026-09-01 \
  --end 2026-10-01 \
  --time-zone America/Chicago \
  --token-file /absolute/path/to/secrets/clickup-api-token.txt \
  --output /absolute/path/to/outputs/thread-id/clickup-timesheet-2026-09.xlsx \
  --preview-dir /absolute/path/to/temporary/previews
```

Use `--input-json` only to rebuild or test from a previously normalized, non-secret extract. A normal timesheet run must use live ClickUp REST API evidence.

## Handoff to the QBO estimate template

When the user requests a QBO-ready timesheet, follow [references/qbo-handoff.md](references/qbo-handoff.md). The separate [QBO review template](assets/qbo-timesheet-template.xlsx) preserves billing decisions and product mappings. Supply `--qbo-template`, `--qbo-project`, and `--qbo-output` together to generate a single-project handoff alongside the client report. Carry the cap reconciliation as a reference; the current QBO adapter does not apply cap discounts. Resolve how the authorized estimate will represent those discounts before saving it. This skill creates local files only.

Preserve each task/subtask's own Project Code field ID, option ID, and label. A Project Code is an allocation category, not a confirmed SOW or QBO product. Require an explicit crosswalk; multiple codes can map to one SOW. Keep `LEGACY` and `Pending allocation — do not invoice` on hold until allocation is explicitly resolved. Never inherit a parent's code, use task status as SOW status, or use task `time_spent` rollups as entry detail.

Keep ClickUp's source Billable flag separate from the reviewed billing decision and its evidence. Do not silently treat false as a contractual exclusion or convert it to true. QBO quantities use exact source duration milliseconds, aggregated by confirmed SOW before rounding up. The reporting end date remains exclusive in both artifacts.

## Preserve the API safety boundary

The supplied client enforces these rules:

- All REST requests are serialized through one limiter.
- The default is 75 calls in any rolling 60-second window, with at least 800 ms between request starts.
- `--max-calls-per-minute` accepts only integers from 1 through 79. Values of 80 or more fail before authentication or network access.
- Retries count as API calls. HTTP 429 honors `Retry-After`; bounded retries also cover transient 5xx responses.
- The client uses only `GET` requests. Do not extend this workflow with ClickUp writes without a new, explicit user instruction and a separate mutation review.
- Fetch workspace members once, spaces once when name resolution is needed, lists once per project, tasks by list page, and time entries by project/date slice. Never fetch a task separately for each time entry.

If the script cannot classify a historical entry from the current task snapshot, keep the entry and mark the reason. Do not spend per-entry calls to make the workbook look complete.

## Produce the workbook

The workbook must contain, left to right:

1. `Project Battlestar`
2. `Project Arrakis`
3. any explicitly configured additional project tabs
4. `SOW caps`
5. `Client detail`
6. `Raw Entries`
7. `Run Info`

Each required project tab must exist even when the API returns no entries. Each project tab contains:

- the concrete reporting period and timezone;
- contractor totals and client project totals side by side;
- actual-hour and gross-cost subtotals, absorbed hours and dollars, charged hours, and net cost;
- an explicit unallocated row when hours lack a confirmed client category.

`SOW caps` shows each SOW's negotiated period cap, rate, gross cost, discount and net cost. `Client detail` preserves one eligible row per source entry, its exact duration, allocation evidence and source Billable flag. `Raw Entries` retains excluded entries and coding exceptions; `Run Info` retains coding coverage. Final net totals remain unavailable when allocation or required cap/rate inputs are unresolved.

`Raw Entries` contains the normalized source rows for every project. Keep hours numeric, timestamps typed as dates, and all ClickUp IDs as text. `Run Info` records the API source, filters, call count, request paths without query values, project/list coverage, coding rules, and limitations.

Schema version 2 also retains duration milliseconds, source start/end epochs, Project Code field/option IDs and raw value, parent task ID, task status, list/space IDs, and period status. Preserve the observed end timestamp; do not fabricate it from start plus an edited duration. Missing/blank/running durations remain exceptions. Attribute a whole entry to its local start date and exclude outside-period or invalid-start rows from report totals while retaining the rows for review.

Follow the layout, field definitions, uncoded statuses, and source limitations in [references/report-contract.md](references/report-contract.md).

## Validate before delivery

1. Confirm the process exits successfully and reports an output path, API call count, record count, total hours, and per-project totals.
2. Verify the reported rate limit is below 80 calls per minute and that no 429 retry was silently omitted from the call count.
3. Reconcile contractor subtotals, client-category hours plus unallocated hours, and SOW hours to Client detail's included hours. Reconcile original source milliseconds separately to Raw Entries and explain changes to Client detail hours. Use contractor IDs, not display names, as grouping keys. Account separately for excluded rows.
4. Verify each SOW's hours across all its categories, cap, excess-hour discount, and net cost. Confirm independent caps cannot subsidize one another. Recalculate and scan formula errors; changing an editable rate or cap must update the client summary. Distinguish minor displayed-cent rounding from a source-hour discrepancy.
5. Render and visually inspect every project tab plus representative top and detail ranges from `Raw Entries` and `Run Info`. Fix clipped labels, unreadable widths, bad number/date formats, missing tabs, and hidden exceptions.
6. Keep previews and normalized audit JSON temporary unless the user asks for them. Deliver one `.xlsx` file.

For a requested QBO handoff, also deliver that second workbook. Verify source ID uniqueness, exact millisecond reconciliation, Project Code mapping exceptions, separate billing decisions, and the exclusive period boundary. Capacity overflow is an error, never truncation. Leave customer, product mappings, SOW status, live rates and billing approvals unconfirmed unless the user or current authoritative evidence establishes them.

Report the exact date window and timezone, included projects, total API calls, coding coverage, unresolved exceptions, and the material historical limitation: the workbook applies each task's current Project Code value to time recorded in the selected period because ClickUp does not provide custom-field history through this extraction path.
