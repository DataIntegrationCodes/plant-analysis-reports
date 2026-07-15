(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const projectSelect = document.getElementById("projectSelect");
  const yearSelect = document.getElementById("yearSelect");
  const downloadBtn = document.getElementById("downloadPdf");

  const manifest = await PAR.fetchJSON("data/manifest.json");
  const plantsWithData = manifest.plants.filter((p) => p.monthCount > 0);

  projectSelect.innerHTML = plantsWithData
    .map((p) => `<option value="${p.code}">${p.name} (${p.code})</option>`)
    .join("");

  let charts = {};
  let currentPlant = null;
  let currentTurbineData = null;

  function destroyCharts() {
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
  }

  function filterPlantToYear(plant, year) {
    const months = {};
    for (const [k, v] of Object.entries(plant.months)) {
      if (k.startsWith(year)) months[k] = v;
    }
    return { ...plant, months };
  }

  function filterTurbinesToYear(turbineData, year) {
    const turbines = {};
    for (const [id, monthsObj] of Object.entries(turbineData.turbines || {})) {
      const filtered = {};
      for (const [k, v] of Object.entries(monthsObj)) {
        if (k.startsWith(year)) filtered[k] = v;
      }
      if (Object.keys(filtered).length) turbines[id] = filtered;
    }
    return { turbines };
  }

  function renderYear(year) {
    destroyCharts();
    const filteredPlant = filterPlantToYear(currentPlant, year);
    const filteredTurbines = filterTurbinesToYear(currentTurbineData, year);
    charts = PAR.buildReportCharts(filteredPlant, filteredTurbines);
  }

  async function loadProject(code) {
    currentPlant = await PAR.fetchJSON(`data/plants/${code}.json`);
    try {
      currentTurbineData = await PAR.fetchJSON(`data/turbines/${code}.json`);
    } catch (e) {
      currentTurbineData = { turbines: {} };
    }

    const years = [...new Set(Object.keys(currentPlant.months).map((k) => k.slice(0, 4)))].sort().reverse();
    yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    downloadBtn.href = `reports/kpi-report/${code}.pdf`;
    renderYear(yearSelect.value);
  }

  projectSelect.addEventListener("change", () => loadProject(projectSelect.value));
  yearSelect.addEventListener("change", () => renderYear(yearSelect.value));

  if (plantsWithData.length) loadProject(plantsWithData[0].code);
})();
