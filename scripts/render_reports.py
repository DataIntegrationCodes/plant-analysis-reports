"""
Render pre-generated PDFs for every (plant, month) and (fleet, month) combo
found in data/, using a headless Chromium via Playwright against the
print/*.html templates.

Usage:
    pip install -r scripts/requirements.txt
    playwright install chromium   # one-time browser download
    python scripts/render_reports.py                # fill in only missing PDFs
    python scripts/render_reports.py --force         # re-render everything
    python scripts/render_reports.py --months 2026-06  # only this month (plants + fleet)
"""
import argparse
import http.server
import json
import os
import threading

from playwright.sync_api import sync_playwright

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS_DIR = os.path.join(REPO_ROOT, "reports")
PORT = 5891


def start_server():
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(*a, directory=REPO_ROOT, **kw)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def render_pdf(page, url, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    page.goto(url, wait_until="networkidle")
    page.wait_for_selector('body[data-render-complete="true"]', timeout=10000)
    page.emulate_media(media="print")
    page.pdf(path=out_path, format="A4", print_background=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Re-render PDFs that already exist")
    parser.add_argument("--months", nargs="*", help="Only render these YYYY-MM months (default: all)")
    parser.add_argument("--plants", nargs="*", help="Only render these plant codes (default: all)")
    args = parser.parse_args()

    with open(os.path.join(REPO_ROOT, "data", "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)

    plant_codes = args.plants or [p["code"] for p in manifest["plants"]]
    months_filter = set(args.months) if args.months else None

    httpd = start_server()
    rendered, skipped = 0, 0
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page()

            for code in plant_codes:
                plant_path = os.path.join(REPO_ROOT, "data", "plants", f"{code}.json")
                with open(plant_path, encoding="utf-8") as f:
                    plant = json.load(f)
                for month in plant["months"]:
                    if months_filter and month not in months_filter:
                        continue
                    out_path = os.path.join(REPORTS_DIR, code, f"{month}.pdf")
                    if os.path.exists(out_path) and not args.force:
                        skipped += 1
                        continue
                    url = f"http://127.0.0.1:{PORT}/print/plant-print.html?code={code}&month={month}"
                    render_pdf(page, url, out_path)
                    print(f"Rendered {code}/{month}.pdf")
                    rendered += 1

            with open(os.path.join(REPO_ROOT, "data", "fleet.json"), encoding="utf-8") as f:
                fleet = json.load(f)
            for month in fleet["months"]:
                if months_filter and month not in months_filter:
                    continue
                out_path = os.path.join(REPORTS_DIR, "fleet", f"{month}.pdf")
                if os.path.exists(out_path) and not args.force:
                    skipped += 1
                    continue
                url = f"http://127.0.0.1:{PORT}/print/fleet-print.html?month={month}"
                render_pdf(page, url, out_path)
                print(f"Rendered fleet/{month}.pdf")
                rendered += 1

            browser.close()
    finally:
        httpd.shutdown()

    print(f"Done. Rendered {rendered}, skipped {skipped} existing.")


if __name__ == "__main__":
    main()
