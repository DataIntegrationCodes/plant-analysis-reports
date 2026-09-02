"""
One-off migration for the V2 reporting layer: adds `availability.pbaRep` and a
new `lossBreakdown` block to each month entry already present in
data/plants/<CODE>.json, sourced from two live DAX pulls (PBA_Rep measure,
and Waterfall Value % grouped by 'Waterfall Axis'[Step]) saved as CSVs by the
powerbi-modeling-mcp tool. Purely additive - does not touch any existing
field, so the V1 pages (report.html, graphical.html, plant.html) are
unaffected. Only merges months that already exist in each plant's JSON file;
any DAX row for a month not already present (e.g. an in-progress month) is
ignored.
"""
import csv
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANTS_DIR = os.path.join(REPO_ROOT, "data", "plants")

sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
from ingest_month import year_month_to_key, parse_number  # noqa: E402

PBA_REP_CSV = r"C:\Users\HRampelwa.INNOWIND\AppData\Local\Temp\PowerBIModelingMCP\QueryResults\dax_query_result_20260902_152633_948.csv"
WATERFALL_CSV = r"C:\Users\HRampelwa.INNOWIND\AppData\Local\Temp\PowerBIModelingMCP\QueryResults\dax_query_result_20260902_152645_805.csv"

# Waterfall Axis[Step] -> our lossBreakdown field name. "Actual Energy" and
# "Potential Energy" are waterfall structural anchors, not losses - excluded.
# "Electrical Losses" is included here (per explicit instruction) and will be
# removed from the V2 Production category to avoid showing it twice.
STEP_FIELD_MAP = {
    "Grid": "grid",
    "Breakdown": "breakdown",
    "Maintenance": "maintenance",
    "Partial perf": "partialPerf",
    "BoP": "bop",
    "Environmental": "environmental",
    "Bat": "bat",
    "Bird": "bird",
    "Data Quality": "dataQuality",
    "Economic": "economic",
    "Economic compensated": "economicCompensated",
    "Grid compensated": "gridCompensated",
    "Icing": "icing",
    "MCR": "mcr",
    "Noise": "noise",
    "Other": "other",
    "Requested Shutdown": "requestedShutdown",
    "Electrical Losses": "electricalLosses",
}


def main():
    plants = {}
    for fname in os.listdir(PLANTS_DIR):
        if not fname.endswith(".json"):
            continue
        code = fname[:-5]
        with open(os.path.join(PLANTS_DIR, fname), encoding="utf-8") as f:
            plants[code] = json.load(f)

    pba_matched = pba_skipped = 0
    with open(PBA_REP_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader)
        for code, year_month, pba_rep in reader:
            month_key = year_month_to_key(year_month)
            plant = plants.get(code)
            if not plant or month_key not in plant["months"]:
                pba_skipped += 1
                continue
            plant["months"][month_key].setdefault("availability", {})["pbaRep"] = parse_number(pba_rep)
            pba_matched += 1

    wf_matched = wf_skipped = wf_ignored_step = 0
    with open(WATERFALL_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader)
        for code, year_month, step, pct in reader:
            field = STEP_FIELD_MAP.get(step)
            if field is None:
                wf_ignored_step += 1
                continue
            month_key = year_month_to_key(year_month)
            plant = plants.get(code)
            if not plant or month_key not in plant["months"]:
                wf_skipped += 1
                continue
            value = parse_number(pct)
            # Model negates loss values for the waterfall's visual direction;
            # flip back to positive for display, per explicit instruction.
            if value is not None:
                value = -value
            entry = plant["months"][month_key]
            entry.setdefault("lossBreakdown", {})[field] = value
            wf_matched += 1

    for code, plant in plants.items():
        with open(os.path.join(PLANTS_DIR, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump(plant, f, indent=2, ensure_ascii=False, sort_keys=True)

    print(f"PBA_Rep: matched {pba_matched}, skipped (month not present) {pba_skipped}")
    print(f"Waterfall: matched {wf_matched}, skipped (month not present) {wf_skipped}, ignored (non-loss step) {wf_ignored_step}")


if __name__ == "__main__":
    main()
