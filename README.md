# Your 2AM Friend — Master Content Engine

Automated, high-performing relationship content creation engine adhering to Google E-E-A-T guidelines, passage indexing, search intent locking, and live internal linking from the Your 2AM Friend database (320+ published URLs).

---

## 🚀 1-Click Free Cloud Deployment (from GitHub)

The easiest and recommended way to deploy this for your team is via **[Render.com](https://render.com/)** (100% Free):

### Step 1: Push this project to GitHub
1. Create a new GitHub repository at [github.com/new](https://github.com/new) (name it e.g. `content-writing-automation`).
2. Push your project files to GitHub (or drag-and-drop into the GitHub repository).

### Step 2: Deploy on Render
1. Go to **[dashboard.render.com](https://dashboard.render.com/)** and sign in (with GitHub).
2. Click **New +** > **Web Service**.
3. Select **"Build and deploy from a Git repository"** and select your GitHub repository.
4. Render will auto-detect Node.js. Configure the following:
   - **Name:** `your2amfriend-content`
   - **Runtime:** `Node`
   - **Build Command:** *(leave empty or `npm install`)*
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
5. *(Optional)* Under **Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Gemini API key *(a default verified key is already built-in)*
6. Click **Deploy Web Service**!

Render will build and give you a permanent, live HTTPS URL (e.g. `https://your2amfriend-content.onrender.com`) that you can share with your entire team!

---

## 💻 Local Development

### Option A: Using Node.js
```bash
node server.js
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

### Option B: Using Windows PowerShell
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\server.ps1 -Port 8080
```

---

## 🛠 Features

- **Live Google Sheet Sync:** Fetches 322+ published URLs from the master spreadsheet and scores contextual matches in real-time.
- **Deep Competitor Intel:** Scrapes live competitor URLs for structure, word counts, and heading architecture.
- **Brand Voice Engine:** Strict adherence to 2 AM friend voice: 0 em dashes, short readable sentences, and natural contractions.
- **1-Click Vital Fixes:** Dedicated alignment buttons for Word Count, Readability (~50 Flesch), Primary Keywords, Internal Links, and FAQs.
- **1-Click Google Doc Export:** Generates consolidated rich HTML formatted ready to paste directly into Google Docs.
