# Plant Analysis Reports

Static dashboard of monthly production, availability, downtime, and wind performance
for the South Africa wind fleet (Grassridge, Chaba, Wesley, Waainek, Dassiesridge,
San Kraal, Phezukomoya, Coleskop), plus a fleet-wide rollup. Every month is browsable
on the site and downloadable as a pre-generated PDF.

## Data

`data/plants/<CODE>.json` holds one entry per month per plant. `data/fleet.json` is
a derived rollup across all plants, and `data/manifest.json` lists the plants and
the full set of months available on the site. All three are rebuilt automatically
by `scripts/ingest_month.py`.

Source: the `P&O_Custom_Semantic_Model` PowerBI semantic model, queried via the
PowerBI modeling MCP (requires PowerBI Desktop open with that model loaded — this
is not a live/scheduled connection).

### Known data quirk

`P50 Target` / `P90 Target` for the GoldWind-turbine plants (San Kraal, Phezukomoya,
Coleskop) come back from the model in kWh instead of MWh like every other plant and
measure. `ingest_month.py`'s `normalize_target_units()` detects and corrects this
(a target more than ~20x that month's actual production, or above 200,000, is
assumed to be kWh and divided by 1000). Worth raising with whoever owns the
semantic model — it should be fixed upstream in the measure definition, not papered
over indefinitely in this ingestion script.

### Adding a new month

Once a month has ended and its data is final in PowerBI:

1. Open the `P&O_Custom_Semantic_Model` in PowerBI Desktop so the modeling MCP can connect.
2. Ask Claude to add that month — it runs one DAX query per plant (see the pattern
   used for the backfill: `SUMMARIZECOLUMNS` over `ref_calendar[year_month]` filtered
   to the target month, `TREATAS` to the plant's `project_code`, pulling `Actual
   Production`, `P50 Target`, `P90 Target`, `Capacity_Factor`, `Contractual_Availability`,
   `Technical_Availability`, `PBA`, the `DownTime` table's `Manufacturer` /
   `Environmental` / `Utility` / `Owner` / `Bat` measures, and `MeasuredWS` /
   `ForecastedWS` / `Deviation` / `Wind Index`).
3. For each plant, run:
   ```
   python scripts/ingest_month.py --plant GRAS --month 2026-07 --json '{"actualProduction": ..., "p50Target": ..., ...}'
   ```
   (field names: see `CSV_FIELD_MAP` values in `scripts/ingest_month.py`). This
   merges just that month into `data/plants/GRAS.json` and rebuilds
   `data/fleet.json` + `data/manifest.json`. Re-running for a month that already
   exists overwrites it in place rather than duplicating.
4. Render the new PDFs:
   ```
   python scripts/render_reports.py --months 2026-07
   ```
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
