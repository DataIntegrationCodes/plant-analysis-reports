(async function () {
  PAR.initThemeToggle(document.getElementById("themeToggle"));

  const manifest = await PAR.fetchJSON("data/manifest.json");
  const fleet = await PAR.fetchJSON("data/fleet.json");

  const months = manifest.months;
  const latestMonth = months[months.length - 1];
  const latest = fleet.months[latestMonth];

  // Fleet summary tiles are year-to-date (current calendar year), not a
  // single latest-month snapshot - production/historical are YTD sums,
  // everything else is a YTD average across the current year's months.
  const currentYear = latestMonth.slice(0, 4);
  const yearEntries = months.filter((m) => m.startsWith(currentYear)).map((m) => fleet.months[m]).filter(Boolean);

  document.getElementById("generatedAt").textContent = `Year to date: ${currentYear}`;

  const summaryGrid = document.getElementById("fleetSummary");
  if (yearEntries.length) {
    const ytdProduction = PAR._sumBy(yearEntries, (e) => e.production.actual);
    const ytdHistorical = PAR._sumBy(yearEntries, (e) => e.production.historical);
    const avgContractual = PAR._avgBy(yearEntries, (e) => e.availability.contractual);
    const avgTechnical = PAR._avgBy(yearEntries, (e) => e.availability.technical);
    const avgPba = PAR._avgBy(yearEntries, (e) => e.availability.pba);
    const avgCapacityFactor = PAR._avgBy(yearEntries, (e) => e.production.capacityFactor);
    const avgWindDeviation = PAR._avgBy(yearEntries, (e) => e.wind.deviation);

    summaryGrid.innerHTML = `
      <div class="tile">
        <div class="tile-label">Fleet Production</div>
        <div class="tile-value">${PAR.fmtGWh(ytdProduction)}</div>
        <div class="tile-sub">${latest ? latest.plantCount : manifest.plants.length} plants reporting</div>
      </div>
      <div class="tile">
        <div class="tile-label">Historical Production</div>
        <div class="tile-value">${PAR.fmtMWh(ytdHistorical)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Avg Contractual Availability</div>
        <div class="tile-value">${PAR.fmtPercent(avgContractual)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Avg Technical Availability</div>
        <div class="tile-value">${PAR.fmtPercent(avgTechnical)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">PBA (Energy Based)</div>
        <div class="tile-value">${PAR.fmtPercent(avgPba)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Avg Capacity Factor</div>
        <div class="tile-value">${PAR.fmtPercent(avgCapacityFactor)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Wind Deviation</div>
        <div class="tile-value">${PAR.fmtSigned(avgWindDeviation !== null && avgWindDeviation !== undefined ? avgWindDeviation * 100 : null)}%</div>
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
