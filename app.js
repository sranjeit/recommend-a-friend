/* ============================================================
   Share an Opportunity — Client Application Logic
   ============================================================
   HOW TO CONFIGURE:
   1. Deploy the Google Apps Script (see /apps-script/Code.gs) as a
      Web App and paste the deployment URL into CONFIG.SCRIPT_URL below.
   2. CONFIG.SITE_URL is auto-derived from the current page URL.
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
    lastResult: null        // { referralId, referralLink, friendName, course, friendMobile } from last submit
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
      ? "Someone thought this opportunity might be helpful for you. Share it with someone you know too."
      : "Share their details and we'll reach out with course information.";
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
      yourName:    v => v.trim().length >= 2,
      yourMobile:  v => CONFIG.MOBILE_REGEX.test(v.trim()),
      friendName:  v => v.trim().length >= 2,
      friendMobile: v => CONFIG.MOBILE_REGEX.test(v.trim()),
      course:      v => v.trim().length > 0
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
        if (wrap && wrap.classList.contains("has-error")) validateField(id);
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
      yourName:      document.getElementById("yourName").value.trim(),
      yourMobile:    document.getElementById("yourMobile").value.trim(),
      friendName:    document.getElementById("friendName").value.trim(),
      friendMobile:  document.getElementById("friendMobile").value.trim(),
      course:        document.getElementById("course").value,
      referralSource: state.referralSource || "",
      referralLinkUsed: state.referralSource
        ? (CONFIG.SITE_URL + "?ref=" + encodeURIComponent(state.referralSource))
        : "",
      pageUrl:        window.location.href,
      userAgent:      navigator.userAgent,
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
      ? '<span class="spinner" aria-hidden="true"></span> Sharing…'
      : "Share this opportunity";
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
      friendName:   payload.friendName,
      course:       payload.course,
      friendMobile: payload.friendMobile
    };
    renderSuccess(state.lastResult);
    autoShareWhatsApp(state.lastResult);
  }

  // If the backend is unreachable/unconfigured, the user still gets a
  // working personal link (best-effort). Actual data capture happens
  // server-side once configured.
  function onSubmitFallback(payload) {
    const referralId = generateReferralId();
    const referralLink = CONFIG.SITE_URL + "?ref=" + encodeURIComponent(referralId);
    state.lastResult = {
      referralId,
      referralLink,
      friendName:   payload.friendName,
      course:       payload.course,
      friendMobile: payload.friendMobile
    };
    renderSuccess(state.lastResult);
    console.warn("Recommendation captured locally only — configure CONFIG.SCRIPT_URL in app.js to save it to Google Sheets.");
    autoShareWhatsApp(state.lastResult);
  }

  function renderSuccess(result) {
    // Populate friend name placeholders
    const nameEl = document.getElementById("success-friend-name");
    const nameEl2 = document.getElementById("success-friend-name-2");
    const firstName = (result.friendName || "them").split(" ")[0];
    if (nameEl) nameEl.textContent = firstName;
    if (nameEl2) nameEl2.textContent = firstName;

    // Populate referral link
    const linkEl = document.getElementById("referral-link-text");
    if (linkEl) linkEl.textContent = result.referralLink;

    showView("success");

    // Draw canvas image after a short delay (fonts need to be ready)
    document.fonts.ready.then(() => {
      try {
        renderCanvas(result);
        const section = document.getElementById("canvas-section");
        if (section) section.style.display = "block";
      } catch (err) {
        console.warn("Canvas image generation failed:", err);
      }
    });
  }

  /* ---------------- Canvas image generation ---------------- */

  function renderCanvas(result) {
    const canvas = document.getElementById("share-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = 1080, H = 1080;

    // --- Background ---
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#0D3D32");
    bgGrad.addColorStop(1, "#146356");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Decorative subtle circles (top-right)
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    for (let r = 160; r <= 400; r += 80) {
      ctx.beginPath();
      ctx.arc(W - 20, 60, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Decorative circles (bottom-left)
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 2;
    for (let r = 100; r <= 260; r += 80) {
      ctx.beginPath();
      ctx.arc(40, H - 40, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // --- Header label ---
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 32px Inter, sans-serif";
    ctx.fillText("A FRIEND THOUGHT OF YOU", 80, 110);
    ctx.restore();

    // --- Main headline ---
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    wrapText(ctx, "Discover a Course That May Support Your Career", 80, 200, W - 160, "700 74px Source Serif 4, Georgia, serif", 90);
    ctx.restore();

    // --- Course badge ---
    const course = result.course || "A course for you";
    const badgeY = 440;
    const badgePadX = 28, badgePadY = 16;

    ctx.save();
    ctx.font = "700 36px Inter, sans-serif";
    const courseWidth = ctx.measureText(course).width;
    const badgeW = courseWidth + badgePadX * 2;
    const badgeH = 36 + badgePadY * 2;

    // Badge background
    roundRect(ctx, 80, badgeY, badgeW, badgeH, 14);
    ctx.fillStyle = "#F0C060";
    ctx.fill();

    // Badge text
    ctx.fillStyle = "#0D3D32";
    ctx.fillText(course, 80 + badgePadX, badgeY + badgePadY + 28);
    ctx.restore();

    // --- Divider ---
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 560);
    ctx.lineTo(W - 80, 560);
    ctx.stroke();
    ctx.restore();

    // --- Sub-copy ---
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    wrapText(ctx, "Explore learning & career growth opportunities.", 80, 620, W - 160, "400 40px Inter, sans-serif", 56);
    ctx.restore();

    // --- Institution name ---
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "500 30px Inter, sans-serif";
    ctx.fillText("Samyak Computer Classes, Sambalpur", 80, 760);
    ctx.restore();

    // --- Divider 2 ---
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(80, 800);
    ctx.lineTo(W - 80, 800);
    ctx.stroke();
    ctx.restore();

    // --- URL label ---
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "400 26px Inter, sans-serif";
    const shortUrl = result.referralLink.replace("https://", "").slice(0, 54);
    ctx.fillText(shortUrl, 80, 855);
    ctx.restore();

    // --- Bottom call to action ---
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "400 24px Inter, sans-serif";
    ctx.fillText("Open the link to learn more or share with a friend →", 80, 920);
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxWidth, font, lineHeight) {
    ctx.font = font;
    const words = text.split(" ");
    let line = "";
    let currentY = y;
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line.trim(), x, currentY);
        line = words[i] + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, currentY);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function downloadImage() {
    const canvas = document.getElementById("share-canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "share-opportunity.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Image saved — attach it in WhatsApp for more impact.");
  }

  /* ---------------- Copy & share ---------------- */

  function copyLink() {
    const link = state.lastResult ? state.lastResult.referralLink : "";
    if (!link) return;

    const done = () => {
      const tick = document.getElementById("copy-tick");
      if (tick) {
        tick.classList.add("show");
        setTimeout(() => tick.classList.remove("show"), 1800);
      }
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
    try { document.execCommand("copy"); done(); } catch (e) { showToast("Long-press the link to copy."); }
    document.body.removeChild(ta);
  }

  /* ---------------- WhatsApp ---------------- */

  function getWhatsAppMessage(result) {
    return (
      "Hi,\n\n" +
      "I thought this course might be useful for you.\n\n" +
      "I have recommended you so that you can receive more information directly.\n\n" +
      "You can also explore here:\n\n" +
      result.referralLink
    );
  }

  function formatWhatsAppPhone(mobile) {
    let phone = (mobile || "").replace(/\D/g, "");
    if (phone.length === 10) phone = "91" + phone;
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
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  /* ---------------- Public API ---------------- */

  return {
    init,
    showView,
    goHome,
    resetForm,
    copyLink,
    shareWhatsApp,
    downloadImage
  };

})();

document.addEventListener("DOMContentLoaded", RAF.init);
