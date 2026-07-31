/*
  Google Sheet connector for the dashboard.

  Recommended setup:
  1. In Google Sheets, use File > Share > Publish to web.
  2. Publish the data tab as CSV.
  3. Paste that CSV link into publishedCsvUrl below.

  For a private Sheet, deploy a Google Apps Script web app that returns:
  JSON.stringify({ values: SpreadsheetApp.getActiveSheet().getDataRange().getValues() })
  Then paste the web app URL into appsScriptUrl.
*/
const GOOGLE_SHEET_CONFIG = {
  publishedCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRADuwtWKQqQNa0E1xMCAVA_2CZo6tpcd8F8pGcmuXr9CU1naNKpFQCpGKR7cnGL71KcVnRii8Bb5zb/pub?gid=775004196&single=true&output=csv",
  appsScriptUrl: "",
  spreadsheetId: "",
  gid: "",
  sheetName: "Sheet1 (2)",
  refreshMs: 15000,
};

(function initLiveData() {
  const emptyData = makeEmptyData();
  window.DASHBOARD_DATA = window.DASHBOARD_DATA || emptyData;
  window.__liveDataReady = loadLiveData();
  window.refreshLiveData = loadLiveData;

  if (GOOGLE_SHEET_CONFIG.refreshMs > 0) {
    window.setInterval(() => loadLiveData(false), GOOGLE_SHEET_CONFIG.refreshMs);
  }
}());

async function loadLiveData(showLoading = true) {
  const url = buildSheetUrl();
  if (!url) {
    setLiveStatus("Add Google Sheet URL in live-data.js", true);
    return window.DASHBOARD_DATA;
  }

  try {
    if (showLoading) setLiveStatus("Refreshing data...");
    const response = await fetch(withCacheBust(url), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const rows = parseSheetResponse(text);
    window.DASHBOARD_DATA = buildDashboardData(rows);
    setLiveStatus(`Updated ${new Date().toLocaleTimeString()}`);

    if (typeof window.onLiveDataRefreshed === "function") {
      window.onLiveDataRefreshed();
    }
    return window.DASHBOARD_DATA;
  } catch (error) {
    console.error("Unable to load Google Sheet data", error);
    setLiveStatus("Google Sheet data unavailable", true);
    return window.DASHBOARD_DATA;
  }
}

function buildSheetUrl() {
  const config = GOOGLE_SHEET_CONFIG;
  if (config.appsScriptUrl) return config.appsScriptUrl;
  if (config.publishedCsvUrl) return config.publishedCsvUrl;
  if (!config.spreadsheetId) return "";

  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheetId)}/gviz/tq`;
  const params = new URLSearchParams({ tqx: "out:csv" });
  if (config.gid) params.set("gid", config.gid);
  if (!config.gid && config.sheetName) params.set("sheet", config.sheetName);
  return `${base}?${params.toString()}`;
}

function withCacheBust(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

function parseSheetResponse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.values)) return json.values;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.rows)) return json.rows;
    if (json.branches && json.overall) return json;
    throw new Error("JSON response does not contain values/data/rows.");
  }

  if (window.Papa) {
    return window.Papa.parse(trimmed, {
      skipEmptyLines: false,
    }).data;
  }

  return simpleCsvParse(trimmed);
}

function buildDashboardData(input) {
  if (input && input.branches && input.overall) return input;

  const rows = input.map((row) => Array.isArray(row) ? row : Object.values(row));
  const monthLabels = getMonthLabels(rows);
  const branches = rows
    .slice(4)
    .map(rowToBranch)
    .filter(Boolean);

  return {
    overall: makeOverall(branches, monthLabels),
    branches,
  };
}

function rowToBranch(row) {
  const branchName = cleanText(row[1]);
  if (!branchName || branchName.toUpperCase() === "TOTAL") return null;
  if (!row[0] && !toNumber(row[2]) && !toNumber(row[4])) return null;

  const activeTotal = toNumber(row[4]) || toNumber(row[2]) + toNumber(row[3]);
  const impsTotal = toNumber(row[7]) || toNumber(row[5]) + toNumber(row[6]);
  const cardTotal = toNumber(row[10]) || toNumber(row[8]) + toNumber(row[9]);
  const targetPct = toPercentNumber(row[15]) || toPercentNumber(row[21]) || 70;
  const mobileTargets = row.slice(22, 32).map(toNumber);
  const debitTargets = row.slice(33, 43).map(toNumber);
  const specialCase = branchName.startsWith("*");
  const displayName = branchName.replace(/^\*\s*/, "");

  return {
    code: cleanText(row[0]),
    name: slug(displayName),
    displayName,
    specialCase,
    activeAccounts: {
      sb: toNumber(row[2]),
      ca: toNumber(row[3]),
      total: activeTotal,
    },
    imps: {
      sb: toNumber(row[5]),
      ca: toNumber(row[6]),
      total: impsTotal,
    },
    debitCards: {
      sb: toNumber(row[8]),
      ca: toNumber(row[9]),
      total: cardTotal,
    },
    mobile: {
      currentPct: toPercentNumber(row[11]) || percent(impsTotal, activeTotal),
      gapPct: toPercentNumber(row[12]),
      additionalRequired: toNumber(row[13]),
      targetAccounts: toNumber(row[14]) || activeTotal * targetPct / 100,
      targetPct,
    },
    debit: {
      currentPct: toPercentNumber(row[17]) || percent(cardTotal, activeTotal),
      gapPct: toPercentNumber(row[18]),
      additionalRequired: toNumber(row[19]),
      targetAccounts: toNumber(row[20]) || activeTotal * targetPct / 100,
      targetPct,
    },
    mobileTargets,
    debitTargets,
  };
}

function getMonthLabels(rows) {
  const monthRow = rows[3] || [];
  const labels = monthRow.slice(22, 32).map(formatMonth).filter(Boolean);
  return labels.length ? labels : ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
}

function makeOverall(branches, months) {
  const overall = {
    months,
    targetPct: 70,
    activeAccounts: sumGroup(branches, "activeAccounts"),
    imps: sumGroup(branches, "imps"),
    debitCards: sumGroup(branches, "debitCards"),
    mobile: {},
    debit: {},
  };

  overall.mobile = makeMetricOverall(branches, "mobile", "mobileTargets", overall.imps.total, overall.activeAccounts.total);
  overall.debit = makeMetricOverall(branches, "debit", "debitTargets", overall.debitCards.total, overall.activeAccounts.total);
  return overall;
}

function makeMetricOverall(branches, metric, targetKey, currentTotal, activeTotal) {
  const targetPct = 70;
  const targetAccounts = activeTotal * targetPct / 100;
  return {
    currentPct: percent(currentTotal, activeTotal),
    gapPct: Math.max(0, targetPct - percent(currentTotal, activeTotal)),
    additionalRequired: Math.max(0, targetAccounts - currentTotal),
    targetAccounts,
    targetPct,
    targets: sumSeries(branches, targetKey),
    targetPcts: sumSeries(branches, targetKey).map((value) => percent(value, activeTotal)),
  };
}

function sumGroup(branches, key) {
  return branches.reduce((total, branch) => ({
    sb: total.sb + branch[key].sb,
    ca: total.ca + branch[key].ca,
    total: total.total + branch[key].total,
  }), { sb: 0, ca: 0, total: 0 });
}

function sumSeries(branches, key) {
  const length = Math.max(10, ...branches.map((branch) => branch[key].length));
  return Array.from({ length }, (_, index) =>
    branches.reduce((sum, branch) => sum + (Number(branch[key][index]) || 0), 0)
  );
}

function toNumber(value) {
  if (value instanceof Date) return 0;
  const normalized = cleanText(value).replace(/,/g, "").replace(/%/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function toPercentNumber(value) {
  const text = cleanText(value);
  if (!text) return 0;
  const number = toNumber(text);
  if (text.includes("%") && number <= 1) return number * 100;
  return number;
}

function percent(value, base) {
  return base ? (value / base) * 100 : 0;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatMonth(value) {
  if (value instanceof Date) {
    return value.toLocaleString("en", { month: "short" });
  }

  const text = cleanText(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString("en", { month: "short" });
  }
  return text.slice(0, 3);
}

function slug(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function setLiveStatus(message, isError = false) {
  const status = document.getElementById("liveStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function makeEmptyData() {
  return {
    overall: {
      months: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
      targetPct: 70,
      activeAccounts: { sb: 0, ca: 0, total: 0 },
      imps: { sb: 0, ca: 0, total: 0 },
      debitCards: { sb: 0, ca: 0, total: 0 },
      mobile: {
        currentPct: 0,
        gapPct: 70,
        additionalRequired: 0,
        targetAccounts: 0,
        targetPct: 70,
        targets: Array(10).fill(0),
        targetPcts: Array(10).fill(0),
      },
      debit: {
        currentPct: 0,
        gapPct: 70,
        additionalRequired: 0,
        targetAccounts: 0,
        targetPct: 70,
        targets: Array(10).fill(0),
        targetPcts: Array(10).fill(0),
      },
    },
    branches: [],
  };
}

function simpleCsvParse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
