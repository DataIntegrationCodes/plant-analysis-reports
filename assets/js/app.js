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

  fmtPercent(v) {
    if (v === null || v === undefined) return "–";
    return `${(v * 100).toFixed(1)}%`;
  },

  fmtNumber(v, digits = 1) {
    if (v === null || v === undefined) return "–";
    return v.toLocaleString(undefined, { maximumFractionDigits: digits });
  },

  fmtSigned(v, digits = 1) {
    if (v === null || v === undefined) return "–";
    const s = v.toLocaleString(undefined, { maximumFractionDigits: digits });
    return v > 0 ? `+${s}` : s;
  },

  monthLabel(key) {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
          <div class="metric"><div class="metric-label">Wind Index</div><div class="metric-value small">${PAR.fmtNumber(w.windIndex, 2)}</div></div>
        </div>
      </div>
    `;
  },
};
