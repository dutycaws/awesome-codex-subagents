# Client timesheet contract

## Presentation and defaults

The primary template is `assets/client-timesheet-template.xlsx`. Its first sheet follows the user's two parallel tables. Contractor Dollars are gross; Project Cost is net of the SOW caps. Contractor Sub Total retains logged hours and gross dollars; Discount shows absorbed hours and dollars; Total Hours is the sum of individually capped SOW hours. The project section sums its net project costs and shows `Discount included` as an informational amount, without subtracting it again. The two tables describe the same time, so never add them together.

Use $245/hour as the editable default. A SOW rate override can differ. Caps are negotiated hours **per reporting period**. The editable 297-hour example is a reference only: actual SOW caps remain blank until established. Missing cap is different from zero; a confirmed zero cap absorbs all of that SOW's cost. Caps are not pooled. A SOW's unused cap cannot cover another's overrun.

Initialize Client detail Hours logged from exact source milliseconds divided by 3,600,000. Thereafter this editable column is the single source of report hours. Sum these unrounded hours across each SOW's categories, then calculate:

- charged hours = MIN(actual hours, negotiated cap hours);
- absorbed hours = MAX(actual hours − negotiated cap hours, 0);
- gross cost = actual hours × rate;
- net cost = charged hours × rate;
- discount = gross cost − net cost.

Show currency to cents and hours to two decimals without changing source precision. The cap sheet rounds monetary SOW results to cents. Summing individually displayed contractor/category values can differ by a cent from full-precision totals; inspect this independently and disclose any material mismatch. Do not round hours up in the client timesheet. QBO whole-hour quantities and current product rates remain separate.

Allocate a shared SOW's net cost across its detail rows in proportion to included hours. The cap sheet's `Net cost / logged hour` equals net cost divided by SOW logged hours (zero if there are no hours). Each detail row's Net project cost is the difference between rounded cumulative cost through that row and rounded cumulative cost through the previous row within the SOW. This conserves the SOW's cents; any residual penny follows source-row order. Project Cost sums these net detail costs by client project. A cap never applies separately to every category within the same SOW.

## Configure a live run

Add a `client` object to each project in the run-local project config. [../assets/client-layout.example.json](../assets/client-layout.example.json) supplies the user's requested labels, an example contractor roster and BS1 grouping. Replace placeholder contractor IDs with confirmed ClickUp user IDs. Confirm category-to-SOW groupings before using them as real allocations. Example hours and dollar amounts are not source data.

```json
{
  "contractors": [{"id": "confirmed-clickup-user-id", "name": "Jan V"}],
  "categories": [{"id": "bs1-salesforce", "name": "BS1 Salesforce", "sow_id": "BS1"}],
  "sows": [{"id": "BS1", "name": "Phase 1", "cap_hours": 297, "rate": 245, "evidence": "User-confirmed example; replace with actual agreement"}],
  "allocations": [{"task_id": "confirmed-task-id", "category_id": "bs1-salesforce", "evidence": "User confirmed this task allocation"}]
}
```

The example cap above illustrates syntax, not a confirmed BS1 cap. An optional `rate` overrides the workbook default. A missing rate uses the editable default; missing caps do not get filled with 297.

Allocation rules select an `entry_id`, a `task_id`, or both `field_id` and `option_id`. Entry-specific rules take precedence over task rules, which take precedence over code rules. Multiple matches at the same level fail. Every rule requires evidence and a category that belongs to a known SOW. SOW IDs and category IDs must be unique within a project. Several categories may share one SOW and one cap.

Battlestar's `BT-P1` option does not distinguish Salesforce, Zoom, migration, dentist portal and order entry. Resolve these with explicit task or entry allocation rules. If one entry spans categories, request a confirmed duration split; the bundled generator supports one allocation per entry and must be extended with source-ID and duration conservation checks before splitting. Never infer a split or duplicate a source entry. Hold LEGACY/Pending allocation until explicit evidence resolves them.

Configured contractors appear even with zero hours. Additional observed contractors are appended by stable user ID. Configured client categories appear even with zero hours. Without client mappings, retain all hours in Unallocated / other and leave net totals unfinalized. Raw source Billable flags remain observations; the client cost illustration does not approve contractual billability.

## Workbook and refresh rules

The template has a client summary, SOW caps and Client detail. Live reports additionally retain both required project tabs, Raw Entries and Run Info. The generator sizes live ranges to the actual dataset; the blank template reserves 500 detail rows and 30 SOW rows. Extend all affected ranges before exceeding those template limits.

The source is a point-in-time snapshot. A new reporting period requires a fresh run, updated negotiated caps and allocation verification. Editing the period caption does not refresh source data. Use the generator with the reviewed config to populate the template layout, including its roster and client category formulas; avoid manually renaming labels over formulas tied to other IDs.

Template front-sheet B3/F3 hold inclusive start/exclusive end. SOW caps B3 is the default rate, E3 the example cap reference. Rows 7 onward: A project key, B SOW ID, C name, D optional rate override, E effective rate, F negotiated cap hours, G agreement evidence, H rolled-up hours, I gross, J discount, K net, L charged hours, M input status, N composite key, O allocated net rate. H:O are calculated; hour edits belong only in Client detail I.

Client detail rows 7 onward contain project key, TE-prefixed entry ID, U-prefixed contractor ID, display name, task/code IDs and label, editable hours (I), confirmed client category ID, SOW ID, evidence, allocation status, rate, gross cost, original Billable flag, period status, original duration ms (R) and task name. T records the hour-change reason; U is allocated net rate, V net project cost, W source/adjusted/invalid hours status, X validated included hours. I and T are the hour adjustment inputs. J:L remain allocation review inputs. Source duration and raw exports stay intact. Blank or negative hours on an existing row must flag an error and prevent final net totals; zero hours is valid.

Use Client detail I for every hour correction. Do not overwrite the front sheet's contractor/project totals or SOW caps H/L. Validate a detail-hour change updates both summaries, the SOW cap calculation, discounts and net costs while original source milliseconds remain unchanged. Preserve any reviewed adjustments separately before a live refresh; the generator starts from source time and does not silently carry prior manual edits forward.

## Example invocations

- “Create September's Battlestar timesheet in the simple contractor/project format. Apply these SOW hourly caps and show the costs we absorb.”
- “Refresh the client timesheet from ClickUp, keeping $245/hour as the default and asking only for missing category allocations or SOW caps.”
- “Prepare the client timesheet and a separate QBO review handoff. Reconcile each SOW's cap discount before proposing the unsent estimate.”
