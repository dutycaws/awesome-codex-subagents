---
name: clickup-project-timesheet
description: Produce auditable Excel timesheets from the ClickUp REST API, grouped by person and the task-level Project Code dropdown, with separate Project Battlestar and Project Arrakis worksheets. Use for invoice support, SOW allocation, project-code coverage checks, or a reusable ClickUp time-entry export. Do not use for changing ClickUp tasks, custom fields, time entries, or workspace configuration.
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
4. `Raw Entries`
5. `Run Info`

Each required project tab must exist even when the API returns no entries. Each project tab contains:

- the concrete reporting period and timezone;
- total, coded, and uncoded hours, entry count, and coding coverage;
- an hours matrix with one row per person and one column per Project Code, plus `Uncoded` and `Total`;
- a Project Code summary with hours and entry counts;
- uncoded-entry exceptions with the exact reason.

`Raw Entries` contains the normalized source rows for every project. Keep hours numeric, timestamps typed as dates, and all ClickUp IDs as text. `Run Info` records the API source, filters, call count, request paths without query values, project/list coverage, coding rules, and limitations.

Follow the layout, field definitions, uncoded statuses, and source limitations in [references/report-contract.md](references/report-contract.md).

## Validate before delivery

1. Confirm the process exits successfully and reports an output path, API call count, record count, total hours, and per-project totals.
2. Verify the reported rate limit is below 80 calls per minute and that no 429 retry was silently omitted from the call count.
3. Reconcile total `Raw Entries` hours to the sum of project-tab total hours. Reconcile each person's matrix total to their raw rows.
4. Inspect the workbook's key ranges and scan for formula errors. The generated workbook is a static source-backed snapshot, so no business formula is required.
5. Render and visually inspect every project tab plus representative top and detail ranges from `Raw Entries` and `Run Info`. Fix clipped labels, unreadable widths, bad number/date formats, missing tabs, and hidden exceptions.
6. Keep previews and normalized audit JSON temporary unless the user asks for them. Deliver one `.xlsx` file.

Report the exact date window and timezone, included projects, total API calls, coding coverage, unresolved exceptions, and the material historical limitation: the workbook applies each task's current Project Code value to time recorded in the selected period because ClickUp does not provide custom-field history through this extraction path.
