// Shared utilities used by index.js, plant.js, fleet.js.

const PAR = {
  STATUS_LABEL: {
    active: "Active",
    onboarding: "Onboarding",
    offboarding: "Offboarding",
  },

  async fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  },

  fmtMWh(v) {
    if (v === null || v === undefined) return "–";
    return `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} MWh`;
  },

  fmtGWh(v) {
    if (v === null || v === undefined) return "–";
    return `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} GWh`;
  },

  fmtPercent(v, digits = 1) {
    if (v === null || v === undefined) return "–";
    return `${(v * 100).toFixed(digits)}%`;
  },

  fmtNumber(v, digits = 1) {
    if (v === null || v === undefined) return "–";
    // Fixed en-US formatting (period decimal) regardless of the viewer's
    // browser/OS locale - see PAR.fmtChartNum for the same reasoning.
    return v.toLocaleString("en-US", { maximumFractionDigits: digits });
  },

  fmtSigned(v, digits = 1) {
    if (v === null || v === undefined) return "–";
    const s = v.toLocaleString(undefined, { maximumFractionDigits: digits });
    return v > 0 ? `+${s}` : s;
  },

  // Chart axis ticks/tooltips: always period-decimal, fixed 2dp, regardless
  // of the browser's locale (some locales - e.g. en-ZA - render the default
  // `undefined` locale used elsewhere in this file with a comma decimal
  // separator, which reads wrong on a MWh/percent chart).
  fmtChartNum(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "";
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  monthLabel(key) {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  },

  // Just the calendar month name, no year - used on chart x-axes where the
  // year is already fixed by a separate Year selector, so repeating it on
  // every tick would be redundant.
  monthOnlyLabel(key) {
    const [, m] = key.split("-");
    return new Date(2000, Number(m) - 1, 1).toLocaleDateString(undefined, { month: "long" });
  },

  populateMonthSelect(selectEl, months, selected) {
    selectEl.innerHTML = "";
    const sorted = [...months].sort().reverse();
    for (const m of sorted) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = PAR.monthLabel(m);
      if (m === selected) opt.selected = true;
      selectEl.appendChild(opt);
    }
  },

  initThemeToggle(btnEl) {
    const stored = localStorage.getItem("par-theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    const isDark = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr) return attr === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    if (btnEl) {
      btnEl.addEventListener("click", () => {
        const next = isDark() ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("par-theme", next);
      });
    }
  },

  badgeClassForStatus(status) {
    if (status === "active") return "badge-green";
    if (status === "onboarding") return "badge-amber";
    if (status === "offboarding") return "badge-amber";
    return "badge-muted";
  },

  DOWNTIME_LABELS: {
    manufacturer: "Manufacturer",
    environmental: "Environmental",
    utility: "Utility / Grid",
    owner: "Owner",
    bat: "Balance of Plant",
  },

  downtimeBars(downtime) {
    const entries = Object.entries(PAR.DOWNTIME_LABELS)
      .map(([key, label]) => ({ label, value: downtime[key] }))
      .filter((e) => e.value !== null && e.value !== undefined);
    if (!entries.length) return '<p class="empty-note">No downtime breakdown for this month.</p>';
    const max = Math.max(...entries.map((e) => e.value), 0.001);
    return entries.map((e) => `
      <div class="bar-row">
        <span class="bar-label">${e.label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(e.value / max) * 100}%"></span></span>
        <span class="bar-value">${PAR.fmtPercent(e.value)}</span>
      </div>
    `).join("");
  },

  // Renders the 4 report sections for a single plant/month. Shared between
  // the interactive plant.html view and print/plant-print.html.
  renderPlantSections(entry) {
    if (!entry) return '<div class="section"><p class="empty-note">No data available for this month.</p></div>';
    const p = entry.production, a = entry.availability, w = entry.wind;
    return `
      <div class="section">
        <div class="section-title">Production</div>
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">Actual</div><div class="metric-value">${PAR.fmtMWh(p.actual)}</div></div>
          <div class="metric"><div class="metric-label">P50 Target</div><div class="metric-value small">${PAR.fmtMWh(p.p50Target)}</div></div>
          <div class="metric"><div class="metric-label">P90 Target</div><div class="metric-value small">${PAR.fmtMWh(p.p90Target)}</div></div>
          <div class="metric"><div class="metric-label">Capacity Factor</div><div class="metric-value small">${PAR.fmtPercent(p.capacityFactor)}</div></div>
          <div class="metric"><div class="metric-label">Historical Production</div><div class="metric-value small">${PAR.fmtMWh(p.historical)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Availability</div>
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">Contractual</div><div class="metric-value">${PAR.fmtPercent(a.contractual)}</div></div>
          <div class="metric"><div class="metric-label">Technical</div><div class="metric-value">${PAR.fmtPercent(a.technical)}</div></div>
          <div class="metric"><div class="metric-label">PBA (energy-based)</div><div class="metric-value">${PAR.fmtPercent(a.pba)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Downtime by Cause</div>
        ${PAR.downtimeBars(entry.downtime)}
      </div>
      <div class="section">
        <div class="section-title">Wind Resource</div>
        <div class="metric-grid">
          <div class="metric"><div class="metric-label">Measured Wind Speed</div><div class="metric-value small">${PAR.fmtNumber(w.measuredWS)} m/s</div></div>
          <div class="metric"><div class="metric-label">Forecasted Wind Speed</div><div class="metric-value small">${PAR.fmtNumber(w.forecastedWS)} m/s</div></div>
          <div class="metric"><div class="metric-label">Deviation</div><div class="metric-value small">${PAR.fmtSigned(w.deviation !== null && w.deviation !== undefined ? w.deviation * 100 : null)}%</div></div>
        </div>
      </div>
    `;
  },

  // --- KPI_Dim-driven matrix (report.html + print/report-print.html) ---
  //
  // Mirrors the live KPI_Dim table + "Plant KPI Value_Upgrade" measure pulled
  // from the model, minus "Warranted availability" (unimplemented upstream)
  // and "Energy Content Index" / "WindSpeed Index" (dropped per instruction).
  // Each KPI's `aggregate(entries)` takes an array of one or more month
  // entries (production/consumption/availability/downtime/wind objects) and
  // returns the correct value whether entries.length is 1 (a single month),
  // 12 (a year), or the full history (Total) - sum/average KPIs are trivially
  // the same formula at any grain, and the three Deviation KPIs use a
  // ratio-of-sums (matching the model's own DAX: DIVIDE(SUMX(..), SUMX(..))),
  // not an average of monthly percentages.

  _sumBy(entries, getter) {
    const vals = entries.map(getter).filter((v) => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0);
  },

  _avgBy(entries, getter) {
    const vals = entries.map(getter).filter((v) => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  },

  _ratioOfSums(entries, numGetter, denomGetter) {
    const pairs = entries
      .map((e) => [numGetter(e), denomGetter(e)])
      .filter(([n, d]) => n !== null && n !== undefined && d !== null && d !== undefined && d !== 0);
    if (!pairs.length) return null;
    const sumNum = pairs.reduce((a, [n]) => a + n, 0);
    const sumDenom = pairs.reduce((a, [, d]) => a + d, 0);
    if (!sumDenom) return null;
    return sumNum / sumDenom;
  },

  KPI_CATEGORIES: [
    {
      category: "A. Production",
      kpis: [
        { key: "measured", label: "Measured (MWh)", unit: "value",
          aggregate: (es) => PAR._sumBy(es, (e) => e.production.actual) },
        { key: "deviationHistorical", label: "Deviation Historical", unit: "percent",
          aggregate: (es) => PAR._ratioOfSums(es,
            (e) => (e.production.historical != null ? e.production.actual - e.production.historical : null),
            (e) => e.production.historical) },
        { key: "deviationP50", label: "Deviation P50", unit: "percent",
          aggregate: (es) => {
            const r = PAR._ratioOfSums(es, (e) => e.production.actual, (e) => e.production.p50Target);
            return r === null ? null : r - 1;
          } },
        { key: "deviationP90", label: "Deviation P90", unit: "percent",
          aggregate: (es) => {
            const r = PAR._ratioOfSums(es, (e) => e.production.actual, (e) => e.production.p90Target);
            return r === null ? null : r - 1;
          } },
        { key: "capacityFactor", label: "Capacity Factor", unit: "percent",
          aggregate: (es) => PAR._avgBy(es, (e) => e.production.capacityFactor) },
        { key: "electricalLosses", label: "Electrical Losses", unit: "percent",
          aggregate: (es) => PAR._avgBy(es, (e) => e.production.electricalLosses) },
      ],
    },
    {
      category: "B. Consumption",
      kpis: [
        { key: "consumption", label: "Measured (MWh)", unit: "value",
          aggregate: (es) => PAR._sumBy(es, (e) => e.consumption.actual) },
        { key: "ratioToProduction", label: "Ratio to Production", unit: "percent",
          aggregate: (es) => PAR._avgBy(es, (e) => e.consumption.ratioToProduction) },
      ],
    },
    {
      category: "C. Availability",
      kpis: [
        { key: "contractual", label: "TBA - Contractual", unit: "percent",
          aggregate: (es) => PAR._avgBy(es, (e) => e.availability.contractual) },
        { key: "technical", label: "TBA - Technical", unit: "percent",
          aggregate: (es) => PAR._avgBy(es, (e) => e.availability.technical) },
        { key: "pba", label: "PBA - Technical", unit: "percent",
          aggregate: (es) => PAR._avgBy(es, (e) => e.availability.pba) },
      ],
    },
    {
      category: "D. OLF - Losses",
      kpis: [
        { key: "manufacturer", label: "Manufacturer", unit: "percent3",
          aggregate: (es) => PAR._avgBy(es, (e) => e.downtime.manufacturer) },
        { key: "owner", label: "Owner", unit: "percent3",
          aggregate: (es) => PAR._avgBy(es, (e) => e.downtime.owner) },
        { key: "environmental", label: "Environmental", unit: "percent3",
          aggregate: (es) => PAR._avgBy(es, (e) => e.downtime.environmental) },
        { key: "utility", label: "Utility", unit: "percent3",
          aggregate: (es) => PAR._avgBy(es, (e) => e.downtime.utility) },
        { key: "bat", label: "Bat Curtailment", unit: "percent3",
          aggregate: (es) => PAR._avgBy(es, (e) => e.downtime.bat) },
      ],
    },
    {
      category: "E. Wind",
      kpis: [
        { key: "forecastedWS", label: "Forecasted WS (m/s)", unit: "speed",
          aggregate: (es) => PAR._avgBy(es, (e) => e.wind.forecastedWS) },
        { key: "measuredWS", label: "Measured WS (m/s)", unit: "speed",
          aggregate: (es) => PAR._avgBy(es, (e) => e.wind.measuredWS) },
        { key: "windSpeedDeviation", label: "WindSpeed Deviation", unit: "percent",
          aggregate: (es) => PAR._avgBy(es, (e) => e.wind.deviation) },
      ],
    },
  ],

  fmtKpiValue(value, unit) {
    if (unit === "value") return PAR.fmtNumber(value, 0);
    if (unit === "percent") return PAR.fmtPercent(value, 1);
    if (unit === "percent3") return PAR.fmtPercent(value, 1);
    if (unit === "speed") return PAR.fmtNumber(value, 1);
    return PAR.fmtNumber(value);
  },

  // Mirrors the live "Plant KPI Color" DAX measure: red/green/neutral text
  // per category + KPI type + value, evaluated in the same priority order as
  // the SWITCH(TRUE(), ...) it was pulled from. Categories not mentioned in
  // that measure (B. Consumption) and the "Black" fallback both mean no
  // color override - handled here by returning "" (inherits default text
  // color, which stays readable in both light and dark themes, unlike a
  // literal black).
  kpiColorClass(category, kpi, value) {
    if (value === null || value === undefined) return "";
    const letter = category.charAt(0);
    const isPercent = kpi.unit === "percent" || kpi.unit === "percent3";
    if (letter === "A" && isPercent) return value < 0 ? "kpi-red" : "kpi-green";
    if (letter === "C" && isPercent) return value < 0.97 ? "kpi-red" : "kpi-green";
    if (letter === "D") return value > 0.03 ? "kpi-red" : "";
    if (letter === "E" && isPercent) {
      if (value < 0) return "kpi-red";
      if (value < 0.9 && kpi.key !== "windSpeedDeviation") return "kpi-red";
      return "kpi-green";
    }
    return "";
  },

  // Renders the KPI matrix (Year columns + Total) for a single plant's or the
  // fleet's full `months` map. `years` is a sorted array of year strings
  // ("2022".."2026"). `expandedYears` (optional Set/array of year strings)
  // pre-expands those years into their individual month columns - used by
  // the print PDF to always show the current year's months (no click needed,
  // unlike the interactive drill-down in report.js).
  renderKpiMatrix(monthsMap, years, expandedYears = []) {
    const expanded = expandedYears instanceof Set ? expandedYears : new Set(expandedYears);
    const monthKeysByYear = {};
    const monthsByYear = {};
    for (const year of years) {
      monthKeysByYear[year] = Object.keys(monthsMap).filter((k) => k.startsWith(year)).sort();
      monthsByYear[year] = monthKeysByYear[year].map((k) => monthsMap[k]);
    }
    const allEntries = Object.values(monthsMap);

    const totalCols = years.reduce((n, y) => n + (expanded.has(y) ? 1 + monthKeysByYear[y].length : 1), 0);

    const headerCells = years.map((y) => {
      const cells = [`<th>${y}</th>`];
      if (expanded.has(y)) {
        for (const mk of monthKeysByYear[y]) {
          cells.push(`<th>${PAR.monthLabel(mk).split(" ")[0].slice(0, 3)}</th>`);
        }
      }
      return cells.join("");
    }).join("");

    const rows = PAR.KPI_CATEGORIES.map((cat) => {
      const catRow = `<tr><td colspan="${totalCols + 2}"><strong>${cat.category}</strong></td></tr>`;
      const kpiRows = cat.kpis.map((kpi) => {
        const cells = years.map((y) => {
          const val = kpi.aggregate(monthsByYear[y]);
          const cls = PAR.kpiColorClass(cat.category, kpi, val);
          const yearCell = `<td class="num ${cls}">${PAR.fmtKpiValue(val, kpi.unit)}</td>`;
          if (!expanded.has(y)) return yearCell;
          const monthCells = monthKeysByYear[y].map((mk) => {
            const mVal = kpi.aggregate([monthsMap[mk]]);
            const mCls = PAR.kpiColorClass(cat.category, kpi, mVal);
            return `<td class="num ${mCls}">${PAR.fmtKpiValue(mVal, kpi.unit)}</td>`;
          }).join("");
          return yearCell + monthCells;
        }).join("");
        const total = kpi.aggregate(allEntries);
        const totalCls = PAR.kpiColorClass(cat.category, kpi, total);
        return `<tr><td></td><td>${kpi.label}</td>${cells}<td class="num ${totalCls}"><strong>${PAR.fmtKpiValue(total, kpi.unit)}</strong></td></tr>`;
      }).join("");
      return catRow + kpiRows;
    }).join("");

    return `
      <table class="kpi-matrix">
        <thead><tr><th colspan="2">Category</th>${headerCells}<th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  // Running-sum helper for cumulative chart series - resets at each year
  // boundary so a multi-year `months` array (full-history print PDF) behaves
  // like a fresh cumulative curve every January, matching a single-year
  // `months` array (the graphical view) where there's only one year to begin with.
  _cumulative(months, getter) {
    let sum = 0;
    let lastYear = null;
    return months.map((m) => {
      const year = m.slice(0, 4);
      if (year !== lastYear) { sum = 0; lastYear = year; }
      const v = getter(m);
      if (v !== null && v !== undefined) sum += v;
      return sum;
    });
  },

  // Builds the 5-chart graphical dashboard onto fixed canvas IDs
  // (chartProduction/chartTurbines/chartAvailability/chartWind/chartDowntime).
  // Shared between report.html (interactive) and print/report-print.html
  // (static, for PDF export). Returns the Chart.js instances so callers can
  // destroy() them before rebuilding (e.g. on project switch).
  buildReportCharts(plant, turbineData) {
    const months = Object.keys(plant.months).sort();
    const monthLabels = months.map((m) => PAR.monthOnlyLabel(m));
    const charts = {};

    const cumProduction = PAR._cumulative(months, (m) => plant.months[m].production.actual);
    const cumP50 = PAR._cumulative(months, (m) => plant.months[m].production.p50Target);
    const cumP90 = PAR._cumulative(months, (m) => plant.months[m].production.p90Target);
    charts.production = new Chart(document.getElementById("chartProduction"), {
      data: {
        labels: monthLabels,
        datasets: [
          { type: "bar", label: "Actual (MWh)", data: months.map((m) => plant.months[m].production.actual), backgroundColor: "#2563eb", order: 2 },
          { type: "line", label: "P50 Target", data: months.map((m) => plant.months[m].production.p50Target), borderColor: "#22c55e", borderDash: [5, 3], pointRadius: 0, order: 2 },
          { type: "line", label: "P90 Target", data: months.map((m) => plant.months[m].production.p90Target), borderColor: "#f97316", borderDash: [5, 3], pointRadius: 0, order: 2 },
          { type: "line", label: "Cumulative Production", data: cumProduction, borderColor: "#1d4ed8", pointRadius: 0, yAxisID: "y1", order: 1 },
          { type: "line", label: "Cumulative P50", data: cumP50, borderColor: "#15803d", pointRadius: 0, yAxisID: "y1", order: 1 },
          { type: "line", label: "Cumulative P90", data: cumP90, borderColor: "#c2410c", pointRadius: 0, yAxisID: "y1", order: 1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${PAR.fmtChartNum(ctx.parsed.y)}` } } },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 0 } },
          y: { position: "left", title: { display: true, text: "Monthly MWh" }, ticks: { callback: (v) => PAR.fmtChartNum(v) } },
          y1: { position: "right", title: { display: true, text: "Cumulative MWh" }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => PAR.fmtChartNum(v) } },
        },
      },
    });

    // Production is averaged across the months in view, not summed - this
    // matches the source "Yearly Production" measure's own formula
    // (AVERAGEX(VALUES(year_month), CALCULATE(SUM(act_energy_iec)))), which
    // averages the monthly totals rather than adding them up.
    const turbineIds = turbineData ? Object.keys(turbineData.turbines).sort() : [];
    const turbineTotals = turbineIds.map((id) => {
      const entries = Object.values(turbineData.turbines[id]);
      return {
        production: PAR._avgBy(entries, (e) => e.production),
        technical: PAR._avgBy(entries, (e) => e.technicalAvailability),
        contractual: PAR._avgBy(entries, (e) => e.contractualAvailability),
      };
    });
    charts.turbines = new Chart(document.getElementById("chartTurbines"), {
      data: {
        labels: turbineIds,
        datasets: [
          { type: "bar", label: "Production (MWh)", data: turbineTotals.map((t) => t.production / 1000), backgroundColor: "#2563eb", yAxisID: "y", order: 2 },
          { type: "line", label: "Technical Availability", data: turbineTotals.map((t) => t.technical * 100), borderColor: "#eab308", pointRadius: 3, yAxisID: "y1", order: 1 },
          { type: "line", label: "Contractual Availability", data: turbineTotals.map((t) => t.contractual * 100), borderColor: "#6b7280", pointRadius: 3, yAxisID: "y1", order: 1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${PAR.fmtChartNum(ctx.parsed.y)}` } } },
        scales: {
          y: { position: "left", title: { display: true, text: "MWh" }, ticks: { callback: (v) => PAR.fmtChartNum(v) } },
          y1: { position: "right", title: { display: true, text: "%" }, grid: { drawOnChartArea: false }, ticks: { callback: (v) => PAR.fmtChartNum(v) } },
        },
      },
    });

    const ytdContractual = [];
    const ytdTechnical = [];
    const yearRunning = {};
    for (const m of months) {
      const y = m.slice(0, 4);
      yearRunning[y] = yearRunning[y] || { c: [], t: [] };
      const entry = plant.months[m];
      if (entry.availability.contractual != null) yearRunning[y].c.push(entry.availability.contractual);
      if (entry.availability.technical != null) yearRunning[y].t.push(entry.availability.technical);
      const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      ytdContractual.push(avg(yearRunning[y].c));
      ytdTechnical.push(avg(yearRunning[y].t));
    }
    charts.availability = new Chart(document.getElementById("chartAvailability"), {
      data: {
        labels: monthLabels,
        datasets: [
          { type: "bar", label: "Contractual", data: months.map((m) => plant.months[m].availability.contractual * 100), backgroundColor: "#6b7280" },
          { type: "bar", label: "Technical", data: months.map((m) => plant.months[m].availability.technical * 100), backgroundColor: "#eab308" },
          { type: "line", label: "Contractual YTD", data: ytdContractual.map((v) => v * 100), borderColor: "#111827", pointRadius: 0 },
          { type: "line", label: "Technical YTD", data: ytdTechnical.map((v) => v * 100), borderColor: "#b45309", pointRadius: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${PAR.fmtChartNum(ctx.parsed.y)}` } } },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 0 } },
          y: { title: { display: true, text: "%" }, ticks: { callback: (v) => PAR.fmtChartNum(v) } },
        },
      },
    });

    charts.wind = new Chart(document.getElementById("chartWind"), {
      data: {
        labels: monthLabels,
        datasets: [
          { type: "bar", label: "Measured WS", data: months.map((m) => plant.months[m].wind.measuredWS), backgroundColor: "#a3e635" },
          { type: "line", label: "Forecasted WS", data: months.map((m) => plant.months[m].wind.forecastedWS), borderColor: "#16a34a", pointRadius: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${PAR.fmtChartNum(ctx.parsed.y)}` } } },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 0 } },
          y: { title: { display: true, text: "m/s" }, ticks: { callback: (v) => PAR.fmtChartNum(v) } },
        },
      },
    });

    const downtimeKeys = [
      { key: "manufacturer", label: "Manufacturer", color: "#38bdf8" },
      { key: "owner", label: "Owner", color: "#eab308" },
      { key: "environmental", label: "Environmental", color: "#22c55e" },
      { key: "utility", label: "Utility", color: "#f97316" },
      { key: "bat", label: "Bat", color: "#16a34a" },
    ];
    charts.downtime = new Chart(document.getElementById("chartDowntime"), {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: downtimeKeys.map((d) => ({
          label: d.label,
          data: months.map((m) => (plant.months[m].downtime[d.key] || 0) * 100),
          backgroundColor: d.color,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${PAR.fmtChartNum(ctx.parsed.y)}` } } },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 45, minRotation: 0 } },
          y: { stacked: true, title: { display: true, text: "% Production Loss" }, ticks: { callback: (v) => PAR.fmtChartNum(v) } },
        },
      },
    });

    return charts;
  },
};
