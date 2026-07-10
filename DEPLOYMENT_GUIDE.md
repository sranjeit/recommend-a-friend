# Deployment Guide — Recommend a Friend

This guide takes you from zero to a live, working app in three parts:

1. Google Sheet + Apps Script backend (your database + API)
2. GitHub Pages frontend (the site people actually use)
3. Wiring the two together, plus the admin dashboard

Estimated time: 20–30 minutes.

---

## Part 1 — Google Sheet + Apps Script backend

### 1.1 Create the Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it something like **"Recommend a Friend — Database"**.

### 1.2 Add the Apps Script

1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete any starter code in `Code.gs`.
3. Copy the full contents of `apps-script/Code.gs` (from this project) into the editor.
4. Click **Save** (the floppy disk icon), and name the project "Recommend a Friend API".

### 1.3 Run setup once

1. In the Apps Script toolbar, select the function dropdown and choose **setup**.
2. Click **Run**.
3. The first time, Google will ask you to authorize the script — click through the consent screens (choose your account → "Advanced" → "Go to Recommend a Friend API (unsafe)" is expected for your own unpublished script → Allow).
4. Once it finishes, go to **View → Logs** (or **Executions**) and copy the **admin dashboard token** it printed. Save this somewhere safe — you'll need it to view the analytics dashboard.
5. Check your Google Sheet — you should now see a **"Recommendations"** tab with the correct column headers.

### 1.4 Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure:
   - **Description:** Recommend a Friend v1
   - **Execute as:** Me (your account)
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Authorize again if prompted.
6. Copy the **Web app URL** shown — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

Keep this URL — it goes into both `app.js` and `admin.js`.

> **Redeploying after edits:** if you change `Code.gs` later, use **Deploy → Manage deployments → Edit (pencil icon) → New version → Deploy**. Simply saving the file is not enough to update a live deployment.

---

## Part 2 — GitHub Pages frontend

### 2.1 Create the repository

1. Create a new **public** GitHub repository, e.g. `recommend-a-friend`.
2. Upload these files to the repository root:
   - `index.html`
   - `style.css`
   - `app.js`
   - `admin.html`
   - `admin.js`
   - `assets/og-image.png`

### 2.2 Enable GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to "Deploy from a branch".
3. Choose the `main` branch and `/ (root)` folder.
4. Click **Save**. GitHub will give you a URL like:
   `https://yourusername.github.io/recommend-a-friend/`

It can take a minute or two to go live the first time.

---

## Part 3 — Wire it together

### 3.1 Point the frontend at your backend

In **`app.js`**, near the top:

```js
const CONFIG = {
  SCRIPT_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE",
  ...
};
```

Replace the placeholder with your Web App URL from step 1.4.

In **`admin.js`**, do the same:

```js
const CONFIG = {
  SCRIPT_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE",
  ...
};
```

Commit and push these changes — GitHub Pages will redeploy automatically.

### 3.2 Update the social share metadata

In **`index.html`**, update these two lines with your actual GitHub Pages URL:

```html
<meta property="og:image" content="https://YOUR-USERNAME.github.io/YOUR-REPO/assets/og-image.png">
<meta property="og:url" content="https://YOUR-USERNAME.github.io/YOUR-REPO/">
```

This is what makes the link preview look clean and trustworthy when shared on WhatsApp.

### 3.3 Test the flow end-to-end

1. Open your GitHub Pages URL on your phone.
2. Submit a test recommendation.
3. Check the Google Sheet — a new row should appear within a few seconds.
4. On the success page, tap **Copy link** and **Share on WhatsApp** to confirm both work.
5. Open the copied link in a new incognito tab — it should load the landing page normally (the `?ref=` parameter is invisible to the visitor but is captured silently for analytics).

### 3.4 Open the admin dashboard

1. Visit `https://yourusername.github.io/recommend-a-friend/admin.html`.
2. Enter the admin token you saved in step 1.3.
3. You should see live stats, charts, and tables pulled directly from the Sheet.

> The dashboard is not indexed by search engines (`noindex`) but the token is the only thing gating access — treat it like a password and don't share the admin URL publicly.

---

## Updating recommendation status (admissions & rewards)

The columns **Status**, **Admission Status**, **Reward Eligibility Status**, **Reward Payment Status**, and **Reward Payment Date** are meant to be updated by staff as a recommendation progresses — either:

- **Directly in the Google Sheet** (simplest — just edit the cell), or
- **Via Apps Script**, using the included helper function. Open the Apps Script editor, select `updateStatusByReferralId`, and call it with a referral ID and the fields to change, e.g.:

  ```js
  updateStatusByReferralId("RAF-M2K9X7QA", {
    "Status": "Contacted",
    "Admission Status": "Admitted",
    "Reward Eligibility Status": "Eligible",
    "Reward Payment Status": "Paid",
    "Reward Payment Date": new Date()
  });
  ```

Only rows with **Referral Level = 1** (a direct recommendation) should ever be marked reward-eligible — this is a manual verification step by design, so appreciation is always paid on genuine, confirmed admissions.

---

## Notes on the referral chain

The app tracks referral chains (who was referred by whom, and how deep) purely for analytics — to understand organic reach. It **never** creates additional layers of reward. Only Referral Level 1 (a direct recommendation) is ever eligible for appreciation. This is enforced by process (manual verification before marking "Eligible"), not just by the UI — please don't mark deeper-level rows as reward-eligible when updating the Sheet.

---

## Troubleshooting

**Submissions aren't appearing in the Sheet.**
Double-check `CONFIG.SCRIPT_URL` in `app.js` matches your deployment's `/exec` URL exactly, and that the deployment's "Who has access" is set to "Anyone."

**The dashboard says "Unauthorized."**
The token in the dashboard doesn't match the `ADMIN_TOKEN` script property. Re-run `setup()` in Apps Script only if you're sure no token exists yet — running it again will reset the Sheet's headers (it won't delete existing rows, but confirm this is intended), or check **Project Settings → Script properties** in the Apps Script editor to view the current token directly.

**WhatsApp preview shows no image or the wrong text.**
Social platforms cache link previews. Test with Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) or simply share the link to yourself first — WhatsApp typically fetches a fresh preview on first share per link.

**CORS / fetch errors in the browser console.**
This project deliberately sends requests with `Content-Type: text/plain` to avoid triggering a CORS preflight, which Apps Script doesn't handle well. Don't change this to `application/json` in `app.js` without also adding a `doOptions` handler in `Code.gs`.
