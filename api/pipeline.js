import { deriveToken } from "./login.js";

/* ============ Sheet registry (confirmed via Smartsheet MCP, July 2026) ============ */
const PIPELINE_SHEETS = [
  { id: 329611896377220,  stage: "Online Registration", group: "reg"  },
  { id: 2269489626304388, stage: "Newly Registered",    group: "reg"  },
  { id: 5491450611453828, stage: "Screening",           group: "proc" },
  { id: 3241937867853700, stage: "Ready to Assess",     group: "proc" },
  { id: 7817907694161796, stage: "Assessed",            group: "pool" },
  { id: 4234298248875908, stage: "Hotel Gap Pool",      group: "pool" },
];

const EXIT_SHEETS = [
  { id: 8423787105046404, type: "nla", year: 2025, label: "No Longer Available 2025" },
  { id: 24014020890500,   type: "nla", year: 2026, label: "No Longer Available 2026" },
  { id: 6566252218634116, type: "uns", year: 2025, label: "Unsuccessful 2025" },
  { id: 523715642085252,  type: "uns", year: 2026, label: "Unsuccessful 2026" },
];

/* ============ Column aliases (title drift tolerance across sheets) ============ */
const ALIASES = {
  palId:        ["PAL ID"],
  firstName:    ["FIRST NAME"],
  lastName:     ["LAST NAME"],
  dept:         ["DEPARTMENT"],
  pos:          ["SUGGESTED POSITION", "SUGESTED POSITION", "POSITION"],
  posApply:     ["POSITION APPLY", "POSITION APPLIED", "APPLY POSITION"],
  cruiseExp:    ["CRUISE EXPERIENCE"],
  eaf:          ["EAF"],
  c1dVisa:      ["C1/D VISA", "C1D VISA"],
  schVisa:      ["SCHENGEN VISA"],
  c1dExp:       ["C1/D EXP DATE"],
  schExp:       ["SCHENGEN EXP DATE"],
  apply:        ["DATE APPLY", "APPLY DATE"],
  assessedDate: ["ASSESSED DATE"],
};

/* ============ Department normalisation ============
   Single source of truth. Add future merges here only — every section of the
   dashboard (Overview, Pool, Candidate Breakdown, Exits) reads from this. */
const DEPT_MERGE = {
  "PRINTSHOP": "ADMINISTRATION",
};

function normalizeDept(raw) {
  const d = (raw || "").toUpperCase().trim();
  return DEPT_MERGE[d] || d;
}

function normalize(t) {
  return (t || "").toLowerCase().replace(/[\u2013\u2014-]/g, "-").replace(/\s+/g, " ").trim();
}

function buildColumnMap(sheetColumns) {
  const byTitle = new Map(sheetColumns.map(col => [normalize(col.title), col.id]));
  const map = {};
  for (const [key, titles] of Object.entries(ALIASES)) {
    for (const t of titles) {
      const id = byTitle.get(normalize(t));
      if (id) { map[key] = id; break; }
    }
  }
  return map;
}

/* ============ Paginated sheet fetch (500 rows/page) ============ */
async function fetchSheetRows(sheetId, token) {
  const rows = [];
  let page = 1, columns = null;
  while (true) {
    const res = await fetch(
      `https://api.smartsheet.com/2.0/sheets/${sheetId}?page=${page}&pageSize=500`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Sheet ${sheetId} HTTP ${res.status}`);
    const data = await res.json();
    if (!columns) columns = data.columns;
    rows.push(...(data.rows || []));
    if (!data.rows || data.rows.length < 500) break;
    page++;
  }
  return { columns, rows };
}

function rowExtractor(columns) {
  const colMap = buildColumnMap(columns);
  return (row) => {
    const cells = Object.fromEntries((row.cells || []).map(c => [c.columnId, c]));
    const get = key => {
      const id = colMap[key];
      if (!id) return "";
      const c = cells[id];
      if (!c) return "";
      const v = c.displayValue ?? c.value ?? "";
      return v === null || v === undefined ? "" : String(v);
    };
    return get;
  };
}

/* ============ Handler ============ */
export default async function handler(req, res) {
  const expected = deriveToken(process.env.TEAM_PASSWORD || "");
  if (req.headers["x-auth-token"] !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  const token = process.env.SMARTSHEET_TOKEN;
  if (!token) return res.status(500).json({ error: "SMARTSHEET_TOKEN is not configured." });

  try {
    const jobs = [
      ...PIPELINE_SHEETS.map(s => fetchSheetRows(s.id, token).then(d => ({ kind: "pipeline", meta: s, ...d }))),
      ...EXIT_SHEETS.map(s => fetchSheetRows(s.id, token).then(d => ({ kind: "exit", meta: s, ...d }))),
    ];
    const settled = await Promise.allSettled(jobs);
    const allMeta = [...PIPELINE_SHEETS.map(s => s.stage), ...EXIT_SHEETS.map(s => s.label)];

    const candidates = [], exits = [], failedSheets = [];

    settled.forEach((r, i) => {
      if (r.status !== "fulfilled") { failedSheets.push(allMeta[i]); return; }
      const { kind, meta, columns, rows } = r.value;
      const extract = rowExtractor(columns);

      for (const row of rows) {
        const get = extract(row);
        const name = [get("firstName"), get("lastName")].filter(Boolean).join(" ").trim();
        // skip completely empty rows
        if (!get("palId") && !name) continue;

        if (kind === "pipeline") {
          candidates.push({
            palId: get("palId"),
            name,
            dept: normalizeDept(get("dept")),
            pos: get("pos"),
            posApply: get("posApply"),
            cruiseExp: get("cruiseExp"),
            eaf: meta.group === "pool" ? get("eaf") : "",
            c1dVisa: get("c1dVisa").toUpperCase(),
            schVisa: get("schVisa").toUpperCase(),
            c1dExp: get("c1dExp"),
            schExp: get("schExp"),
            apply: get("apply"),
            assessedDate: get("assessedDate"),
            stage: meta.stage,
            group: meta.group,
          });
        } else {
          exits.push({
            palId: get("palId"),
            name,
            dept: normalizeDept(get("dept")),
            pos: get("pos"),
            apply: get("apply"),
            type: meta.type,
            year: meta.year,
          });
        }
      }
    });

    return res.status(200).json({
      candidates,
      exits,
      failedSheets,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({ error: "Upstream fetch failed", detail: String(err) });
  }
}
