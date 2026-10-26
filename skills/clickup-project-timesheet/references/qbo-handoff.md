# ClickUp to QBO timesheet handoff

Use this path when a ClickUp timesheet should feed `qbo-estimate-from-timesheet`. The source report retains Battlestar, Arrakis, Raw Entries and Run Info. A separate handoff selects one project; confirm that it corresponds to one QBO company/customer before estimate creation. If a project spans customers, split by confirmed scope before proceeding.

The client report also includes SOW caps and Client detail. Its contractor and project summaries describe the same hours; never add them together. Its per-SOW period-hour caps and absorbed-cost discounts must accompany an estimate request as reconciliation evidence. The current QBO handoff adapter imports source time only and does not apply those discounts, replace live product rates, or authorize altering QBO discount/tax settings. Before saving a capped estimate, resolve how its authorized discount will be represented alongside the required whole-hour quantity. Never present an uncapped estimate as satisfying a capped timesheet without that reconciliation.

## Generate

Use the ordinary live-export command and add:

```bash
--qbo-template /absolute/path/to/skill/assets/qbo-timesheet-template.xlsx \
--qbo-project battlestar \
--qbo-output /absolute/path/to/outputs/thread-id/battlestar-qbo-timesheet.xlsx
```

The project argument is the config project `key`, not a task, SOW or product name. All three flags are required. The source report, template and handoff must be distinct files. A schema-version-1 audit extract lacks stable code IDs and source milliseconds; rerun live extraction instead of reverse-engineering missing data from displayed hours.

The importer clears prior input decisions and imports source detail, code options and reporting metadata. It leaves company/customer, SOW registry, mappings, rates and billing decisions blank. It stops above 500 entries or 100 code options; extend all template formulas, validations, and adapter capacity together before a larger import. The SOW register supports 30 unique SOWs. Never truncate source detail.

Manual Client detail hour adjustments are not transferred by this source-only adapter. Reconcile them explicitly before using the handoff for QBO; do not silently substitute original source hours for the client's reviewed hours or overwrite original duration evidence.

The template uses XLOOKUP and requires Excel 2021/Microsoft 365 or a compatible calculation engine. Its formulas and export/reopen behavior are tested with the bundled workbook runtime; that does not constitute a live Microsoft Excel test.

## Workbook contract

| Sheet | Authoritative content |
| --- | --- |
| Estimate review | One company/customer, currency, local start date inclusive, end date exclusive, timezone, project scope; derived SOW hours, whole-hour quantities, rates and amounts. |
| SOW register | One row per confirmed SOW, current open/closed evidence, exact existing QBO service, current rate observation and optional explicit override. |
| Time entries | One row per immutable time-entry ID. Source duration ms, local work date, source IDs, current task Project Code and source Billable flag. Reviewed billing decision and evidence are separate fields. |
| Project codes | Unique project + field-ID + option-ID key mapped to a confirmed SOW. Several keys may map to the same SOW. Hold/review states never supply a SOW automatically. |

Time entries A:C identify entry/date/person; D derives SOW; E is task name; F derives hours; G is reviewed billing decision; H is task URL; I checks prerequisites. J:AA retain project/task/person/code provenance, duration, source billability, task status, entry description, local start/end and epoch timestamps. AB records the billing decision evidence. Empty source descriptions are allowed.

Source records remain intact. User-reviewed decisions belong in G/AB and the mapping register, never in the source Billable flag or source Project Code. For a confirmed instruction to use ClickUp flags, populate the reviewed decisions from those flags and cite that instruction; do not establish that policy by inference. A false flag is an observed value, not proof of contractual treatment.

Only complete, nonnegative durations enter hours. Sum integer milliseconds for the SOW and divide by 3,600,000 before taking the ceiling. Do not sum rounded display hours or round individual entries. Whole entries belong to their local start date; the workflow does not split a timer across midnight. A different allocation rule requires explicit agreement and implementation.

## Observed Battlestar model, 2026-10-01

- Workspace ID `90141134369`; space `90145102540`; Main List `901417296099`.
- Main List has required Project Code dropdown `8e714f9d-cabd-4396-b26a-b8aee1ba18aa`, with phase/SOW-like options plus LEGACY and Pending allocation. This does not prove current contract status or product mapping.
- The inspected `1.2 Salesforce Improvements` and `Miscellaneous Administrative Work` lists did not expose this field. Preserve those exceptions; do not infer allocations from their list names.
- [Production defect: restore all Base44 website forms to governed Salesforce intake](https://app.clickup.com/t/86bc0axn5) had BT-S12, while its [Salesforce intake subtask](https://app.clickup.com/t/86bc965vw) had LEGACY. A parent lookup would misallocate the child's time.
- Two sampled entries for those tasks had false billability, empty descriptions, long string entry IDs and integer millisecond durations. They demonstrate why source billability and billing approval must remain separate.

These are dated observations, not standing SOW or billing instructions. Refresh task snapshots and code options on every run. Current custom-field values can differ from the values when time was recorded. Confirm corrections against user instructions or authoritative records before using them for estimates.
