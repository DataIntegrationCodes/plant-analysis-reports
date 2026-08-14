// Availability below 97.5% or capacity factor below 40% is flagged red,
// otherwise green - thresholds are fixed, not relative to the fleet average.
const AVAILABILITY_THRESHOLD = 0.975;
const CAPACITY_FACTOR_THRESHOLD = 0.4;

function kpiClass(value, threshold) {
  if (value === null || value === undefined) return "";
  return value < threshold ? "kpi-red" : "kpi-green";
}

// Fleet-wide narrative built only from what plantStats actually contains -
// same "only assert what the data supports" rule as the per-project summary
// in app.js's buildProjectSummary.
function buildFleetInsight(plantStats, avgCapacityFactor) {
  const withData = plantStats.filter((s) => s.hasData);
  if (!withData.length) return "";

  const byProduction = [...withData].sort((a, b) => b.ytdProduction - a.ytdProduction);
  const topProducer = byProduction[0];

  const byCapacityFactor = [...withData].sort((a, b) => b.capacityFactor - a.capacityFactor);
  const topCF = byCapacityFactor[0];

  let sentence = topProducer.plant.code === topCF.plant.code
    ? `<strong>${topProducer.plant.name}</strong> led the fleet YTD with ${PAR.fmtGWh(topProducer.ytdProduction)} produced and the highest capacity factor at ${PAR.fmtPercent(topCF.capacityFactor)}.`
    : `<strong>${topProducer.plant.name}</strong> led the fleet YTD with ${PAR.fmtGWh(topProducer.ytdProduction)} produced, and <strong>${topCF.plant.name}</strong> posted the highest capacity factor at ${PAR.fmtPercent(topCF.capacityFactor)}.`;

  const lowAvailability = [];
  for (const s of withData) {
    const fields = [["contractual availability", s.contractual], ["technical availability", s.technical], ["PBA", s.pba]];
    for (const [label, value] of fields) {
      if (value !== null && value !== undefined && value < AVAILABILITY_THRESHOLD) {
        lowAvailability.push(`${s.plant.name} ${label} (${PAR.fmtPercent(value)})`);
      }
    }
  }
  if (lowAvailability.length) {
    sentence += ` ${lowAvailability.join(", ")} ${lowAvailability.length === 1 ? "sits" : "sit"} below the 97.5% availability threshold.`;
  }

  const lowCapacityFactor = withData.filter((s) => s.capacityFactor !== null && s.capacityFactor !== undefined && s.capacityFactor < CAPACITY_FACTOR_THRESHOLD);
  if (lowCapacityFactor.length === withData.length) {
    sentence += ` Every reporting plant remains below the 40% capacity factor threshold, in line with the fleet average of ${PAR.fmtPercent(avgCapacityFactor)}.`;
  } else if (lowCapacityFactor.length) {
    sentence += ` ${lowCapacityFactor.map((s) => s.plant.name).join(", ")} ${lowCapacityFactor.length === 1 ? "is" : "are"} below the 40% capacity factor threshold.`;
  }

  return `<p>${sentence}</p>`;
}

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
  let avgCapacityFactor = null;
  if (yearEntries.length) {
    const ytdProduction = PAR._sumBy(yearEntries, (e) => e.production.actual);
    const avgContractual = PAR._avgBy(yearEntries, (e) => e.availability.contractual);
    const avgTechnical = PAR._avgBy(yearEntries, (e) => e.availability.technical);
    const avgPba = PAR._avgBy(yearEntries, (e) => e.availability.pba);
    avgCapacityFactor = PAR._avgBy(yearEntries, (e) => e.production.capacityFactor);

    summaryGrid.innerHTML = `
      <div class="tile">
        <div class="tile-label">Fleet Total Production YTD</div>
        <div class="tile-value">${PAR.fmtGWh(ytdProduction)}</div>
        <div class="tile-sub">${latest ? latest.plantCount : manifest.plants.length} plants reporting</div>
      </div>
      <div class="tile">
        <div class="tile-label">Capacity Factor</div>
        <div class="tile-value ${kpiClass(avgCapacityFactor, CAPACITY_FACTOR_THRESHOLD)}">${PAR.fmtPercent(avgCapacityFactor)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">TBA - Contractual</div>
        <div class="tile-value ${kpiClass(avgContractual, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(avgContractual)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">TBA - Technical</div>
        <div class="tile-value ${kpiClass(avgTechnical, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(avgTechnical)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">PBA - Technical</div>
        <div class="tile-value ${kpiClass(avgPba, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(avgPba)}</div>
      </div>
    `;
  }

  // Per-project stats (shared by both the card grid and the table view)
  // mirror the fleet summary tiles above, scoped to each plant's own
  // current-year months.
  const plantData = await Promise.all(
    manifest.plants.map((p) => PAR.fetchJSON(`data/plants/${p.code}.json`).catch(() => null))
  );

  const plantStats = manifest.plants.map((p, i) => {
    const plant = plantData[i];
    const plantYearEntries = plant
      ? Object.keys(plant.months).filter((m) => m.startsWith(currentYear)).map((m) => plant.months[m])
      : [];
    if (!plantYearEntries.length) return { plant: p, hasData: false };
    return {
      plant: p,
      hasData: true,
      ytdProduction: PAR._sumBy(plantYearEntries, (e) => e.production.actual),
      capacityFactor: PAR._avgBy(plantYearEntries, (e) => e.production.capacityFactor),
      contractual: PAR._avgBy(plantYearEntries, (e) => e.availability.contractual),
      technical: PAR._avgBy(plantYearEntries, (e) => e.availability.technical),
      pba: PAR._avgBy(plantYearEntries, (e) => e.availability.pba),
    };
  });

  document.getElementById("fleetInsight").innerHTML = buildFleetInsight(plantStats, avgCapacityFactor);

  const grid = document.getElementById("cardsGrid");
  grid.innerHTML = plantStats.map((s) => {
    const p = s.plant;
    const badgeClass = PAR.badgeClassForStatus(p.status);
    const statusLabel = PAR.STATUS_LABEL[p.status] || p.status;

    const statsHtml = s.hasData
      ? `
        <div class="card-stats">
          <div><div class="card-stat-label">YTD Production</div><div class="card-stat-value">${PAR.fmtGWh(s.ytdProduction)}</div></div>
          <div><div class="card-stat-label">Capacity Factor</div><div class="card-stat-value ${kpiClass(s.capacityFactor, CAPACITY_FACTOR_THRESHOLD)}">${PAR.fmtPercent(s.capacityFactor)}</div></div>
          <div><div class="card-stat-label">TBA - Contractual</div><div class="card-stat-value ${kpiClass(s.contractual, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(s.contractual)}</div></div>
          <div><div class="card-stat-label">TBA - Technical</div><div class="card-stat-value ${kpiClass(s.technical, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(s.technical)}</div></div>
          <div><div class="card-stat-label">PBA - Technical</div><div class="card-stat-value ${kpiClass(s.pba, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(s.pba)}</div></div>
        </div>
      `
      : `<div class="card-meta-row"><span>No data yet</span></div>`;

    return `
      <a class="card" href="plant.html?code=${p.code}">
        <div class="card-top">
          <div>
            <p class="card-name">${p.name}</p>
            <p class="card-code">${p.code} · ${p.mwInstalled} MW</p>
          </div>
          <span class="badge ${badgeClass}">${statusLabel}</span>
        </div>
        ${statsHtml}
      </a>
    `;
  }).join("");

  const tableWrap = document.getElementById("plantsTableWrap");
  tableWrap.innerHTML = `
    <table class="plants-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Code</th>
          <th class="num">MW</th>
          <th>Status</th>
          <th class="num">YTD Production</th>
          <th class="num">Capacity Factor</th>
          <th class="num">TBA - Contractual</th>
          <th class="num">TBA - Technical</th>
          <th class="num">PBA - Technical</th>
        </tr>
      </thead>
      <tbody>
        ${plantStats.map((s) => {
          const p = s.plant;
          const badgeClass = PAR.badgeClassForStatus(p.status);
          const statusLabel = PAR.STATUS_LABEL[p.status] || p.status;
          const cells = s.hasData
            ? `
              <td class="num">${PAR.fmtGWh(s.ytdProduction)}</td>
              <td class="num ${kpiClass(s.capacityFactor, CAPACITY_FACTOR_THRESHOLD)}">${PAR.fmtPercent(s.capacityFactor)}</td>
              <td class="num ${kpiClass(s.contractual, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(s.contractual)}</td>
              <td class="num ${kpiClass(s.technical, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(s.technical)}</td>
              <td class="num ${kpiClass(s.pba, AVAILABILITY_THRESHOLD)}">${PAR.fmtPercent(s.pba)}</td>
            `
            : `<td class="num" colspan="5">No data yet</td>`;
          return `
            <tr onclick="window.location.href='plant.html?code=${p.code}'">
              <td>${p.name}</td>
              <td>${p.code}</td>
              <td class="num">${p.mwInstalled}</td>
              <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
              ${cells}
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  // Cards/Table toggle, persisted across visits.
  const cardsBtn = document.getElementById("viewCardsBtn");
  const tableBtn = document.getElementById("viewTableBtn");
  function setView(mode) {
    grid.style.display = mode === "table" ? "none" : "";
    tableWrap.style.display = mode === "table" ? "" : "none";
    cardsBtn.classList.toggle("active", mode !== "table");
    tableBtn.classList.toggle("active", mode === "table");
    localStorage.setItem("par-plants-view", mode);
  }
  cardsBtn.addEventListener("click", () => setView("cards"));
  tableBtn.addEventListener("click", () => setView("table"));
  setView(localStorage.getItem("par-plants-view") === "table" ? "table" : "cards");
})();
