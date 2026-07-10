/* ============================================================
   Recommend a Friend — Admin Dashboard Logic
   ============================================================
   Configure CONFIG.SCRIPT_URL below with the same Apps Script Web App
   URL used in app.js. The dashboard token is the ADMIN_TOKEN generated
   by running setup() in the Apps Script editor.
   ============================================================ */

const CONFIG = {
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwpVRLxgVrDSFTZE2YV3FY4tMWpLQg0GRtQmMo12YTAGAmO5czejJQn0JJq8OMjwMLw/exec",
  TOKEN_STORAGE_KEY: "e53f3f23-2380-4175-9a26-b33725dc6702"
};

const ADMIN = (function () {

  let charts = {};
  let records = [];

  function unlock() {
    const token = document.getElementById("token-input").value.trim();
    if (!token) return;
    try { sessionStorage.setItem(CONFIG.TOKEN_STORAGE_KEY, token); } catch (e) { /* ignore */ }
    load();
  }

  function getToken() {
    try { return sessionStorage.getItem(CONFIG.TOKEN_STORAGE_KEY) || ""; } catch (e) { return ""; }
  }

  function load() {
    const token = getToken() || document.getElementById("token-input").value.trim();
    if (!token) return;

    if (CONFIG.SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
      showToast("Set CONFIG.SCRIPT_URL in admin.js first.");
      return;
    }

    const url = CONFIG.SCRIPT_URL + "?action=getAllRecords&token=" + encodeURIComponent(token);

    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (!json.success) {
          document.getElementById("gate-error").style.display = "block";
          return;
        }
        try { sessionStorage.setItem(CONFIG.TOKEN_STORAGE_KEY, token); } catch (e) { /* ignore */ }
        records = json.records || [];
        document.getElementById("gate").style.display = "none";
        document.getElementById("dashboard").style.display = "block";
        document.getElementById("updated-note").textContent = "Updated " + new Date().toLocaleTimeString();
        render(records);
      })
      .catch(() => showToast("Couldn't reach the backend. Check CONFIG.SCRIPT_URL."));
  }

  /* ---------------- Rendering ---------------- */

  function render(rows) {
    const contentEl = document.getElementById("dash-content");
    const emptyEl = document.getElementById("dash-empty");

    if (!rows.length) {
      contentEl.style.display = "none";
      emptyEl.style.display = "block";
      return;
    }
    contentEl.style.display = "block";
    emptyEl.style.display = "none";

    renderStats(rows);
    renderFunnel(rows);
    renderTimeseries(rows);
    renderCourseChart(rows);
    renderLevelsChart(rows);
    renderStatusChart(rows);
    renderContributors(rows);
    renderRecent(rows);
  }

  function daysAgo(dateStr) {
    const d = new Date(dateStr);
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  }

  function renderStats(rows) {
    const total = rows.length;
    const today = rows.filter(r => daysAgo(r.Timestamp) <= 1).length;
    const week = rows.filter(r => daysAgo(r.Timestamp) <= 7).length;
    const month = rows.filter(r => daysAgo(r.Timestamp) <= 30).length;
    const admitted = rows.filter(r => r["Admission Status"] === "Admitted").length;
    const eligible = rows.filter(r => r["Reward Eligibility Status"] === "Eligible").length;
    const paid = rows.filter(r => r["Reward Payment Status"] === "Paid").length;
    const direct = rows.filter(r => Number(r["Referral Level"]) === 1).length;
    const directPct = total ? Math.round((direct / total) * 100) : 0;

    setText("s-total", total);
    setText("s-today", today);
    setText("s-week", week);
    setText("s-month", month);
    setText("s-admitted", admitted);
    setText("s-eligible", eligible);
    setText("s-paid", paid);
    setText("s-direct", directPct + "%");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function upsertChart(id, config) {
    const ctx = document.getElementById(id).getContext("2d");
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, config);
  }

  const palette = ["#146356", "#1B2A4A", "#9A6B12", "#5B6472", "#B3401F", "#6E8F86", "#8C97A8"];

  function renderFunnel(rows) {
    const submitted = rows.length;
    const contacted = rows.filter(r => r.Status && r.Status !== "New").length;
    const admitted = rows.filter(r => r["Admission Status"] === "Admitted").length;
    const rewarded = rows.filter(r => r["Reward Payment Status"] === "Paid").length;

    upsertChart("chart-funnel", {
      type: "bar",
      data: {
        labels: ["Submitted", "Contacted", "Admitted", "Appreciation Paid"],
        datasets: [{ data: [submitted, contacted, admitted, rewarded], backgroundColor: palette[0], borderRadius: 6 }]
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderTimeseries(rows) {
    const counts = {};
    rows.forEach(r => {
      const d = new Date(r.Timestamp);
      if (isNaN(d)) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = Object.keys(counts).sort();
    const data = labels.map(l => counts[l]);

    upsertChart("chart-timeseries", {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: palette[0],
          backgroundColor: "rgba(20,99,86,0.08)",
          fill: true,
          tension: 0.25,
          pointRadius: 2
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderCourseChart(rows) {
    const counts = {};
    rows.forEach(r => {
      const c = r["Course Interest"] || "Unspecified";
      counts[c] = (counts[c] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    upsertChart("chart-course", {
      type: "bar",
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{ data: entries.map(e => e[1]), backgroundColor: palette[1], borderRadius: 6 }]
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderLevelsChart(rows) {
    const counts = {};
    rows.forEach(r => {
      const lvl = "Level " + (Number(r["Referral Level"]) || 1);
      counts[lvl] = (counts[lvl] || 0) + 1;
    });
    const labels = Object.keys(counts).sort();

    upsertChart("chart-levels", {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{ data: labels.map(l => counts[l]), backgroundColor: palette }]
      },
      options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
  }

  function renderStatusChart(rows) {
    const counts = {};
    rows.forEach(r => {
      const s = r.Status || "New";
      counts[s] = (counts[s] || 0) + 1;
    });
    const labels = Object.keys(counts);

    upsertChart("chart-status", {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{ data: labels.map(l => counts[l]), backgroundColor: palette }]
      },
      options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
  }

  function renderContributors(rows) {
    const byReferrer = {};
    rows.forEach(r => {
      const key = (r["Referrer Mobile"] || "") + "|" + (r["Referrer Name"] || "");
      if (!byReferrer[key]) {
        byReferrer[key] = { name: r["Referrer Name"], mobile: r["Referrer Mobile"], count: 0, admitted: 0 };
      }
      byReferrer[key].count += 1;
      if (r["Admission Status"] === "Admitted") byReferrer[key].admitted += 1;
    });

    const top = Object.values(byReferrer).sort((a, b) => b.count - a.count).slice(0, 10);
    const tbody = document.querySelector("#table-contributors tbody");
    tbody.innerHTML = top.map(c =>
      `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.mobile)}</td><td>${c.count}</td><td>${c.admitted}</td></tr>`
    ).join("");
  }

  function renderRecent(rows) {
    const sorted = [...rows].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)).slice(0, 25);
    const tbody = document.querySelector("#table-recent tbody");
    tbody.innerHTML = sorted.map(r => `
      <tr>
        <td>${formatDate(r.Timestamp)}</td>
        <td>${escapeHtml(r["Referrer Name"])}</td>
        <td>${escapeHtml(r["Recommended Person Name"])}</td>
        <td>${escapeHtml(r["Course Interest"])}</td>
        <td>${escapeHtml(String(r["Referral Level"] || 1))}</td>
        <td>${escapeHtml(r.Status || "New")}</td>
        <td>${escapeHtml(r["Admission Status"] || "Not Yet Enrolled")}</td>
        <td>${escapeHtml(r["Reward Payment Status"] || "Not Due")}</td>
      </tr>
    `).join("");
  }

  function formatDate(str) {
    const d = new Date(str);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) + " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function init() {
    const saved = getToken();
    if (saved) {
      document.getElementById("token-input").value = saved;
      load();
    }
  }

  return { unlock, load, init };
})();

document.addEventListener("DOMContentLoaded", ADMIN.init);
