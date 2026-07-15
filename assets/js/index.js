(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const manifest = await PAR.fetchJSON("data/manifest.json");
  const fleet = await PAR.fetchJSON("data/fleet.json");

  const months = manifest.months;
  const latestMonth = months[months.length - 1];
  const latest = fleet.months[latestMonth];

  document.getElementById("generatedAt").textContent = `Latest month: ${PAR.monthLabel(latestMonth)}`;

  const summaryGrid = document.getElementById("fleetSummary");
  if (latest) {
    summaryGrid.innerHTML = `
      <div class="tile">
        <div class="tile-label">Fleet Production</div>
        <div class="tile-value">${PAR.fmtMWh(latest.production.actual)}</div>
        <div class="tile-sub">${latest.plantCount} plants reporting</div>
      </div>
      <div class="tile">
        <div class="tile-label">Avg Technical Availability</div>
        <div class="tile-value">${PAR.fmtPercent(latest.availability.technical)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Avg PBA</div>
        <div class="tile-value">${PAR.fmtPercent(latest.availability.pba)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Avg Capacity Factor</div>
        <div class="tile-value">${PAR.fmtPercent(latest.production.capacityFactor)}</div>
      </div>
    `;
  }

  const grid = document.getElementById("cardsGrid");
  grid.innerHTML = manifest.plants.map((p) => {
    const plantMonths = p.monthCount;
    const badgeClass = PAR.badgeClassForStatus(p.status);
    const statusLabel = PAR.STATUS_LABEL[p.status] || p.status;
    return `
      <a class="card" href="plant.html?code=${p.code}">
        <div class="card-top">
          <div>
            <p class="card-name">${p.name}</p>
            <p class="card-code">${p.code} · ${p.mwInstalled} MW</p>
          </div>
          <span class="badge ${badgeClass}">${statusLabel}</span>
        </div>
        <div class="card-meta-row">
          <span>${plantMonths} month${plantMonths === 1 ? "" : "s"} of data</span>
        </div>
      </a>
    `;
  }).join("");
})();
