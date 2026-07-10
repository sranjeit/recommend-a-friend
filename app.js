/* ============================================================
   Recommend a Friend — Client Application Logic
   ============================================================
   HOW TO CONFIGURE:
   1. Deploy the Google Apps Script (see /apps-script/Code.gs) as a
      Web App and paste the deployment URL into CONFIG.SCRIPT_URL below.
   2. Replace CONFIG.SITE_URL with your GitHub Pages URL
      (e.g. https://yourusername.github.io/your-repo/).
   ============================================================ */

const CONFIG = {
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwpVRLxgVrDSFTZE2YV3FY4tMWpLQg0GRtQmMo12YTAGAmO5czejJQn0JJq8OMjwMLw/exec",
  SITE_URL: window.location.origin + window.location.pathname.replace(/index\.html$/, ""),
  MOBILE_REGEX: /^[6-9]\d{9}$/,
  STORAGE_KEY: "e53f3f23-2380-4175-9a26-b33725dc6702"
};

const RAF = (function () {

  let state = {
    referralSource: null,   // referral ID captured from ?ref= in the URL
    lastResult: null        // { referralId, referralLink } from the last successful submit
  };

  /* ---------------- Init ---------------- */

  function init() {
    captureReferralSource();
    bindForm();
    prefillFormNoteIfReferred();

    // Deep-link support: /?ref=XXXX&go=form opens the form directly
    const params = new URLSearchParams(window.location.search);
    if (params.get("go") === "form") {
      showView("form");
    }
  }

  function captureReferralSource() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      try { localStorage.setItem(CONFIG.STORAGE_KEY, ref); } catch (e) { /* storage unavailable */ }
      state.referralSource = ref;
    } else {
      try { state.referralSource = localStorage.getItem(CONFIG.STORAGE_KEY); } catch (e) { state.referralSource = null; }
    }
  }

  function prefillFormNoteIfReferred() {
    const note = document.getElementById("form-referral-note");
    if (!note) return;
    note.textContent = state.referralSource
      ? "A friend thought this might be useful to you. Fill this in for someone you'd like to recommend."
      : "Just the essentials — this takes about a minute.";
  }

  /* ---------------- View switching ---------------- */

  function showView(name) {
    document.querySelectorAll(".view").forEach(el => el.classList.remove("is-active"));
    const target = document.getElementById("view-" + name);
    if (target) {
      target.classList.add("is-active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goHome(e) {
    if (e) e.preventDefault();
    showView("landing");
  }

  function resetForm() {
    const form = document.getElementById("raf-form");
    form.reset();
    document.querySelectorAll(".field").forEach(f => f.classList.remove("has-error"));
    showView("form");
  }

  /* ---------------- Form validation ---------------- */

  function validators() {
    return {
      yourName: v => v.trim().length >= 2,
      yourMobile: v => CONFIG.MOBILE_REGEX.test(v.trim()),
      friendName: v => v.trim().length >= 2,
      friendMobile: v => CONFIG.MOBILE_REGEX.test(v.trim()),
      course: v => v.trim().length > 0
    };
  }

  function validateField(id) {
    const el = document.getElementById(id);
    const wrap = document.getElementById("f-" + id);
    const rules = validators();
    const ok = rules[id] ? rules[id](el.value) : true;
    if (wrap) wrap.classList.toggle("has-error", !ok);
    return ok;
  }

  function validateAll() {
    const ids = ["yourName", "yourMobile", "friendName", "friendMobile", "course"];
    let allOk = true;
    ids.forEach(id => { if (!validateField(id)) allOk = false; });

    return allOk;
  }

  function bindForm() {
    const form = document.getElementById("raf-form");
    if (!form) return;

    ["yourName", "yourMobile", "friendName", "friendMobile", "course"].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener("blur", () => validateField(id));
      el.addEventListener("input", () => {
        const wrap = document.getElementById("f-" + id);
        if (wrap.classList.contains("has-error")) validateField(id);
      });
    });

    form.addEventListener("submit", handleSubmit);
  }

  /* ---------------- Submission ---------------- */

  function generateReferralId() {
    // Client-side fallback ID (server assigns the authoritative one).
    const t = Date.now().toString(36).toUpperCase();
    const r = Math.random().toString(36).substring(2, 6).toUpperCase();
    return "RAF-" + t + r;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validateAll()) {
      showToast("Please check the highlighted fields.");
      return;
    }

    const payload = {
      yourName: document.getElementById("yourName").value.trim(),
      yourMobile: document.getElementById("yourMobile").value.trim(),
      friendName: document.getElementById("friendName").value.trim(),
      friendMobile: document.getElementById("friendMobile").value.trim(),
      course: document.getElementById("course").value,
      referralSource: state.referralSource || "",
      referralLinkUsed: state.referralSource ? (CONFIG.SITE_URL + "?ref=" + encodeURIComponent(state.referralSource)) : "",
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      clientTimestamp: new Date().toISOString()
    };

    setSubmitting(true);

    submitToBackend(payload)
      .then(result => onSubmitSuccess(payload, result))
      .catch(() => onSubmitFallback(payload))
      .finally(() => setSubmitting(false));
  }

  function setSubmitting(isSubmitting) {
    const btn = document.getElementById("submit-btn");
    const label = document.getElementById("submit-label");
    btn.disabled = isSubmitting;
    label.innerHTML = isSubmitting
      ? '<span class="spinner" aria-hidden="true"></span> Submitting…'
      : "Submit recommendation";
  }

  function submitToBackend(payload) {
    if (!CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
      return Promise.reject(new Error("Backend not configured"));
    }
    // Sent as text/plain to avoid a CORS preflight (Apps Script doesn't
    // handle OPTIONS requests well). Code.gs parses the JSON body itself.
    return fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "submitRecommendation", data: payload })
    })
      .then(res => res.json())
      .then(json => {
        if (!json || json.success !== true) throw new Error((json && json.error) || "Unknown error");
        return json;
      });
  }

  function onSubmitSuccess(payload, result) {
    const referralId = result.referralId || generateReferralId();
    const referralLink = result.referralLink || (CONFIG.SITE_URL + "?ref=" + encodeURIComponent(referralId));
    state.lastResult = {
      referralId,
      referralLink,
      friendName: payload.friendName,
      course: payload.course,
      friendMobile: payload.friendMobile
    };
    renderSuccess(state.lastResult);
    autoShareWhatsApp(state.lastResult);
  }

  // If the backend is unreachable/unconfigured, the user still gets a
  // working personal link (best-effort — actual data capture happens
  // server-side once configured). This keeps the experience frictionless
  // even before deployment is fully wired up.
  function onSubmitFallback(payload) {
    const referralId = generateReferralId();
    const referralLink = CONFIG.SITE_URL + "?ref=" + encodeURIComponent(referralId);
    state.lastResult = {
      referralId,
      referralLink,
      friendName: payload.friendName,
      course: payload.course,
      friendMobile: payload.friendMobile
    };
    renderSuccess(state.lastResult);
    console.warn("Recommendation captured locally only — configure CONFIG.SCRIPT_URL in app.js to save it to Google Sheets.");
    autoShareWhatsApp(state.lastResult);
  }

  function renderSuccess(result) {
    document.getElementById("success-friend-name").textContent = result.friendName || "them";
    document.getElementById("referral-link-text").textContent = result.referralLink;
    showView("success");
  }

  /* ---------------- Copy & share ---------------- */

  function copyLink() {
    const link = state.lastResult ? state.lastResult.referralLink : "";
    if (!link) return;

    const done = () => {
      const tick = document.getElementById("copy-tick");
      tick.classList.add("show");
      setTimeout(() => tick.classList.remove("show"), 1800);
      showToast("Link copied.");
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(() => legacyCopy(link, done));
    } else {
      legacyCopy(link, done);
    }
  }

  function legacyCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { showToast("Copy failed — long-press the link to copy."); }
    document.body.removeChild(ta);
  }

  function getWhatsAppMessage(result) {
    return `Hi! I have referred you for the course "${result.course}" at Samyak Computer Classes, Sambalpur.\n\n` +
      `You can learn more and also recommend someone who may benefit from it:\n\n` +
      result.referralLink;
  }

  function formatWhatsAppPhone(mobile) {
    let phone = (mobile || "").replace(/\D/g, "");
    if (phone.length === 10) {
      phone = "91" + phone;
    }
    return phone;
  }

  function autoShareWhatsApp(result) {
    const message = getWhatsAppMessage(result);
    const phone = formatWhatsAppPhone(result.friendMobile);
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
    window.location.href = url;
  }

  function shareWhatsApp() {
    if (!state.lastResult) return;
    const message = getWhatsAppMessage(state.lastResult);
    const phone = formatWhatsAppPhone(state.lastResult.friendMobile);
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
    window.open(url, "_blank", "noopener");
  }

  /* ---------------- Toast ---------------- */

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  /* ---------------- Public API ---------------- */

  return {
    init,
    showView,
    goHome,
    resetForm,
    copyLink,
    shareWhatsApp
  };

})();

document.addEventListener("DOMContentLoaded", RAF.init);
