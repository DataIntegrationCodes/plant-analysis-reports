(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const projectSelect = document.getElementById("projectSelect");
  const downloadBtn = document.getElementById("downloadPdf");
  const matrixWrap = document.getElementById("kpiMatrixWrap");
  const summaryWrap = document.getElementById("projectSummary");
  const yearFilterEl = document.getElementById("yearFilter");

  const manifest = await PAR.fetchJSON("data/manifest.json");
  const plantsWithData = manifest.plants.filter((p) => p.monthCount > 0);

  projectSelect.innerHTML = plantsWithData
    .map((p) => `<option value="${p.code}">${p.name} (${p.code})</option>`)
    .join("");

  const expandedYears = new Set();
  let selectedYears = new Set();

  const waterfallMonthSelect = document.getElementById("waterfallMonth");
  const waterfallCanvas = document.getElementById("chartLossWaterfall");
  let waterfallChart = null;
  let waterfallYear = null;
  let currentMonths = {};

  function years(monthsMap) {
    const set = new Set(Object.keys(monthsMap).map((k) => k.slice(0, 4)));
    return [...set].sort();
  }

  // The waterfall's "active" year is the year expanded in the matrix (only
  // one can be at a time); with nothing expanded it falls back to the latest
  // selected year. An expanded year that has since been unchecked in the year
  // filter doesn't count.
  function activeYear() {
    const expanded = [...expandedYears].find((y) => selectedYears.has(y));
    return expanded || [...selectedYears].sort().pop();
  }

  function drawWaterfall() {
    if (waterfallChart) waterfallChart.destroy();
    const entry = currentMonths[waterfallMonthSelect.value];
    waterfallChart = entry ? PAR.buildLossWaterfallChart(waterfallCanvas, entry) : null;
  }

  // Re-populates the month dropdown only when the active year changes (so an
  // unrelated matrix re-render doesn't reset a month the user picked), and
  // lands on that year's latest month - which, on first load, is the latest
  // month overall.
  function syncWaterfall() {
    const year = activeYear();
    if (!year || year === waterfallYear) return;
    waterfallYear = year;
    const months = Object.keys(currentMonths).filter((k) => k.startsWith(year)).sort();
    PAR.populateMonthSelect(waterfallMonthSelect, months, months[months.length - 1]);
    drawWaterfall();
  }

  waterfallMonthSelect.addEventListener("change", drawWaterfall);

  // Total recomputes to the year selection (unlike V1, where Total is
  // always full history) - it's built only from the checked years' months.
  function renderMatrix(monthsMap) {
    const yrs = [...selectedYears].sort();
    const monthsByYear = {};
    for (const y of yrs) {
      monthsByYear[y] = Object.keys(monthsMap).filter((k) => k.startsWith(y)).sort();
    }
    const filteredMonthsMap = {};
    for (const y of yrs) {
      for (const mk of monthsByYear[y]) filteredMonthsMap[mk] = monthsMap[mk];
    }
    const allEntries = Object.values(filteredMonthsMap);
    const categories = PAR.buildKpiCategoriesV2(filteredMonthsMap);

    const headerCells = yrs.map((y) => {
      const cells = [`<th class="year-toggle" data-year="${y}">${y} ${expandedYears.has(y) ? "▾" : "▸"}</th>`];
      if (expandedYears.has(y)) {
        for (const mk of monthsByYear[y]) {
          cells.push(`<th>${PAR.monthLabel(mk).split(" ")[0].slice(0, 3)}</th>`);
        }
      }
      return cells.join("");
    }).join("");

    const rows = categories.map((cat) => {
      const catRow = `<tr><td colspan="99"><strong>${cat.category}</strong></td></tr>`;
      const kpiRows = cat.kpis.map((kpi) => {
        const cells = yrs.map((y) => {
          const yearEntries = monthsByYear[y].map((mk) => monthsMap[mk]);
          const yearVal = kpi.aggregate(yearEntries);
          const yearCell = `<td class="num ${PAR.kpiColorClass(cat.category, kpi, yearVal)}">${PAR.fmtKpiValue(yearVal, kpi.unit)}</td>`;
          if (!expandedYears.has(y)) return yearCell;
          const monthCells = monthsByYear[y].map((mk) => {
            const mVal = kpi.aggregate([monthsMap[mk]]);
            return `<td class="num ${PAR.kpiColorClass(cat.category, kpi, mVal)}">${PAR.fmtKpiValue(mVal, kpi.unit)}</td>`;
          }).join("");
          return yearCell + monthCells;
        }).join("");
        const total = kpi.aggregate(allEntries);
        const totalCls = PAR.kpiColorClass(cat.category, kpi, total);
        return `<tr><td></td><td>${kpi.label}</td>${cells}<td class="num ${totalCls}"><strong>${PAR.fmtKpiValue(total, kpi.unit)}</strong></td></tr>`;
      }).join("");
      return catRow + kpiRows;
    }).join("");

    matrixWrap.innerHTML = `
      <table class="kpi-matrix">
        <thead><tr><th colspan="2">Category</th>${headerCells}<th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    matrixWrap.querySelectorAll(".year-toggle").forEach((th) => {
      th.addEventListener("click", () => {
        const y = th.dataset.year;
        // Only one year can be expanded into months at a time - expanding a
        // new one collapses whichever was previously expanded.
        if (expandedYears.has(y)) {
          expandedYears.delete(y);
        } else {
          expandedYears.clear();
          expandedYears.add(y);
        }
        renderMatrix(monthsMap);
      });
    });

    syncWaterfall();
  }

  async function loadProject(code) {
    expandedYears.clear();
    waterfallYear = null;
    const plant = await PAR.fetchJSON(`data/plants/${code}.json`);
    currentMonths = plant.months;
    summaryWrap.innerHTML = PAR.buildProjectSummary(plant);

    const yrs = years(plant.months);
    const latestYear = yrs[yrs.length - 1];
    selectedYears = new Set(latestYear ? [latestYear] : []);
    if (latestYear) expandedYears.add(latestYear);

    PAR.renderYearFilter(yearFilterEl, yrs, selectedYears, () => renderMatrix(plant.months));
    renderMatrix(plant.months);
    downloadBtn.href = `reports/kpi-report-v2/${code}.pdf`;
  }

  projectSelect.addEventListener("change", () => loadProject(projectSelect.value));
  if (plantsWithData.length) loadProject(plantsWithData[0].code);
})();
