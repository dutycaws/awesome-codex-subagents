# Report contract

## Configuration

The generator accepts one JSON config:

```json
{
  "workspace_id": "optional-clickup-workspace-id",
  "workspace_name": "optional-exact-workspace-name",
  "project_code_field": "Project Code",
  "time_entry_slice_days": 31,
  "projects": [
    {
      "key": "battlestar",
      "name": "Project Battlestar",
      "tab_name": "Project Battlestar",
      "space_id": "optional-space-id",
      "space_names": ["Project Battlestar", "Battlestar"],
      "list_ids": []
    }
  ]
}
```

Selection rules:

- `workspace_id` is preferred. Otherwise select an exact case-insensitive `workspace_name`; if neither is set, proceed only when the token exposes one workspace.
- `space_id` is preferred. Otherwise select exactly one space by the ordered `space_names` aliases.
- A nonempty `list_ids` array is the most stable and least expensive list selection. Each item may be a string ID or `{ "id": "...", "name": "..." }`.
- Without `list_ids`, the client reads active folderless lists plus lists returned with active folders in the selected space. Optional `list_names` then applies an exact case-insensitive filter.
- `project_code_field` defaults to `Project Code`.
- `time_entry_slice_days` defaults to 31 and must be 1 through 366. Slicing bounds large responses and the generator de-duplicates time entries by ID.
- Config files contain no token or authorization header.

The two required project definitions have tab names `Project Battlestar` and `Project Arrakis`. Additional project tabs are allowed when explicitly requested. Excel tab names must be unique and no longer than 31 characters.

## REST reads

The live workflow uses ClickUp REST API v2:

- `GET /team` for authorized workspaces and workspace members;
- `GET /team/{team_id}/space` when a project uses name-based space resolution;
- `GET /space/{space_id}/folder` and `GET /space/{space_id}/list` when list IDs are not configured;
- paginated `GET /list/{list_id}/task` with closed tasks and subtasks included;
- `GET /team/{team_id}/time_entries` for each project/date slice, filtered by workspace members and space.

Every request attempt passes through the rolling-window limiter. The call log stores method, path, status, attempt, and elapsed time. It omits the authorization header and query values.

## Join and coding rules

Join a time entry to its current task snapshot by immutable ClickUp task ID.

For the configured single-select dropdown:

1. Match the custom field by exact case-insensitive field name.
2. Treat `null`, an empty string, or an empty array as blank.
3. Resolve the stored value to an option by option ID first and `orderindex` second. This supports ClickUp payloads that represent a dropdown selection either way.
4. If a nonempty stored value does not match current options, preserve the raw value and mark it `Unknown dropdown option`.

Use these coding statuses:

| Status | Project Code column | Meaning |
| --- | --- | --- |
| `Coded` | resolved option name | Current task snapshot has a recognized Project Code value. |
| `Project Code blank` | blank | Field exists on the current task but has no value. |
| `Project Code field unavailable` | blank | Current task snapshot does not expose the configured field. |
| `Task unavailable in current snapshot` | blank | Time entry references a task not returned by the selected current lists/pages. |
| `Unknown dropdown option` | raw stored value | Field is populated but its value cannot be mapped to a current option. |
Do not convert any uncoded status into a project code. Use `Uncoded` only as the matrix roll-up label. Track `Running or invalid duration` separately as the duration status; those rows remain visible but are excluded from hour totals.

## Workbook layout

### Project worksheets

Each project worksheet presents:

- title and fixed reporting context;
- KPI row: total hours, coded hours, uncoded hours, coding coverage, valid entries, excluded running/invalid entries;
- `Hours by person and Project Code` matrix;
- `Project Code summary`;
- `Uncoded entries` with person, work date, task, hours, and coding status.

Total hours include only nonnegative, finite durations. Coding coverage is coded hours divided by total valid hours. A zero-hour project displays `n.a.` rather than a false 0% coverage.

### Raw Entries

One row per normalized time entry with these fields:

- Project
- Person
- Person ID
- Work Date
- Start (local)
- End (local)
- Hours
- Duration Status
- Project Code
- Coding Status
- Task ID
- Task Name
- List
- Folder
- Space
- Time Entry ID
- Billable
- Description
- Tags
- Task URL

IDs are text. The raw sheet prefixes numeric user IDs with `U-` and time-entry IDs with `TE-` so spreadsheet engines cannot coerce them to scientific notation or lose digits. Hours are numbers. Dates and timestamps are typed values and formatted for the workbook locale.

### Run Info

Record the generated time, half-open local interval, timezone, workspace, field name, configured request rate, actual call attempts, returned entry count, total valid hours, project/list/task coverage, and sanitized call log. State these limitations:

- Project Code is read from the current task snapshot, not a historical custom-field snapshot.
- Archived, deleted, moved, or otherwise unavailable tasks remain uncoded rather than inferred.
- The API may return running entries without a final duration; they remain visible but do not enter hour totals.
- The workbook supports invoice review but does not decide whether time is contractually billable.
