(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const projectSelect = document.getElementById("projectSelect");
  const yearFilterEl = document.getElementById("yearFilter");
  const downloadBtn = document.getElementById("downloadPdf");

  const manifest = await PAR.fetchJSON("data/manifest.json");
  const plantsWithData = manifest.plants.filter((p) => p.monthCount > 0);

  projectSelect.innerHTML = plantsWithData
    .map((p) => `<option value="${p.code}">${p.name} (${p.code})</option>`)
    .join("");

  let charts = {};
  let currentPlant = null;
  let currentTurbineData = null;
  let selectedYears = new Set();

  function destroyCharts() {
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
  }

  function filterPlantToYears(plant, yearsSet) {
    const months = {};
    for (const [k, v] of Object.entries(plant.months)) {
      if (yearsSet.has(k.slice(0, 4))) months[k] = v;
    }
    return { ...plant, months };
  }

  function filterTurbinesToYears(turbineData, yearsSet) {
    const turbines = {};
    for (const [id, monthsObj] of Object.entries(turbineData.turbines || {})) {
      const filtered = {};
      for (const [k, v] of Object.entries(monthsObj)) {
        if (yearsSet.has(k.slice(0, 4))) filtered[k] = v;
      }
      if (Object.keys(filtered).length) turbines[id] = filtered;
    }
    return { turbines };
  }

  function renderSelection() {
    destroyCharts();
    const filteredPlant = filterPlantToYears(currentPlant, selectedYears);
    const filteredTurbines = filterTurbinesToYears(currentTurbineData, selectedYears);
    charts = PAR.buildReportCharts(filteredPlant, filteredTurbines, { v2: true });
  }

  async function loadProject(code) {
    currentPlant = await PAR.fetchJSON(`data/plants/${code}.json`);
    try {
      currentTurbineData = await PAR.fetchJSON(`data/turbines/${code}.json`);
    } catch (e) {
      currentTurbineData = { turbines: {} };
    }

    const years = [...new Set(Object.keys(currentPlant.months).map((k) => k.slice(0, 4)))].sort();

    // Default to the latest year that actually has turbine-level data (IDs
    // get repowered/renamed over time, so the plant's most recent year can
    // be empty at turbine grain) - falls back to the latest plant year if
    // there's no turbine data at all. The user can still add more years.
    const turbineYears = new Set();
    for (const monthsObj of Object.values(currentTurbineData.turbines || {})) {
      for (const k of Object.keys(monthsObj)) turbineYears.add(k.slice(0, 4));
    }
    const yearsWithTurbines = years.filter((y) => turbineYears.has(y));
    const defaultYear = yearsWithTurbines.length ? yearsWithTurbines[yearsWithTurbines.length - 1] : years[years.length - 1];
    selectedYears = new Set(defaultYear ? [defaultYear] : []);

    PAR.renderYearFilter(yearFilterEl, years, selectedYears, renderSelection);
    downloadBtn.href = `reports/kpi-report-v2/${code}.pdf`;
    renderSelection();
  }

  projectSelect.addEventListener("change", () => loadProject(projectSelect.value));

  if (plantsWithData.length) loadProject(plantsWithData[0].code);
})();
