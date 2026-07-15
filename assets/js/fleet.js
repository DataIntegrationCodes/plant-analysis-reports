(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const monthSelect = document.getElementById("monthSelect");
  const downloadBtn = document.getElementById("downloadPdf");
  const body = document.getElementById("reportBody");
  const tableBody = document.getElementById("plantTableBody");

  const manifest = await PAR.fetchJSON("data/manifest.json");
  const fleet = await PAR.fetchJSON("data/fleet.json");
  const plants = await Promise.all(
    manifest.plants.map((p) => PAR.fetchJSON(`data/plants/${p.code}.json`))
  );

  function render(month) {
    body.innerHTML = PAR.renderPlantSections(fleet.months[month]);
    downloadBtn.href = `reports/fleet/${month}.pdf`;

    const rows = manifest.plants.map((meta, i) => {
      const entry = plants[i].months[month];
      const badgeClass = PAR.badgeClassForStatus(meta.status);
      const statusLabel = PAR.STATUS_LABEL[meta.status] || meta.status;
      if (!entry) {
        return `
          <tr>
            <td><a href="plant.html?code=${meta.code}">${meta.name}</a></td>
            <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
            <td class="num" colspan="6">No data for this month</td>
          </tr>
        `;
      }
      return `
        <tr>
          <td><a href="plant.html?code=${meta.code}">${meta.name}</a></td>
          <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
          <td class="num">${PAR.fmtNumber(entry.production.actual, 0)}</td>
          <td class="num">${PAR.fmtNumber(entry.production.p50Target, 0)}</td>
          <td class="num">${PAR.fmtPercent(entry.production.capacityFactor)}</td>
          <td class="num">${PAR.fmtPercent(entry.availability.technical)}</td>
          <td class="num">${PAR.fmtPercent(entry.availability.pba)}</td>
          <td class="num">${PAR.fmtNumber(entry.wind.windIndex, 2)}</td>
        </tr>
      `;
    });
    tableBody.innerHTML = rows.join("");
  }

  PAR.populateMonthSelect(monthSelect, manifest.months, manifest.months.slice().reverse()[0]);
  render(monthSelect.value);
  monthSelect.addEventListener("change", () => render(monthSelect.value));
})();
