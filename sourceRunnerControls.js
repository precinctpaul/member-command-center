(function () {
  const U = window.MCCUtils;
  const DEFAULT_CONGRESS = "119";
  const DEFAULT_FEC_CYCLE = "2026";
  const DEFAULT_CONGRESS_LIMIT = "10";

  if (!window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("MCC source runner controls could not find MCCRender.renderProfileView.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function enhancedRenderProfileView(person) {
    originalRenderProfileView(person);
    mountSourceRunnerControls(person);
  };

  function mountSourceRunnerControls(person) {
    if (!person) return;

    const profileView = document.getElementById("profileView");
    if (!profileView) return;

    const existing = document.getElementById("sourceRunnerControlPanel");
    if (existing) existing.remove();

    const quickFacts = profileView.querySelector(".quick-facts");
    const hero = profileView.querySelector(".profile-hero");

    const panel = document.createElement("section");
    panel.id = "sourceRunnerControlPanel";
    panel.className = "section open";
    panel.innerHTML = renderPanelShell(person);

    if (quickFacts && quickFacts.parentNode) {
      quickFacts.insertAdjacentElement("afterend", panel);
    } else if (hero && hero.parentNode) {
      hero.insertAdjacentElement("afterend", panel);
    } else {
      profileView.prepend(panel);
    }

    bindSourceRunnerControls(person);
    refreshSourceRunnerPanel(person, false);
  }

  function renderPanelShell(person) {
    const capabilities = getCapabilities(person);

    return `
      <button class="section-header" type="button" aria-label="Toggle source runner controls">
        <div>
          <h3>Source Runner Control Panel</h3>
          <p>Run source-backed intelligence modules and check latest saved-run health.</p>
        </div>
        <div class="section-header-right">
          <span class="status-pill ${capabilities.readyCount > 0 ? "ready" : "missing"}">
            ${U.escapeHtml(capabilities.readyCount)} wired
          </span>
          <span class="chevron">›</span>
        </div>
      </button>

      <div class="section-body">
        <div class="completion-meter">
          <div id="sourceRunnerStatus" class="empty">
            Loading latest saved source runs...
          </div>

          <div class="grid-three">
            ${renderRunnerCard({
              key: "openfec",
              title: "OpenFEC Finance",
              subtitle: "Campaign finance totals, filings, debts, and loans.",
              moduleName: "openfec_finance",
              ready: capabilities.openfec.ready,
              readyLabel: capabilities.openfec.label,
              buttonId: "runOpenFecFromControlPanelButton",
              buttonLabel: "Run OpenFEC"
            })}

            ${renderRunnerCard({
              key: "congress",
              title: "Congress.gov Legislation",
              subtitle: "Member detail, sponsored bills, cosponsored bills, and bill detail enrichment.",
              moduleName: "congress_legislation",
              ready: capabilities.congress.ready,
              readyLabel: capabilities.congress.label,
              buttonId: "runCongressFromControlPanelButton",
              buttonLabel: "Run Congress.gov"
            })}

            ${renderRunnerCard({
              key: "youtube",
              title: "YouTube Media",
              subtitle: "Video proof, channel stats, and public media activity.",
              moduleName: "youtube_media",
              ready: false,
              readyLabel: "Backend runner not wired yet",
              buttonId: "runYouTubeFromControlPanelButton",
              buttonLabel: "Not Wired"
            })}
          </div>

          <div style="height: 14px"></div>

          <div class="grid-three">
            <button id="runAllReadySourcesButton" class="secondary-button" type="button">
              Run All Ready Sources
            </button>

            <button id="refreshSourceRunsButton" class="secondary-button" type="button">
              Refresh Saved Runs
            </button>

            <button id="viewLatestSourceRunsJsonButton" class="secondary-button" type="button">
              View Latest Runs JSON
            </button>
          </div>

          <div style="height: 14px"></div>

          <div id="sourceRunnerLatestRuns"></div>
        </div>
      </div>
    `;
  }

  function renderRunnerCard({ key, title, subtitle, moduleName, ready, readyLabel, buttonId, buttonLabel }) {
    return `
      <div class="info-card" data-runner-card="${U.escapeAttribute(key)}" data-module-name="${U.escapeAttribute(moduleName)}">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(title)}</div>
            <div class="info-value" data-runner-card-status="${U.escapeAttribute(moduleName)}">
              Not checked yet
            </div>
          </div>
          <span class="status-pill ${ready ? "ready" : "missing"}">
            ${ready ? "Ready" : "Blocked"}
          </span>
        </div>

        <div style="height: 10px"></div>

        <p style="margin: 0; color: var(--muted); line-height: 1.5;">
          ${U.escapeHtml(subtitle)}
        </p>

        <div style="height: 10px"></div>

        <div class="info-label">Requirement</div>
        <div class="info-value">${U.escapeHtml(readyLabel)}</div>

        <div style="height: 12px"></div>

        <button
          id="${U.escapeAttribute(buttonId)}"
          class="secondary-button"
          type="button"
          ${ready ? "" : "disabled"}
        >
          ${U.escapeHtml(buttonLabel)}
        </button>
      </div>
    `;
  }

  function bindSourceRunnerControls(person) {
    const panel = document.getElementById("sourceRunnerControlPanel");
    if (!panel) return;

    const header = panel.querySelector(".section-header");
    if (header) {
      header.addEventListener("click", () => {
        panel.classList.toggle("open");
      });
    }

    const runOpenFecButton = document.getElementById("runOpenFecFromControlPanelButton");
    if (runOpenFecButton) {
      runOpenFecButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await runSingleSource(person, "openfec");
      });
    }

    const runCongressButton = document.getElementById("runCongressFromControlPanelButton");
    if (runCongressButton) {
      runCongressButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await runSingleSource(person, "congress");
      });
    }

    const runAllButton = document.getElementById("runAllReadySourcesButton");
    if (runAllButton) {
      runAllButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await runAllReadySources(person);
      });
    }

    const refreshButton = document.getElementById("refreshSourceRunsButton");
    if (refreshButton) {
      refreshButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await refreshSourceRunnerPanel(person, true);
      });
    }

    const jsonButton = document.getElementById("viewLatestSourceRunsJsonButton");
    if (jsonButton) {
      jsonButton.addEventListener("click", (event) => {
        event.stopPropagation();

        const profileId = getProfileId(person);
        if (!profileId) {
          setSourceRunnerStatus("This profile does not have a stable profile ID.", "error");
          return;
        }

        window.open(`/api/runs/latest?profile_id=${encodeURIComponent(profileId)}`, "_blank", "noopener,noreferrer");
      });
    }

    const youtubeButton = document.getElementById("runYouTubeFromControlPanelButton");
    if (youtubeButton) {
      youtubeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setSourceRunnerStatus("YouTube backend runner is not wired yet.  OpenFEC and Congress.gov are the active source runners.", "warning");
      });
    }
  }

  async function runAllReadySources(person) {
    const capabilities = getCapabilities(person);
    const readySources = [];

    if (capabilities.openfec.ready) readySources.push("openfec");
    if (capabilities.congress.ready) readySources.push("congress");

    if (!readySources.length) {
      setSourceRunnerStatus("No ready source runners are available for this profile.", "warning");
      return;
    }

    setPanelBusy(true);
    setSourceRunnerStatus(`Running ${readySources.length} ready source runner${readySources.length === 1 ? "" : "s"}...`, "loading");

    try {
      for (const sourceName of readySources) {
        await runSingleSource(person, sourceName, true);
      }

      await refreshSourceRunnerPanel(person, false);
      setSourceRunnerStatus("All ready source runners completed and latest saved runs are refreshed.", "success");
    } catch (error) {
      console.error(error);
      setSourceRunnerStatus(error.message || "One or more source runners failed.", "error");
    } finally {
      setPanelBusy(false);
    }
  }

  async function runSingleSource(person, sourceName, suppressFinalRefresh) {
    const profileId = getProfileId(person);

    if (!profileId) {
      throw new Error("This profile does not have a stable profile ID.");
    }

    const capabilities = getCapabilities(person);

    if (sourceName === "openfec" && !capabilities.openfec.ready) {
      throw new Error(capabilities.openfec.label);
    }

    if (sourceName === "congress" && !capabilities.congress.ready) {
      throw new Error(capabilities.congress.label);
    }

    const config = getSourceConfig(sourceName);

    if (!config) {
      throw new Error(`Unknown source runner: ${sourceName}`);
    }

    setPanelBusy(true);
    setRunnerCardStatus(config.moduleName, "Running...");
    setSourceRunnerStatus(`Running ${config.label} and saving a new intelligence run...`, "loading");

    try {
      const response = await fetch(config.endpoint(profileId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(config.payload())
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `${config.label} failed with HTTP ${response.status}.`);
      }

      renderRunToast(config.moduleName, payload.run);
      setRunnerCardStatus(config.moduleName, formatRunnerStatus(payload.run));

      if (!suppressFinalRefresh) {
        await refreshSourceRunnerPanel(person, false);
        setSourceRunnerStatus(`${config.label} completed and saved to intelligence_runs.`, "success");
      }

      return payload.run;
    } catch (error) {
      console.error(error);
      setRunnerCardStatus(config.moduleName, "Failed");
      setSourceRunnerStatus(error.message || `${config.label} failed.`, "error");
      throw error;
    } finally {
      if (!suppressFinalRefresh) {
        setPanelBusy(false);
      }
    }
  }

  async function refreshSourceRunnerPanel(person, showStatus) {
    const profileId = getProfileId(person);

    if (!profileId) {
      setSourceRunnerStatus("This profile does not have a stable profile ID.", "error");
      return;
    }

    if (showStatus) {
      setSourceRunnerStatus("Refreshing latest saved runs...", "loading");
    }

    try {
      const response = await fetch(`/api/runs/latest?profile_id=${encodeURIComponent(profileId)}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Latest runs request failed with HTTP ${response.status}.`);
      }

      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      renderLatestRuns(person, runs);

      if (showStatus) {
        setSourceRunnerStatus("Latest saved runs refreshed.", "success");
      } else if (!runs.length) {
        setSourceRunnerStatus("No saved source runs found yet.  Run OpenFEC or Congress.gov to create one.", "warning");
      } else {
        setSourceRunnerStatus("Latest saved source runs loaded.", "success");
      }
    } catch (error) {
      console.error(error);
      setSourceRunnerStatus(error.message || "Could not refresh latest saved runs.", "error");
    }
  }

  function renderLatestRuns(person, runs) {
    const container = document.getElementById("sourceRunnerLatestRuns");
    if (!container) return;

    const relevantModules = [
      "openfec_finance",
      "congress_legislation",
      "youtube_media"
    ];

    const latestByModule = Object.fromEntries(
      relevantModules.map((moduleName) => [
        moduleName,
        runs.find((run) => run.module_name === moduleName) || null
      ])
    );

    relevantModules.forEach((moduleName) => {
      const run = latestByModule[moduleName];
      setRunnerCardStatus(moduleName, run ? formatRunnerStatus(run) : "No saved run");
    });

    const summaryCards = relevantModules.map((moduleName) => {
      const run = latestByModule[moduleName];

      if (!run) {
        return renderSavedRunCard({
          title: getModuleLabel(moduleName),
          status: "Not run",
          savedAt: "",
          detailRows: [
            ["Module", moduleName],
            ["Saved run", "None"]
          ],
          empty: true
        });
      }

      return renderSavedRunCard({
        title: getModuleLabel(moduleName),
        status: run.run_status || "unknown",
        savedAt: run.completed_at || run.created_at || "",
        detailRows: getRunDetailRows(run),
        empty: false
      });
    }).join("");

    container.innerHTML = `
      <div class="info-label">Latest saved source runs</div>
      <div class="grid-three">
        ${summaryCards}
      </div>
    `;
  }

  function renderSavedRunCard({ title, status, savedAt, detailRows, empty }) {
    const normalized = normalizeRunStatus(status);
    const rows = detailRows
      .filter(([, value]) => U.hasContent(value))
      .map(([label, value]) => `
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="info-value">${U.escapeHtml(formatDisplayValue(value))}</div>
          </div>
        </div>
      `)
      .join("");

    return `
      <div class="info-card ${empty ? "muted-card" : ""}">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(title)}</div>
            <div class="info-value">${savedAt ? U.escapeHtml(formatDateTime(savedAt)) : "No saved run"}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(normalized)}">
            ${U.escapeHtml(status || "unknown")}
          </span>
        </div>

        <div style="height: 12px"></div>

        ${rows || `<div class="empty">No saved data yet.</div>`}
      </div>
    `;
  }

  function renderRunToast(moduleName, run) {
    const container = document.getElementById("sourceRunnerLatestRuns");
    if (!container || !run) return;

    const message = `${getModuleLabel(moduleName)} saved as ${run.run_status || "unknown"} at ${formatDateTime(run.completed_at || run.created_at || "")}.`;

    container.innerHTML = `
      <div class="empty">
        ${U.escapeHtml(message)}
      </div>
    `;
  }

  function getRunDetailRows(run) {
    const summary = run.summary || {};

    if (run.module_name === "openfec_finance") {
      return [
        ["Profile ID", run.profile_id],
        ["Receipts", formatMoney(summary.total_receipts)],
        ["Disbursements", formatMoney(summary.total_disbursements)],
        ["Cash on hand", formatMoney(summary.cash_on_hand)],
        ["Latest filing", summary.latest_filing],
        ["Successful requests", run.diagnostics?.successful_requests]
      ];
    }

    if (run.module_name === "congress_legislation") {
      return [
        ["Profile ID", run.profile_id],
        ["Bioguide ID", summary.bioguide_id],
        ["Sponsored returned", summary.sponsored_returned],
        ["Cosponsored returned", summary.cosponsored_returned],
        ["Bills enriched", summary.enriched_bills_returned],
        ["Successful requests", run.diagnostics?.successful_requests]
      ];
    }

    return [
      ["Profile ID", run.profile_id],
      ["Module", run.module_name],
      ["Status", run.run_status]
    ];
  }

  function getSourceConfig(sourceName) {
    if (sourceName === "openfec") {
      return {
        label: "OpenFEC Finance",
        moduleName: "openfec_finance",
        endpoint: (profileId) => `/api/run/openfec/${encodeURIComponent(profileId)}`,
        payload: () => ({
          cycle: DEFAULT_FEC_CYCLE
        })
      };
    }

    if (sourceName === "congress") {
      return {
        label: "Congress.gov Legislation",
        moduleName: "congress_legislation",
        endpoint: (profileId) => `/api/run/congress/${encodeURIComponent(profileId)}`,
        payload: () => ({
          congress: DEFAULT_CONGRESS,
          limit: DEFAULT_CONGRESS_LIMIT
        })
      };
    }

    return null;
  }

  function getCapabilities(person) {
    const isFederal = person.officeTypeNormalized === "federal";
    const fecIds = getFecIds(person);
    const bioguideId = getBioguideId(person);

    const openfecReady = isFederal && Boolean(fecIds.candidateId || fecIds.committeeId);
    const congressReady = isFederal && Boolean(bioguideId);

    return {
      readyCount: [openfecReady, congressReady].filter(Boolean).length,
      openfec: {
        ready: openfecReady,
        label: openfecReady
          ? "Federal profile with FEC candidate or committee ID"
          : isFederal
            ? "Missing FEC candidate or committee ID"
            : "Federal-only runner"
      },
      congress: {
        ready: congressReady,
        label: congressReady
          ? "Federal profile with Bioguide ID"
          : isFederal
            ? "Missing Bioguide ID"
            : "Federal-only runner"
      }
    };
  }

  function getProfileId(person) {
    return U.getFirstValue(
      person.id,
      person.slug,
      person.profile_id,
      person.profileId,
      person.sourceIdentity?.profile_id,
      person.sourceIdentity?.profileId,
      person.sourceIdentity?.slug,
      person.sourceIdentity?.bioguideId
    ) || "";
  }

  function getFecIds(person) {
    return {
      candidateId: U.getFirstValue(
        person.fecCandidateId,
        person.ids?.fecCandidateId,
        person.identifiers?.fecCandidateId,
        person.sourceIdentity?.fecCandidateId,
        person.campaignFinanceSnapshot?.fecCandidateId
      ) || "",
      committeeId: U.getFirstValue(
        person.fecCommitteeId,
        person.fecPrincipalCommitteeId,
        person.ids?.fecCommitteeId,
        person.ids?.fecPrincipalCommitteeId,
        person.sourceIdentity?.fecPrincipalCommitteeId,
        person.campaignFinanceSnapshot?.fecPrincipalCommitteeId
      ) || ""
    };
  }

  function getBioguideId(person) {
    return U.getFirstValue(
      person.bioguideId,
      person.bioguide_id,
      person.ids?.bioguideId,
      person.identifiers?.bioguideId,
      person.sourceIdentity?.bioguideId,
      person.legislativeMechanics?.bioguideId
    ) || "";
  }

  function setSourceRunnerStatus(message, type) {
    const status = document.getElementById("sourceRunnerStatus");
    if (!status) return;

    status.className = type === "error" ? "empty error-state" : "empty";
    status.textContent = message;
  }

  function setRunnerCardStatus(moduleName, message) {
    const status = document.querySelector(`[data-runner-card-status="${cssEscape(moduleName)}"]`);
    if (!status) return;

    status.textContent = message;
  }

  function setPanelBusy(isBusy) {
    [
      "runOpenFecFromControlPanelButton",
      "runCongressFromControlPanelButton",
      "runAllReadySourcesButton",
      "refreshSourceRunsButton",
      "viewLatestSourceRunsJsonButton"
    ].forEach((id) => {
      const button = document.getElementById(id);
      if (!button) return;

      if (button.id === "viewLatestSourceRunsJsonButton") {
        button.disabled = false;
        return;
      }

      button.disabled = isBusy || button.dataset.blocked === "true";
    });

    const openFecButton = document.getElementById("runOpenFecFromControlPanelButton");
    const congressButton = document.getElementById("runCongressFromControlPanelButton");

    if (openFecButton) {
      openFecButton.textContent = isBusy ? "Working..." : "Run OpenFEC";
    }

    if (congressButton) {
      congressButton.textContent = isBusy ? "Working..." : "Run Congress.gov";
    }
  }

  function formatRunnerStatus(run) {
    if (!run) return "No saved run";

    const status = run.run_status || "unknown";
    const date = run.completed_at || run.created_at;

    return date ? `${status} · ${formatDateTime(date)}` : status;
  }

  function getModuleLabel(moduleName) {
    const labels = {
      openfec_finance: "OpenFEC Finance",
      congress_legislation: "Congress.gov Legislation",
      youtube_media: "YouTube Media"
    };

    return labels[moduleName] || U.humanizeKey(moduleName);
  }

  function normalizeRunStatus(status) {
    const text = String(status || "").toLowerCase();

    if (text.includes("completed")) return "ready";
    if (text.includes("partial")) return "partial";
    if (text.includes("failed") || text.includes("error")) return "missing";
    if (text.includes("not run")) return "missing";

    return "partial";
  }

  function formatDateTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
      return "Not returned";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(number);
  }

  function formatDisplayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";

    return U.stringifyValue(value);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }
})();