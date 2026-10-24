// Your 2AM Friend — Master Content Creation Engine Frontend
document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6JbhlF0MClODcaw-r9moTW-p4sNoWyXFbSSGv1ruZhQZg";

  // Global State
  const state = {
    allSheetRows: [],
    selectedInternalLinks: [],
    competitorData: [],
    generatedArticle: null,
    apiKey: localStorage.getItem("y2am_gemini_key") || DEFAULT_GEMINI_KEY,
    model: "gemini-3.5-flash-lite"
  };

  // DOM Elements
  const sheetStatusBadge = document.getElementById("sheetStatusBadge");
  const sheetStatusText = document.getElementById("sheetStatusText");
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const geminiModelSelect = document.getElementById("geminiModel");
  const toggleApiKeyBtn = document.getElementById("toggleApiKeyBtn");
  const btnRestoreDefaultKey = document.getElementById("btnRestoreDefaultKey");
  const progressBanner = document.getElementById("progressBanner");
  const progressStepTitle = document.getElementById("progressStepTitle");
  const progressStepDesc = document.getElementById("progressStepDesc");
  const btnDetectModels = document.getElementById("btnDetectModels");
  const modelDetectionResult = document.getElementById("modelDetectionResult");

  // Load saved API key
  if (geminiApiKeyInput) {
    if (state.apiKey) {
      geminiApiKeyInput.value = state.apiKey;
    }
    const syncKey = () => {
      state.apiKey = geminiApiKeyInput.value.trim();
      localStorage.setItem("y2am_gemini_key", state.apiKey);
    };
    geminiApiKeyInput.addEventListener("input", syncKey);
    geminiApiKeyInput.addEventListener("change", syncKey);
    geminiApiKeyInput.addEventListener("blur", syncKey);
  }

  // Restore Default Working Key Button
  if (btnRestoreDefaultKey) {
    btnRestoreDefaultKey.addEventListener("click", () => {
      state.apiKey = DEFAULT_GEMINI_KEY;
      if (geminiApiKeyInput) geminiApiKeyInput.value = state.apiKey;
      localStorage.setItem("y2am_gemini_key", state.apiKey);
      if (btnDetectModels) btnDetectModels.click();
    });
  }

  if (geminiModelSelect) {
    geminiModelSelect.addEventListener("change", (e) => {
      state.model = e.target.value;
    });
  }
  if (toggleApiKeyBtn && geminiApiKeyInput) {
    toggleApiKeyBtn.addEventListener("click", () => {
      if (geminiApiKeyInput.type === "password") {
        geminiApiKeyInput.type = "text";
        toggleApiKeyBtn.textContent = "Hide";
      } else {
        geminiApiKeyInput.type = "password";
        toggleApiKeyBtn.textContent = "Show";
      }
    });
  }

  if (btnDetectModels) {
    btnDetectModels.addEventListener("click", async () => {
      let key = geminiApiKeyInput?.value?.trim() || state.apiKey;
      if (!key) {
        key = DEFAULT_GEMINI_KEY;
        if (geminiApiKeyInput) geminiApiKeyInput.value = key;
      }
      btnDetectModels.disabled = true;
      btnDetectModels.textContent = "Verifying...";
      modelDetectionResult.textContent = "Validating key & discovering models...";
      modelDetectionResult.style.color = "var(--text-muted)";
      try {
        const res = await fetch(`/api/list-models?key=${encodeURIComponent(key)}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          const errMsg = data.error?.message || "Invalid API key or Generative Language API not enabled.";
          modelDetectionResult.innerHTML = `❌ ${escapeHtml(errMsg)} <button type="button" id="btnQuickFixKey" style="background:none;border:none;color:var(--accent);text-decoration:underline;cursor:pointer;font-size:11px;padding:0;margin-left:4px;">Use Working Key</button>`;
          modelDetectionResult.style.color = "var(--danger)";
          const quickFix = document.getElementById("btnQuickFixKey");
          if (quickFix) {
            quickFix.addEventListener("click", () => {
              if (btnRestoreDefaultKey) btnRestoreDefaultKey.click();
            });
          }
          return;
        }
        const models = Array.isArray(data) ? data : [];
        if (models.length === 0) {
          modelDetectionResult.textContent = "⚠️ Key authenticated, but no content models found.";
          modelDetectionResult.style.color = "var(--warning)";
          return;
        }
        state.apiKey = key;
        localStorage.setItem("y2am_gemini_key", key);

        geminiModelSelect.innerHTML = models.map(m => `
          <option value="${m.id}" ${m.id === "gemini-3.5-flash-lite" ? "selected" : ""}>${m.displayName || m.id}</option>
        `).join("");
        if (!geminiModelSelect.value) {
          geminiModelSelect.value = models[0].id;
        }
        state.model = geminiModelSelect.value;
        modelDetectionResult.textContent = `✓ Key Valid! Loaded ${models.length} active models. Selected: ${state.model}`;
        modelDetectionResult.style.color = "var(--success)";
      } catch(e) {
        modelDetectionResult.textContent = "❌ Connection error: " + e.message;
        modelDetectionResult.style.color = "var(--danger)";
      } finally {
        btnDetectModels.disabled = false;
        btnDetectModels.textContent = "Verify";
      }
    });

    // Auto-verify on initial load after brief pause so user immediately sees active green state!
    setTimeout(() => {
      if (btnDetectModels && state.apiKey) {
        btnDetectModels.click();
      }
    }, 400);
  }

  // Collapsible sections
  const aiConfigToggle = document.getElementById("aiConfigToggle");
  if (aiConfigToggle) {
    aiConfigToggle.addEventListener("click", () => {
      const body = document.getElementById("aiConfigBody");
      if (body) body.style.display = body.style.display === "none" ? "block" : "none";
    });
  }

  // Top Nav Tab Switching
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
      tab.classList.add("active");
      const targetId = tab.dataset.tab;
      document.getElementById(targetId).classList.add("active");
      if (targetId === "draftsTab") loadSavedDrafts();
    });
  });

  // Center Stage Tab Switching
  document.querySelectorAll(".stage-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".stage-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".stage-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const stageId = tab.dataset.stage;
      document.getElementById(stageId).classList.add("active");
    });
  });

  // 1. Fetch & Initialize Google Sheet Data
  async function initSheetData(forceRefresh = false) {
    try {
      if (sheetStatusBadge) sheetStatusBadge.className = "status-badge connecting";
      if (sheetStatusText) sheetStatusText.textContent = forceRefresh ? "Syncing live with Google Sheet..." : "Connecting to Master Sheet...";
      const queryParam = forceRefresh ? `?refresh=true&t=${Date.now()}` : `?t=${Date.now()}`;
      const res = await fetch(`/api/sheet-links${queryParam}`);
      const data = await res.json();
      state.allSheetRows = data;
      if (sheetStatusBadge) sheetStatusBadge.className = "status-badge connected";
      if (sheetStatusText) sheetStatusText.textContent = `Connected (${data.length} published URLs)`;
      renderSheetExplorerTable(data);
      if (forceRefresh) {
        alert(`✓ Master Database Refreshed! Loaded all ${data.length} live published URLs.`);
      }
    } catch (err) {
      console.error("Sheet load error:", err);
      if (sheetStatusBadge) sheetStatusBadge.className = "status-badge";
      if (sheetStatusText) sheetStatusText.textContent = "Offline / Connection Error";
    }
  }
  initSheetData();

  // Master Sheet Explorer Search & Filter
  const sheetSearchInput = document.getElementById("sheetSearchInput");
  const sheetCatFilter = document.getElementById("sheetCatFilter");
  const btnReloadSheet = document.getElementById("btnReloadSheet");
  if (btnReloadSheet) {
    btnReloadSheet.addEventListener("click", () => {
      initSheetData(true);
    });
  }

  function filterSheetData() {
    const query = sheetSearchInput.value.toLowerCase().trim();
    const cat = sheetCatFilter.value.toLowerCase().trim();
    const filtered = state.allSheetRows.filter(row => {
      const matchCat = !cat || (row.Category && row.Category.toLowerCase().includes(cat));
      const matchQuery = !query ||
        (row.Keywords && row.Keywords.toLowerCase().includes(query)) ||
        (row.SecondaryKeywords && row.SecondaryKeywords.toLowerCase().includes(query)) ||
        (row.LiveUrl && row.LiveUrl.toLowerCase().includes(query));
      return matchCat && matchQuery;
    });
    renderSheetExplorerTable(filtered);
  }

  sheetSearchInput.addEventListener("input", filterSheetData);
  sheetCatFilter.addEventListener("change", filterSheetData);

  function renderSheetExplorerTable(rows) {
    const tbody = document.getElementById("sheetTableBody");
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center">No matching URLs found in database.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.slice(0, 1000).map(r => `
      <tr>
        <td><span class="badge-subtle">${escapeHtml(r.Category || "General")}</span></td>
        <td><strong>${escapeHtml(r.Keywords || "-")}</strong></td>
        <td>${escapeHtml(r.SecondaryKeywords || "-")}</td>
        <td><a href="${escapeHtml(r.LiveUrl)}" target="_blank" rel="noopener">${escapeHtml(r.LiveUrl)}</a></td>
      </tr>
    `).join("");
  }

  // 2. Scrape Competitor Action
  const btnScrapeOnly = document.getElementById("btnScrapeOnly");
  if (btnScrapeOnly) {
    btnScrapeOnly.addEventListener("click", async () => {
    const urls = getCompetitorUrls();
    if (urls.length === 0) {
      alert("Please provide at least 1 competitor URL.");
      return;
    }
    showProgress("Scraping Competitor URLs...", "Analyzing headings, length, and content structure");
    try {
      const res = await fetch("/api/scrape-competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls })
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data && typeof data === 'object' && !data.error ? [data] : []);
      if (data && data.error && list.length === 0) {
        throw new Error(data.error);
      }
      state.competitorData = list;
      renderCompetitorIntel(list);
      switchStage("stageCompetitor");
    } catch (err) {
      alert("Error scraping competitors: " + err.message);
    } finally {
      hideProgress();
    }
  });
  }

  function getCompetitorUrls() {
    return document.getElementById("competitorUrls").value
      .split("\n")
      .map(u => u.trim())
      .filter(u => u.length > 5 && u.startsWith("http"));
  }

  function extractH2Array(c) {
    if (!c || !c.h2Headings) return [];
    if (Array.isArray(c.h2Headings)) return c.h2Headings;
    if (typeof c.h2Headings === 'string') return [c.h2Headings];
    if (typeof c.h2Headings === 'object') {
      return Object.values(c.h2Headings).filter(v => typeof v === 'string' && v.trim().length > 0);
    }
    return [];
  }

  function renderCompetitorIntel(data) {
    const container = document.getElementById("competitorScrapeCards");
    const items = Array.isArray(data) ? data : (data && typeof data === 'object' && !data.error ? [data] : []);
    if (!items || items.length === 0) {
      container.innerHTML = `<p class="placeholder-text">No competitor data found.</p>`;
      return;
    }
    container.innerHTML = items.map((c, idx) => {
      let domain = "Competitor " + (idx + 1);
      try { domain = new URL(c.url).hostname.replace("www.", ""); } catch(e){}
      const h2List = extractH2Array(c);
      return `
        <div class="competitor-card">
          <div class="comp-domain">${escapeHtml(domain)}</div>
          <div class="comp-title">${escapeHtml(c.title || c.url)}</div>
          <div class="comp-stats">
            <span>~${c.estimatedWordCount || 0} words</span>
            <span>•</span>
            <span>${c.h2Count || h2List.length} H2 sections</span>
          </div>
          <div class="comp-h2s">
            <strong>Key Headings:</strong>
            <ul>
              ${h2List.slice(0, 5).map(h => `<li>${escapeHtml(String(h))}</li>`).join("")}
            </ul>
          </div>
        </div>
      `;
    }).join("");

    // If analysis box exists, populate
    document.getElementById("competitorAnalysisBox").classList.remove("hidden");
  }

  // 3. Find Matching Internal Links
  const btnFindLinks = document.getElementById("btnFindLinks");
  if (btnFindLinks) {
    btnFindLinks.addEventListener("click", async () => {
      await findMatchingLinks();
      switchStage("stageInternalLinks");
    });
  }
  const btnRefreshLinks = document.getElementById("btnRefreshLinks");
  if (btnRefreshLinks) {
    btnRefreshLinks.addEventListener("click", async () => {
      await findMatchingLinks();
    });
  }

  async function findMatchingLinks() {
    const primary = document.getElementById("primaryKeyword").value.trim();
    const secondaries = document.getElementById("secondaryKeywords").value.trim();
    const cat = document.getElementById("category").value.trim();
    const query = `${primary} ${secondaries}`;

    showProgress("Scanning Master Database...", "Searching across 320+ rows for high contextual relevance");
    try {
      const res = await fetch(`/api/sheet-links?query=${encodeURIComponent(query)}&category=${encodeURIComponent(cat)}`);
      let matches = await res.json();
      
      // Fallback if strict query had few matches
      if (!matches || matches.length < 3) {
        const fallbackRes = await fetch(`/api/sheet-links?query=${encodeURIComponent(primary)}`);
        matches = await fallbackRes.json();
      }

      // Pick top 3-8 unique URLs (v4 allows 3 to 8 max)
      const selected = [];
      const seen = new Set();
      for (const m of (matches || [])) {
        if (!seen.has(m.LiveUrl) && selected.length < 8) {
          seen.add(m.LiveUrl);
          selected.push(m);
        }
      }

      // Supplement up to 8 from allSheetRows if needed
      if (selected.length < 8 && state.allSheetRows && state.allSheetRows.length > 0) {
        for (const row of state.allSheetRows) {
          if (!seen.has(row.LiveUrl) && selected.length < 8) {
            seen.add(row.LiveUrl);
            selected.push(row);
          }
        }
      }

      state.selectedInternalLinks = selected;
      renderSelectedLinks(selected);
      return selected;
    } finally {
      hideProgress();
    }
  }

  function renderSelectedLinks(links) {
    const container = document.getElementById("selectedLinksList");
    const text = state.generatedArticle?.markdown || "";
    const norm = (u) => (u || "").trim().toLowerCase().replace(/\/+$/, "");

    const embeddedUrls = new Set();
    const linkRegex = /\[(.*?)\]\((https?:\/\/[^\)]+)\)/g;
    let m;
    while ((m = linkRegex.exec(text)) !== null) {
      if (m[2].includes("your2amfriend.com")) {
        embeddedUrls.add(norm(m[2]));
      }
    }

    let displayList = Array.isArray(links) && links.length > 0 ? links : [];
    if (displayList.length === 0 && embeddedUrls.size > 0) {
      displayList = Array.from(embeddedUrls).map(url => ({
        Category: "Embedded",
        Keywords: "Linked in Article",
        LiveUrl: url
      }));
    }

    if (displayList.length === 0) {
      container.innerHTML = `<p class="placeholder-text">No matches found. Try broadening keywords or changing category.</p>`;
      return;
    }

    const embeddedCount = embeddedUrls.size;
    const hasArticle = Boolean(state.generatedArticle?.markdown);

    container.innerHTML = `
      ${hasArticle ? `
        <div style="background: #f8f9fa; border: 1px solid #dadce0; border-radius: 8px; padding: 12px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <strong style="color: #202124;">Internal Linking Summary:</strong>
            <span style="color: #137333; font-weight: 700; margin-left: 8px; background: #e6f4ea; padding: 2px 8px; border-radius: 12px; font-size: 12px;">✓ ${embeddedCount} Embedded in Draft</span>
            <span style="color: #5f6368; margin-left: 8px; font-size: 12.5px;">(${displayList.length} Candidate Opportunities Matched from Sheet)</span>
          </div>
          <span class="badge-subtle">Target: 3–5 links in body (Prevents over-linking penalty)</span>
        </div>
      ` : `
        <div style="background: #f8f9fa; border: 1px solid #dadce0; border-radius: 8px; padding: 10px 16px; margin-bottom: 14px; font-size: 12.5px; color: #5f6368;">
          Showing <strong>${displayList.length} candidate opportunities</strong> matched from database. When generated, the AI will naturally weave 3–5 into body paragraphs.
        </div>
      `}
      <table class="data-table">
        <thead>
          <tr>
            <th width="12%">Category</th>
            <th width="28%">Target Keyword / Anchor Idea</th>
            <th width="42%">Live URL (Verified from Sheet)</th>
            <th width="18%">Status in Article</th>
          </tr>
        </thead>
        <tbody>
          ${displayList.map((l, i) => {
            const isEmbedded = embeddedUrls.has(norm(l.LiveUrl));
            return `
            <tr>
              <td><span class="badge-subtle">${escapeHtml(l.Category || "Related")}</span></td>
              <td><strong>${escapeHtml(l.Keywords || "Related Article " + (i+1))}</strong></td>
              <td><a href="${escapeHtml(l.LiveUrl)}" target="_blank" rel="noopener" style="font-family: monospace; font-size: 11.5px; word-break: break-all;">${escapeHtml(l.LiveUrl)}</a></td>
              <td>
                ${hasArticle ? (
                  isEmbedded 
                    ? `<span style="background: #e6f4ea; color: #137333; padding: 3px 9px; border-radius: 12px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">✓ In Body</span>`
                    : `<span style="background: #f1f3f4; color: #5f6368; padding: 3px 9px; border-radius: 12px; font-size: 11px;">Candidate Pool</span>`
                ) : `<span style="background: #e8f0fe; color: #1a73e8; padding: 3px 9px; border-radius: 12px; font-size: 11px;">Candidate Pool</span>`}
              </td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  // 4. Generate Master Content (Steps 1–5 Pipeline)
  const btnGenerateAll = document.getElementById("btnGenerateAll");
  if (btnGenerateAll) {
    btnGenerateAll.addEventListener("click", async () => {
      const key = geminiApiKeyInput?.value?.trim() || state.apiKey || localStorage.getItem("y2am_gemini_key") || "";
      if (!key) {
        alert("Please enter your Gemini API key under 'Gemini AI Engine Settings' on the left and click Verify.");
        const body = document.getElementById("aiConfigBody");
        if (body) body.style.display = "block";
        if (geminiApiKeyInput) geminiApiKeyInput.focus();
        return;
      }
      state.apiKey = key;
      localStorage.setItem("y2am_gemini_key", key);

      const primary = document.getElementById("primaryKeyword").value.trim();
      const secondaries = document.getElementById("secondaryKeywords").value.trim();
      const compUrls = getCompetitorUrls();
      const category = document.getElementById("category").value.trim();
      const subCategory = document.getElementById("subCategory").value.trim();

      if (!primary) {
        alert("Please enter a Primary Keyword.");
        document.getElementById("primaryKeyword")?.focus();
        return;
      }
      if (!secondaries) {
        alert("Please enter at least 2 Secondary Keywords (comma-separated).");
        document.getElementById("secondaryKeywords")?.focus();
        return;
      }
      if (compUrls.length === 0) {
        const proceedWithout = confirm("No Competitor URL provided. Would you like to proceed with direct search-intent synthesis without scraping competitor URLs?");
        if (!proceedWithout) {
          document.getElementById("competitorUrls")?.focus();
          return;
        }
      }

      // Step A: Scrape Competitors
      if (compUrls.length > 0) {
        showProgress("Step 1/5: Competitor Analysis...", "Scraping competitor URLs and evaluating content structure");
        try {
          const compRes = await fetch("/api/scrape-competitor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: compUrls })
          });
          const compRaw = await compRes.json();
          state.competitorData = Array.isArray(compRaw) ? compRaw : (compRaw && typeof compRaw === 'object' && !compRaw.error ? [compRaw] : []);
          renderCompetitorIntel(state.competitorData);
        } catch(e) {
          console.warn("Competitor scrape warning:", e);
        }
      } else {
        state.competitorData = [];
      }

      // Step B: Fetch Internal Links
      showProgress("Step 2/5: Database Matcher...", "Selecting 3–5 unique live URLs from Google Sheet");
      const links = await findMatchingLinks();

      // Step C: Trigger Article Synthesis via Gemini
      showProgress("Step 3/5: Brand Voice & E-E-A-T Drafting...", "Writing long-form article matching 2 AM Friend tone & strict constraints");

      try {
        const generated = await executeContentGenerationPipeline({
          primaryKeyword: primary,
          secondaryKeywords: secondaries,
          competitorUrls: compUrls,
          competitorIntel: state.competitorData,
          category,
          subCategory,
          selectedLinks: state.selectedInternalLinks,
          apiKey: state.apiKey,
          model: state.model
        });

        state.generatedArticle = generated;
        displayGeneratedContent(generated);
        switchStage("stagePreview");
      } catch(err) {
        alert("Generation error: " + err.message);
      } finally {
        hideProgress();
      }
    });
  }

  // Content Generation Logic (Supports Gemini API directly)
  async function executeContentGenerationPipeline(params) {
    if (!params.apiKey) {
      params.apiKey = geminiApiKeyInput?.value?.trim() || state.apiKey || localStorage.getItem("y2am_gemini_key") || "";
    }
    if (!params.apiKey) {
      const keyPrompt = prompt("Enter your Gemini API key (from Google AI Studio - free):", state.apiKey);
      if (keyPrompt && keyPrompt.trim()) {
        params.apiKey = keyPrompt.trim();
        state.apiKey = params.apiKey;
        if (geminiApiKeyInput) geminiApiKeyInput.value = state.apiKey;
        localStorage.setItem("y2am_gemini_key", state.apiKey);
      } else {
        throw new Error("Gemini API Key is required to execute generation. Please enter it in the settings on the left.");
      }
    }

    const promptText = buildMasterSystemPrompt(params);

    // Call our server backend which handles proper headers, no CORS issues, and automatic fallback across models!
    const res = await fetch("/api/generate-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: params.apiKey,
        model: params.model,
        prompt: promptText
      })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const errMsg = errJson.error?.message || `Server returned error (${res.status})`;
      throw new Error(errMsg);
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("No text returned by Gemini API. Response: " + JSON.stringify(data));
    }

    return parseArticleOutput(candidateText, params);
  }

  // Syllable Counter & Flesch Score Calculator
  function countSyllables(word) {
    word = (word || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]|ed|es|e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? Math.max(1, matches.length) : 1;
  }

  function calculateFleschScore(text) {
    if (!text) return 50;
    const clean = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\[.*?\]\(.*?\)/g, " ")
      .replace(/[`#*|_~]/g, " ")
      .replace(/\s+/g, " ");

    const sentences = clean.split(/[.!?]+\s+/).filter(s => s.trim().length > 3);
    const words = clean.split(/\s+/).filter(w => w.trim().length > 0 && /[a-z0-9]/i.test(w));
    if (sentences.length === 0 || words.length === 0) return 50;

    let totalSyllables = 0;
    for (const w of words) {
      totalSyllables += countSyllables(w);
    }

    const wordsPerSentence = words.length / sentences.length;
    const syllablesPerWord = totalSyllables / words.length;

    // Flesch Reading Ease Formula
    let score = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
    return Math.round(Math.max(10, Math.min(95, score)));
  }

  // Resilient FAQ Counter supporting all LLM formatting variations
  function extractFaqCount(text) {
    if (!text) return 0;

    // 1. Locate the FAQ section
    const faqHeaderRegex = /(?:^|\n)#{1,4}\s*(?:Frequently\s+Asked\s+Questions|FAQs?|Common\s+Questions|Questions\s*&\s*Answers)[^\n]*\n([\s\S]*?)(?=(?:\n#{1,2}\s+(?!#|Q|Question|\d\.)[A-Za-z]+)|$)/i;
    const match = text.match(faqHeaderRegex);
    let faqText = match ? match[1] : "";

    // Fallback: search anywhere after "Frequently Asked Questions" or "FAQs"
    if (!faqText) {
      const idx = text.search(/Frequently\s+Asked\s+Questions|FAQs?\b/i);
      if (idx !== -1) {
        faqText = text.substring(idx);
      }
    }

    if (!faqText || faqText.trim().length === 0) return 0;

    // 2. Count distinct questions inside the FAQ block
    // Pattern A: Sub-headings (### Question? or #### Question?)
    const headingQuestions = (faqText.match(/\n#{3,4}\s+[^\n]+/g) || []).map(q => q.trim());
    if (headingQuestions.length >= 3) {
      return headingQuestions.length;
    }

    // Pattern B: Line-by-line inspection (bold questions, numbered questions, Q: questions)
    const distinctQuestions = [];
    const lines = faqText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip the main FAQ header itself if present
      if (/^#{1,3}\s*(?:Frequently|FAQ)/i.test(trimmed)) continue;

      if (/^(?:(?:\d+[\.\)]|[-*])\s*)?\*\*(?:Q\d*[:.]\s*|Question\s*\d*[:.]\s*)?[^*\n]+\??\*\*/i.test(trimmed) ||
          /^(?:Q\d*[:.]|Question\s*\d*[:.])/i.test(trimmed) ||
          /^#{3,4}\s+[^\n]+/i.test(trimmed) ||
          (/^(?:\d+[\.\)]|[-*])\s+.*?\?\s*$/i.test(trimmed) && trimmed.length < 180)) {
        distinctQuestions.push(trimmed);
      }
    }
    if (distinctQuestions.length >= 2) {
      return distinctQuestions.length;
    }

    // Pattern C: Any line ending in a question mark in the FAQ block
    const qMarkQuestions = (faqText.match(/[^\n]+\?\s*(?:\*\*)?(?=\n|$)/g) || []).filter(q => {
      const t = q.trim();
      return t.length > 10 && t.length < 180 && !/^#{1,2}\s+Frequently/i.test(t);
    });
    if (qMarkQuestions.length >= 2) {
      return qMarkQuestions.length;
    }

    return headingQuestions.length || distinctQuestions.length || 0;
  }

  // Robust Markdown Table Formatter & Renderer
  function renderMarkdownTables(text) {
    if (!text) return "";
    const lines = text.split("\n");
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      const hasPipe = trimmed.includes("|");
      const hasTab = trimmed.includes("\t") && trimmed.split("\t").length >= 2;
      const isHeaderOrQuote = trimmed.startsWith("#") || trimmed.startsWith(">");

      if ((hasPipe || hasTab) && !isHeaderOrQuote) {
        const tableLines = [];
        while (i < lines.length) {
          const cur = lines[i];
          const curTrim = cur.trim();
          if (!curTrim) {
            if (i + 1 < lines.length && (lines[i+1].trim().includes("|") || lines[i+1].trim().includes("\t"))) {
              i++;
              continue;
            }
            break;
          }
          if (curTrim.startsWith("#") || curTrim.startsWith(">") || curTrim.startsWith("```")) {
            break;
          }
          tableLines.push(curTrim);
          i++;
        }

        const parsedRows = [];
        for (let tl of tableLines) {
          let cells = [];
          if (!tl.includes("|") && tl.includes("\t")) {
            cells = tl.split("\t").map(c => c.trim()).filter(c => c.length > 0);
          } else {
            let clean = tl;
            if (clean.startsWith("|")) clean = clean.substring(1);
            if (clean.endsWith("|")) clean = clean.substring(0, clean.length - 1);
            cells = clean.split("|").map(c => c.trim());
          }

          const isSeparator = cells.every(c => /^:?-+:?$/.test(c.replace(/\s+/g, "")));
          if (isSeparator) continue;

          if (cells.length > 0) parsedRows.push(cells);
        }

        if (parsedRows.length >= 2) {
          let maxCols = Math.max(...parsedRows.map(r => r.length));
          if (maxCols < 2) maxCols = 2;

          const headerRow = parsedRows[0];
          while (headerRow.length < maxCols) {
            headerRow.push(`Column ${headerRow.length + 1}`);
          }

          const dataRows = [];
          for (let r = 1; r < parsedRows.length; r++) {
            let row = parsedRows[r];
            if (row.length < maxCols && dataRows.length > 0 && dataRows[dataRows.length - 1].length < maxCols) {
              dataRows[dataRows.length - 1].push(...row);
            } else {
              dataRows.push(row);
            }
          }

          for (let row of dataRows) {
            while (row.length < maxCols) row.push("");
          }

          const ths = headerRow.map(c => `<th>${escapeHtml(c)}</th>`).join("");
          const trs = dataRows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
          result.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
        } else {
          result.push(...tableLines);
        }
      } else {
        result.push(line);
        i++;
      }
    }

    return result.join("\n");
  }

  function buildMasterSystemPrompt(params) {
    const compList = Array.isArray(params.competitorIntel) ? params.competitorIntel : [];
    const compSummary = compList.map(c => {
      const h2List = extractH2Array(c);
      return `
- Competitor URL: ${c.url || '-'}
  Title: ${c.title || 'Competitor'}
  H2s: ${h2List.slice(0, 6).map(h => String(h)).join(" | ")}
  Estimated word count: ${c.estimatedWordCount || 0}
`;
    }).join("\n");

    const linksList = Array.isArray(params.selectedLinks) ? params.selectedLinks : [];
    const linksFormatted = linksList.map(l => 
      `- Category: ${l.Category} | Keyword: ${l.Keywords} | Live URL: ${l.LiveUrl}`
    ).join("\n");

    return `# Your 2AM Friend — Master Content Engine Execution (v4 Final)
You are a senior content writer with 5+ years of hands-on experience in relationships, mental health, family, motivation, and self-care, writing exclusively for Your 2AM Friend (your2amfriend.com).
You build content to Google's Helpful Content standards - Experience, Expertise, Authoritativeness, Trustworthiness (E-E-A-T), plus accuracy, transparency, comprehension, and genuine reader value.
Brand voice: Imagine the most emotionally intelligent person in someone's contacts. They text you at 2AM when you're spiraling. They don't lecture. They don't pad. They just say the thing you needed to hear: warm, honest, grounded, real.
Tone & Reading Ease: Informal, conversational tone throughout like an emotionally mature friend, not a brand. Strictly target a Flesch Reading Ease score around 50 (target range 45 to 55, never exceed 58). Use varied sentence rhythms (10 to 18 words per sentence; never over 20 words), mature emotional vocabulary, and natural contractions ("you're", "don't", "can't"). Avoid both over-simplistic child-like phrasing (which inflates score above 60) and dense academic jargon (which drops score under 45). Second person always: "you", "your", "you're".
Human-written Feel & Anti-Plagiarism: Content must NEVER look like generic AI. Strictly zero plagiarism (<20% similarity threshold; use original analogies, fresh framing, never copy competitor sentence patterns). Use natural human contractions ("you're", "don't", "can't").

CRITICAL NON-NEGOTIABLE QUALITY RULES:
1. NO em dashes (—). Replace with a comma, colon, or rewrite sentences.
2. NO sentences over 20 words. Count and break them.
3. NO paragraphs longer than 4 mobile lines (~60 words).
4. Banned words/phrases (strict zero tolerance): "straightforward", "crucial", "delve", "utilize", "comprehensive", "navigate", "noteworthy", "paramount", "it is important to note", "in today's world", "in conclusion", "final thoughts", "we hope this helped", "have you ever wondered".
5. Primary Keyword: "${params.primaryKeyword}" must appear STRICTLY 3 to 5 times across the whole article:
   - in H1 (exact or very close match)
   - in Meta description
   - in first 100 words of intro (naturally)
   - in at least one H2 or H3
   - in the closing paragraph
   Total count must be exactly 3 to 5. Not 2, not 6. Count them.
6. Secondary Keywords: "${params.secondaryKeywords}". Each secondary keyword appears naturally at least once; at least one secondary keyword appears in an H2 or H3.
7. Word count: Floor: 1,400 words (Strict non-negotiable floor; target 1,450 to 1,950 words).
   CRITICAL: Do NOT write a brief summary. Deliver full, compassionate substance:
   - Intro + Key Takeaways: ~150 words
   - Core H2 Sections (4 to 6 sections): 250 to 350 words EACH (at least 1,200 words across core sections alone)
   - FAQs (4 to 6 questions): 250 to 350 words total
   - Soft CTA + Closing: ~150 words
   Ensure the final article comfortably exceeds 1,400 words with genuine depth, relatable real-world partner examples, and psychological nuance. Any draft under 1,200 words is considered failed.
8. Structure, LLM-Friendly Formatting & Passage Indexing:
   - Exactly One H1.
   - Introduction (60–100 words max, opens by speaking directly to the reader's emotional state, no question openers, no generic openers, primary keyword in first 100 words).
   - **Key Takeaways** box placed immediately after intro (4–6 bullets, each specific and useful, under 20 words).
   - 4–7 H2s (WH-format preferred: What, Why, How, When, Who). First 1–2 sentences of every H2 must say plainly what the section covers and answer the heading directly (AEO/GEO self-contained passage test).
   - Practical action tips: In at least 1-2 sections, add a concrete tip labeled "**Try this:**".
   - TABLE FORMATTING (STRICT GFM SYNTAX):
     If you include a comparison table, you MUST format it strictly as standard GitHub Flavored Markdown:
     | Header 1 | Header 2 | Header 3 |
     | :--- | :--- | :--- |
     | Row 1 Col 1 | Row 1 Col 2 | Row 1 Col 3 |
     Every row must begin with a pipe \`|\` and end with a pipe \`|\`. Never put newlines inside a table cell. Never use tab characters.
   - COMPULSARY EXTERNAL AUTHORITY LINKS (MANDATORY):
     You MUST include 1 to 2 clickable markdown external links to recognized, authoritative research/health institutions.
     Choose ONLY from this approved authority list:
     * [The Gottman Institute](https://www.gottman.com)
     * [American Psychological Association](https://www.apa.org)
     * [Mayo Clinic](https://www.mayoclinic.org)
     * [Harvard Health Publishing](https://www.health.harvard.edu)
     * [Cleveland Clinic](https://my.clevelandclinic.org)
     * [Psychology Today](https://www.psychologytoday.com)
     * [National Institutes of Health](https://www.nih.gov)
     * [Greater Good Science Center](https://greatergood.berkeley.edu)
     * [Child Mind Institute](https://childmind.org)
     Embed naturally in sentences (e.g. "Research published by [The Gottman Institute](https://www.gottman.com) indicates that..."). Never use bare URLs.
    - MANDATORY INTERNAL LINKS (NON-NEGOTIABLE MINIMUM: 3 TO 5 LINKS):
      You MUST embed at least 3 to 5 internal links chosen ONLY from the Approved Internal Links list below.
      Fewer than 3 links is a strict quality failure. Distribute 1 link per major H2 section across body paragraphs. Format: [natural contextual anchor text](URL)
   - Frequently Asked Questions (COMPULSARY): ## Frequently Asked Questions. Include strictly 4 to 6 questions. Format each question heading as "### [Question text]?" followed by a direct 2–4 sentence answer. Real questions people search for; at least one addresses a secondary keyword.
   - Call to Action: One soft CTA after FAQs, before closing (reflection nudge or related read from approved list).
   - Closing paragraph: 60–100 words, warm and human like a friend finishing a conversation, contains the primary keyword once.
   - Image Alt Texts: Provide 3–5 descriptive, keyword-friendly image alt text descriptions with suggested context/placement.

COMPETITOR INTEL:
${compSummary}

APPROVED INTERNAL LINKS (USE 3 TO 8 OF THESE EXACT URLS IN BODY):
${linksFormatted}

OUTPUT STRUCTURE:
You must provide the output with the exact delimiters:

===STEP_1_COMPETITOR_ANALYSIS===
1. Search Intent & Emotional State: [Analysis]
2. Structure & Length: [Analysis]
3. What they did well: [2-3 specific strengths]
4. What they missed: [2-3 specific gaps]
5. Your Content Edge: [One sentence north star]

===STEP_2_SEARCH_INTENT===
"The person searching ${params.primaryKeyword} is looking for [validation / explanation / how-to / comparison / reassurance] because they are feeling [specific emotional state]."

===STEP_3_METADATA===
TITLE_TAG: [Strictly 50-55 characters, primary keyword front-loaded]
META_DESCRIPTION: [Strictly 120-150 characters, primary keyword included]
URL_SLUG: [lowercase, hyphenated, 3-6 words]
CATEGORY: [${params.category || 'Relationship'}]
SUB_CATEGORY: [${params.subCategory || 'General'}]

===STEP_3B_IMAGE_ALT_TEXTS===
1. [Placement/Section]: [Descriptive alt text under 100 characters]
2. [Placement/Section]: [Descriptive alt text under 100 characters]
3. [Placement/Section]: [Descriptive alt text under 100 characters]
4. [Placement/Section]: [Descriptive alt text under 100 characters]

===STEP_4_ARTICLE_MARKDOWN===
[Full article in Markdown starting with # H1]
`;
  }

  function parseArticleOutput(rawText, params) {
    let compAnalysis = "";
    let searchIntent = "";
    let titleTag = "";
    let metaDesc = "";
    let urlSlug = "";
    let category = params.category || "Relationship";
    let subCategory = params.subCategory || "";
    let imageAltTexts = [];
    let articleMarkdown = "";

    const p1 = rawText.indexOf("===STEP_1_COMPETITOR_ANALYSIS===");
    const p2 = rawText.indexOf("===STEP_2_SEARCH_INTENT===");
    const p3 = rawText.indexOf("===STEP_3_METADATA===");
    const p3b = rawText.indexOf("===STEP_3B_IMAGE_ALT_TEXTS===");
    const p4 = rawText.indexOf("===STEP_4_ARTICLE_MARKDOWN===");

    if (p1 !== -1 && p2 !== -1) {
      compAnalysis = rawText.substring(p1 + 32, p2).trim();
    }
    if (p2 !== -1 && p3 !== -1) {
      searchIntent = rawText.substring(p2 + 26, p3).trim();
    }
    if (p3 !== -1) {
      const metaEnd = p3b !== -1 ? p3b : (p4 !== -1 ? p4 : rawText.length);
      const metaBlock = rawText.substring(p3 + 22, metaEnd).trim();
      const tMatch = metaBlock.match(/TITLE_TAG:\s*(.*)/i);
      const mMatch = metaBlock.match(/META_DESCRIPTION:\s*(.*)/i);
      const sMatch = metaBlock.match(/URL_SLUG:\s*(.*)/i);
      const cMatch = metaBlock.match(/CATEGORY:\s*(.*)/i);
      const scMatch = metaBlock.match(/SUB_CATEGORY:\s*(.*)/i);
      if (tMatch) titleTag = tMatch[1].trim();
      if (mMatch) metaDesc = mMatch[1].trim();
      if (sMatch) urlSlug = sMatch[1].trim();
      if (cMatch && cMatch[1].trim()) category = cMatch[1].trim();
      if (scMatch && scMatch[1].trim()) subCategory = scMatch[1].trim();
    }
    if (p3b !== -1) {
      const altEnd = p4 !== -1 ? p4 : rawText.length;
      const altBlock = rawText.substring(p3b + 30, altEnd).trim();
      imageAltTexts = altBlock.split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0 && (/^\d+[\.\)]/.test(l) || l.startsWith("-")));
    }
    if (p4 !== -1) {
      articleMarkdown = rawText.substring(p4 + 29).trim();
    } else {
      const h1Idx = rawText.search(/\n# [^\n]+/);
      if (h1Idx !== -1) {
        articleMarkdown = rawText.substring(h1Idx + 1).trim();
      } else if (rawText.startsWith("# ")) {
        articleMarkdown = rawText.trim();
      } else {
        articleMarkdown = rawText.trim();
      }
    }

    // Strip wrapping markdown code blocks if AI wrapped the entire article
    articleMarkdown = articleMarkdown
      .replace(/^```markdown\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();

    // Default slug if empty
    if (!urlSlug) {
      urlSlug = params.primaryKeyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    return {
      compAnalysis,
      searchIntent,
      titleTag,
      metaDesc,
      urlSlug,
      category,
      subCategory,
      imageAltTexts,
      markdown: articleMarkdown,
      primaryKeyword: params.primaryKeyword,
      secondaryKeywords: params.secondaryKeywords,
      selectedLinks: params.selectedLinks
    };
  }

  function displayGeneratedContent(art) {
    // 1. Metadata
    document.getElementById("metaTitleDisplay").textContent = art.titleTag || "Untitled";
    const tLen = (art.titleTag || "").length;
    const tCounter = document.getElementById("titleCharCount");
    tCounter.textContent = `${tLen} / 55 chars`;
    tCounter.className = `char-counter ${tLen >= 50 && tLen <= 55 ? 'valid' : (tLen > 55 ? 'invalid' : '')}`;

    document.getElementById("metaDescDisplay").textContent = art.metaDesc || "No description";
    const mLen = (art.metaDesc || "").length;
    const mCounter = document.getElementById("descCharCount");
    mCounter.textContent = `${mLen} / 150 chars`;
    mCounter.className = `char-counter ${mLen >= 120 && mLen <= 150 ? 'valid' : (mLen > 150 ? 'invalid' : '')}`;

    document.getElementById("metaSlugDisplay").textContent = `/${art.urlSlug}/`;

    const catEl = document.getElementById("metaCategoryDisplay");
    if (catEl) {
      const catText = art.category ? (art.subCategory ? `${art.category} (Sub: ${art.subCategory})` : art.category) : "Relationship";
      catEl.textContent = catText;
    }

    const altContainer = document.getElementById("imageAltTextsList");
    const altCountEl = document.getElementById("altTextsCount");
    if (altContainer) {
      const alts = art.imageAltTexts || [];
      if (alts.length > 0) {
        if (altCountEl) {
          altCountEl.textContent = `${alts.length} / 5 descriptions`;
          altCountEl.className = `char-counter ${alts.length >= 3 && alts.length <= 5 ? 'valid' : ''}`;
        }
        altContainer.innerHTML = alts.map(item => {
          const parts = item.replace(/^\d+[\.\)]\s*/, '').split(/:\s*/);
          const label = parts.length > 1 ? parts[0] : "Image Alt";
          const desc = parts.length > 1 ? parts.slice(1).join(": ") : parts[0];
          return `<div class="alt-text-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(desc)}</span></div>`;
        }).join("");
      } else {
        if (altCountEl) {
          altCountEl.textContent = "0 / 5";
          altCountEl.className = "char-counter";
        }
        altContainer.innerHTML = `<p class="placeholder-text">No alt text descriptions generated.</p>`;
      }
    }

    // 2. Intent & Competitor
    if (art.searchIntent) {
      document.getElementById("lockedIntentStatement").textContent = art.searchIntent;
    }
    if (art.compAnalysis) {
      const lines = art.compAnalysis.split("\n");
      lines.forEach(line => {
        if (line.includes("1. Search Intent")) document.getElementById("evalIntentText").textContent = line.split(":")[1]?.trim() || line;
        if (line.includes("2. Structure")) document.getElementById("evalStructureText").textContent = line.split(":")[1]?.trim() || line;
        if (line.includes("3. What they did well")) document.getElementById("evalStrengthsText").textContent = line.split(":")[1]?.trim() || line;
        if (line.includes("4. What they missed")) document.getElementById("evalGapsText").textContent = line.split(":")[1]?.trim() || line;
        if (line.includes("5. Content Edge")) document.getElementById("evalEdgeText").textContent = line.split(":")[1]?.trim() || line;
      });
      document.getElementById("competitorAnalysisBox").classList.remove("hidden");
    }

    // 3. Raw Markdown
    document.getElementById("rawMarkdownViewer").value = art.markdown;

    // 4. Render Article Preview
    document.getElementById("emptyArticleState").classList.add("hidden");
    document.getElementById("articleViewer").classList.remove("hidden");
    document.getElementById("renderedCategoryBadge").textContent = art.category || "Relationship";

    const wordCount = art.markdown.split(/\s+/).filter(w => w.length > 0).length;
    document.getElementById("renderedWordCountBadge").textContent = `${wordCount.toLocaleString()} words`;

    const fleschScore = calculateFleschScore(art.markdown);
    const fleschBadge = document.getElementById("renderedFleschBadge");
    if (fleschBadge) {
      fleschBadge.textContent = `Flesch Ease: ${fleschScore} (Target ~50)`;
    }

    const html = markdownToHtml(art.markdown);
    const renderedBody = document.getElementById("renderedArticleContent");
    if (renderedBody) renderedBody.innerHTML = html;

    // Render Unified Google Doc Version (Step 1 + Step 2 & 3 + Step 4)
    const gdocContainer = document.getElementById("gdocDocumentContainer");
    if (gdocContainer) {
      gdocContainer.innerHTML = markdownToRichHtmlForGdocs(art);
    }

    // Update Content Vitals card
    updateContentVitals(art);

    // Refresh Step 5 Internal Links status with embedded badges
    if (state.selectedInternalLinks && state.selectedInternalLinks.length > 0) {
      renderSelectedLinks(state.selectedInternalLinks);
    }
  }
  window.displayGeneratedContent = displayGeneratedContent;

  // Content Vitals & Quality Standards Summary
  function updateContentVitals(art) {
    if (!art) return;
    const text = art.markdown || "";
    const primary = (art.primaryKeyword || "").toLowerCase();

    // 1. Word Count
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const wordEl = document.getElementById("vitalWordCount");
    let isWordPass = false;
    if (wordEl) {
      isWordPass = wordCount >= 1200;
      wordEl.textContent = `${wordCount.toLocaleString()} words (Floor: 1,200) ${isWordPass ? '✓' : ''}`;
      wordEl.className = `vital-val ${isWordPass ? 'pass' : 'fail'}`;
    }

    // 2. Flesch Reading Ease
    const fleschScore = calculateFleschScore(text);
    const fleschEl = document.getElementById("vitalFlesch");
    let isFleschPass = false;
    if (fleschEl) {
      isFleschPass = fleschScore >= 45 && fleschScore <= 60;
      fleschEl.textContent = `Score: ${fleschScore} (Target ~50) ${isFleschPass ? '✓' : ''}`;
      fleschEl.className = `vital-val ${isFleschPass ? 'pass' : 'fail'}`;
    }

    // 3. Primary Keyword Count
    const regex = new RegExp(`\\b${escapeRegExp(primary)}\\b`, "gi");
    const matches = text.match(regex) || [];
    const pkCount = matches.length;
    const pkEl = document.getElementById("vitalPrimaryCount");
    let isPkPass = false;
    if (pkEl) {
      isPkPass = pkCount >= 3 && pkCount <= 5;
      pkEl.textContent = `${pkCount} occurrences (Target: 3–5) ${isPkPass ? '✓' : ''}`;
      pkEl.className = `vital-val ${isPkPass ? 'pass' : 'fail'}`;
    }

    // 4. Internal Links
    const allMarkdownLinks = [];
    const linkRegex = /\[(.*?)\]\((https?:\/\/[^\)]+)\)/g;
    let lMatch;
    while ((lMatch = linkRegex.exec(text)) !== null) {
      allMarkdownLinks.push({ anchor: lMatch[1], url: lMatch[2] });
    }
    const internalLinks = allMarkdownLinks.filter(l => l.url.includes("your2amfriend.com"));
    const intEl = document.getElementById("vitalInternalLinks");
    let isIntPass = false;
    if (intEl) {
      isIntPass = internalLinks.length >= 3 && internalLinks.length <= 8;
      intEl.textContent = `${internalLinks.length} URLs from Sheet ${isIntPass ? '✓' : ''}`;
      intEl.className = `vital-val ${isIntPass ? 'pass' : 'fail'}`;
    }

    // 5. External Authority Links
    const externalLinks = allMarkdownLinks.filter(l => !l.url.includes("your2amfriend.com"));
    const extEl = document.getElementById("vitalExternalLinks");
    let isExtPass = false;
    if (extEl) {
      isExtPass = externalLinks.length >= 1 && externalLinks.length <= 3;
      const domains = externalLinks.map(l => {
        try { return new URL(l.url).hostname.replace("www.", ""); } catch(e){ return "authority"; }
      }).slice(0, 2).join(", ");
      extEl.textContent = externalLinks.length > 0 ? `${externalLinks.length} link (${domains}) ${isExtPass ? '✓' : ''}` : `0 links (Compulsory: 1–2)`;
      extEl.className = `vital-val ${isExtPass ? 'pass' : 'fail'}`;
    }

    // 6. FAQs
    const faqCount = extractFaqCount(text);
    const faqEl = document.getElementById("vitalFaqs");
    let isFaqPass = false;
    if (faqEl) {
      isFaqPass = faqCount >= 4 && faqCount <= 6;
      faqEl.textContent = `${faqCount} Q&As included ${isFaqPass ? '✓' : ''}`;
      faqEl.className = `vital-val ${isFaqPass ? 'pass' : 'fail'}`;
    }

    // 7. Voice & Punctuation
    const emDashes = (text.match(/—/g) || []).length;
    const voiceEl = document.getElementById("vitalVoice");
    let isVoicePass = false;
    if (voiceEl) {
      isVoicePass = emDashes === 0;
      voiceEl.textContent = `${emDashes} em dashes (Clean) ${isVoicePass ? '✓' : ''}`;
      voiceEl.className = `vital-val ${isVoicePass ? 'pass' : 'fail'}`;
    }

    // Toggle individual 1-click fix buttons
    setFixBtnVisibility("btnFixWordCount", !isWordPass);
    setFixBtnVisibility("btnFixFlesch", !isFleschPass);
    setFixBtnVisibility("btnFixPrimaryCount", !isPkPass);
    setFixBtnVisibility("btnFixInternalLinks", !isIntPass);
    setFixBtnVisibility("btnFixExternalLinks", !isExtPass);
    setFixBtnVisibility("btnFixFaqs", !isFaqPass);
    setFixBtnVisibility("btnFixVoice", !isVoicePass);

    const allPassed = isWordPass && isFleschPass && isPkPass && isIntPass && isExtPass && isFaqPass && isVoicePass;
    const badge = document.getElementById("auditScoreBadge");
    if (badge) {
      badge.textContent = allPassed ? "Google Doc Ready" : "Vitals Aligning";
      badge.className = `audit-badge ${allPassed ? 'audit-passed' : 'audit-warning'}`;
    }

    const btnAlign = document.getElementById("btnAutoAlignVitals");
    if (btnAlign) {
      if (!allPassed) {
        const failedItems = [];
        if (!isIntPass) failedItems.push("Links");
        if (!isWordPass) failedItems.push("Words");
        if (!isFleschPass) failedItems.push("Flesch");
        if (!isPkPass) failedItems.push("Keywords");
        if (!isExtPass) failedItems.push("Authority");
        if (!isFaqPass) failedItems.push("FAQs");
        if (!isVoicePass) failedItems.push("Punctuation");
        btnAlign.innerHTML = `⚡ Auto-Align All Gaps (${failedItems.join(", ")})`;
        btnAlign.className = "btn btn-align-vitals needs-alignment";
      } else {
        btnAlign.innerHTML = `✓ All Vitals Covered (Click to Polish Further)`;
        btnAlign.className = "btn btn-align-vitals all-aligned";
      }
    }
  }

  function setFixBtnVisibility(btnId, shouldShow) {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (shouldShow) {
        btn.classList.remove("hidden");
      } else {
        btn.classList.add("hidden");
      }
    }
  }

  // Combined Google Doc Version Formatter (Step 1, Step 2 & 3, Step 4 in one document)
  function markdownToRichHtmlForGdocs(art) {
    if (!art) return "";
    const md = art.markdown || "";
    const bodyHtml = markdownToHtml(md);

    // Format Step 1: Competitor Intel
    let compHtml = "";
    if (art.compAnalysis) {
      const compLines = art.compAnalysis.split("\n").filter(l => l.trim().length > 0);
      compHtml = compLines.map(line => {
        const parts = line.split(/:\s*/);
        if (parts.length > 1) {
          return `<p style="margin: 4pt 0;"><strong>${escapeHtml(parts[0])}:</strong> ${escapeHtml(parts.slice(1).join(": "))}</p>`;
        }
        return `<p style="margin: 4pt 0;">${escapeHtml(line)}</p>`;
      }).join("");
    } else {
      compHtml = `<p style="margin: 4pt 0; font-style: italic;">Competitor analysis and search intent validated prior to drafting.</p>`;
    }

    // Format Image Alt Texts
    let altHtml = "";
    if (art.imageAltTexts && art.imageAltTexts.length > 0) {
      altHtml = `<ul style="margin: 6pt 0 12pt 20pt; padding: 0;">` + 
        art.imageAltTexts.map(a => `<li style="margin-bottom: 4pt;">${escapeHtml(a)}</li>`).join("") + 
        `</ul>`;
    } else {
      altHtml = `<p style="margin: 4pt 0;">1. Hero Image: Emotional support late at night<br/>2. Section Image: Concrete practical exercise<br/>3. Closing Image: Grounded peace and reflection</p>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.6; color: #202124;">

<!-- ========================================== -->
<!-- STEP 1: COMPETITOR INTEL & SEARCH INTENT   -->
<!-- ========================================== -->
<h2 style="font-size: 14pt; color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 4px; margin-top: 10px; margin-bottom: 10px;">STEP 1: COMPETITOR INTEL & SEARCH INTENT ANALYSIS</h2>

<p style="margin: 4pt 0;"><strong>Primary Keyword:</strong> ${escapeHtml(art.primaryKeyword || '-')}</p>
<p style="margin: 4pt 0;"><strong>Secondary Keywords:</strong> ${escapeHtml(art.secondaryKeywords || '-')}</p>
<p style="margin: 4pt 0 10pt 0;"><strong>Target Category:</strong> ${escapeHtml(art.category || 'Relationship')} (Sub-Category: ${escapeHtml(art.subCategory || '-')})</p>

<div style="background-color: #f8f9fa; border: 1px solid #dadce0; border-radius: 6px; padding: 12px 16px; margin: 10pt 0 18pt 0;">
  <h3 style="font-size: 11pt; margin-top: 0; margin-bottom: 8px; color: #3c4043;">5-Point Competitor Evaluation:</h3>
  ${compHtml}
</div>

<!-- ========================================== -->
<!-- STEP 2 & 3: LOCKED INTENT & SEO METADATA   -->
<!-- ========================================== -->
<h2 style="font-size: 14pt; color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 4px; margin-top: 24px; margin-bottom: 10px;">STEP 2 & 3: LOCKED SEARCH INTENT & SEO METADATA</h2>

<div style="background-color: #e8f0fe; border-left: 4px solid #1a73e8; padding: 10px 14px; margin: 10pt 0 14pt 0; font-style: italic;">
  <strong>Locked-In Search Intent Statement:</strong><br/>
  "${escapeHtml(art.searchIntent || 'The person searching is looking for clear, compassionate answers.')}"
</div>

<table style="width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 10pt;">
  <thead>
    <tr style="background-color: #f1f3f4;">
      <th style="border: 1px solid #dadce0; padding: 8px 10px; text-align: left; width: 25%;">SEO Field</th>
      <th style="border: 1px solid #dadce0; padding: 8px 10px; text-align: left; width: 55%;">Value</th>
      <th style="border: 1px solid #dadce0; padding: 8px 10px; text-align: left; width: 20%;">Specification</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;"><strong>Title Tag</strong></td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;">${escapeHtml(art.titleTag || '')}</td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;">${(art.titleTag || '').length} chars (Target: 50–55)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;"><strong>Meta Description</strong></td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;">${escapeHtml(art.metaDesc || '')}</td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;">${(art.metaDesc || '').length} chars (Target: 120–150)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;"><strong>URL Slug</strong></td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px; font-family: monospace;">/${escapeHtml(art.urlSlug || '')}/</td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;">Lowercase, hyphenated</td>
    </tr>
    <tr>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;"><strong>Category / Sub-Category</strong></td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;">${escapeHtml(art.category || 'Relationship')} / ${escapeHtml(art.subCategory || '-')}</td>
      <td style="border: 1px solid #dadce0; padding: 8px 10px;">Brand taxonomy</td>
    </tr>
  </tbody>
</table>

<h3 style="font-size: 11pt; color: #3c4043; margin-top: 14px; margin-bottom: 6px;">Image Alt Text Descriptions (3–5 Contextual Descriptions):</h3>
${altHtml}

<hr style="border: 0; border-top: 3px double #1a73e8; margin: 30px 0;" />

<!-- ========================================== -->
<!-- STEP 4: COMPLETE ARTICLE CONTENT           -->
<!-- ========================================== -->
<h2 style="font-size: 14pt; color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 4px; margin-top: 24px; margin-bottom: 14px;">STEP 4: COMPLETE ARTICLE CONTENT</h2>

${bodyHtml}

</body>
</html>`;
  }

  function generateCompleteGoogleDocPlainText(art) {
    if (!art) return "";
    return `================================================================================
STEP 1: COMPETITOR INTEL & SEARCH INTENT ANALYSIS
================================================================================
Primary Keyword: ${art.primaryKeyword || '-'}
Secondary Keywords: ${art.secondaryKeywords || '-'}
Category: ${art.category || 'Relationship'} (Sub: ${art.subCategory || '-'})

5-Point Competitor Evaluation:
${art.compAnalysis || 'Search intent and competitor edge validated.'}

================================================================================
STEP 2 & 3: LOCKED SEARCH INTENT & SEO METADATA
================================================================================
Locked Search Intent Statement:
"${art.searchIntent || ''}"

TITLE TAG: ${art.titleTag || ''} (${(art.titleTag || '').length} chars)
META DESCRIPTION: ${art.metaDesc || ''} (${(art.metaDesc || '').length} chars)
URL SLUG: /${art.urlSlug || ''}/
CATEGORY: ${art.category || 'Relationship'} / ${art.subCategory || '-'}

IMAGE ALT TEXT DESCRIPTIONS:
${(art.imageAltTexts || []).join("\n")}

================================================================================
STEP 4: COMPLETE ARTICLE CONTENT
================================================================================
${art.markdown || ''}
`;
  }

  // Toast Notification for 1-Click Copy
  function showCopyToast(msg) {
    let toast = document.getElementById("copyToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "copyToast";
      toast.style.cssText = "position: fixed; bottom: 24px; right: 24px; background: #1a73e8; color: #fff; padding: 14px 22px; border-radius: 8px; font-weight: 600; font-size: 13.5px; box-shadow: 0 4px 20px rgba(0,0,0,0.35); z-index: 99999; transition: all 0.3s; opacity: 0; transform: translateY(12px); pointer-events: none;";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(12px)";
    }, 4500);
  }

  // 1-Click Unified Google Doc Version Copy Handler
  async function copyGoogleDocVersion(shouldOpenDocsNew = false) {
    if (!state.generatedArticle || !state.generatedArticle.markdown) {
      alert("Please generate or import an article first.");
      return;
    }
    const htmlContent = markdownToRichHtmlForGdocs(state.generatedArticle);
    const plainText = generateCompleteGoogleDocPlainText(state.generatedArticle);

    try {
      const blobHtml = new Blob([htmlContent], { type: "text/html" });
      const blobText = new Blob([plainText], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": blobHtml,
          "text/plain": blobText
        })
      ]);
      showCopyToast("✓ Complete Google Doc copied! (Step 1, 2, 3 & 4 included). Press Ctrl+V in Google Docs.");
    } catch(err) {
      console.warn("Clipboard API rich text fallback:", err);
      const listener = (e) => {
        e.clipboardData.setData("text/html", htmlContent);
        e.clipboardData.setData("text/plain", plainText);
        e.preventDefault();
      };
      document.addEventListener("copy", listener);
      document.execCommand("copy");
      document.removeEventListener("copy", listener);
      showCopyToast("✓ Complete Google Doc copied! Press Ctrl+V in Google Docs.");
    }

    if (shouldOpenDocsNew) {
      window.open("https://docs.new", "_blank");
    }
  }

  // Download .doc file directly for Word or Google Drive
  function downloadGoogleDocFile() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) {
      alert("Please generate or import an article first.");
      return;
    }
    const htmlContent = markdownToRichHtmlForGdocs(state.generatedArticle);
    const blob = new Blob([htmlContent], { type: "application/msword;charset=utf-8" });
    const filename = (state.generatedArticle.urlSlug || "your2amfriend-article") + "-google-doc.doc";
    downloadBlob(blob, filename);
    showCopyToast("✓ .doc file downloaded! Open in Word or upload to Google Drive.");
  }

  function cleanGeneratedMarkdown(md) {
    if (!md) return "";
    let clean = md
      .replace(/^```markdown\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    const p4 = clean.indexOf("===STEP_4_ARTICLE_MARKDOWN===");
    if (p4 !== -1) {
      clean = clean.substring(p4 + 29).trim();
    }
    return clean;
  }

  // 1. INDIVIDUAL VITAL FIX: Internal Links
  async function fixInternalLinks() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) {
      alert("Please generate or import an article first.");
      return;
    }
    const art = state.generatedArticle;
    const text = art.markdown || "";

    const embeddedUrls = new Set();
    const linkRegex = /\[(.*?)\]\((https?:\/\/[^\)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      if (match[2].includes("your2amfriend.com")) {
        embeddedUrls.add(match[2].trim());
      }
    }

    const pool = (state.selectedInternalLinks && state.selectedInternalLinks.length > 0)
      ? state.selectedInternalLinks
      : (state.allSheetRows || []).slice(0, 15);

    const candidates = [];
    for (const item of pool) {
      if (item.LiveUrl && !embeddedUrls.has(item.LiveUrl.trim()) && !candidates.some(c => c.LiveUrl === item.LiveUrl)) {
        candidates.push(item);
      }
    }

    if (candidates.length === 0) {
      alert("No additional unlinked URLs available in the sheet to add.");
      return;
    }

    const neededCount = Math.max(1, 3 - embeddedUrls.size);
    const linksToEmbed = candidates.slice(0, Math.min(3, neededCount + 1));

    showProgress(
      "⚡ Embedding Missing Internal Links...",
      `Inserting ${linksToEmbed.length} contextual link(s) from sheet into body paragraphs...`
    );

    const prompt = `You are a senior content editor for Your 2AM Friend (your2amfriend.com).
The article below currently has ${embeddedUrls.size} internal link(s). It strictly requires at least 3 to 5 internal links.

APPROVED INTERNAL LINKS TO INSERT (Choose 1 to 2 that naturally connect with the discussion):
${linksToEmbed.map(l => `- Target Topic: "${l.Keywords || l.Category}" | Exact URL: ${l.LiveUrl}`).join("\n")}

STRICT INSTRUCTIONS:
1. Naturally weave ${neededCount} of the above links into relevant body paragraphs where they logically add value.
2. Format as [natural contextual anchor text](exact URL). Do NOT use generic anchor text like "click here" or bare URLs.
3. Keep the existing word count, tone, headings, Key Takeaways, and FAQs COMPLETELY UNCHANGED. Do not add unnecessary new sections.
4. Output ONLY the complete revised article Markdown starting with # H1. Do not wrap in triple backticks or add introductory commentary.

CURRENT ARTICLE:
${art.markdown}`;

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: state.apiKey,
          model: state.model,
          prompt: prompt
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Server returned error (${res.status})`);
      }
      const data = await res.json();
      let updatedMd = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!updatedMd) throw new Error("No text returned by API.");

      updatedMd = cleanGeneratedMarkdown(updatedMd);
      state.generatedArticle.markdown = updatedMd;
      displayGeneratedContent(state.generatedArticle);
      showCopyToast("✓ Missing internal links successfully embedded!");
    } catch (err) {
      alert("Error adding internal links: " + err.message);
    } finally {
      hideProgress();
    }
  }

  // 2. INDIVIDUAL VITAL FIX: Word Count
  async function fixWordCount() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) return;
    const art = state.generatedArticle;
    const currentWordCount = (art.markdown || "").split(/\s+/).filter(w => w.length > 0).length;

    showProgress(
      "⚡ Expanding Word Count...",
      `Deepening core sections past 1,400 words (currently ${currentWordCount} words)...`
    );

    const prompt = `You are a senior content editor for Your 2AM Friend (your2amfriend.com).
Current word count: ${currentWordCount} words. Strict floor is 1,200 words (Target: 1,450 to 1,750 words).

TASK:
1. Substantively expand each core H2 section by adding 1 to 2 paragraphs of compassionate psychological insights, real-world relationship scenarios, and practical daily communication tools.
2. Maintain the warm 2 AM friend voice, short sentences under 20 words, and natural contractions.
3. PRESERVE ALL headings, Key Takeaways box, all existing internal links (${(art.selectedLinks || []).length} URLs), external links, and all FAQ questions.
4. Output ONLY the complete revised article Markdown starting with # H1. No commentary.

CURRENT ARTICLE:
${art.markdown}`;

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: state.apiKey, model: state.model, prompt })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Server returned error (${res.status})`);
      }
      const data = await res.json();
      let updatedMd = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!updatedMd) throw new Error("No text returned by API.");

      updatedMd = cleanGeneratedMarkdown(updatedMd);
      state.generatedArticle.markdown = updatedMd;
      displayGeneratedContent(state.generatedArticle);
      showCopyToast("✓ Word count expanded past required floor!");
    } catch(err) {
      alert("Error expanding word count: " + err.message);
    } finally {
      hideProgress();
    }
  }

  // 3. INDIVIDUAL VITAL FIX: Flesch Readability
  async function fixFlesch() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) return;
    const art = state.generatedArticle;
    const currentScore = calculateFleschScore(art.markdown || "");

    showProgress(
      "⚡ Balancing Readability Score...",
      `Tuning Flesch score towards 50 (currently ${currentScore})...`
    );

    const directive = currentScore > 60
      ? "The readability score is currently too simple (>60). Elevate the emotional vocabulary, introduce richer reflective phrasing, and vary sentence rhythms (12 to 18 words per sentence) to bring the Flesch score into the 48 to 55 range."
      : "The readability score is currently too dense (<45). Shorten sentences to under 18 words, break up complex clauses, and use warm conversational phrasing with natural contractions ('you're', 'don't', 'can't') to bring the Flesch score into the 48 to 55 range.";

    const prompt = `You are a senior content editor for Your 2AM Friend (your2amfriend.com).
Current Flesch Reading Ease score: ${currentScore}. Strict target is ~50 (range 45 to 55).

TASK:
${directive}
Strict rules:
- Strictly NO em dashes (—).
- PRESERVE all headings, all links, all FAQs, and keep the word count steady.
- Output ONLY the complete revised article Markdown starting with # H1.

CURRENT ARTICLE:
${art.markdown}`;

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: state.apiKey, model: state.model, prompt })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Server returned error (${res.status})`);
      }
      const data = await res.json();
      let updatedMd = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!updatedMd) throw new Error("No text returned by API.");

      updatedMd = cleanGeneratedMarkdown(updatedMd);
      state.generatedArticle.markdown = updatedMd;
      displayGeneratedContent(state.generatedArticle);
      showCopyToast("✓ Readability score balanced ~50!");
    } catch(err) {
      alert("Error balancing Flesch score: " + err.message);
    } finally {
      hideProgress();
    }
  }

  // 4. INDIVIDUAL VITAL FIX: Primary Keyword Count
  async function fixPrimaryCount() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) return;
    const art = state.generatedArticle;
    const pk = art.primaryKeyword || "";
    const regex = new RegExp(`\\b${escapeRegExp(pk)}\\b`, "gi");
    const count = (art.markdown.match(regex) || []).length;

    showProgress(
      "⚡ Adjusting Primary Keyword...",
      `Aligning "${pk}" strictly to 3–5 occurrences (currently ${count})...`
    );

    const directive = count < 3
      ? `The primary keyword "${pk}" only appears ${count} times. You must naturally incorporate it ${4 - count} more time(s) (e.g. in a subheading or intro) so total occurrences across the entire article are strictly 3 to 4.`
      : `The primary keyword "${pk}" is overused (${count} times). Replace ${count - 4} occurrences with pronouns or natural synonyms so total occurrences across the whole article are strictly 3 to 4.`;

    const prompt = `You are an SEO editor for Your 2AM Friend (your2amfriend.com).
Primary Keyword: "${pk}"
Current Count: ${count}
Target: Strictly 3 to 5 occurrences across the entire draft.

TASK:
${directive}
Preserve all headings, links, takeaways, FAQs, and general word count.
Output ONLY the complete revised article Markdown starting with # H1.

CURRENT ARTICLE:
${art.markdown}`;

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: state.apiKey, model: state.model, prompt })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Server returned error (${res.status})`);
      }
      const data = await res.json();
      let updatedMd = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!updatedMd) throw new Error("No text returned by API.");

      updatedMd = cleanGeneratedMarkdown(updatedMd);
      state.generatedArticle.markdown = updatedMd;
      displayGeneratedContent(state.generatedArticle);
      showCopyToast("✓ Primary keyword aligned strictly to 3–5 occurrences!");
    } catch(err) {
      alert("Error adjusting primary keyword: " + err.message);
    } finally {
      hideProgress();
    }
  }

  // 5. INDIVIDUAL VITAL FIX: External Authority Citation
  async function fixExternalLinks() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) return;
    const art = state.generatedArticle;

    showProgress("⚡ Adding External Authority Link...", "Embedding credible psychological research citation...");

    const prompt = `You are a health & psychology editor for Your 2AM Friend (your2amfriend.com).
The article is currently missing a compulsory external authority citation.

TASK:
Contextually integrate 1 credible markdown link to an approved authority:
- [The Gottman Institute](https://www.gottman.com)
OR
- [American Psychological Association](https://www.apa.org)
Embed it smoothly in a body paragraph discussing research, communication, or emotional health.
Keep all other content, headings, and internal links unchanged.
Output ONLY the complete revised article Markdown starting with # H1.

CURRENT ARTICLE:
${art.markdown}`;

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: state.apiKey, model: state.model, prompt })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Server returned error (${res.status})`);
      }
      const data = await res.json();
      let updatedMd = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!updatedMd) throw new Error("No text returned by API.");

      updatedMd = cleanGeneratedMarkdown(updatedMd);
      state.generatedArticle.markdown = updatedMd;
      displayGeneratedContent(state.generatedArticle);
      showCopyToast("✓ External authority link added!");
    } catch(err) {
      alert("Error adding external link: " + err.message);
    } finally {
      hideProgress();
    }
  }

  // 6. INDIVIDUAL VITAL FIX: FAQs
  async function fixFaqs() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) return;
    const art = state.generatedArticle;
    const currentFaqCount = extractFaqCount(art.markdown || "");

    showProgress("⚡ Completing FAQ Section...", `Adding questions to meet 4–6 FAQ requirement (currently ${currentFaqCount})...`);

    const needed = Math.max(1, 4 - currentFaqCount);
    const prompt = `You are an editor for Your 2AM Friend (your2amfriend.com).
The article currently has ${currentFaqCount} FAQs. Requirement is strictly 4 to 6 questions under "## Frequently Asked Questions".

TASK:
Add ${needed} high-value, realistic questions searched by readers under the "## Frequently Asked Questions" heading.
Format each as "### [Question]?" followed by a direct 2 to 4 sentence empathetic, concrete answer.
Keep all other sections, headings, and links intact.
Output ONLY the complete revised article Markdown starting with # H1.

CURRENT ARTICLE:
${art.markdown}`;

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: state.apiKey, model: state.model, prompt })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Server returned error (${res.status})`);
      }
      const data = await res.json();
      let updatedMd = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!updatedMd) throw new Error("No text returned by API.");

      updatedMd = cleanGeneratedMarkdown(updatedMd);
      state.generatedArticle.markdown = updatedMd;
      displayGeneratedContent(state.generatedArticle);
      showCopyToast("✓ FAQ section updated to 4–6 Q&As!");
    } catch(err) {
      alert("Error updating FAQs: " + err.message);
    } finally {
      hideProgress();
    }
  }

  // 7. INDIVIDUAL VITAL FIX: Voice & Em Dashes (Instant Local Fix)
  function fixVoice() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) return;
    let md = state.generatedArticle.markdown;
    const emDashCount = (md.match(/—/g) || []).length;
    if (emDashCount === 0) {
      showCopyToast("✓ Brand voice & punctuation already clean!");
      return;
    }
    md = md.replace(/ — /g, ', ')
           .replace(/— /g, ', ')
           .replace(/ —/g, ', ')
           .replace(/—/g, ', ');
    state.generatedArticle.markdown = md;
    displayGeneratedContent(state.generatedArticle);
    showCopyToast(`✓ Removed ${emDashCount} em dashes! Punctuation clean.`);
  }

  // SMART AUTO-ALIGN VITALS: Intelligently fixes ONLY the gaps that failed
  async function autoAlignVitals() {
    if (!state.generatedArticle || !state.generatedArticle.markdown) {
      alert("Please generate or import an article first.");
      return;
    }
    const art = state.generatedArticle;
    const text = art.markdown || "";

    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const fleschScore = calculateFleschScore(text);
    const pk = (art.primaryKeyword || "").toLowerCase();
    const pkMatches = text.match(new RegExp(`\\b${escapeRegExp(pk)}\\b`, "gi")) || [];
    const pkCount = pkMatches.length;

    const allMarkdownLinks = [];
    const linkRegex = /\[(.*?)\]\((https?:\/\/[^\)]+)\)/g;
    let lMatch;
    while ((lMatch = linkRegex.exec(text)) !== null) {
      allMarkdownLinks.push({ anchor: lMatch[1], url: lMatch[2] });
    }
    const internalLinks = allMarkdownLinks.filter(l => l.url.includes("your2amfriend.com"));
    const externalLinks = allMarkdownLinks.filter(l => !l.url.includes("your2amfriend.com"));
    const faqCount = extractFaqCount(text);
    const emDashes = (text.match(/—/g) || []).length;

    const issues = [];
    if (wordCount < 1200) {
      issues.push(`1. WORD COUNT SHORT: Current is ${wordCount} words. Floor is 1,200 words. Expand core sections to reach 1,400+ words.`);
    }
    if (fleschScore < 45 || fleschScore > 60) {
      issues.push(`2. READABILITY: Current Flesch score is ${fleschScore}. Target is ~50 (range 45 to 55). ${fleschScore > 60 ? 'Deepen emotional vocabulary and vary sentence structure.' : 'Shorten long sentences to under 18 words and use natural contractions.'}`);
    }
    if (internalLinks.length < 3) {
      const embedded = new Set(internalLinks.map(l => l.url));
      const pool = (state.selectedInternalLinks && state.selectedInternalLinks.length > 0)
        ? state.selectedInternalLinks
        : (state.allSheetRows || []).slice(0, 15);
      const candidates = pool.filter(l => !embedded.has(l.LiveUrl));
      issues.push(`3. INTERNAL LINKS DEFICIENT: Current has only ${internalLinks.length} internal links (Requires 3 to 5). You MUST naturally embed ${3 - internalLinks.length} of these approved links into body paragraphs:\n${candidates.slice(0, 3).map(c => `   - Topic: "${c.Keywords || c.Category}" | URL: ${c.LiveUrl}`).join("\n")}`);
    }
    if (pkCount < 3 || pkCount > 5) {
      issues.push(`4. PRIMARY KEYWORD: "${art.primaryKeyword}" appears ${pkCount} times. Strictly adjust to 3 to 4 occurrences.`);
    }
    if (externalLinks.length < 1) {
      issues.push(`5. EXTERNAL AUTHORITY LINK MISSING: Add 1 link to [The Gottman Institute](https://www.gottman.com) or [American Psychological Association](https://www.apa.org).`);
    }
    if (faqCount < 4) {
      issues.push(`6. FAQ SECTION DEFICIENT: Current has ${faqCount} questions. Add ${4 - faqCount} more questions & answers under ## Frequently Asked Questions.`);
    }
    if (emDashes > 0) {
      issues.push(`7. PUNCTUATION: Remove all ${emDashes} em dashes (—) and replace with commas or colons.`);
    }

    if (issues.length === 0) {
      showCopyToast("✓ All content vitals are already 100% met! No changes needed.");
      return;
    }

    // CRITICAL: If word count is already met, forbid adding words!
    const wordLengthConstraint = (wordCount >= 1200)
      ? `CRITICAL INSTRUCTION ON LENGTH: The article word count is ALREADY SATISFACTORY (${wordCount} words). DO NOT EXPAND LENGTH. DO NOT ADD NEW UNNECESSARY PARAGRAPHS. Keep total word count steady around ${wordCount} words and focus strictly on the specific gaps below.`
      : `EXPAND LENGTH: Expand depth to comfortably reach 1,350 to 1,650 words.`;

    showProgress(
      "⚡ Auto-Aligning All Content Vitals...",
      `Fixing ${issues.length} specific gap(s)...`
    );

    const smartPrompt = `You are a senior content editor for Your 2AM Friend (your2amfriend.com).
${wordLengthConstraint}

SPECIFIC GAPS THAT MUST BE FIXED IN THIS EDIT:
${issues.join("\n\n")}

CRITICAL PRESERVATION RULES:
- Preserve all existing headings and structure.
- Preserve the Key Takeaways box.
- Output ONLY the complete revised article Markdown starting with # H1. Do NOT wrap in code fence blocks or provide commentary.

CURRENT ARTICLE:
${art.markdown}`;

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: state.apiKey,
          model: state.model,
          prompt: smartPrompt
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Server returned error (${res.status})`);
      }
      const data = await res.json();
      let updatedMd = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!updatedMd) throw new Error("No text returned by API.");

      updatedMd = cleanGeneratedMarkdown(updatedMd);
      state.generatedArticle.markdown = updatedMd;
      displayGeneratedContent(state.generatedArticle);
      showCopyToast("✓ All content vitals auto-aligned!");
    } catch(err) {
      alert("Error auto-aligning vitals: " + err.message);
    } finally {
      hideProgress();
    }
  }

  // EXPORT & PUBLISH EVENT HANDLERS
  const btnCopyGoogleDocs = document.getElementById("btnCopyGoogleDocs");
  if (btnCopyGoogleDocs) {
    btnCopyGoogleDocs.addEventListener("click", () => copyGoogleDocVersion(false));
  }

  const btnOpenDocsNew = document.getElementById("btnOpenDocsNew");
  if (btnOpenDocsNew) {
    btnOpenDocsNew.addEventListener("click", () => copyGoogleDocVersion(true));
  }

  const btnDownloadDocFile = document.getElementById("btnDownloadDocFile");
  if (btnDownloadDocFile) {
    btnDownloadDocFile.addEventListener("click", downloadGoogleDocFile);
  }

  const btnCopyGoogleDocsFromTab = document.getElementById("btnCopyGoogleDocsFromTab");
  if (btnCopyGoogleDocsFromTab) {
    btnCopyGoogleDocsFromTab.addEventListener("click", () => copyGoogleDocVersion(false));
  }

  const btnAutoAlignVitals = document.getElementById("btnAutoAlignVitals");
  if (btnAutoAlignVitals) {
    btnAutoAlignVitals.addEventListener("click", autoAlignVitals);
  }

// Individual Content Vital Fix Event Listeners
  document.getElementById("btnFixWordCount")?.addEventListener("click", fixWordCount);
  document.getElementById("btnFixFlesch")?.addEventListener("click", fixFlesch);
  document.getElementById("btnFixPrimaryCount")?.addEventListener("click", fixPrimaryCount);
  document.getElementById("btnFixInternalLinks")?.addEventListener("click", fixInternalLinks);
  document.getElementById("btnFixExternalLinks")?.addEventListener("click", fixExternalLinks);
  document.getElementById("btnFixFaqs")?.addEventListener("click", fixFaqs);
  document.getElementById("btnFixVoice")?.addEventListener("click", fixVoice);

  // Copy Raw Markdown
  const btnCopyMarkdown = document.getElementById("btnCopyMarkdown");
  if (btnCopyMarkdown) {
    btnCopyMarkdown.addEventListener("click", () => {
      const val = document.getElementById("rawMarkdownViewer").value;
      if (!val) return;
      navigator.clipboard.writeText(val);
      showCopyToast("Raw Markdown copied to clipboard!");
    });
  }

  // Load Saved Drafts Tab
  async function loadSavedDrafts() {
    const tbody = document.getElementById("draftsTableBody");
    try {
      const res = await fetch("/api/drafts");
      const drafts = await res.json();
      if (!drafts || drafts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No saved drafts found.</td></tr>`;
        return;
      }
      tbody.innerHTML = drafts.map(d => `
        <tr>
          <td><strong>${escapeHtml(d.title || d.filename)}</strong></td>
          <td>${escapeHtml(d.primaryKeyword || "-")}</td>
          <td>${escapeHtml(d.lastModified)}</td>
          <td>${(d.sizeBytes / 1024).toFixed(1)} KB</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="loadDraftBySlug('${d.slug}')">Open</button>
          </td>
        </tr>
      `).join("");
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading drafts.</td></tr>`;
    }
  }

  const btnRefreshDrafts = document.getElementById("btnRefreshDrafts");
  if (btnRefreshDrafts) {
    btnRefreshDrafts.addEventListener("click", loadSavedDrafts);
  }

  window.loadDraftBySlug = async (slug) => {
    try {
      const res = await fetch(`/api/draft-content?slug=${slug}`);
      const data = await res.json();
      state.generatedArticle = {
        titleTag: data.metadata?.titleTag || data.title,
        metaDesc: data.metadata?.metaDesc || "",
        urlSlug: data.slug,
        markdown: data.markdown,
        primaryKeyword: data.primaryKeyword || "",
        secondaryKeywords: "",
        category: data.metadata?.category || "Relationship",
        subCategory: data.metadata?.subCategory || "",
        searchIntent: data.metadata?.searchIntent || "",
        imageAltTexts: data.metadata?.imageAltTexts || []
      };
      displayGeneratedContent(state.generatedArticle);
      document.querySelector('[data-tab="generatorTab"]').click();
      switchStage("stagePreview");
    } catch(err) {
      alert("Error loading draft: " + err.message);
    }
  };

  // Helper UI Utilities
  function switchStage(stageId) {
    document.querySelectorAll(".stage-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".stage-panel").forEach(p => p.classList.remove("active"));
    const tab = document.querySelector(`.stage-tab[data-stage="${stageId}"]`);
    if (tab) tab.classList.add("active");
    const panel = document.getElementById(stageId);
    if (panel) panel.classList.add("active");
  }

  function showProgress(title, desc) {
    progressBanner.classList.remove("hidden");
    progressStepTitle.textContent = title;
    progressStepDesc.textContent = desc;
  }

  function hideProgress() {
    progressBanner.classList.add("hidden");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Markdown to Rich HTML for preview and Google Docs
  function markdownToHtml(md) {
    if (!md) return "";
    let html = renderMarkdownTables(md);

    // Key Takeaways callout box: match **Key Takeaways** followed ONLY by immediate bullet/numbered lines
    let hasKeyTakeaways = false;
    html = html.replace(/(?:(?:\*\*Key Takeaways\*\*|###?\s*Key Takeaways)[:\s]*)\n+((?:[ \t]*[-*\u2022\d][^\n]+\n*)+)/i, (m, bulletBlock) => {
      hasKeyTakeaways = true;
      const lis = bulletBlock.split("\n")
        .map(l => l.trim())
        .filter(l => /^[-*\u2022]|\d+[\.\)]/.test(l))
        .map(l => `<li>${l.replace(/^(?:[-*\u2022]|\d+[\.\)])\s*/, '')}</li>`)
        .join("");
      return `\n<div class="takeaways-box"><h4>Key Takeaways</h4><ul>${lis}</ul></div>\n\n`;
    });
    if (!hasKeyTakeaways && (/\*\*Key Takeaways\*\*|###?\s*Key Takeaways/i).test(html)) {
      html = html.replace(/(?:\*\*Key Takeaways\*\*|###?\s*Key Takeaways)[:\s]*/i, '<div class="takeaways-box"><h4>Key Takeaways</h4></div>\n\n');
    }

    // Try this callout box
    html = html.replace(/\*\*Try this:\*\*([^\n]+)/gi, '<div class="try-this-box"><strong>Try this:</strong> $1</div>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Links: style your2amfriend internal links
    html = html.replace(/\[(.*?)\]\((https?:\/\/www\.your2amfriend\.com\/.*?)\)/g, '<a href="$2" class="internal-link-pill" target="_blank">$1</a>');
    html = html.replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists
    html = html.replace(/^\s*[-*\u2022]\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Paragraphs
    const blocks = html.split(/\n{2,}/);
    html = blocks.map(b => {
      b = b.trim();
      if (!b) return "";
      if (b.startsWith("<h") || b.startsWith("<table") || b.startsWith("<div") || b.startsWith("<ul") || b.startsWith("<blockquote")) {
        return b;
      }
      return `<p>${b.replace(/\n/g, '<br>')}</p>`;
    }).join("\n\n");

    return html;
  }

  // Copy Master Prompt Handler
  const btnCopyPrompt = document.getElementById("btnCopyPrompt");
  if (btnCopyPrompt) {
    btnCopyPrompt.addEventListener("click", () => {
      const primary = document.getElementById("primaryKeyword").value.trim();
      const secondaries = document.getElementById("secondaryKeywords").value.trim();
      const compUrls = getCompetitorUrls();
      const category = document.getElementById("category").value.trim();
      const subCategory = document.getElementById("subCategory").value.trim();

      if (!primary) {
        alert("Please enter a Primary Keyword first.");
        return;
      }

      const promptText = buildMasterSystemPrompt({
        primaryKeyword: primary,
        secondaryKeywords: secondaries,
        competitorUrls: compUrls,
        competitorIntel: state.competitorData,
        category,
        subCategory,
        selectedLinks: state.selectedInternalLinks.length > 0 ? state.selectedInternalLinks : state.allSheetRows.slice(0, 8)
      });

      navigator.clipboard.writeText(promptText);
      alert("Master Content Creation Prompt copied to clipboard! You can paste it into Antigravity, ChatGPT, or Claude.");
    });
  }

  // Import / Paste Draft Modal Handlers
  const importModal = document.getElementById("importModal");
  const btnOpenImportModal = document.getElementById("btnOpenImportModal");
  const btnCloseImportModal = document.getElementById("btnCloseImportModal");
  const btnApplyImportDraft = document.getElementById("btnApplyImportDraft");

  if (btnOpenImportModal) {
    btnOpenImportModal.addEventListener("click", () => {
      importModal.classList.remove("hidden");
    });
  }
  if (btnCloseImportModal) {
    btnCloseImportModal.addEventListener("click", () => {
      importModal.classList.add("hidden");
    });
  }
  if (btnApplyImportDraft) {
    btnApplyImportDraft.addEventListener("click", () => {
      const rawInput = document.getElementById("importDraftInput").value.trim();
      if (!rawInput) {
        alert("Please paste article markdown or text.");
        return;
      }
      const primary = document.getElementById("primaryKeyword").value.trim();
      const secondaries = document.getElementById("secondaryKeywords").value.trim();
      const category = document.getElementById("category").value.trim();
      const subCategory = document.getElementById("subCategory").value.trim();

      const parsed = parseArticleOutput(rawInput, {
        primaryKeyword: primary,
        secondaryKeywords: secondaries,
        category,
        subCategory,
        selectedLinks: state.selectedInternalLinks
      });

      state.generatedArticle = parsed;
      displayGeneratedContent(parsed);
      importModal.classList.add("hidden");
      switchStage("stagePreview");
    });
  }

  // Live Two-Way Editor Sync: updates word count, Flesch score, HTML preview, Google Doc version, and vitals in real time
  const rawViewer = document.getElementById("rawMarkdownViewer");
  if (rawViewer) {
    rawViewer.addEventListener("input", () => {
      if (!state.generatedArticle) {
        state.generatedArticle = {
          primaryKeyword: document.getElementById("primaryKeyword")?.value.trim() || "",
          secondaryKeywords: document.getElementById("secondaryKeywords")?.value.trim() || "",
          category: document.getElementById("category")?.value.trim() || "Relationship",
          subCategory: document.getElementById("subCategory")?.value.trim() || "",
          selectedLinks: state.selectedInternalLinks
        };
      }
      const newMd = rawViewer.value;
      state.generatedArticle.markdown = newMd;

      const words = newMd.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const wordBadge = document.getElementById("renderedWordCountBadge");
      if (wordBadge) wordBadge.textContent = `${wordCount.toLocaleString()} words`;

      const fleschScore = calculateFleschScore(newMd);
      const fleschBadge = document.getElementById("renderedFleschBadge");
      if (fleschBadge) fleschBadge.textContent = `Flesch Ease: ${fleschScore} (Target ~50)`;

      const previewEl = document.getElementById("renderedArticleContent");
      if (previewEl) previewEl.innerHTML = markdownToHtml(newMd);

      const gdocContainer = document.getElementById("gdocDocumentContainer");
      if (gdocContainer) {
        gdocContainer.innerHTML = markdownToRichHtmlForGdocs(state.generatedArticle);
      }

      updateContentVitals(state.generatedArticle);
    });
  }

});

