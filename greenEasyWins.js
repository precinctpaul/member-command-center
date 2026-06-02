(function attachGreenEasyWinsUi() {
  const STORAGE_KEYS = {
    openFecApiKey: "mcc_openfec_api_key",
    congressApiKey: "mcc_congress_api_key",
    youtubeApiKey: "mcc_youtube_api_key",
    googleSearchApiKey: "mcc_google_search_api_key",
    googleSearchCx: "mcc_google_search_cx"
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCurrentPerson() {
    const people = window.MEMBER_COMMAND_CENTER_PEOPLE || [];
    return people[0] || null;
  }

  function getSourceIdentity(person) {
    return person?.sourceIdentity || {};
  }

  function getApiConfig() {
    return {
      openFecApiKey: localStorage.getItem(STORAGE_KEYS.openFecApiKey) || "",
      congressApiKey: localStorage.getItem(STORAGE_KEYS.congressApiKey) || "",
      youtubeApiKey: localStorage.getItem(STORAGE_KEYS.youtubeApiKey) || "",
      googleSearchApiKey: localStorage.getItem(STORAGE_KEYS.googleSearchApiKey) || "",
      googleSearchCx: localStorage.getItem(STORAGE_KEYS.googleSearchCx) || ""
    };
  }

  function saveApiConfig(config) {
    Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
      localStorage.setItem(storageKey, config[key] || "");
    });
  }

  function getProfileContentElement() {
    return document.querySelector(".profile-content");
  }

  function injectGreenEasyWinStyles() {
    if (document.getElementById("green-easy-wins-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "green-easy-wins-styles";
    style.textContent = `
      .green-easy-wins-shell {
        display: grid;
        gap: 18px;
      }

      .green-api-config {
        display: grid;
        gap: 14px;
        padding: 16px;
      }

      .green-api-config-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .green-input-group {
        display: grid;
        gap: 6px;
      }

      .green-input-group label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .green-input-group input {
        width: 100%;
        padding: 11px 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.82);
        color: var(--text);
        font: inherit;
        font-size: 13px;
      }

      .green-input-group input:focus {
        outline: none;
        border-color: rgba(96, 165, 250, 0.8);
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.12);
      }

      .green-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .green-primary-button,
      .green-secondary-button {
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid rgba(96, 165, 250, 0.44);
        background: rgba(37, 99, 235, 0.16);
        color: var(--accent-2);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
      }

      .green-primary-button:hover,
      .green-secondary-button:hover {
        border-color: rgba(96, 165, 250, 0.9);
        background: rgba(37, 99, 235, 0.28);
      }

      .green-secondary-button {
        background: rgba(15, 23, 42, 0.68);
        color: var(--muted);
      }

      .green-status-note {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .green-results {
        display: grid;
        gap: 12px;
        padding: 16px;
        border-top: 1px solid var(--border);
      }

      .green-result-card {
        display: grid;
        gap: 10px;
        padding: 14px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.6);
      }

      .green-result-card h4 {
        margin: 0;
        font-size: 14px;
      }

      .green-result-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
      }

      .green-result-list {
        display: grid;
        gap: 8px;
      }

      .green-result-row {
        display: grid;
        grid-template-columns: 160px 1fr;
        gap: 10px;
        align-items: start;
        color: var(--text);
        font-size: 13px;
      }

      .green-result-row span:first-child {
        color: var(--muted);
        font-weight: 800;
      }

      .green-json-preview {
        max-height: 280px;
        overflow: auto;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.72);
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
        white-space: pre-wrap;
      }

      .green-error {
        color: #fca5a5;
      }

      .green-success {
        color: var(--good);
      }

      .green-image-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }

      .green-image-card {
        display: grid;
        gap: 8px;
      }

      .green-image-card img {
        width: 100%;
        aspect-ratio: 1 / 1;
        border: 1px solid var(--border);
        border-radius: 14px;
        object-fit: cover;
        background: var(--panel-2);
      }

      .green-image-card a {
        color: var(--muted);
        font-size: 11px;
        line-height: 1.35;
      }

      @media (max-width: 1100px) {
        .green-api-config-grid,
        .green-result-row {
          grid-template-columns: 1fr;
        }

        .green-image-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;

    document.head.appendChild(style);
  }

  function renderGreenEasyWinsShell() {
    const profileContent = getProfileContentElement();

    if (!profileContent || document.getElementById("greenEasyWinsRoot")) {
      return;
    }

    const person = getCurrentPerson();

    if (!person) {
      return;
    }

    const config = getApiConfig();

    const container = document.createElement("section");
    container.id = "greenEasyWinsRoot";
    container.className = "green-easy-wins-shell";
    container.innerHTML = `
      <details class="card details-card secondary-card">
        <summary class="card-header details-summary">
          <h3>Green Easy Win API Integrations</h3>
          <div class="summary-actions">
            <div class="source-status">REST API Layer</div>
            <span class="chevron" aria-hidden="true">▾</span>
          </div>
        </summary>

        <div class="green-api-config">
          <p class="green-status-note">
            Enter API keys locally for testing.  These are saved only in this browser's localStorage.  Do not use this front-end storage pattern for production secrets.
          </p>

          <div class="green-api-config-grid">
            <div class="green-input-group">
              <label for="greenOpenFecApiKey">OpenFEC API Key</label>
              <input id="greenOpenFecApiKey" type="password" autocomplete="off" value="${escapeHtml(config.openFecApiKey)}" />
            </div>

            <div class="green-input-group">
              <label for="greenCongressApiKey">Congress.gov API Key</label>
              <input id="greenCongressApiKey" type="password" autocomplete="off" value="${escapeHtml(config.congressApiKey)}" />
            </div>

            <div class="green-input-group">
              <label for="greenYoutubeApiKey">YouTube API Key</label>
              <input id="greenYoutubeApiKey" type="password" autocomplete="off" value="${escapeHtml(config.youtubeApiKey)}" />
            </div>

            <div class="green-input-group">
              <label for="greenGoogleSearchApiKey">Google Custom Search API Key</label>
              <input id="greenGoogleSearchApiKey" type="password" autocomplete="off" value="${escapeHtml(config.googleSearchApiKey)}" />
            </div>

            <div class="green-input-group">
              <label for="greenGoogleSearchCx">Google Search Engine ID / CX</label>
              <input id="greenGoogleSearchCx" type="password" autocomplete="off" value="${escapeHtml(config.googleSearchCx)}" />
            </div>
          </div>

          <div class="green-actions">
            <button class="green-secondary-button" type="button" id="greenSaveApiConfig">Save Keys Locally</button>
            <button class="green-primary-button" type="button" id="greenRunRiskModule">Load Campaign Risk</button>
            <button class="green-primary-button" type="button" id="greenRunOutsideMoneyModule">Load Outside Spending</button>
            <button class="green-primary-button" type="button" id="greenRunLegislativeModule">Load Expanded Legislative</button>
            <button class="green-primary-button" type="button" id="greenRunDigitalModule">Load Digital Reach</button>
          </div>
        </div>

        <div id="greenEasyWinsResults" class="green-results">
          <p class="green-status-note">
            No live API calls run yet.  Use the buttons above to load each module.
          </p>
        </div>
      </details>
    `;

    const sourceIdentityHub = Array.from(profileContent.children).find((element) =>
      element.textContent.includes("Source Identity Hub")
    );

    if (sourceIdentityHub) {
      profileContent.insertBefore(container, sourceIdentityHub);
    } else {
      profileContent.appendChild(container);
    }

    bindGreenEasyWinsEvents();
  }

  function readFormConfig() {
    return {
      openFecApiKey: document.getElementById("greenOpenFecApiKey")?.value.trim() || "",
      congressApiKey: document.getElementById("greenCongressApiKey")?.value.trim() || "",
      youtubeApiKey: document.getElementById("greenYoutubeApiKey")?.value.trim() || "",
      googleSearchApiKey: document.getElementById("greenGoogleSearchApiKey")?.value.trim() || "",
      googleSearchCx: document.getElementById("greenGoogleSearchCx")?.value.trim() || ""
    };
  }

  function bindGreenEasyWinsEvents() {
    document.getElementById("greenSaveApiConfig")?.addEventListener("click", () => {
      saveApiConfig(readFormConfig());
      setResultsHtml(`
        <div class="green-result-card">
          <h4 class="green-success">Saved</h4>
          <p class="green-status-note">API settings saved locally in this browser.</p>
        </div>
      `);
    });

    document.getElementById("greenRunRiskModule")?.addEventListener("click", () => {
      runCampaignRiskModule();
    });

    document.getElementById("greenRunOutsideMoneyModule")?.addEventListener("click", () => {
      runOutsideMoneyModule();
    });

    document.getElementById("greenRunLegislativeModule")?.addEventListener("click", () => {
      runExpandedLegislativeModule();
    });

    document.getElementById("greenRunDigitalModule")?.addEventListener("click", () => {
      runDigitalReachModule();
    });
  }

  function setResultsHtml(html) {
    const resultsElement = document.getElementById("greenEasyWinsResults");

    if (resultsElement) {
      resultsElement.innerHTML = html;
    }
  }

  function appendResultsHtml(html) {
    const resultsElement = document.getElementById("greenEasyWinsResults");

    if (resultsElement) {
      resultsElement.insertAdjacentHTML("beforeend", html);
    }
  }

  function setLoading(moduleName) {
    setResultsHtml(`
      <div class="green-result-card">
        <h4>${escapeHtml(moduleName)}</h4>
        <p class="green-status-note">Loading API data...</p>
      </div>
    `);
  }

  function renderError(moduleName, error) {
    setResultsHtml(`
      <div class="green-result-card">
        <h4 class="green-error">${escapeHtml(moduleName)} failed</h4>
        <p class="green-status-note green-error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
      </div>
    `);
  }

  function getResultArray(apiResponse) {
    if (!apiResponse || !apiResponse.data) {
      return [];
    }

    if (Array.isArray(apiResponse.data.results)) {
      return apiResponse.data.results;
    }

    if (Array.isArray(apiResponse.data.items)) {
      return apiResponse.data.items;
    }

    if (Array.isArray(apiResponse.data.crsReports)) {
      return apiResponse.data.crsReports;
    }

    if (Array.isArray(apiResponse.data.nominations)) {
      return apiResponse.data.nominations;
    }

    return [];
  }

  function getPaginationCount(apiResponse) {
    if (!apiResponse || !apiResponse.data) {
      return null;
    }

    if (apiResponse.data.pagination && typeof apiResponse.data.pagination.count === "number") {
      return apiResponse.data.pagination.count;
    }

    if (apiResponse.data.pageInfo && typeof apiResponse.data.pageInfo.totalResults === "number") {
      return apiResponse.data.pageInfo.totalResults;
    }

    if (apiResponse.data.searchInformation && apiResponse.data.searchInformation.totalResults) {
      return apiResponse.data.searchInformation.totalResults;
    }

    return null;
  }

  function renderApiSummaryCard(title, apiResponse, fields = []) {
    const count = getPaginationCount(apiResponse);
    const results = getResultArray(apiResponse);
    const firstResult = results[0] || null;

    const fieldRows = fields
      .map((field) => {
        const value = firstResult ? getNestedValue(firstResult, field.path) : "";

        return `
          <div class="green-result-row">
            <span>${escapeHtml(field.label)}</span>
            <strong>${escapeHtml(formatDisplayValue(value))}</strong>
          </div>
        `;
      })
      .join("");

    return `
      <div class="green-result-card">
        <h4>${escapeHtml(title)}</h4>
        <div class="green-result-meta">
          <span class="${apiResponse.ok ? "green-success" : "green-error"}">${apiResponse.ok ? "OK" : "Error"}</span>
          <span>Status: ${escapeHtml(apiResponse.status ?? "n/a")}</span>
          <span>Total Count: ${escapeHtml(count ?? "unknown")}</span>
          <span>Returned: ${escapeHtml(results.length)}</span>
        </div>
        ${
          apiResponse.error
            ? `<p class="green-status-note green-error">${escapeHtml(apiResponse.error)}</p>`
            : ""
        }
        ${
          fieldRows
            ? `<div class="green-result-list">${fieldRows}</div>`
            : ""
        }
        <details>
          <summary class="green-status-note">Raw JSON preview</summary>
          <pre class="green-json-preview">${escapeHtml(JSON.stringify(apiResponse.data, null, 2))}</pre>
        </details>
      </div>
    `;
  }

  function getNestedValue(object, path) {
    return path.split(".").reduce((currentValue, key) => {
      if (currentValue === null || currentValue === undefined) {
        return "";
      }

      return currentValue[key];
    }, object);
  }

  function formatDisplayValue(value) {
    if (value === null || value === undefined || value === "") {
      return "Not available";
    }

    if (Array.isArray(value)) {
      return value.join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return value;
  }

  async function runCampaignRiskModule() {
    const person = getCurrentPerson();
    const identity = getSourceIdentity(person);
    const config = readFormConfig();

    saveApiConfig(config);
    setLoading("Campaign Risk & Vulnerability");

    try {
      const result = await window.MemberCommandCenterApiService.getCampaignRiskAndVulnerability({
        apiKey: config.openFecApiKey,
        committeeId: identity.fecPrincipalCommitteeId
      });

      setResultsHtml(`
        <div class="green-result-card">
          <h4>Campaign Risk & Vulnerability</h4>
          <p class="green-status-note">
            Uses OpenFEC audit reports, Schedule D debts, and Schedule C loans for committee ${escapeHtml(identity.fecPrincipalCommitteeId)}.
          </p>
        </div>
      `);

      appendResultsHtml(renderApiSummaryCard("Final Audit Reports", result.results.audits, [
        { label: "Committee ID", path: "committee_id" },
        { label: "Committee Name", path: "committee_name" },
        { label: "Audit ID", path: "audit_id" },
        { label: "Cycle", path: "cycle" }
      ]));

      appendResultsHtml(renderApiSummaryCard("Debts and Obligations, Schedule D", result.results.debts, [
        { label: "Committee ID", path: "committee_id" },
        { label: "Creditor / Debtor", path: "creditor_debtor_name" },
        { label: "Amount", path: "amount" },
        { label: "Report Year", path: "report_year" }
      ]));

      appendResultsHtml(renderApiSummaryCard("Loans, Schedule C", result.results.loans, [
        { label: "Committee ID", path: "committee_id" },
        { label: "Loan Source", path: "loan_source_name" },
        { label: "Loan Amount", path: "loan_amount" },
        { label: "Loan Date", path: "loan_date" }
      ]));
    } catch (error) {
      renderError("Campaign Risk & Vulnerability", error);
    }
  }

  async function runOutsideMoneyModule() {
    const person = getCurrentPerson();
    const identity = getSourceIdentity(person);
    const config = readFormConfig();

    saveApiConfig(config);
    setLoading("Dark Money & Outside Spending");

    try {
      const result = await window.MemberCommandCenterApiService.getDarkMoneyAndOutsideSpending({
        apiKey: config.openFecApiKey,
        candidateId: identity.fecCandidateId,
        committeeId: identity.fecPrincipalCommitteeId,
        candidateName: person.displayName
      });

      setResultsHtml(`
        <div class="green-result-card">
          <h4>Dark Money & Outside Spending</h4>
          <p class="green-status-note">
            Uses OpenFEC electioneering communications and Schedule F party coordinated expenditures for candidate ${escapeHtml(identity.fecCandidateId)}.
          </p>
        </div>
      `);

      appendResultsHtml(renderApiSummaryCard("Electioneering Communications", result.results.electioneering, [
        { label: "Candidate Name", path: "candidate_name" },
        { label: "Committee Name", path: "committee_name" },
        { label: "Amount", path: "calculated_candidate_share" },
        { label: "Disclosure Date", path: "disclosure_date" }
      ]));

      appendResultsHtml(renderApiSummaryCard("Party Coordinated Expenditures, Schedule F", result.results.partyCoordinated, [
        { label: "Candidate Name", path: "candidate_name" },
        { label: "Committee Name", path: "committee.name" },
        { label: "Amount", path: "expenditure_amount" },
        { label: "Date", path: "expenditure_date" }
      ]));
    } catch (error) {
      renderError("Dark Money & Outside Spending", error);
    }
  }

  async function runExpandedLegislativeModule() {
    const person = getCurrentPerson();
    const config = readFormConfig();

    saveApiConfig(config);
    setLoading("Expanded Legislative Tracking");

    try {
      const result = await window.MemberCommandCenterApiService.getExpandedLegislativeTracking({
        apiKey: config.congressApiKey,
        query: person.displayName,
        congress: 119
      });

      setResultsHtml(`
        <div class="green-result-card">
          <h4>Expanded Legislative Tracking</h4>
          <p class="green-status-note">
            Uses Congress.gov CRS reports and nominations endpoints.  CRS reports are queried using "${escapeHtml(person.displayName)}".
          </p>
        </div>
      `);

      appendResultsHtml(renderApiSummaryCard("CRS Reports", result.results.crsReports, [
        { label: "Title", path: "title" },
        { label: "Report Number", path: "number" },
        { label: "Updated", path: "updateDate" },
        { label: "URL", path: "url" }
      ]));

      appendResultsHtml(renderApiSummaryCard("Presidential Nominations", result.results.nominations, [
        { label: "Citation", path: "citation" },
        { label: "Description", path: "description" },
        { label: "Received Date", path: "receivedDate" },
        { label: "Organization", path: "organization" }
      ]));
    } catch (error) {
      renderError("Expanded Legislative Tracking", error);
    }
  }

  async function runDigitalReachModule() {
    const person = getCurrentPerson();
    const config = readFormConfig();
    const channelId = person.officialLinks?.youtubeChannelId || person.mediaTracking?.youtubeChannelId || "";

    saveApiConfig(config);
    setLoading("Digital Reach & Image Stream");

    try {
      const result = await window.MemberCommandCenterApiService.getDigitalReachAndImageStream({
        youtubeApiKey: config.youtubeApiKey,
        googleSearchApiKey: config.googleSearchApiKey,
        googleSearchCx: config.googleSearchCx,
        channelId,
        query: person.displayName
      });

      setResultsHtml(`
        <div class="green-result-card">
          <h4>Digital Reach & Image Stream</h4>
          <p class="green-status-note">
            Uses YouTube channel metadata/statistics and Google Custom Search image results for "${escapeHtml(person.displayName)}".
          </p>
        </div>
      `);

      appendResultsHtml(renderYouTubeChannelStatsCard(result.results.youtubeChannelStats));
      appendResultsHtml(renderImageSearchCard(result.results.imageSearch));
    } catch (error) {
      renderError("Digital Reach & Image Stream", error);
    }
  }

  function renderYouTubeChannelStatsCard(apiResponse) {
    const items = apiResponse?.data?.items || [];
    const channel = items[0] || {};
    const snippet = channel.snippet || {};
    const statistics = channel.statistics || {};

    return `
      <div class="green-result-card">
        <h4>YouTube Channel Stats</h4>
        <div class="green-result-meta">
          <span class="${apiResponse.ok ? "green-success" : "green-error"}">${apiResponse.ok ? "OK" : "Error"}</span>
          <span>Status: ${escapeHtml(apiResponse.status ?? "n/a")}</span>
          <span>Returned: ${escapeHtml(items.length)}</span>
        </div>
        ${
          apiResponse.error
            ? `<p class="green-status-note green-error">${escapeHtml(apiResponse.error)}</p>`
            : ""
        }
        <div class="green-result-list">
          <div class="green-result-row">
            <span>Channel Title</span>
            <strong>${escapeHtml(snippet.title || "Not available")}</strong>
          </div>
          <div class="green-result-row">
            <span>Description</span>
            <strong>${escapeHtml(snippet.description || "Not available")}</strong>
          </div>
          <div class="green-result-row">
            <span>Subscribers</span>
            <strong>${escapeHtml(statistics.subscriberCount || "Not available")}</strong>
          </div>
          <div class="green-result-row">
            <span>Total Views</span>
            <strong>${escapeHtml(statistics.viewCount || "Not available")}</strong>
          </div>
          <div class="green-result-row">
            <span>Video Count</span>
            <strong>${escapeHtml(statistics.videoCount || "Not available")}</strong>
          </div>
        </div>
        <details>
          <summary class="green-status-note">Raw JSON preview</summary>
          <pre class="green-json-preview">${escapeHtml(JSON.stringify(apiResponse.data, null, 2))}</pre>
        </details>
      </div>
    `;
  }

  function renderImageSearchCard(apiResponse) {
    const items = apiResponse?.data?.items || [];
    const totalResults = apiResponse?.data?.searchInformation?.totalResults || "unknown";

    const imageCards = items
      .slice(0, 10)
      .map((item) => {
        return `
          <div class="green-image-card">
            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">
              <img src="${escapeHtml(item.link)}" alt="${escapeHtml(item.title || "Image result")}" loading="lazy" />
            </a>
            <a href="${escapeHtml(item.image?.contextLink || item.link)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(item.title || "Image result")}
            </a>
          </div>
        `;
      })
      .join("");

    return `
      <div class="green-result-card">
        <h4>Programmatic Image Search</h4>
        <div class="green-result-meta">
          <span class="${apiResponse.ok ? "green-success" : "green-error"}">${apiResponse.ok ? "OK" : "Error"}</span>
          <span>Status: ${escapeHtml(apiResponse.status ?? "n/a")}</span>
          <span>Total Results: ${escapeHtml(totalResults)}</span>
          <span>Returned: ${escapeHtml(items.length)}</span>
        </div>
        ${
          apiResponse.error
            ? `<p class="green-status-note green-error">${escapeHtml(apiResponse.error)}</p>`
            : ""
        }
        <div class="green-image-grid">
          ${imageCards || '<p class="green-status-note">No image results returned.</p>'}
        </div>
        <details>
          <summary class="green-status-note">Raw JSON preview</summary>
          <pre class="green-json-preview">${escapeHtml(JSON.stringify(apiResponse.data, null, 2))}</pre>
        </details>
      </div>
    `;
  }

  function bootGreenEasyWins() {
    injectGreenEasyWinStyles();

    window.setTimeout(() => {
      renderGreenEasyWinsShell();
    }, 0);
  }

  bootGreenEasyWins();
})();