"""
Merge plant metrics pulled from the P&O_Custom_Semantic_Model PowerBI model into
data/plants/<CODE>.json, then rebuild data/fleet.json and data/manifest.json.

Two input modes:

1. CSV mode (bulk backfill) - one row per month, columns matching the DAX query
   documented in scripts/dax_template.md:
       python scripts/ingest_month.py --plant GRAS --csv path/to/rows.csv

2. Single-month JSON mode (normal monthly update) - the numbers for one month,
   already extracted from a DAX query result:
       python scripts/ingest_month.py --plant GRAS --month 2026-07 --json '{"actualProduction": 1234.5, ...}'

Both modes are idempotent: re-running for a month that already exists overwrites
just that month's entry rather than duplicating it.
"""
import argparse
import csv
import json
import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANTS_DIR = os.path.join(REPO_ROOT, "data", "plants")
FLEET_PATH = os.path.join(REPO_ROOT, "data", "fleet.json")
MANIFEST_PATH = os.path.join(REPO_ROOT, "data", "manifest.json")

PLANT_META = {
    "GRAS": {"name": "Grassridge", "mwInstalled": 64.5, "status": "active"},
    "CHAA": {"name": "Chaba", "mwInstalled": 21.5, "status": "active"},
    "WESL": {"name": "Wesley", "mwInstalled": 34.5, "status": "active"},
    "WAAI": {"name": "Waainek", "mwInstalled": 24.6, "status": "active"},
    "DASS": {"name": "Dassiesridge", "mwInstalled": 63, "status": "onboarding"},
    "SANK": {"name": "San Kraal", "mwInstalled": 145.6, "status": "onboarding"},
    "PHEZ": {"name": "Phezukomoya", "mwInstalled": 145.6, "status": "onboarding"},
    "COLE": {"name": "Coleskop", "mwInstalled": 145.6, "status": "onboarding"},
}

CSV_FIELD_MAP = {
    "[Actual Production]": "actualProduction",
    "[P50 Target]": "p50Target",
    "[P90 Target]": "p90Target",
    "[Historical Production]": "historicalProduction",
    "[Capacity Factor]": "capacityFactor",
    "[Electrical Losses]": "electricalLosses",
    "[Consumption]": "consumptionMWh",
    "[Ratio to Production]": "ratioToProduction",
    "[Contractual Availability]": "contractualAvailability",
    "[Technical Availability]": "technicalAvailability",
    "[PBA]": "pba",
    "[DT Manufacturer]": "downtimeManufacturer",
    "[DT Environmental]": "downtimeEnvironmental",
    "[DT Utility]": "downtimeUtility",
    "[DT Owner]": "downtimeOwner",
    "[DT Bat]": "downtimeBat",
    "[MeasuredWS]": "measuredWS",
    "[ForecastedWS]": "forecastedWS",
    "[WindDeviation]": "windDeviation",
    "[Wind Index]": "windIndex",
}

TURBINE_CSV_FIELD_MAP = {
    "[Production]": "production",
    "[Technical Availability]": "technicalAvailability",
    "[Contractual Availability]": "contractualAvailability",
}

MONTH_NAME_TO_NUM = {
    "January": "01", "February": "02", "March": "03", "April": "04",
    "May": "05", "June": "06", "July": "07", "August": "08",
    "September": "09", "October": "10", "November": "11", "December": "12",
}


def parse_number(raw):
    if raw is None:
        return None
    s = raw.strip()
    if s == "":
        return None
    s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def year_month_to_key(year_month_text):
    year, month_name = year_month_text.split(" ", 1)
    return f"{year}-{MONTH_NAME_TO_NUM[month_name]}"


def normalize_target_units(target, actual):
    """
    P50/P90 Target for some projects (the GoldWind-turbine plants: SANK, PHEZ,
    COLE) come back from the model in kWh instead of MWh like every other
    measure. Actual Production is always MWh, so use it as the sanity check:
    a monthly target more than ~20x actual production for the same plant is
    almost certainly a kWh value that needs /1000. This is a real unit
    inconsistency in the source PowerBI measures, not just a display choice -
    flagged in the README for whoever owns that model to fix upstream.
    """
    if target is None:
        return None
    if actual and actual > 0 and target > actual * 20:
        return target / 1000
    if target > 200000:
        return target / 1000
    return target


def build_month_entry(fields):
    actual = fields.get("actualProduction")
    return {
        "production": {
            "actual": actual,
            "p50Target": normalize_target_units(fields.get("p50Target"), actual),
            "p90Target": normalize_target_units(fields.get("p90Target"), actual),
            "historical": fields.get("historicalProduction"),
            "capacityFactor": fields.get("capacityFactor"),
            "electricalLosses": fields.get("electricalLosses"),
        },
        "consumption": {
            "actual": fields.get("consumptionMWh"),
            "ratioToProduction": fields.get("ratioToProduction"),
        },
        "availability": {
            "contractual": fields.get("contractualAvailability"),
            "technical": fields.get("technicalAvailability"),
            "pba": fields.get("pba"),
        },
        "downtime": {
            "manufacturer": fields.get("downtimeManufacturer"),
            "environmental": fields.get("downtimeEnvironmental"),
            "utility": fields.get("downtimeUtility"),
            "owner": fields.get("downtimeOwner"),
            "bat": fields.get("downtimeBat"),
        },
        "wind": {
            "measuredWS": fields.get("measuredWS"),
            "forecastedWS": fields.get("forecastedWS"),
            "deviation": fields.get("windDeviation"),
            "windIndex": fields.get("windIndex"),
        },
    }


def load_plant_file(code):
    path = os.path.join(PLANTS_DIR, f"{code}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    meta = PLANT_META[code]
    return {"code": code, "name": meta["name"], "mwInstalled": meta["mwInstalled"], "months": {}}


def save_plant_file(code, data):
    os.makedirs(PLANTS_DIR, exist_ok=True)
    path = os.path.join(PLANTS_DIR, f"{code}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, sort_keys=True)


def ingest_csv(code, csv_path):
    data = load_plant_file(code)
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            month_key = year_month_to_key(row["ref_calendar[year_month]"])
            fields = {}
            for csv_col, field_name in CSV_FIELD_MAP.items():
                fields[field_name] = parse_number(row.get(csv_col))
            # Skip months with no production data at all (plant not yet onboarded)
            if fields.get("actualProduction") is None and fields.get("contractualAvailability") is None:
                continue
            data["months"][month_key] = build_month_entry(fields)
            count += 1
    save_plant_file(code, data)
    print(f"{code}: ingested {count} months from {csv_path}")


def ingest_single_month(code, month_key, fields):
    data = load_plant_file(code)
    data["months"][month_key] = build_month_entry(fields)
    save_plant_file(code, data)
    print(f"{code}: ingested {month_key}")


TURBINES_DIR = os.path.join(REPO_ROOT, "data", "turbines")


def ingest_turbines(code, csv_path):
    """
    CSV columns: ref_calendar[year_month], wdm_equipment[TurbineID],
    [Production], [Technical Availability], [Contractual Availability] - one
    row per (turbine, month). Stored as {turbineId: {month: {...}}}.
    """
    turbines = {}
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            turbine_id = row.get("wdm_equipment[TurbineID]")
            if not turbine_id:
                continue
            month_key = year_month_to_key(row["ref_calendar[year_month]"])
            entry = {field_name: parse_number(row.get(csv_col))
                     for csv_col, field_name in TURBINE_CSV_FIELD_MAP.items()}
            if entry.get("production") is None:
                continue
            turbines.setdefault(turbine_id, {})[month_key] = entry
            count += 1
    os.makedirs(TURBINES_DIR, exist_ok=True)
    with open(os.path.join(TURBINES_DIR, f"{code}.json"), "w", encoding="utf-8") as f:
        json.dump({"code": code, "turbines": turbines}, f, indent=2, ensure_ascii=False, sort_keys=True)
    print(f"{code}: ingested {count} turbine-month rows across {len(turbines)} turbines from {csv_path}")


def rebuild_fleet_and_manifest():
    plants = []
    all_months = set()
    plant_data_by_code = {}
    for code in PLANT_META:
        path = os.path.join(PLANTS_DIR, f"{code}.json")
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as f:
            pdata = json.load(f)
        plant_data_by_code[code] = pdata
        plants.append({
            "code": code,
            "name": pdata["name"],
            "mwInstalled": pdata["mwInstalled"],
            "status": PLANT_META[code]["status"],
            "monthCount": len(pdata["months"]),
        })
        all_months.update(pdata["months"].keys())

    fleet_months = {}
    for month_key in sorted(all_months):
        entries = [plant_data_by_code[c]["months"][month_key]
                   for c in plant_data_by_code if month_key in plant_data_by_code[c]["months"]]
        entries = [e for e in entries if e["production"]["actual"] is not None]
        if not entries:
            continue

        def avg(section, field):
            vals = [e[section][field] for e in entries if e[section][field] is not None]
            if not vals:
                return None
            return sum(vals) / len(vals)

        def sum_or_none(section, field):
            vals = [e[section][field] for e in entries if e[section][field] is not None]
            return sum(vals) if vals else None

        fleet_months[month_key] = {
            "production": {
                "actual": sum(e["production"]["actual"] for e in entries),
                "p50Target": sum(e["production"]["p50Target"] for e in entries if e["production"]["p50Target"] is not None) or None,
                "p90Target": sum(e["production"]["p90Target"] for e in entries if e["production"]["p90Target"] is not None) or None,
                "historical": sum_or_none("production", "historical"),
                "capacityFactor": avg("production", "capacityFactor"),
                "electricalLosses": avg("production", "electricalLosses"),
            },
            "consumption": {
                "actual": sum_or_none("consumption", "actual"),
                "ratioToProduction": avg("consumption", "ratioToProduction"),
            },
            "availability": {
                "contractual": avg("availability", "contractual"),
                "technical": avg("availability", "technical"),
                "pba": avg("availability", "pba"),
            },
            "downtime": {
                "manufacturer": avg("downtime", "manufacturer"),
                "environmental": avg("downtime", "environmental"),
                "utility": avg("downtime", "utility"),
                "owner": avg("downtime", "owner"),
                "bat": avg("downtime", "bat"),
            },
            "wind": {
                "measuredWS": avg("wind", "measuredWS"),
                "forecastedWS": avg("wind", "forecastedWS"),
                "deviation": avg("wind", "deviation"),
                "windIndex": avg("wind", "windIndex"),
            },
            "plantCount": len(entries),
        }

    os.makedirs(os.path.dirname(FLEET_PATH), exist_ok=True)
    with open(FLEET_PATH, "w", encoding="utf-8") as f:
        json.dump({"months": fleet_months}, f, indent=2, ensure_ascii=False, sort_keys=True)

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "plants": sorted(plants, key=lambda p: p["name"]),
            "months": sorted(all_months),
        }, f, indent=2, ensure_ascii=False)

    print(f"Rebuilt fleet.json ({len(fleet_months)} months) and manifest.json ({len(plants)} plants)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plant", required=True, choices=list(PLANT_META))
    parser.add_argument("--csv", help="CSV file with one row per month (bulk backfill)")
    parser.add_argument("--turbine-csv", help="CSV file with one row per (turbine, month) - see ingest_turbines")
    parser.add_argument("--month", help="YYYY-MM, required with --json")
    parser.add_argument("--json", help="JSON object of this month's metrics")
    parser.add_argument("--skip-rebuild", action="store_true", help="Skip regenerating fleet.json/manifest.json (use when ingesting multiple plants in a loop)")
    args = parser.parse_args()

    if args.turbine_csv:
        ingest_turbines(args.plant, args.turbine_csv)
        return
    elif args.csv:
        ingest_csv(args.plant, args.csv)
    elif args.month and args.json:
        ingest_single_month(args.plant, args.month, json.loads(args.json))
    else:
        parser.error("Provide either --csv, --turbine-csv, or both --month and --json")

    if not args.skip_rebuild:
        rebuild_fleet_and_manifest()


if __name__ == "__main__":
    main()
