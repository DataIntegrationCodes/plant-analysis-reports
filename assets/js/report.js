(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const projectSelect = document.getElementById("projectSelect");
  const downloadBtn = document.getElementById("downloadPdf");
  const matrixWrap = document.getElementById("kpiMatrixWrap");

  const manifest = await PAR.fetchJSON("data/manifest.json");
  const plantsWithData = manifest.plants.filter((p) => p.monthCount > 0);

  projectSelect.innerHTML = plantsWithData
    .map((p) => `<option value="${p.code}">${p.name} (${p.code})</option>`)
    .join("");

  const expandedYears = new Set();
  let charts = {};

  function years(monthsMap) {
    const set = new Set(Object.keys(monthsMap).map((k) => k.slice(0, 4)));
    return [...set].sort();
  }

  function renderMatrix(monthsMap) {
    const yrs = years(monthsMap);
    const monthsByYear = {};
    for (const y of yrs) {
      monthsByYear[y] = Object.keys(monthsMap).filter((k) => k.startsWith(y)).sort();
    }
    const allEntries = Object.values(monthsMap);

    const headerCells = yrs.map((y) => {
      const cells = [`<th class="year-toggle" data-year="${y}" style="cursor:pointer;">${y} ${expandedYears.has(y) ? "▾" : "▸"}</th>`];
      if (expandedYears.has(y)) {
        for (const mk of monthsByYear[y]) {
          cells.push(`<th>${PAR.monthLabel(mk).split(" ")[0].slice(0, 3)}</th>`);
        }
      }
      return cells.join("");
    }).join("");

    const rows = PAR.KPI_CATEGORIES.map((cat) => {
      const catRow = `<tr><td colspan="99"><strong>${cat.category}</strong></td></tr>`;
      const kpiRows = cat.kpis.map((kpi) => {
        const cells = yrs.map((y) => {
          const yearEntries = monthsByYear[y].map((mk) => monthsMap[mk]);
          const yearCell = `<td class="num">${PAR.fmtKpiValue(kpi.aggregate(yearEntries), kpi.unit)}</td>`;
          if (!expandedYears.has(y)) return yearCell;
          const monthCells = monthsByYear[y].map((mk) => `<td class="num">${PAR.fmtKpiValue(kpi.aggregate([monthsMap[mk]]), kpi.unit)}</td>`).join("");
          return yearCell + monthCells;
        }).join("");
        const total = kpi.aggregate(allEntries);
        return `<tr><td></td><td>${kpi.label}</td>${cells}<td class="num"><strong>${PAR.fmtKpiValue(total, kpi.unit)}</strong></td></tr>`;
      }).join("");
      return catRow + kpiRows;
    }).join("");

    matrixWrap.innerHTML = `
      <table>
        <thead><tr><th colspan="2">Category</th>${headerCells}<th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    matrixWrap.querySelectorAll(".year-toggle").forEach((th) => {
      th.addEventListener("click", () => {
        const y = th.dataset.year;
        if (expandedYears.has(y)) expandedYears.delete(y);
        else expandedYears.add(y);
        renderMatrix(monthsMap);
      });
    });
  }

  function destroyCharts() {
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
  }

  async function loadProject(code) {
    expandedYears.clear();
    const plant = await PAR.fetchJSON(`data/plants/${code}.json`);
    let turbineData = { turbines: {} };
    try {
      turbineData = await PAR.fetchJSON(`data/turbines/${code}.json`);
    } catch (e) {
      // no turbine-level data for this plant yet
    }
    renderMatrix(plant.months);
    destroyCharts();
    charts = PAR.buildReportCharts(plant, turbineData);
    downloadBtn.href = `reports/kpi-report/${code}.pdf`;
  }

  projectSelect.addEventListener("change", () => loadProject(projectSelect.value));
  if (plantsWithData.length) loadProject(plantsWithData[0].code);
})();
