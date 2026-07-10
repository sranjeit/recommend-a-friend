/**
 * ============================================================
 * Recommend a Friend — Google Apps Script Backend
 * ============================================================
 * This script turns a Google Sheet into the database + API for the
 * "Recommend a Friend" web app.
 *
 * SETUP (see DEPLOYMENT_GUIDE.md for full steps):
 *   1. Create a new Google Sheet.
 *   2. Extensions → Apps Script → paste this file in as Code.gs.
 *   3. Run `setup` once from the editor (grants permissions, creates
 *      the "Recommendations" sheet with headers, and a Script Property
 *      for your admin dashboard token).
 *   4. Deploy → New deployment → Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *   5. Copy the deployment URL into app.js (CONFIG.SCRIPT_URL) and
 *      admin.js (CONFIG.SCRIPT_URL).
 * ============================================================
 */

const SHEET_NAME = "Recommendations";

const COLUMNS = [
  "Timestamp",
  "Referral ID",
  "Referrer Name",
  "Referrer Mobile",
  "Recommended Person Name",
  "Recommended Person Mobile",
  "Course Interest",
  "Referral Source ID",
  "Referral Link Used",
  "Referral Level",
  "Status",
  "Admission Status",
  "Reward Eligibility Status",
  "Reward Payment Status",
  "Reward Payment Date",
  "Page URL",
  "User Agent",
  "Client Timestamp"
];

/* ============================================================
   One-time setup
   ============================================================ */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  sheet.clear();
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight("bold");
  sheet.autoResizeColumns(1, COLUMNS.length);

  // Generate an admin dashboard token if one doesn't already exist.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_TOKEN")) {
    const token = Utilities.getUuid();
    props.setProperty("ADMIN_TOKEN", token);
    Logger.log("Admin dashboard token (save this — you'll need it for the dashboard): " + token);
  } else {
    Logger.log("Admin dashboard token already set: " + props.getProperty("ADMIN_TOKEN"));
  }

  Logger.log("Setup complete. Sheet '" + SHEET_NAME + "' is ready.");
}

/* ============================================================
   HTTP entry points
   ============================================================ */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === "submitRecommendation") {
      const result = submitRecommendation(body.data || {});
      return jsonResponse(result);
    }

    return jsonResponse({ success: false, error: "Unknown action" });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const params = e.parameter || {};

    if (params.action === "getAllRecords") {
      if (!isAuthorized(params.token)) {
        return jsonResponse({ success: false, error: "Unauthorized" });
      }
      return jsonResponse({ success: true, records: getAllRecords() });
    }

    return jsonResponse({ success: true, message: "Recommend a Friend API is running." });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function isAuthorized(token) {
  const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_TOKEN");
  return !!expected && token === expected;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   Core logic: submit a recommendation
   ============================================================ */

function submitRecommendation(data) {
  const sheet = getSheet_();

  const yourName = sanitize_(data.yourName);
  const yourMobile = sanitize_(data.yourMobile);
  const friendName = sanitize_(data.friendName);
  const friendMobile = sanitize_(data.friendMobile);
  const course = sanitize_(data.course);
  const referralSource = sanitize_(data.referralSource);
  const referralLinkUsed = sanitize_(data.referralLinkUsed);
  const pageUrl = sanitize_(data.pageUrl);
  const userAgent = sanitize_(data.userAgent);
  const clientTimestamp = sanitize_(data.clientTimestamp);

  if (!yourName || !yourMobile || !friendName || !friendMobile || !course) {
    return { success: false, error: "Missing required fields." };
  }
  if (!/^[6-9]\d{9}$/.test(yourMobile) || !/^[6-9]\d{9}$/.test(friendMobile)) {
    return { success: false, error: "Invalid mobile number." };
  }

  const referralId = generateReferralId_();
  const referralLevel = computeReferralLevel_(sheet, referralSource);
  const timestamp = new Date();

  // Referral chain is recorded for analytics only — see computeReferralLevel_
  // and the "Referral Appreciation Program" notes in the deployment guide.
  // Only Referral Level 1 (a direct recommendation with no further chain
  // reward) is ever eligible for the ₹500 appreciation; deeper levels are
  // tracked purely so we can understand organic reach, never rewarded.
  const rewardEligibility = "Pending Admission";

  sheet.appendRow([
    timestamp,
    referralId,
    yourName,
    yourMobile,
    friendName,
    friendMobile,
    course,
    referralSource,
    referralLinkUsed,
    referralLevel,
    "New",
    "Not Yet Enrolled",
    rewardEligibility,
    "Not Due",
    "",
    pageUrl,
    userAgent,
    clientTimestamp
  ]);

  const siteUrl = getSiteUrl_(pageUrl);
  const referralLink = siteUrl + "?ref=" + encodeURIComponent(referralId);

  return { success: true, referralId: referralId, referralLink: referralLink };
}

/* ============================================================
   Helpers
   ============================================================ */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' not found. Run setup() first.");
  return sheet;
}

function sanitize_(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().substring(0, 500);
}

// Referral IDs look like RAF-<base36 timestamp><4 random chars>, e.g. RAF-M2K9X7QA
// — short, URL-friendly, and effectively collision-free without a database lock.
function generateReferralId_() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Utilities.getUuid().replace(/-/g, "").substring(0, 4).toUpperCase();
  return "RAF-" + t + r;
}

// Referral chains are tracked strictly for analytics (see brief: "DO NOT
// implement MLM" / "Referral chain is for analytics only"). This function
// only computes depth for reporting — it never affects reward eligibility
// beyond confirming a recommendation is direct (level 1).
function computeReferralLevel_(sheet, referralSourceId) {
  if (!referralSourceId) return 1; // organic, direct submission

  const data = sheet.getDataRange().getValues();
  const idCol = COLUMNS.indexOf("Referral ID");
  const levelCol = COLUMNS.indexOf("Referral Level");

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === referralSourceId) {
      const parentLevel = Number(data[i][levelCol]) || 1;
      return parentLevel + 1;
    }
  }
  return 1; // referral source not found — treat as direct
}

function getSiteUrl_(pageUrl) {
  if (!pageUrl) return "";
  try {
    const noQuery = pageUrl.split("?")[0].split("#")[0];
    return noQuery;
  } catch (e) {
    return pageUrl;
  }
}

function getAllRecords() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = (v instanceof Date) ? v.toISOString() : v;
    });
    return obj;
  });
}

/**
 * Manual admin helper: run this from the Apps Script editor (select the
 * function, click Run) to update a single row after verifying admission
 * or paying appreciation. Sheet edits work just as well — this is a
 * convenience shortcut for bulk/scripted updates.
 *
 * Example:
 *   updateStatusByReferralId("RAF-M2K9X7QA", {
 *     "Admission Status": "Admitted",
 *     "Reward Eligibility Status": "Eligible",
 *     "Reward Payment Status": "Paid",
 *     "Reward Payment Date": new Date()
 *   });
 */
function updateStatusByReferralId(referralId, updates) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const idCol = COLUMNS.indexOf("Referral ID");

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === referralId) {
      Object.keys(updates).forEach(key => {
        const colIndex = COLUMNS.indexOf(key);
        if (colIndex > -1) {
          sheet.getRange(i + 1, colIndex + 1).setValue(updates[key]);
        }
      });
      return true;
    }
  }
  return false;
}
