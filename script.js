let source = window.DASHBOARD_DATA;

const state = {
  metric: "mobile",
  branch: "all",
  matrixPoints: [],
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();

  Promise.resolve(window.__liveDataReady).finally(() => {
    source = window.DASHBOARD_DATA;
    populateBranchFilter();
    bindEvents();
    renderDashboard();
  });

  window.onLiveDataRefreshed = () => {
    source = window.DASHBOARD_DATA;
    const previousValue = els.branchFilter.value;
    populateBranchFilter();
    if ([...els.branchFilter.options].some((opt) => opt.value === previousValue)) {
      els.branchFilter.value = previousValue;
      state.branch = previousValue;
    } else {
      state.branch = "all";
    }
    renderDashboard();
  };
});

function cacheElements() {
  [
    "branchFilter", "activeTotal", "activeSplit", "impsTotal", "impsSplit", "cardsTotal", "cardsSplit",
    "mobilePct", "mobileGap", "debitPct", "debitGap", "mobileGauge", "debitGauge", "mobileGaugeValue",
    "debitGaugeValue", "mobileGaugeTarget", "debitGaugeTarget", "mobileGapLarge", "debitGapLarge",
    "mobileRequired", "debitRequired", "targetChart", "matrixChart", "matrixTooltip", "topBranches",
    "rankMetricLabel", "rankHeader", "attentionList", "insightGrid", "exportBtn", "modal", "modalTitle",
    "modalTable", "closeModal", "viewAllTop", "viewAllAttention", "activeSpark", "impsSpark", "cardsSpark",
    "mobileSpark", "debitSpark", "liveStatus", "refreshBtn",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function populateBranchFilter() {
  els.branchFilter.innerHTML = '<option value="all">All Branches</option>';
  (source.branches || [])
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch.name;
      option.textContent = branch.displayName;
      els.branchFilter.appendChild(option);
    });
}

function bindEvents() {
  els.branchFilter.addEventListener("change", (event) => {
    state.branch = event.target.value;
    renderDashboard();
  });

  document.querySelectorAll(".metric-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = button.dataset.metric;
      document.querySelectorAll(".metric-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderDashboard();
    });
  });

  els.matrixChart.addEventListener("mousemove", handleMatrixHover);
  els.matrixChart.addEventListener("mouseleave", () => {
    els.matrixTooltip.hidden = true;
  });

  els.exportBtn.addEventListener("click", exportCsv);
  els.refreshBtn.addEventListener("click", () => {
    if (typeof window.refreshLiveData === "function") {
      window.refreshLiveData(true);
    }
  });
  els.viewAllTop.addEventListener("click", () => showBranchTable("All Branches - Performance Ranking", rankedBranches(state.metric)));
  els.viewAllAttention.addEventListener("click", () => showBranchTable("Branches Requiring Attention", attentionBranches()));
  els.closeModal.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });

  window.addEventListener("resize", debounce(renderCharts, 120));
}

function renderDashboard() {
  const selection = selectedData();
  renderKpis(selection);
  renderGauges(selection);
  renderRankings();
  renderAttention();
  renderInsights();
  renderCharts();
}

function renderCharts() {
  const selection = selectedData();
  drawTargetChart(selection);
  drawMatrixChart();
  drawSparks(selection);
}

function selectedData() {
  if (state.branch === "all") return source.overall;
  const branch = source.branches.find((item) => item.name === state.branch);
  if (!branch) return source.overall;
  return normalizeBranch(branch);
}

function normalizeBranch(branch) {
  const active = branch.activeAccounts.total || 1;
  return {
    branchName: branch.displayName,
    specialCase: branch.specialCase,
    months: source.overall.months,
    targetPct: 70,
    activeAccounts: branch.activeAccounts,
    imps: branch.imps,
    debitCards: branch.debitCards,
    mobile: {
      currentPct: branch.mobile.currentPct,
      gapPct: branch.mobile.gapPct,
      additionalRequired: branch.mobile.additionalRequired,
      targetAccounts: branch.mobile.targetAccounts,
      targetPct: branch.mobile.targetPct,
      targets: branch.mobileTargets,
      targetPcts: branch.mobileTargets.map((value) => (value / active) * 100),
    },
    debit: {
      currentPct: branch.debit.currentPct,
      gapPct: branch.debit.gapPct,
      additionalRequired: branch.debit.additionalRequired,
      targetAccounts: branch.debit.targetAccounts,
      targetPct: branch.debit.targetPct,
      targets: branch.debitTargets,
      targetPcts: branch.debitTargets.map((value) => (value / active) * 100),
    },
  };
}

function renderKpis(selection) {
  setText("activeTotal", number(selection.activeAccounts.total));
  setText("activeSplit", `SB: ${number(selection.activeAccounts.sb)}  •  CA: ${number(selection.activeAccounts.ca)}`);
  setText("impsTotal", number(selection.imps.total));
  setText("impsSplit", `SB: ${number(selection.imps.sb)}  •  CA: ${number(selection.imps.ca)}`);
  setText("cardsTotal", number(selection.debitCards.total));
  setText("cardsSplit", `SB: ${number(selection.debitCards.sb)}  •  CA: ${number(selection.debitCards.ca)}`);
  setText("mobilePct", pct(selection.mobile.currentPct));
  setText("mobileGap", `Target: ${pct(selection.targetPct, 0)} • Gap: ${fixed(selection.mobile.gapPct)} pp`);
  setText("debitPct", pct(selection.debit.currentPct));
  setText("debitGap", `Target: ${pct(selection.targetPct, 0)} • Gap: ${fixed(selection.debit.gapPct)} pp`);
}

function renderGauges(selection) {
  const mobileTarget = selection.mobile.targetPct || selection.targetPct;
  const debitTarget = selection.debit.targetPct || selection.targetPct;
  updateGauge(els.mobileGauge, els.mobileGaugeValue, selection.mobile.currentPct);
  updateGauge(els.debitGauge, els.debitGaugeValue, selection.debit.currentPct);
  setText("mobileGaugeTarget", `Target: ${pct(mobileTarget, 0)}`);
  setText("debitGaugeTarget", `Target: ${pct(debitTarget, 0)}`);
  setText("mobileGapLarge", fixed(Math.max(0, mobileTarget - selection.mobile.currentPct)));
  setText("debitGapLarge", fixed(Math.max(0, debitTarget - selection.debit.currentPct)));
  setText("mobileRequired", number(selection.mobile.additionalRequired));
  setText("debitRequired", number(selection.debit.additionalRequired));
}

function updateGauge(gauge, label, value) {
  gauge.style.setProperty("--value", Math.max(0, Math.min(value, 100)).toFixed(2));
  label.textContent = pct(value);
}

function renderRankings() {
  const label = state.metric === "mobile" ? "Mobile Banking %" : "Debit Card %";
  setText("rankMetricLabel", `(By ${label})`);
  setText("rankHeader", label);
  const rows = rankedBranches(state.metric).slice(0, 5);
  if (!rows.length) {
    els.topBranches.innerHTML = '<div class="rank-row"><span>-</span><span>No data loaded</span><span>-</span></div>';
    return;
  }
  const max = Math.max(...rows.map((branch) => branch[state.metric].currentPct), 70);
  els.topBranches.innerHTML = rows.map((branch, index) => {
    const value = branch[state.metric].currentPct;
    const active = state.branch === branch.name ? " selected" : "";
    return `
      <div class="rank-row${active}">
        <span>${index + 1}</span>
        <span>${escapeHtml(branch.displayName)}</span>
        <span class="bar-cell">
          <i class="bar"><i style="width:${Math.min(100, (value / max) * 100)}%"></i></i>
          ${pct(value)}
        </span>
      </div>`;
  }).join("");
}

function renderAttention() {
  const rows = attentionBranches().slice(0, 5);
  if (!rows.length) {
    els.attentionList.innerHTML = '<div class="attention-item"><b>-</b><span>No data loaded</span><small></small><small></small></div>';
    return;
  }
  els.attentionList.innerHTML = rows.map((branch, index) => {
    const gap = Math.max(0, branch.mobile.gapPct);
    return `
      <div class="attention-item">
        <b>${index + 1}</b>
        <span>${escapeHtml(branch.displayName)}</span>
        <small>Mobile Gap: ${fixed(gap)} pp</small>
        <small>Need: ${number(branch.mobile.additionalRequired)} regs</small>
      </div>`;
  }).join("");
}

function renderInsights() {
  const topMobile = rankedBranches("mobile")[0];
  const topDebit = rankedBranches("debit")[0];
  const total = source.overall;
  const selected = selectedData();
  const context = selected.branchName ? selected.branchName : "Overall";
  const special = source.branches.find((branch) => branch.specialCase);
  if (!topMobile || !topDebit) {
    els.insightGrid.innerHTML = '<div class="insight"><i class="target-mini" aria-hidden="true"></i><span>Connect a Google Sheet to load live branch insights.</span></div>';
    return;
  }
  const insights = [
    { icon: "growth", text: `${topMobile.displayName} has the highest Mobile Banking penetration at ${pct(topMobile.mobile.currentPct)}` },
    { icon: "card-mini", text: `${topDebit.displayName} has the highest Debit Card penetration at ${pct(topDebit.debit.currentPct)}` },
    { icon: "users-mini", text: `Total ${number(total.imps.total)} IMPS registrations from ${number(total.activeAccounts.total)} active accounts (${pct(total.mobile.currentPct)} penetration)` },
    { icon: "target-mini", text: `${context} Mobile Banking requires ${number(selected.mobile.additionalRequired)} additional registrations to reach target` },
    { icon: "card-mini", text: `${context} Debit Cards require ${number(selected.debit.additionalRequired)} additional cards to reach target` },
    special
      ? { icon: "bank-mini", text: `${special.displayName} uses a special debit-card target base as per bank configuration` }
      : { icon: "bank-mini", text: `Dashboard is connected to ${number(source.branches.length)} branch records` },
  ];

  els.insightGrid.innerHTML = insights.map((item) => `
    <div class="insight"><i class="${item.icon}" aria-hidden="true"></i><span>${escapeHtml(item.text)}</span></div>
  `).join("");
}

function drawTargetChart(selection) {
  const canvas = fitCanvas(els.targetChart);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const pad = { left: 70, right: 28, top: 22, bottom: 42 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const mobile = selection.mobile.targetPcts;
  const debit = selection.debit.targetPcts;
  const months = selection.months || source.overall.months;

  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, pad, plotW, plotH, 0, 100, "%");
  drawAreaLine(ctx, debit, pad, plotW, plotH, "#ff9438", state.metric === "debit" ? 1 : 0.45, 100);
  drawAreaLine(ctx, mobile, pad, plotW, plotH, "#36a2ff", state.metric === "mobile" ? 1 : 0.45, 100);

  ctx.font = `${12 * devicePixelRatio}px Segoe UI, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#eaf3ff";
  months.forEach((month, i) => {
    const x = pad.left + (plotW * i) / (months.length - 1);
    ctx.fillText(month, x, h - 26 * devicePixelRatio);
  });

  labelLineValues(ctx, state.metric === "mobile" ? mobile : debit, pad, plotW, plotH, state.metric === "mobile" ? "#80e9ff" : "#ffb04f", 100);
}

function drawGrid(ctx, pad, plotW, plotH, min, max, suffix) {
  ctx.save();
  ctx.strokeStyle = "rgba(150, 190, 240, 0.18)";
  ctx.lineWidth = devicePixelRatio;
  ctx.font = `${13 * devicePixelRatio}px Segoe UI, Arial`;
  ctx.fillStyle = "#f4f8ff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i += 1) {
    const value = min + ((max - min) * i) / 5;
    const y = pad.top + plotH - (plotH * i) / 5;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(value)}${suffix}`, pad.left - 12 * devicePixelRatio, y);
  }
  ctx.strokeStyle = "rgba(150, 190, 240, 0.35)";
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);
  ctx.restore();
}

function drawAreaLine(ctx, values, pad, plotW, plotH, color, opacity, max) {
  const points = values.map((value, i) => ({
    x: pad.left + (plotW * i) / (values.length - 1),
    y: pad.top + plotH - (Math.max(0, Math.min(value, max)) / max) * plotH,
    value,
  }));
  ctx.save();
  ctx.globalAlpha = opacity;
  const area = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  area.addColorStop(0, rgba(color, 0.24));
  area.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.lineTo(points.at(-1).x, pad.top + plotH);
  ctx.lineTo(points[0].x, pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * devicePixelRatio;
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.4 * devicePixelRatio;
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.stroke();
  });
  ctx.restore();
}

function labelLineValues(ctx, values, pad, plotW, plotH, color, max) {
  ctx.save();
  ctx.font = `${13 * devicePixelRatio}px Segoe UI, Arial`;
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  values.forEach((value, i) => {
    const x = pad.left + (plotW * i) / (values.length - 1);
    const y = pad.top + plotH - (Math.max(0, Math.min(value, max)) / max) * plotH;
    ctx.textBaseline = "bottom";
    ctx.fillText(pct(value), x, y - 14 * devicePixelRatio);
  });
  ctx.restore();
}

function drawMatrixChart() {
  const canvas = fitCanvas(els.matrixChart);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const pad = { left: 66, right: 22, top: 14, bottom: 48 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const maxAccounts = Math.max(1, ...source.branches.map((branch) => branch.activeAccounts.total));
  state.matrixPoints = [];

  ctx.clearRect(0, 0, w, h);
  drawMatrixGrid(ctx, pad, plotW, plotH);

  source.branches.forEach((branch) => {
    const xVal = Math.min(100, branch.mobile.currentPct);
    const yVal = Math.min(100, branch.debit.currentPct);
    const x = pad.left + (xVal / 100) * plotW;
    const y = pad.top + plotH - (yVal / 100) * plotH;
    const radius = (6 + Math.sqrt(branch.activeAccounts.total / maxAccounts) * 17) * devicePixelRatio;
    const color = quadrantColor(branch);
    const selected = state.branch === branch.name;
    ctx.save();
    ctx.globalAlpha = selected || state.branch === "all" ? 0.95 : 0.38;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = (selected ? 4 : 1.4) * devicePixelRatio;
    ctx.strokeStyle = selected ? "#fff" : "rgba(255,255,255,0.55)";
    ctx.stroke();
    if (selected) {
      ctx.fillStyle = "#fff";
      ctx.font = `${18 * devicePixelRatio}px Segoe UI, Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", x, y);
    }
    ctx.restore();
    state.matrixPoints.push({ branch, x: x / devicePixelRatio, y: y / devicePixelRatio, r: radius / devicePixelRatio });
  });
}

function drawMatrixGrid(ctx, pad, plotW, plotH) {
  ctx.save();
  ctx.strokeStyle = "rgba(143, 185, 238, 0.14)";
  ctx.lineWidth = devicePixelRatio;
  ctx.font = `${12 * devicePixelRatio}px Segoe UI, Arial`;
  ctx.fillStyle = "#f4f8ff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i += 1) {
    const pctValue = i * 20;
    const y = pad.top + plotH - (pctValue / 100) * plotH;
    const x = pad.left + (pctValue / 100) * plotW;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
    ctx.fillText(`${pctValue}%`, pad.left - 10 * devicePixelRatio, y);
    ctx.textAlign = "center";
    ctx.fillText(`${pctValue}%`, x, pad.top + plotH + 22 * devicePixelRatio);
    ctx.textAlign = "right";
  }
  const x70 = pad.left + plotW * 0.7;
  const y70 = pad.top + plotH * 0.3;
  ctx.setLineDash([7 * devicePixelRatio, 5 * devicePixelRatio]);
  ctx.strokeStyle = "rgba(255, 75, 75, 0.95)";
  ctx.beginPath();
  ctx.moveTo(x70, pad.top);
  ctx.lineTo(x70, pad.top + plotH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad.left, y70);
  ctx.lineTo(pad.left + plotW, y70);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ff5858";
  ctx.textAlign = "left";
  ctx.fillText("70%", pad.left + 4 * devicePixelRatio, y70 - 10 * devicePixelRatio);
  ctx.fillStyle = "#f4f8ff";
  ctx.textAlign = "center";
  ctx.fillText("Mobile Banking Penetration (%)", pad.left + plotW / 2, pad.top + plotH + 42 * devicePixelRatio);
  ctx.save();
  ctx.translate(18 * devicePixelRatio, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Debit Card Penetration (%)", 0, 0);
  ctx.restore();
  ctx.strokeStyle = "rgba(143, 185, 238, 0.35)";
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);
  ctx.restore();
}

function handleMatrixHover(event) {
  const rect = els.matrixChart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = state.matrixPoints.find((point) => Math.hypot(point.x - x, point.y - y) <= point.r + 4);
  if (!hit) {
    els.matrixTooltip.hidden = true;
    return;
  }
  const branch = hit.branch;
  els.matrixTooltip.innerHTML = `
    <strong>${escapeHtml(branch.displayName)}</strong><br>
    Mobile Banking : ${pct(branch.mobile.currentPct)}<br>
    Debit Card : ${pct(branch.debit.currentPct)}<br>
    Active Accounts : ${number(branch.activeAccounts.total)}<br>
    IMPS Users : ${number(branch.imps.total)}<br>
    Debit Cards : ${number(branch.debitCards.total)}
  `;
  els.matrixTooltip.style.left = `${Math.min(rect.width - 220, hit.x + 16)}px`;
  els.matrixTooltip.style.top = `${Math.max(42, hit.y - 54)}px`;
  els.matrixTooltip.hidden = false;
}

function drawSparks(selection) {
  const activeSeries = source.branches
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((branch) => branch.activeAccounts.total);
  drawSpark(els.activeSpark, state.branch === "all" ? activeSeries : selection.mobile.targets, "#2e91ff");
  drawSpark(els.impsSpark, selection.mobile.targets, "#a35cff");
  drawSpark(els.cardsSpark, selection.debit.targets, "#24d4e6");
  drawSpark(els.mobileSpark, selection.mobile.targetPcts, "#63d957");
  drawSpark(els.debitSpark, selection.debit.targetPcts, "#ff8b31");
}

function drawSpark(canvas, values, color) {
  const fitted = fitCanvas(canvas);
  const ctx = fitted.getContext("2d");
  const w = fitted.width;
  const h = fitted.height;
  if (!values.length) {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  const pad = 4 * devicePixelRatio;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, i) => ({
    x: pad + ((w - pad * 2) * i) / Math.max(1, values.length - 1),
    y: h - pad - ((value - min) / span) * (h - pad * 2),
  }));
  ctx.clearRect(0, 0, w, h);
  const fill = ctx.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, rgba(color, 0.38));
  fill.addColorStop(1, rgba(color, 0));
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.lineTo(points.at(-1).x, h - pad);
  ctx.lineTo(points[0].x, h - pad);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.stroke();
}

function rankedBranches(metric) {
  return (source.branches || []).slice().sort((a, b) => b[metric].currentPct - a[metric].currentPct);
}

function attentionBranches() {
  return (source.branches || [])
    .slice()
    .sort((a, b) => b.mobile.gapPct - a.mobile.gapPct || b.mobile.additionalRequired - a.mobile.additionalRequired);
}

function showBranchTable(title, branches) {
  els.modalTitle.textContent = title;
  els.modalTable.innerHTML = `
    <thead>
      <tr>
        <th>Branch</th>
        <th>Active Accounts</th>
        <th>IMPS</th>
        <th>Mobile %</th>
        <th>Mobile Need</th>
        <th>Debit Cards</th>
        <th>Debit %</th>
        <th>Debit Need</th>
      </tr>
    </thead>
    <tbody>
      ${branches.map((branch) => `
        <tr>
          <td>${escapeHtml(branch.displayName)}</td>
          <td>${number(branch.activeAccounts.total)}</td>
          <td>${number(branch.imps.total)}</td>
          <td>${pct(branch.mobile.currentPct)}</td>
          <td>${number(branch.mobile.additionalRequired)}</td>
          <td>${number(branch.debitCards.total)}</td>
          <td>${pct(branch.debit.currentPct)}</td>
          <td>${number(branch.debit.additionalRequired)}</td>
        </tr>
      `).join("")}
    </tbody>`;
  els.modal.hidden = false;
}

function closeModal() {
  els.modal.hidden = true;
}

function exportCsv() {
  const rows = state.branch === "all"
    ? source.branches
    : source.branches.filter((branch) => branch.name === state.branch);
  if (!rows.length) return;
  const header = [
    "Branch", "Active SB", "Active CA", "Active Total", "IMPS SB", "IMPS CA", "IMPS Total",
    "Debit SB", "Debit CA", "Debit Total", "Mobile %", "Mobile Gap pp", "Mobile Need",
    "Debit %", "Debit Gap pp", "Debit Need",
  ];
  const body = rows.map((branch) => [
    branch.displayName,
    branch.activeAccounts.sb,
    branch.activeAccounts.ca,
    branch.activeAccounts.total,
    branch.imps.sb,
    branch.imps.ca,
    branch.imps.total,
    branch.debitCards.sb,
    branch.debitCards.ca,
    branch.debitCards.total,
    fixed(branch.mobile.currentPct),
    fixed(branch.mobile.gapPct),
    Math.round(branch.mobile.additionalRequired),
    fixed(branch.debit.currentPct),
    fixed(branch.debit.gapPct),
    Math.round(branch.debit.additionalRequired),
  ]);
  const csv = [header, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = state.branch === "all" ? "digital-banking-dashboard-all-branches.csv" : `${slug(rows[0].displayName)}-dashboard.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function quadrantColor(branch) {
  const mobileOk = branch.mobile.currentPct >= 70;
  const debitOk = branch.debit.currentPct >= 70;
  if (mobileOk && debitOk) return "#4fd962";
  if (!mobileOk && debitOk) return "#237dff";
  if (mobileOk && !debitOk) return "#ffcd3f";
  return branch.debit.currentPct > branch.mobile.currentPct ? "#ff7b42" : "#865cff";
}

function setText(id, value) {
  els[id].textContent = value;
}

function number(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-IN");
}

function pct(value, decimals = 2) {
  return `${fixed(value, decimals)}%`;
}

function fixed(value, decimals = 2) {
  return (Number(value) || 0).toFixed(decimals);
}

function rgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
