/* =========================================================================
   LIVE DATA LOADER — pulls branch data from a Google Sheet published as
   CSV, and rebuilds window.DASHBOARD_DATA from the raw numbers, on a timer.

   ---- SETUP (free, no API key / no billing account needed) --------------
   1. In Google Drive, right-click your Excel file → Open with →
      Google Sheets. This creates a linked Google Sheets copy — from now on
      just keep editing that Sheet (it openource).
   2. In the Sheet: File → Share → Publish to web → pick the correct
      sheet/tab → format "Comma-separated values (.csv)" → Publish.
   3. Copy the link it gives you and paste it below as CSV_URL.
   ------------------------------------------------------------------------ */
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRADuwtWKQqQNa0E1xMCAVA_2CZo6tpcd8F8pGcmuXr9CU1naNKpFQCpGKR7cnGL71KcVnRii8Bb5zb/pub?gid=775004196&single=true&output=csv";

// How often to re-fetch the sheet, in milliseconds. 2 minutes by default.
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

// Column header aliases. Add any header text your sheet actually uses —
// matching is case-insensitive and ignores extra spaces/punctuation.
const HEADER_ALIASES = {
  srNo: ["sr no", "sr.no", "s no", "serial no", "sr"],
  name: ["branch name", "branch", "name"],
  sbActive: ["sb active accounts", "sb active", "active sb"],
  caActive: ["ca active accounts", "ca active", "active ca"],
  sbImps: ["sb imps", "imps sb"],
  caImps: ["ca imps", "imps ca"],
  sbDebit: ["sb debit cards", "sb debit", "debit sb", "sb debit card"],
  caDebit: ["ca debit cards", "ca debit", "debit ca", "ca debit card"],
};

const MONTH_LABELS = [
  "Jun 2024", "Jul 2024", "Aug 2024", "Sep 2024", "Oct 2024",
  "Nov 2024", "Dec 2024", "Jan 2025", "Feb 2025", "Mar 2025",
];
const TARGET_PCT = 70;

function normalizeHeader(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildHeaderMap(headerRow) {
  const normalized = headerRow.map(normalizeHeader);
  const map = {};
  Object.keys(HEADER_ALIASES).forEach((field) => {
    const aliases = HEADER_ALIASES[field].map(normalizeHeader);
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  });
  return map;
}

function toNumber(value) {
  const n = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function computeMetric(currentCount, active) {
  const currentPct = active > 0 ? (currentCount / active) * 100 : 0;
  const targetAccounts = Math.max(active * (TARGET_PCT / 100), currentCount);
  const targetPct = active > 0 ? (targetAccounts / active) * 100 : TARGET_PCT;
  const gapPct = Math.max(0, targetPct - currentPct);
  const additionalRequired = Math.max(0, targetAccounts - currentCount);
  const targets = [];
  for (let k = 1; k <= 10; k++) {
    targets.push(currentCount + (k * (targetAccounts - currentCount)) / 10);
  }
  return {
    metric: { currentPct, gapPct, additionalRequired, targetAccounts, targetPct },
    targets,
  };
}

function buildBranch(row, headerMap) {
  const get = (field) => (field in headerMap ? row[headerMap[field]] : undefined);
  const sbActive = toNumber(get("sbActive"));
  const caActive = toNumber(get("caActive"));
  const sbImps = toNumber(get("sbImps"));
  const caImps = toNumber(get("caImps"));
  const sbDebit = toNumber(get("sbDebit"));
  const caDebit = toNumber(get("caDebit"));

  const activeTotal = sbActive + caActive;
  const impsTotal = sbImps + caImps;
  const debitTotal = sbDebit + caDebit;

  const mobile = computeMetric(impsTotal, activeTotal);
  const debit = computeMetric(debitTotal, activeTotal);

  const rawName = String(get("name") || "").trim();
  const displayName = rawName.replace(/^\*+\s*/, "");

  return {
    srNo: String(get("srNo") || ""),
    name: rawName,
    displayName,
    specialCase: false,
    activeAccounts: { sb: sbActive, ca: caActive, total: activeTotal },
    imps: { sb: sbImps, ca: caImps, total: impsTotal },
    debitCards: { sb: sbDebit, ca: caDebit, total: debitTotal },
    mobile: mobile.metric,
    debit: debit.metric,
    mobileTargets: mobile.targets,
    debitTargets: debit.targets,
  };
}

function buildDashboardData(rows) {
  if (!rows.length) throw new Error("No header row found in the sheet.");
  const headerMap = buildHeaderMap(rows[0]);
  const required = ["name", "sbActive", "caActive", "sbImps", "caImps", "sbDebit", "caDebit"];
  const missing = required.filter((f) => !(f in headerMap));
  if (missing.length) {
    throw new Error("Missing expected column(s): " + missing.join(", "));
  }

  const branches = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => buildBranch(row, headerMap));

  const totals = branches.reduce(
    (acc, b) => {
      acc.sbActive += b.activeAccounts.sb;
      acc.caActive += b.activeAccounts.ca;
      acc.sbImps += b.imps.sb;
      acc.caImps += b.imps.ca;
      acc.sbDebit += b.debitCards.sb;
      acc.caDebit += b.debitCards.ca;
      return acc;
    },
    { sbActive: 0, caActive: 0, sbImps: 0, caImps: 0, sbDebit: 0, caDebit: 0 }
  );

  const overallActive = totals.sbActive + totals.caActive;
  const overallImps = totals.sbImps + totals.caImps;
  const overallDebit = totals.sbDebit + totals.caDebit;
  const overallMobile = computeMetric(overallImps, overallActive);
  const overallDebitMetric = computeMetric(overallDebit, overallActive);

  return {
    overall: {
      sourceFile: "Live: Google Drive",
      months: MONTH_LABELS,
      targetPct: TARGET_PCT,
      activeAccounts: { sb: totals.sbActive, ca: totals.caActive, total: overallActive },
      imps: { sb: totals.sbImps, ca: totals.caImps, total: overallImps },
      debitCards: { sb: totals.sbDebit, ca: totals.caDebit, total: overallDebit },
      mobile: overallMobile.metric,
      debit: overallDebitMetric.metric,
      mobileTargets: overallMobile.targets,
      debitTargets: overallDebitMetric.targets,
    },
    branches,
  };
}

async function fetchCsvRows() {
  const bustCache = (CSV_URL.includes("?") ? "&" : "?") + "cachebust=" + Date.now();
  const response = await fetch(CSV_URL + bustCache);
  if (!response.ok) {
    throw new Error(`Sheet fetch failed (${response.status})`);
  }
  const text = await response.text();
  const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
  if (parsed.errors && parsed.errors.length) {
    console.warn("CSV parse warnings:", parsed.errors);
  }
  return parsed.data;
}

async function loadLiveData() {
  const rows = await fetchCsvRows();
  window.DASHBOARD_DATA = buildDashboardData(rows);
}

function setLiveStatus(text, isError) {
  const el = document.getElementById("liveStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", !!isError);
}

async function refreshLiveData() {
  setLiveStatus("Refreshing…", false);
  try {
    await loadLiveData();
    const stamp = new Date().toLocaleTimeString();
    setLiveStatus(`Live • updated ${stamp}`, false);
    if (typeof window.onLiveDataRefreshed === "function") {
      window.onLiveDataRefreshed();
    }
  } catch (err) {
    console.error("Live data refresh failed:", err);
    setLiveStatus("Data refresh failed — check console", true);
  }
}

// Kick off the first load immediately, then poll on an interval.
window.__liveDataReady = refreshLiveData();
setInterval(refreshLiveData, REFRESH_INTERVAL_MS);

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("refreshBtn");
  if (btn) btn.addEventListener("click", refreshLiveData);
});
