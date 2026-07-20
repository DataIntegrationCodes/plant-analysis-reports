# Plant Analysis Reports

Static dashboard of monthly production, availability, downtime, and wind performance
for the South Africa wind fleet (Grassridge, Chaba, Wesley, Waainek, Dassiesridge,
San Kraal, Phezukomoya, Coleskop), plus a fleet-wide rollup. Every month is browsable
on the site and downloadable as a pre-generated PDF.

A second, separate **Reporting** layer (`report.html`) mirrors the actual PowerBI
report structure: a full `KPI_Dim`-driven matrix (Category → KPI rows, Year columns
that drill down to months, a Total column) plus a 5-chart graphical dashboard
(production vs P50/P90 target, turbine-level production & availability, availability
trend, wind resource, downtime by cause) for a selected project. It has its own
"Download PDF" producing a single rolling PDF per project with the full history to
date — this layer is additive; the original month-by-month plant/fleet pages and
PDFs are unaffected by it.

## Data

`data/plants/<CODE>.json` holds one entry per month per plant. `data/fleet.json` is
a derived rollup across all plants, `data/manifest.json` lists the plants and the
full set of months available on the site, and `data/turbines/<CODE>.json` holds
per-turbine monthly production/availability (used by the Reporting layer's
turbine-level chart). All are rebuilt automatically by `scripts/ingest_month.py`.

Source: the `P&O_Custom_Semantic_Model` PowerBI semantic model, queried via the
PowerBI modeling MCP (requires PowerBI Desktop open with that model loaded — this
is not a live/scheduled connection).

### The Reporting layer's KPI list

`assets/js/app.js`'s `PAR.KPI_CATEGORIES` encodes the same KPI list, grouping, and
order as the model's live `KPI_Dim` table and `Plant KPI Value_Upgrade` measure,
with two exceptions made deliberately: "Warranted availability" is omitted (its
measure returns `BLANK()` upstream — not implemented yet), and "Energy Content
Index" / "WindSpeed Index" are dropped from the Wind section per request. The three
Deviation KPIs (Historical/P50/P90) are **not** stored in `data/` — they're computed
client-side in `aggregateKpi()` as a ratio-of-sums over whatever months are in view,
which matches the model's own DAX (`DIVIDE(SUMX(months, actual - historical),
SUMX(months, historical))`, etc.) exactly, so the Year and Total columns are correct
without needing a separate DAX pull per aggregation level.

### Known data quirk

`P50 Target` / `P90 Target` for the GoldWind-turbine plants (San Kraal, Phezukomoya,
Coleskop) come back from the model in kWh instead of MWh like every other plant and
measure. `ingest_month.py`'s `normalize_target_units()` detects and corrects this
(a target more than ~20x that month's actual production, or above 200,000, is
assumed to be kWh and divided by 1000). Worth raising with whoever owns the
semantic model — it should be fixed upstream in the measure definition, not papered
over indefinitely in this ingestion script.

Separately, a July 2026 full backfill (after the source data was refreshed in
PowerBI) turned up turbine-level `Contractual Availability` reading exactly
`1` for every Phezukomoya turbine/month in the fresh pull. This wasn't
corrected client-side since it's what the model returns — worth flagging
upstream if it looks wrong.

Dassiesridge (`DASS`) genuinely has zero rows across every production/
availability/wind measure for its entire 2022-01 through 2026-08 range —
confirmed directly against the model, not an ingestion gap. `data/plants/
DASS.json` stays at `"months": {}` until this plant starts reporting.

**Production source measure**: `production.actual` for every plant is pulled as
`COALESCE([Measured (MWh)], [Actual Production])`. `[Measured (MWh)]`
(`production_data[BillingFigure]`, billing/metered production) is what
PowerBI's own KPI matrix actually displays — it's what the live `Plant KPI
Value_Upgrade` measure (and `Deviation P50i`/`Deviation Historical`) dispatch
to for the "Measured (MWh)" KPI. `[Actual Production]`
(`vw_kpi_tech_daily_agg_reclass[act_energy_iec]`, SCADA/technical daily
aggregation) is a separate table used only as a fallback for the most recent
month, where billing hasn't posted yet. This switch was made after Coleskop's
`[Actual Production]` was found reading `0` for Mar–May 2026 while
`[Measured (MWh)]` had real values for those months; for the other 7 plants
the two measures track within ~1-2% (normal billing/SCADA reconciliation
variance), but the model's own KPI matrix is the authoritative source, so all
8 plants were switched for consistency with what PowerBI itself displays.

**Don't ingest an in-progress month.** The DAX range used for the Measured
(MWh) backfill above (`202601`-`202608`) accidentally picked up July 2026
while it was still in progress — since `[Measured (MWh)]` (billing) hadn't
posted for July yet, `COALESCE(..., [Actual Production])` fell back to a
SCADA reading that only covered the ~20 days elapsed so far, not a full
month. That partial figure got mixed in with complete monthly totals across
every chart, KPI, and PDF before being caught and reverted. Always bound a
backfill/update query to `year_month_number <=` the last **fully-elapsed**
month, not the current month-in-progress.

**P50/P90 Target double-counting**: the native `[P50 Target]`/`[P90 Target]`
measures (`CALCULATE([Target Value]/1000, wdm_target_class[target_subclass]
= "P50"/"P90")`) only filter by `target_subclass`, not `target_type`. Some
projects have *two* rows tagged with the same subclass in
`wdm_target_monthly` — one `target_type = "energy"` (the real production
target, what we want) and one `target_type = "revenue"` (a financial target
in Local Currency that happens to share the subclass tag) — and the native
measure sums both, silently double-counting (confirmed on Waainek, P50 only,
~2x; and Chaba, both P50 and P90, ~2.58x since energy and revenue aren't
even close in magnitude there). This ingestion pulls
`COALESCE(CALCULATE(..., target_type="energy"), CALCULATE(..., target_type
="revenue"))` instead — prefers the energy target, but falls back to revenue
for any month where only the legacy revenue-only row exists (Waainek's 2022
history predates its energy-type P50 row entirely). Grassridge, Wesley, and
the newer onboarding plants had no revenue-row duplicate in the months
checked, so their figures are unchanged by this fix.

### Adding a new month

Once a month has ended and its data is final in PowerBI:

1. Open the `P&O_Custom_Semantic_Model` in PowerBI Desktop so the modeling MCP can connect.
2. Ask Claude to add that month — it runs one DAX query per plant (see the pattern
   used for the backfill: `SUMMARIZECOLUMNS` over `ref_calendar[year_month]` filtered
   to the target month, `TREATAS` to the plant's `project_code`, pulling `Actual
   Production`, `P50 Target`, `P90 Target`, `HistoricalProduction`, `Capacity_Factor`,
   `Electrical Losses`, `Consumption (MWh)`, `Ratio to Production (%)`,
   `Contractual_Availability`, `Technical_Availability`, `PBA`, the `DownTime`
   table's `Manufacturer` / `Environmental` / `Utility` / `Owner` / `Bat` measures,
   and `MeasuredWS` / `ForecastedWS` / `Deviation` / `Wind Index`), plus one
   turbine-level query per plant (`SUMMARIZECOLUMNS` grouped by
   `wdm_equipment[TurbineID]` + `ref_calendar[year_month]`, pulling
   `Yearly Production`, `Technical_Availability`, `Contractual_Availability` — note
   this measure was called `Monthly ProductionB` until a July 2026 model update
   removed it; `Yearly Production` is the confirmed replacement, despite the name
   it's evaluated per `year_month` and correctly respects turbine-level filter
   context, unlike `Measured (MWh)` or `Actual Production`).
3. For each plant, run:
   ```
   python scripts/ingest_month.py --plant GRAS --month 2026-07 --json '{"actualProduction": ..., "p50Target": ..., ...}'
   ```
   (field names: see `CSV_FIELD_MAP` values in `scripts/ingest_month.py`). This
   merges just that month into `data/plants/GRAS.json` and rebuilds
   `data/fleet.json` + `data/manifest.json`. Re-running for a month that already
   exists overwrites it in place rather than duplicating. Turbine-level data uses
   `--turbine-csv` (see `ingest_turbines` in the same script) since it's naturally
   a CSV of (turbine, month) rows rather than a single month's numbers.
4. Render the new PDFs:
   ```
   python scripts/render_reports.py --months 2026-07
   ```
   This also regenerates all 7 `reports/kpi-report/<CODE>.pdf` files (the Reporting
   layer's rolling full-history PDF), since a new month changes their Total column.
   Pass `--skip-kpi-reports` to skip that pass.
5. Commit. **Pushing to GitHub (which triggers the Vercel redeploy) should be a
   separate, explicit step** — don't push automatically as part of routine updates.

### Bulk backfill

`ingest_month.py --plant CODE --csv path/to/rows.csv` accepts a full history CSV
(one row per month, same columns as the DAX query above) — this is how the initial
Jan 2022–Jun 2026 backfill was loaded.

## PDF generation

`scripts/render_reports.py` uses Playwright (headless Chromium) against the
print-only templates in `print/` to produce `reports/<CODE>/<YYYY-MM>.pdf` and
`reports/fleet/<YYYY-MM>.pdf`. It only renders PDFs that don't already exist unless
you pass `--force`.

```
pip install -r scripts/requirements.txt
playwright install chromium   # one-time browser download
python scripts/render_reports.py
```

## Run locally

Any static file server works, e.g.:

```
npx serve .
```

Then open the printed URL.

## Deploy

Zero-config static site — deploy the repo root directly on Vercel (no build command,
no output directory override needed).

## Access control

`middleware.js` puts the whole site behind HTTP Basic Auth using Vercel Edge
Middleware, same mechanism as the sibling `data-onboarding` project:

1. In the Vercel dashboard, open the project → **Settings** → **Environment Variables**.
2. Add `SITE_PASSWORD` (required) and optionally `SITE_USERNAME` (defaults to `admin`).
3. Redeploy so middleware picks up the variables.

Local preview via a static server is unprotected — the middleware only runs on Vercel.
