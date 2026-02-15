import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const KEY_ENTRIES = "100x_entries";
const KEY_START_BALANCE = "100x_start_balance";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

async function loadFromStorage() {
  const res = await fetch(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR0RCmN9uf0TXrcan5bx33Yp-M_SP4KGF1mXBU_q_pc1YCjZMlFI30GjnPrP-fSJbKtY8vUZFRmqaZx/pub?gid=148955930&single=true&output=csv"
  );
  const text = await res.text();
  return parseCSV(text);
}

async function saveToStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error(e);
  }
}

function parseCSV(text) {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitRow = (line) => {
    const cols = [];
    let current = "",
      inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cols.push(current.trim());
    return cols;
  };
  const header = lines[0].toLowerCase();
  const startIdx =
    header.includes("date") || header.includes("week") || header.includes("day")
      ? 1
      : 0;
  const entries = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 2) continue;
    let dateStr = cols[0].replace(/"/g, "").trim();
    let date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      const parts = dateStr.split(/[\/\-\.]/);
      if (parts.length === 3) {
        const [a, b, c] = parts.map(Number);
        if (a > 31) date = new Date(a, b - 1, c);
        else if (a > 12) date = new Date(c, b - 1, a);
        else date = new Date(c, a - 1, b);
      }
    }
    if (isNaN(date.getTime())) continue;
    const balance = parseFloat(cols[1].replace(/[$£€,\s]/g, ""));
    if (isNaN(balance) || balance <= 0) continue;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    entries.push({ date: y + "-" + m + "-" + d, balance });
  }
  return entries;
}

function fmt(n) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PortfolioTracker() {
  const [entries, setEntries] = useState([]);
  const [startBalance, setStartBalance] = useState(0);
  const [view, setView] = useState("overall");
  const [modalOpen, setModalOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const e = await loadFromStorage();
      setEntries(e);
      const sb = await loadFromStorage(KEY_START_BALANCE);
      if (e) setEntries(e);
      if (sb) setStartBalance(sb);
    })();
  }, []);

  useEffect(() => {
    if (entries.length) saveToStorage(KEY_ENTRIES, entries);
  }, [entries]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );
  const effectiveStart = useMemo(
    () =>
      startBalance > 0
        ? startBalance
        : sortedEntries.length
        ? sortedEntries[0].balance
        : 0,
    [startBalance, sortedEntries]
  );

  const chartData = useMemo(() => {
    if (!sortedEntries.length) return [];
    if (view === "overall") {
      return sortedEntries.map((e) => ({
        label: e.date.slice(5),
        date: e.date,
        balance: e.balance,
        profit:
          effectiveStart > 0
            ? ((e.balance - effectiveStart) / effectiveStart) * 100
            : 0,
        multiplier: effectiveStart > 0 ? e.balance / effectiveStart : 1,
      }));
    }
    const mi = parseInt(view);
    const me = sortedEntries.filter(
      (e) => new Date(e.date + "T00:00:00").getMonth() === mi
    );
    if (!me.length) return [];
    const ms = me[0].balance;
    return me.map((e) => ({
      label: e.date.slice(8),
      date: e.date,
      balance: e.balance,
      profit: ms > 0 ? ((e.balance - ms) / ms) * 100 : 0,
      multiplier: ms > 0 ? e.balance / ms : 1,
    }));
  }, [sortedEntries, view, effectiveStart]);

  const stats = useMemo(() => {
    const last = sortedEntries.length
      ? sortedEntries[sortedEntries.length - 1]
      : null;
    const overallPnl =
      last && effectiveStart ? last.balance - effectiveStart : 0;
    const overallPct =
      effectiveStart > 0 ? (overallPnl / effectiveStart) * 100 : 0;
    const overallMulti =
      effectiveStart > 0 && last ? last.balance / effectiveStart : 0;
    let monthPnl = 0,
      monthPct = 0;
    if (view !== "overall") {
      const mi = parseInt(view);
      const me = sortedEntries.filter(
        (e) => new Date(e.date + "T00:00:00").getMonth() === mi
      );
      if (me.length) {
        monthPnl = me[me.length - 1].balance - me[0].balance;
        monthPct = me[0].balance > 0 ? (monthPnl / me[0].balance) * 100 : 0;
      }
    }
    return {
      overallPnl,
      overallPct,
      overallMulti,
      monthPnl,
      monthPct,
      currentBalance: last?.balance ?? 0,
    };
  }, [sortedEntries, effectiveStart, view]);

  const monthsWithData = useMemo(() => {
    const s = new Set();
    sortedEntries.forEach((e) =>
      s.add(new Date(e.date + "T00:00:00").getMonth())
    );
    return s;
  }, [sortedEntries]);

  // Manual add
  const [inputDate, setInputDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [inputBalance, setInputBalance] = useState("");
  const addEntry = () => {
    const bal = parseFloat(inputBalance.replace(/[$,]/g, ""));
    if (!inputDate || isNaN(bal) || bal <= 0) return;
    setEntries([
      ...entries.filter((e) => e.date !== inputDate),
      { date: inputDate, balance: bal },
    ]);
    setInputBalance("");
    setModalOpen(false);
  };
  const deleteEntry = (date) =>
    setEntries(entries.filter((e) => e.date !== date));

  // CSV paste
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvError, setCsvError] = useState("");
  const previewCSV = (text) => {
    setCsvText(text);
    setCsvError("");
    if (!text.trim()) {
      setCsvPreview([]);
      return;
    }
    const parsed = parseCSV(text);
    if (!parsed.length) {
      setCsvError(
        "Couldn't parse any rows. Check that column 1 is a date and column 2 is a number."
      );
      setCsvPreview([]);
    } else setCsvPreview(parsed);
  };
  const importCSV = () => {
    if (!csvPreview.length) return;
    setEntries(csvPreview);
    setCsvOpen(false);
    setCsvText("");
    setCsvPreview([]);
    setCsvError("");
  };
  const closeCsv = () => {
    setCsvOpen(false);
    setCsvText("");
    setCsvPreview([]);
    setCsvError("");
  };

  // Settings
  const [settStart, setSettStart] = useState(
    startBalance ? startBalance.toString() : ""
  );
  useEffect(() => {
    setSettStart(startBalance ? startBalance.toString() : "");
  }, [startBalance]);
  const saveSettings = async () => {
    const sb = parseFloat(settStart.replace(/[$,]/g, "")) || 0;
    setStartBalance(sb);
    await saveToStorage(KEY_START_BALANCE, sb);
    setSettingsOpen(false);
  };

  const lastProfit = chartData.length
    ? chartData[chartData.length - 1].profit
    : 0;
  const areaColor = lastProfit >= 0 ? "#4caf7c" : "#e05555";

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const base =
      view === "overall" ? effectiveStart : chartData[0]?.balance || d.balance;
    const pnl = d.balance - base;
    const pos = pnl >= 0;
    return (
      <div
        style={{
          background: "rgba(14,14,20,0.96)",
          border: "1px solid #2a2a3a",
          borderRadius: 8,
          padding: "10px 14px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
          minWidth: 175,
        }}
      >
        <div
          style={{
            color: "#555",
            fontSize: 11,
            marginBottom: 5,
            fontFamily: "'Courier New',monospace",
          }}
        >
          {d.date}
        </div>
        <div
          style={{
            color: "#e8e8e8",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 3,
          }}
        >
          ${fmt(d.balance)}
        </div>
        <div style={{ color: pos ? "#4caf7c" : "#e05555", fontSize: 12 }}>
          {pos ? "+" : ""}${fmt(pnl)} ({pos ? "+" : ""}
          {d.profit.toFixed(2)}%)
        </div>
        <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>
          {d.multiplier.toFixed(2)}x
        </div>
      </div>
    );
  };

  const inputStyle = {
    width: "100%",
    background: "#111118",
    border: "1px solid #2a2a3a",
    borderRadius: 6,
    color: "#e8e8e8",
    padding: "8px 10px",
    fontSize: 13,
    boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 11,
    color: "#555",
    display: "block",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };
  const Backdrop = ({ onClick, children }) => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClick}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
  const Modal = ({ style, children }) => (
    <div
      style={{
        background: "#16161e",
        border: "1px solid #2a2a3a",
        borderRadius: 12,
        padding: 28,
        boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        ...style,
      }}
    >
      {children}
    </div>
  );
  const ModalHeader = ({ title, onClose }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
      }}
    >
      <h3
        style={{ margin: 0, color: "#e8e8e8", fontSize: 16, fontWeight: 600 }}
      >
        {title}
      </h3>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: "#555",
          fontSize: 20,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );

  return (
    <div
      style={{
        background: "#0e0e14",
        minHeight: "100vh",
        padding: "28px 16px 24px",
        fontFamily: "'Segoe UI',sans-serif",
        color: "#ccc",
      }}
    >
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter:invert(1); cursor:pointer; }
        input:focus, textarea:focus { outline:none; box-shadow:0 0 0 2px #5b9bd533 !important; }
        button:active { transform:scale(0.96); }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:#0e0e14; } ::-webkit-scrollbar-thumb { background:#2a2a3a; border-radius:3px; }
      `}</style>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* Title */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 6,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#e8e8e8",
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              100x Challenge
            </h1>
            <span style={{ fontSize: 11, color: "#444" }}>
              {effectiveStart > 0 ? (
                <>
                  Starting: ${fmt(effectiveStart)} · Target: $
                  {fmt(effectiveStart * 100)}
                </>
              ) : (
                "Set a starting balance in ⚙ Settings"
              )}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setCsvOpen(true)}
              style={{
                background: "#1a1a2a",
                border: "1px solid #5b9bd555",
                borderRadius: 6,
                color: "#5b9bd5",
                padding: "5px 11px",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ⬇ Import CSV
            </button>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                background: "#1a2a1a",
                border: "1px solid #4caf7c55",
                borderRadius: 6,
                color: "#4caf7c",
                padding: "5px 11px",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add Entry
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              style={{
                background: "#1a1a24",
                border: "1px solid #2a2a3a",
                borderRadius: 6,
                color: "#666",
                padding: "5px 10px",
                fontSize: 14,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ⚙
            </button>
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 14,
            marginTop: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "#444" }}>Overall:</span>
            <span style={{ fontSize: 13, color: "#e8e8e8", fontWeight: 600 }}>
              ${fmt(stats.currentBalance)}
            </span>
            <span
              style={{
                fontSize: 12,
                color: stats.overallPnl >= 0 ? "#4caf7c" : "#e05555",
                fontWeight: 600,
              }}
            >
              {stats.overallPnl >= 0 ? "+" : ""}${fmt(stats.overallPnl)} (
              {stats.overallPnl >= 0 ? "+" : ""}
              {stats.overallPct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: 11, color: "#555" }}>
              {stats.overallMulti.toFixed(2)}x
            </span>
          </div>
          {view !== "overall" && (
            <>
              <div style={{ width: 1, height: 18, background: "#2a2a3a" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "#444" }}>
                  {MONTHS[parseInt(view)]}:
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: stats.monthPnl >= 0 ? "#4caf7c" : "#e05555",
                    fontWeight: 600,
                  }}
                >
                  {stats.monthPnl >= 0 ? "+" : ""}${fmt(stats.monthPnl)} (
                  {stats.monthPnl >= 0 ? "+" : ""}
                  {stats.monthPct.toFixed(2)}%)
                </span>
              </div>
            </>
          )}
        </div>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <button
            onClick={() => setView("overall")}
            style={{
              background: view === "overall" ? "#5b9bd520" : "#1a1a24",
              border: `1px solid ${view === "overall" ? "#5b9bd5" : "#2a2a3a"}`,
              borderRadius: 6,
              color: view === "overall" ? "#5b9bd5" : "#666",
              padding: "5px 13px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Overall
          </button>
          <div
            style={{
              width: 1,
              height: 22,
              background: "#2a2a3a",
              margin: "0 2px",
            }}
          />
          {MONTHS.map((m, i) => {
            const has = monthsWithData.has(i),
              active = view === String(i);
            return (
              <button
                key={m}
                onClick={() => has && setView(String(i))}
                style={{
                  background: active
                    ? "#f0a05020"
                    : has
                    ? "#1a1a24"
                    : "#141418",
                  border: `1px solid ${
                    active ? "#f0a050" : has ? "#2a2a3a" : "#1a1a22"
                  }`,
                  borderRadius: 6,
                  color: active ? "#f0a050" : has ? "#888" : "#333",
                  padding: "5px 10px",
                  fontSize: 11.5,
                  fontWeight: 500,
                  cursor: has ? "pointer" : "default",
                  transition: "all 0.2s",
                  opacity: has ? 1 : 0.4,
                  position: "relative",
                }}
              >
                {m}
                {has && (
                  <span
                    style={{
                      position: "absolute",
                      top: -3,
                      right: -3,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#4caf7c",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <div
          style={{
            background: "#111118",
            borderRadius: 12,
            border: "1px solid #1e1e2a",
            padding: "14px 6px 6px 2px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
            minHeight: 380,
          }}
        >
          {chartData.length === 0 ? (
            <div
              style={{
                height: 340,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ color: "#333", fontSize: 40 }}>📈</div>
              <div style={{ color: "#444", fontSize: 14 }}>
                {view === "overall"
                  ? "No data yet"
                  : `No data for ${MONTHS[parseInt(view)]}`}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => setCsvOpen(true)}
                  style={{
                    background: "#1a1a2a",
                    border: "1px solid #5b9bd544",
                    borderRadius: 6,
                    color: "#5b9bd5",
                    padding: "6px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ⬇ Import CSV
                </button>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    background: "#1a2a1a",
                    border: "1px solid #4caf7c44",
                    borderRadius: 6,
                    color: "#4caf7c",
                    padding: "6px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  + Add Entry
                </button>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={areaColor}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={areaColor}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1a1a26"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  type="category"
                  tick={{ fill: "#555", fontSize: 11 }}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  orientation="left"
                  domain={["auto", "auto"]}
                  tickFormatter={(v) =>
                    `$${
                      v >= 1000
                        ? (v / 1000).toFixed(1) + "K"
                        : v.toLocaleString()
                    }`
                  }
                  tick={{ fill: "#888", fontSize: 11 }}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickLine={false}
                  width={68}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: "#2a2a3a", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke={areaColor}
                  strokeWidth={2}
                  fill="url(#gArea)"
                  isAnimationActive={false}
                  dot={
                    chartData.length < 60
                      ? { r: 2.5, fill: areaColor, strokeWidth: 0 }
                      : false
                  }
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Progress bar */}
        {effectiveStart > 0 && stats.currentBalance > 0 && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "#444",
                marginBottom: 4,
              }}
            >
              <span>Progress to 100x</span>
              <span>{stats.overallMulti.toFixed(2)}x / 100x</span>
            </div>
            <div
              style={{
                height: 4,
                background: "#1a1a24",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 2,
                  width: `${Math.min(100, (stats.overallMulti / 100) * 100)}%`,
                  background: "linear-gradient(90deg,#4caf7c,#5b9bd5)",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Recent entries */}
        {sortedEntries.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 11,
                color: "#444",
                marginBottom: 8,
                fontWeight: 600,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              Recent Entries{" "}
              <span style={{ fontWeight: 400, color: "#333" }}>
                ({sortedEntries.length} total)
              </span>
            </div>
            <div
              style={{
                maxHeight: 180,
                overflowY: "auto",
                borderRadius: 8,
                border: "1px solid #1e1e2a",
              }}
            >
              {[...sortedEntries]
                .reverse()
                .slice(0, 20)
                .map((e, i) => {
                  const idx = sortedEntries.findIndex((x) => x.date === e.date);
                  const prev = idx > 0 ? sortedEntries[idx - 1] : null;
                  const change = prev ? e.balance - prev.balance : null;
                  const pos = change !== null && change >= 0;
                  return (
                    <div
                      key={e.date}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "7px 12px",
                        borderBottom: i < 19 ? "1px solid #1a1a24" : "none",
                        background: i % 2 === 0 ? "#111118" : "#0e0e14",
                      }}
                    >
                      <span
                        style={{
                          color: "#666",
                          fontSize: 12,
                          fontFamily: "'Courier New',monospace",
                        }}
                      >
                        {e.date}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                        }}
                      >
                        {change !== null && (
                          <span
                            style={{
                              fontSize: 11,
                              color: pos ? "#4caf7c" : "#e05555",
                            }}
                          >
                            {pos ? "+" : ""}${fmt(change)}
                          </span>
                        )}
                        <span
                          style={{
                            color: "#e8e8e8",
                            fontSize: 13,
                            fontWeight: 600,
                            minWidth: 90,
                            textAlign: "right",
                          }}
                        >
                          ${fmt(e.balance)}
                        </span>
                        <button
                          onClick={() => deleteEntry(e.date)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#333",
                            cursor: "pointer",
                            fontSize: 16,
                            padding: "0 2px",
                            lineHeight: 1,
                          }}
                          onMouseEnter={(ev) =>
                            (ev.target.style.color = "#e05555")
                          }
                          onMouseLeave={(ev) =>
                            (ev.target.style.color = "#333")
                          }
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ADD ENTRY MODAL */}
      {modalOpen && (
        <Backdrop onClick={() => setModalOpen(false)}>
          <Modal style={{ width: 340 }}>
            <ModalHeader
              title="Add Entry"
              onClose={() => setModalOpen(false)}
            />
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={inputDate}
              onChange={(e) => setInputDate(e.target.value)}
              style={{ ...inputStyle, marginBottom: 14 }}
            />
            <label style={labelStyle}>Balance ($)</label>
            <input
              type="text"
              placeholder="e.g. 1250.00"
              value={inputBalance}
              onChange={(e) => setInputBalance(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
              style={{ ...inputStyle, marginBottom: 20 }}
              autoFocus
            />
            <button
              onClick={addEntry}
              style={{
                width: "100%",
                background: "#4caf7c",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                padding: "9px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add Entry
            </button>
          </Modal>
        </Backdrop>
      )}

      {/* CSV IMPORT MODAL */}
      {csvOpen && (
        <Backdrop onClick={closeCsv}>
          <Modal style={{ width: 480, maxHeight: "80vh", overflowY: "auto" }}>
            <ModalHeader title="Import CSV" onClose={closeCsv} />
            <p
              style={{
                fontSize: 11.5,
                color: "#555",
                margin: "0 0 16px",
                lineHeight: 1.6,
              }}
            >
              Go to your Google Sheets CSV link in your browser,{" "}
              <strong style={{ color: "#888" }}>select all</strong>,{" "}
              <strong style={{ color: "#888" }}>copy</strong>, then paste below.
              <span style={{ color: "#3a3a4a" }}>
                {" "}
                Needs two columns: Date, Balance.
              </span>
            </p>
            <textarea
              placeholder={"Date,Balance\n2025-01-10,1000\n2025-01-17,1150\n…"}
              value={csvText}
              onChange={(e) => previewCSV(e.target.value)}
              style={{
                width: "100%",
                minHeight: 140,
                background: "#111118",
                border: "1px solid #2a2a3a",
                borderRadius: 6,
                color: "#ccc",
                padding: "10px",
                fontSize: 12,
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "'Courier New',monospace",
                lineHeight: 1.5,
              }}
              autoFocus
            />
            {csvError && (
              <div
                style={{
                  marginTop: 10,
                  color: "#e05555",
                  fontSize: 11.5,
                  background: "#2a1a1a",
                  border: "1px solid #e0555533",
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                {csvError}
              </div>
            )}
            {csvPreview.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{ fontSize: 11, color: "#4caf7c", marginBottom: 6 }}
                >
                  ✓ Parsed {csvPreview.length} entries — preview:
                </div>
                <div
                  style={{
                    maxHeight: 120,
                    overflowY: "auto",
                    borderRadius: 6,
                    border: "1px solid #1e1e2a",
                  }}
                >
                  {csvPreview.slice(0, 8).map((e, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "5px 10px",
                        borderBottom: i < 7 ? "1px solid #1a1a24" : "none",
                        background: i % 2 === 0 ? "#111118" : "#0e0e14",
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          color: "#666",
                          fontFamily: "'Courier New',monospace",
                        }}
                      >
                        {e.date}
                      </span>
                      <span style={{ color: "#e8e8e8", fontWeight: 600 }}>
                        ${fmt(e.balance)}
                      </span>
                    </div>
                  ))}
                  {csvPreview.length > 8 && (
                    <div
                      style={{
                        padding: "5px 10px",
                        color: "#444",
                        fontSize: 11,
                        textAlign: "center",
                      }}
                    >
                      … and {csvPreview.length - 8} more
                    </div>
                  )}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button
                onClick={importCSV}
                disabled={!csvPreview.length}
                style={{
                  flex: 1,
                  background: csvPreview.length ? "#5b9bd5" : "#222",
                  border: "none",
                  borderRadius: 6,
                  color: csvPreview.length ? "#fff" : "#444",
                  padding: "9px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: csvPreview.length ? "pointer" : "default",
                }}
              >
                Import {csvPreview.length ? csvPreview.length + " entries" : ""}
              </button>
              <button
                onClick={closeCsv}
                style={{
                  flex: 0.4,
                  background: "#1a1a24",
                  border: "1px solid #2a2a3a",
                  borderRadius: 6,
                  color: "#666",
                  padding: "9px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </Modal>
        </Backdrop>
      )}

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <Backdrop onClick={() => setSettingsOpen(false)}>
          <Modal style={{ width: 380 }}>
            <ModalHeader
              title="Settings"
              onClose={() => setSettingsOpen(false)}
            />
            <label style={labelStyle}>Starting Balance ($)</label>
            <p
              style={{
                fontSize: 10.5,
                color: "#3a3a4a",
                margin: "0 0 6px",
                lineHeight: 1.5,
              }}
            >
              The amount you're starting the 100x challenge with. Overall P&L
              and the target are calculated from this.
            </p>
            <input
              type="text"
              placeholder="e.g. 1000"
              value={settStart}
              onChange={(e) => setSettStart(e.target.value)}
              style={{ ...inputStyle, marginBottom: 24 }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveSettings}
                style={{
                  flex: 1,
                  background: "#5b9bd5",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  padding: "9px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <button
                onClick={() => setSettingsOpen(false)}
                style={{
                  flex: 0.4,
                  background: "#1a1a24",
                  border: "1px solid #2a2a3a",
                  borderRadius: 6,
                  color: "#666",
                  padding: "9px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </Modal>
        </Backdrop>
      )}
    </div>
  );
}
