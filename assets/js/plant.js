(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const monthSelect = document.getElementById("monthSelect");
  const downloadBtn = document.getElementById("downloadPdf");
  const body = document.getElementById("reportBody");

  if (!code) {
    document.getElementById("plantName").textContent = "No plant specified";
    return;
  }

  let plant;
  try {
    plant = await PAR.fetchJSON(`data/plants/${code}.json`);
  } catch (e) {
    document.getElementById("plantName").textContent = "Plant not found";
    return;
  }

  document.getElementById("plantName").textContent = plant.name;
  document.getElementById("plantMeta").textContent = `${plant.code} · ${plant.mwInstalled} MW installed`;
  document.title = `${plant.name} — Plant Analysis Reports`;

  const months = Object.keys(plant.months);
  if (!months.length) {
    monthSelect.classList.add("hidden");
    downloadBtn.classList.add("hidden");
    body.innerHTML = '<div class="section"><p class="empty-note">This plant has no production data in the model yet.</p></div>';
    return;
  }

  function render(month) {
    body.innerHTML = PAR.renderPlantSections(plant.months[month]);
    downloadBtn.href = `reports/${code}/${month}.pdf`;
  }

  PAR.populateMonthSelect(monthSelect, months, months.sort().reverse()[0]);
  render(monthSelect.value);
  monthSelect.addEventListener("change", () => render(monthSelect.value));
})();
