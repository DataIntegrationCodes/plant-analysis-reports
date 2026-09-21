"""
Refreshes the V2 fields in data/plants/<CODE>.json from two live DAX pulls
(saved as CSVs by the powerbi-modeling-mcp tool):

  * PBA_Rep                     -> availability.pbaRep
  * Waterfall Value % by Step   -> lossBreakdown  (positive fractions)

Usage:
    python scripts/add_v2_fields.py --pba-rep-csv PBA.csv --waterfall-csv WF.csv [--dry-run]

Each month's `lossBreakdown` is REPLACED wholesale (not merged), so a step the
model has since retired disappears instead of lingering as a stale value. Only
months already present in a plant's file are touched - a row for any other month
(e.g. an in-progress one) is ignored. Prints a before/after comparison,
including how far pbaRep + sum(lossBreakdown) is from 100%.

Waterfall CSV columns: project_code, year_month, Step, value. Steps that aren't
loss categories (Potential, PBA_IEC, ...) are ignored; PBA_IEC is only used as a
cross-check against the separate PBA_Rep pull.
"""
import argparse
import csv
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANTS_DIR = os.path.join(REPO_ROOT, "data", "plants")

sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
from ingest_month import year_month_to_key, parse_number  # noqa: E402

# Waterfall Axis[Step] -> lossBreakdown field. Electrical Losses is no longer a
# waterfall step (the model's loss now comes from the PBA tables, which don't
# carry it), so it is intentionally absent.
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
}


def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader)
        yield from reader


def identity_gap(entry):
    """pbaRep + sum(losses) - 1, or None when either side is missing."""
    pba = entry.get("availability", {}).get("pbaRep")
    if pba is None:
        return None
    return pba + sum(v for v in (entry.get("lossBreakdown") or {}).values() if v is not None) - 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pba-rep-csv", required=True)
    ap.add_argument("--waterfall-csv", required=True)
    ap.add_argument("--dry-run", action="store_true", help="Report changes without writing files")
    args = ap.parse_args()

    plants = {}
    for fname in os.listdir(PLANTS_DIR):
        if fname.endswith(".json"):
            with open(os.path.join(PLANTS_DIR, fname), encoding="utf-8") as f:
                plants[fname[:-5]] = json.load(f)
    before = json.loads(json.dumps(plants))

    new_pba, new_losses, pba_iec = {}, {}, {}
    for code, year_month, value in read_rows(args.pba_rep_csv):
        new_pba[(code, year_month_to_key(year_month))] = parse_number(value)
    for code, year_month, step, value in read_rows(args.waterfall_csv):
        key = (code, year_month_to_key(year_month))
        v = parse_number(value)
        if step == "PBA_IEC":
            pba_iec[key] = v
        elif step in STEP_FIELD_MAP:
            new_losses.setdefault(key, {})[STEP_FIELD_MAP[step]] = -v if v is not None else None
        elif step == "Potential":
            new_losses.setdefault(key, {})  # month exists in the pull, even with no losses

    pba_touched = loss_touched = 0
    for code, plant in plants.items():
        for month_key, entry in plant["months"].items():
            key = (code, month_key)
            if key in new_pba:
                entry.setdefault("availability", {})["pbaRep"] = new_pba[key]
                pba_touched += 1
            if key in new_losses:
                entry["lossBreakdown"] = new_losses[key]
                loss_touched += 1

    # ---- comparison report
    changed_months = 0
    max_pba_move = (0, None)
    max_loss_move = (0, None)
    added, removed = {}, {}
    gap_before, gap_after = [], []
    for code, plant in plants.items():
        for month_key, entry in plant["months"].items():
            old = before[code]["months"][month_key]
            old_lb, new_lb = old.get("lossBreakdown") or {}, entry.get("lossBreakdown") or {}
            old_pba, new_pba_v = old.get("availability", {}).get("pbaRep"), entry.get("availability", {}).get("pbaRep")
            if old_lb != new_lb or old_pba != new_pba_v:
                changed_months += 1
            if old_pba is not None and new_pba_v is not None:
                d = abs(new_pba_v - old_pba)
                if d > max_pba_move[0]: max_pba_move = (d, f"{code} {month_key}")
            for k in set(old_lb) | set(new_lb):
                o, n = old_lb.get(k), new_lb.get(k)
                if o is None and n is not None: added[k] = added.get(k, 0) + 1
                if o is not None and n is None: removed[k] = removed.get(k, 0) + 1
                if o is not None and n is not None and abs(n - o) > max_loss_move[0]:
                    max_loss_move = (abs(n - o), f"{code} {month_key} {k}")
            g0, g1 = identity_gap(old), identity_gap(entry)
            if g0 is not None: gap_before.append(abs(g0))
            if g1 is not None: gap_after.append(abs(g1))

    # PBA_IEC (the waterfall's own end bar) should equal the separate PBA_Rep pull
    iec_mismatch = [k for k, v in pba_iec.items() if k in new_pba and v is not None and new_pba[k] is not None
                    and abs(v - new_pba[k]) > 1e-9]

    print(f"pbaRep refreshed for {pba_touched} plant-months, lossBreakdown replaced for {loss_touched}")
    print(f"plant-months with any change: {changed_months}")
    print(f"largest pbaRep move: {max_pba_move[0]:.4%} ({max_pba_move[1]})")
    print(f"largest single-category move: {max_loss_move[0]:.4%} ({max_loss_move[1]})")
    print(f"category values newly present: {added or 'none'}; no longer present: {removed or 'none'}")
    if gap_before and gap_after:
        print(f"|pbaRep + losses - 100%|  before: mean {sum(gap_before)/len(gap_before):.4%}, max {max(gap_before):.4%}"
              f"   after: mean {sum(gap_after)/len(gap_after):.4%}, max {max(gap_after):.4%}")
    print(f"PBA_IEC vs PBA_Rep mismatches: {len(iec_mismatch)}")

    if args.dry_run:
        print("dry run - nothing written")
        return
    for code, plant in plants.items():
        with open(os.path.join(PLANTS_DIR, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump(plant, f, indent=2, ensure_ascii=False, sort_keys=True)
    print("written")


if __name__ == "__main__":
    main()
