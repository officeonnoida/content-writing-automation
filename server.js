const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = parseInt(process.env.PORT, 10) || 8080;
const PUBLIC_DIR = path.join(__dirname, "public");
const DRAFTS_DIR = path.join(__dirname, "drafts");

if (!fs.existsSync(DRAFTS_DIR)) {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
}

// Fallback verified key and cache
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6JbhlF0MClODcaw-r9moTW-p4sNoWyXFbSSGv1ruZhQZg";
let sheetCacheData = null;
let sheetCacheTime = 0;
const SHEET_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

// Simple robust CSV parser for Google Sheet CSV exports
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] !== undefined ? values[j].trim() : "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Fetch Google Sheet internal links database
async function getGoogleSheetLinks(query = "", category = "", forceRefresh = false) {
  const now = Date.now();
  const cacheExpired = !sheetCacheData || (now - sheetCacheTime > SHEET_CACHE_TTL_MS) || forceRefresh;

  if (cacheExpired) {
    const csvUrl = "https://docs.google.com/spreadsheets/d/1sQafuhPo34p_2Pn28hbj0tezDQyOofvf7n2tMLghTjE/export?format=csv&gid=75796421";
    try {
      const resp = await fetch(csvUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (resp.ok) {
        const text = await resp.text();
        const rawRows = parseCSV(text);
        const validRows = [];

        for (const row of rawRows) {
          const url = row["Live URL"] || row["LiveUrl"] || row["live url"] || "";
          if (url && url.trim() !== "" && url.trim() !== "-" && /^https?:\/\//i.test(url.trim())) {
            validRows.push({
              Category: (row["Category"] || row["category"] || "General").trim(),
              LiveUrl: url.trim(),
              Keywords: (row["Keywords"] || row["keywords"] || "").trim(),
              SecondaryKeywords: (row["Secondary Keywords"] || row["secondary keywords"] || "").trim(),
              Content: (row["Content"] || row["content"] || "").trim()
            });
          }
        }
        sheetCacheData = validRows;
        sheetCacheTime = now;
      }
    } catch (err) {
      console.error("Error fetching Google Sheet CSV:", err.message);
    }
  }

  let results = sheetCacheData || [];

  if (category && category.trim() !== "") {
    const catLower = category.trim().toLowerCase();
    results = results.filter(r => r.Category && r.Category.toLowerCase().includes(catLower));
  }

  if (query && query.trim() !== "") {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
    const scored = [];

    for (const item of results) {
      const combined = `${item.Keywords} ${item.SecondaryKeywords} ${item.Category} ${item.Content} ${item.LiveUrl}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (combined.includes(t)) {
          score += 2;
          if (item.Keywords && item.Keywords.toLowerCase().includes(t)) {
            score += 3;
          }
        }
      }
      if (score > 0) {
        scored.push({
          Category: item.Category,
          LiveUrl: item.LiveUrl,
          Keywords: item.Keywords,
          SecondaryKeywords: item.SecondaryKeywords,
          Score: score
        });
      }
    }
    scored.sort((a, b) => b.Score - a.Score);
    return scored;
  }

  return results.map(r => ({
    Category: r.Category,
    LiveUrl: r.LiveUrl,
    Keywords: r.Keywords,
    SecondaryKeywords: r.SecondaryKeywords
  }));
}

// Scrape competitor URL
async function scrapeCompetitorUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { url, error: "Invalid URL", h2Headings: [] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return { url, error: `HTTP ${resp.status}`, h2Headings: [] };
    }

    const html = await resp.text();

    // Title
    let title = "";
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    }

    // Meta Description
    let metaDesc = "";
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/is) ||
                      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/is);
    if (descMatch) {
      metaDesc = descMatch[1].replace(/\s+/g, " ").trim();
    }

    // H1
    let h1 = "";
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    if (h1Match) {
      h1 = h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    }

    // H2 Headings
    const h2s = [];
    const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gis;
    let m;
    while ((m = h2Regex.exec(html)) !== null) {
      const cleanH2 = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (cleanH2.length > 0 && cleanH2.length < 200) {
        h2s.push(cleanH2);
      }
    }

    // Estimated Word Count
    let cleanText = html
      .replace(/<script[^>]*>.*?<\/script>/gis, " ")
      .replace(/<style[^>]*>.*?<\/style>/gis, " ")
      .replace(/<nav[^>]*>.*?<\/nav>/gis, " ")
      .replace(/<footer[^>]*>.*?<\/footer>/gis, " ")
      .replace(/<header[^>]*>.*?<\/header>/gis, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-zA-Z0-9#]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    const approxArticleWords = Math.max(300, Math.floor(words.length * 0.65));

    return {
      url,
      title: title || url,
      metaDescription: metaDesc,
      h1,
      h2Count: h2s.length,
      h2Headings: h2s.slice(0, 12),
      estimatedWordCount: approxArticleWords,
      sampleSnippet: cleanText.substring(0, 500).trim()
    };
  } catch (err) {
    return { url, error: err.message, h2Headings: [] };
  }
}

// Request Body Parser helper
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendResponse(res, statusCode, contentType, data) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  });
  res.end(data);
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendResponse(res, 200, "text/plain", "");
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = reqUrl.pathname;

  try {
    // 1. Healthcheck
    if (pathname === "/api/health") {
      return sendResponse(res, 200, "application/json", JSON.stringify({
        status: "ok",
        timestamp: new Date().toISOString()
      }));
    }

    // 2. Google Sheet Links
    if (pathname === "/api/sheet-links" && req.method === "GET") {
      const query = reqUrl.searchParams.get("query") || "";
      const category = reqUrl.searchParams.get("category") || "";
      const refresh = reqUrl.searchParams.get("refresh") === "1" || reqUrl.searchParams.get("refresh") === "true";

      const links = await getGoogleSheetLinks(query, category, refresh);
      return sendResponse(res, 200, "application/json", JSON.stringify(links));
    }

    // 3. Competitor Scraper
    if (pathname === "/api/scrape-competitor" && req.method === "POST") {
      const raw = await readRequestBody(req);
      let data = {};
      try { data = JSON.parse(raw); } catch {}

      const urls = Array.isArray(data.urls) ? data.urls : [];
      const results = [];
      for (const u of urls) {
        if (u && typeof u === "string" && u.trim().length > 0) {
          results.push(await scrapeCompetitorUrl(u.trim()));
        }
      }
      return sendResponse(res, 200, "application/json", JSON.stringify(results));
    }

    // 4. List Models
    if (pathname === "/api/list-models" && req.method === "GET") {
      let key = reqUrl.searchParams.get("key") || "";
      if (!key || key.trim() === "") key = DEFAULT_GEMINI_KEY;

      const keysToTry = [key];
      if (key !== DEFAULT_GEMINI_KEY) keysToTry.push(DEFAULT_GEMINI_KEY);

      let foundModels = null;
      for (const activeKey of keysToTry) {
        try {
          const apiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`);
          if (apiResp.ok) {
            const json = await apiResp.json();
            if (json && Array.isArray(json.models)) {
              foundModels = json.models
                .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
                .map(m => ({
                  id: (m.name || "").replace(/^models\//, ""),
                  displayName: m.displayName || m.name,
                  description: m.description
                }));
              break;
            }
          }
        } catch (e) {}
      }

      if (foundModels) {
        return sendResponse(res, 200, "application/json", JSON.stringify(foundModels));
      } else {
        return sendResponse(res, 400, "application/json", JSON.stringify({ error: "Failed to authenticate Gemini API key." }));
      }
    }

    // 5. Generate Content Proxy
    if (pathname === "/api/generate-content" && req.method === "POST") {
      const raw = await readRequestBody(req);
      let reqData = {};
      try { reqData = JSON.parse(raw); } catch {}

      const key = (reqData.apiKey && reqData.apiKey.trim()) || DEFAULT_GEMINI_KEY;
      const model = reqData.model || "gemini-3.5-flash-lite";
      const prompt = reqData.prompt || "";

      const candidateModels = Array.from(new Set([
        model,
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-flash-latest",
        "gemini-2.5-flash"
      ]));

      const keysToTry = [key];
      if (key !== DEFAULT_GEMINI_KEY) keysToTry.push(DEFAULT_GEMINI_KEY);

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536
        }
      };

      let success = false;
      let outputJson = null;
      let lastError = "";

      for (const activeKey of keysToTry) {
        for (const m of candidateModels) {
          const cleanModel = m.replace(/^models\//, "");
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`;

          try {
            const apiResp = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": activeKey
              },
              body: JSON.stringify(payload)
            });

            const respData = await apiResp.json();
            if (respData && respData.candidates) {
              success = true;
              outputJson = respData;
              break;
            } else if (respData && respData.error) {
              lastError = respData.error.message || JSON.stringify(respData.error);
            }
          } catch (err) {
            lastError = err.message;
          }
        }
        if (success) break;
      }

      if (success) {
        return sendResponse(res, 200, "application/json", JSON.stringify(outputJson));
      } else {
        return sendResponse(res, 400, "application/json", JSON.stringify({
          error: { message: lastError || "Generation failed across all models." }
        }));
      }
    }

    // 6. Save Draft
    if (pathname === "/api/save-draft" && req.method === "POST") {
      const raw = await readRequestBody(req);
      let data = {};
      try { data = JSON.parse(raw); } catch {}

      let slug = data.slug || `draft-${Date.now()}`;
      slug = slug.replace(/[^a-zA-Z0-9_-]/g, "-");

      const mdPath = path.join(DRAFTS_DIR, `${slug}.md`);
      const jsonPath = path.join(DRAFTS_DIR, `${slug}.json`);

      fs.writeFileSync(mdPath, data.markdown || "", "utf8");
      fs.writeFileSync(jsonPath, raw, "utf8");

      return sendResponse(res, 200, "application/json", JSON.stringify({
        success: true,
        slug,
        message: "Draft successfully saved"
      }));
    }

    // 7. List Drafts
    if (pathname === "/api/drafts" && req.method === "GET") {
      const files = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith(".md"));
      const list = [];

      for (const file of files) {
        const fullMd = path.join(DRAFTS_DIR, file);
        const fullJson = path.join(DRAFTS_DIR, file.replace(/\.md$/, ".json"));
        const stats = fs.statSync(fullMd);

        let meta = null;
        if (fs.existsSync(fullJson)) {
          try { meta = JSON.parse(fs.readFileSync(fullJson, "utf8")); } catch {}
        }

        list.push({
          filename: file,
          slug: file.replace(/\.md$/, ""),
          lastModified: stats.mtime.toISOString().replace("T", " ").substring(0, 19),
          sizeBytes: stats.size,
          title: (meta && meta.title) || file,
          primaryKeyword: (meta && meta.primaryKeyword) || ""
        });
      }

      list.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      return sendResponse(res, 200, "application/json", JSON.stringify(list));
    }

    // 8. Draft Content
    if (pathname === "/api/draft-content" && req.method === "GET") {
      const slug = (reqUrl.searchParams.get("slug") || "").replace(/[^a-zA-Z0-9_-]/g, "-");
      const jsonPath = path.join(DRAFTS_DIR, `${slug}.json`);
      const mdPath = path.join(DRAFTS_DIR, `${slug}.md`);

      if (fs.existsSync(jsonPath)) {
        return sendResponse(res, 200, "application/json", fs.readFileSync(jsonPath, "utf8"));
      } else if (fs.existsSync(mdPath)) {
        return sendResponse(res, 200, "application/json", JSON.stringify({
          markdown: fs.readFileSync(mdPath, "utf8"),
          slug
        }));
      } else {
        return sendResponse(res, 404, "application/json", JSON.stringify({ error: "Draft not found" }));
      }
    }

    // 9. Static Files (Public directory & root directory fallback)
    const sanitizedPath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
    const relativePath = sanitizedPath === "/" || sanitizedPath === "\\" ? "index.html" : sanitizedPath.replace(/^[\/\\]/, "");
    
    // Check in public/ first, then fall back to root directory
    let filePath = path.join(PUBLIC_DIR, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(__dirname, relativePath);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const content = fs.readFileSync(filePath);
      return sendResponse(res, 200, contentType, content);
    }

    // 404 Fallback
    return sendResponse(res, 404, "text/plain", "Not Found");

  } catch (err) {
    console.error("Server error:", err);
    return sendResponse(res, 500, "text/plain", `Internal Server Error: ${err.message}`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("==========================================================");
  console.log(" Your 2AM Friend - Master Content Engine (Node.js)");
  console.log(` Running on: http://0.0.0.0:${PORT}/`);
  console.log(" Ready for Cloud Deployment (Render, Railway, Vercel)");
  console.log("==========================================================");
});
