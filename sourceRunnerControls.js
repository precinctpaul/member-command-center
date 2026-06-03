(function () {
  const U = window.MCCUtils;
  const DEFAULT_CONGRESS = "119";
  const DEFAULT_FEC_CYCLE = "2026";
  const DEFAULT_CONGRESS_LIMIT = "10";
  const DEFAULT_YOUTUBE_MAX_RESULTS = "5";
  const DEFAULT_OFFICIAL_WEB_TIMEOUT_SECONDS = "10";
  const FRESH_HOURS = 24;
  const STALE_HOURS = 72;

  const RUNNER_DEFINITIONS = [
    {
      key: "openfec",
      moduleName: "openfec_finance",
      title: "OpenFEC Finance",
      shortTitle: "OpenFEC",
      subtitle: "Campaign finance totals, filings, debts, and loans.",
      active: true,
      buttonId: "runOpenFecFromControlPanelButton",
      buttonLabel: "Run OpenFEC"
    },
    {
      key: "congress",
      moduleName: "congress_legislation",
      title: "Congress.gov Legislation",
      shortTitle: "Congress.gov",
      subtitle: "Member detail, sponsored bills, cosponsored bills, and bill detail enrichment.",
      active: true,
      buttonId: "runCongressFromControlPanelButton",
      buttonLabel: "Run Congress.gov"
    },
    {
      key: "youtube",
      moduleName: "youtube_media",
      title: "YouTube Media",
      shortTitle: "YouTube",
      subtitle: "Channel stats, latest uploads, and proof video links.",
      active: true,
      buttonId: "runYouTubeFromControlPanelButton",
      buttonLabel: "Run YouTube"
    },
    {
      key: "officialWeb",
      moduleName: "official_web_contact",
      title: "Official Web + Contact",
      shortTitle: "Web/contact",
      subtitle: "Official websites, campaign links, contact forms, social links, redirects, and endpoint health.",
      active: true,
      buttonId: "runOfficialWebFromControlPanelButton",
      buttonLabel: "Run Web Check"
    }
  ];

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
    const wiredCount = RUNNER_DEFINITIONS.filter((definition) => {
      const capability = capabilities[definition.key];
      return definition.active && capability && capability.ready;
    }).length;

    return `
      <button class="section-header" type="button" aria-label="Toggle source runner controls">
        <div>
          <h3>Source Runner Control Panel</h3>
          <p>Run source-backed intelligence modules and check latest saved-run health.</p>
        </div>
        <div class="section-header-right">
          <span id="sourceRunnerHeaderPill" class="status-pill ${wiredCount > 0 ? "ready" : "missing"}">
            ${U.escapeHtml(wiredCount)} wired
          </span>
          <span class="chevron">›</span>
        </div>
      </button>

      <div class="section-body">
        <div class="completion-meter">
          <div id="sourceRunnerStatus" class="empty">
            Loading latest saved source runs...
          </div>

          <div id="sourceRunnerHealthSummary">
            ${renderHealthSkeleton()}
          </div>

          <div style="height: 14px"></div>

          <div class="grid-three">
            ${RUNNER_DEFINITIONS.map((definition) => {
              const capability = capabilities[definition.key] || {
                ready: false,
                label: "Runner not available"
              };

              return renderRunnerCard({
                ...definition,
                ready: definition.active && capability.ready,
                readyLabel: capability.label
              });
            }).join("")}
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

  function renderHealthSkeleton() {
    return `
      <div class="grid-three">
        ${renderMiniHealthCard("Completed", "Checking", "ready")}
        ${renderMiniHealthCard("Stale", "Checking", "partial")}
        ${renderMiniHealthCard("Failed", "Checking", "missing")}
      </div>
    `;
  }

  function renderMiniHealthCard(label, value, statusClass) {
    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="info-value">${U.escapeHtml(value)}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(statusClass)}">
            ${U.escapeHtml(statusClass === "ready" ? "OK" : statusClass === "missing" ? "Watch" : "Review")}
          </span>
        </div>
      </div>
    `;
  }

  function renderRunnerCard({ key, title, subtitle, moduleName, ready, readyLabel, active, buttonId, buttonLabel }) {
    const stateLabel = !active ? "Planned" : ready ? "Ready" : "Blocked";
    const stateClass = !active ? "partial" : ready ? "ready" : "missing";
    const buttonDisabled = !active || !ready;

    return `
      <div class="info-card" data-runner-card="${U.escapeAttribute(key)}" data-module-name="${U.escapeAttribute(moduleName)}">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(title)}</div>
            <div class="info-value" data-runner-card-status="${U.escapeAttribute(moduleName)}">
              Not checked yet
            </div>
          </div>
          <span class="status-pill ${U.escapeAttribute(stateClass)}">
            ${U.escapeHtml(stateLabel)}
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
          data-source-runner-button="true"
          data-runner-key="${U.escapeAttribute(key)}"
          data-default-label="${U.escapeAttribute(buttonLabel)}"
          ${buttonDisabled ? "disabled" : ""}
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

    bindRunnerButton("runOpenFecFromControlPanelButton", person, "openfec");
    bindRunnerButton("runCongressFromControlPanelButton", person, "congress");
    bindRunnerButton("runYouTubeFromControlPanelButton", person, "youtube");
    bindRunnerButton("runOfficialWebFromControlPanelButton", person, "officialWeb");

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
  }

  function bindRunnerButton(buttonId, person, sourceName) {
    const button = document.getElementById(buttonId);

    if (!button) return;

    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await runSingleSource(person, sourceName);
    });
  }

  async function runAllReadySources(person) {
    const capabilities = getCapabilities(person);
    const readySources = RUNNER_DEFINITIONS
      .filter((definition) => definition.active && capabilities[definition.key] && capabilities[definition.key].ready)
      .map((definition) => definition.key);

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
      setSourceRunnerStatus("All ready source runners completed.  Latest saved-run health has been refreshed.", "success");
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
    const capability = capabilities[sourceName];

    if (!capability || !capability.ready) {
      throw new Error(capability ? capability.label : `Runner is not available: ${sourceName}`);
    }

    const config = getSourceConfig(sourceName);

    if (!config) {
      throw new Error(`Unknown source runner: ${sourceName}`);
    }

    setPanelBusy(true);
    setRunnerCardStatus(config.moduleName, "Running now...");
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
        setSourceRunnerStatus(`${config.label} completed, saved, and refreshed.`, "success");
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

      const health = getHealthSummary(person, runs);

      if (showStatus) {
        setSourceRunnerStatus(buildHealthStatusSentence(health), health.failed > 0 ? "error" : "success");
      } else if (!runs.length) {
        setSourceRunnerStatus("No saved source runs found yet.  Run OpenFEC, Congress.gov, YouTube, or Web Check to create one.", "warning");
      } else {
        setSourceRunnerStatus(buildHealthStatusSentence(health), health.failed > 0 ? "error" : "success");
      }
    } catch (error) {
      console.error(error);
      setSourceRunnerStatus(error.message || "Could not refresh latest saved runs.", "error");
    }
  }

  function renderLatestRuns(person, runs) {
    const container = document.getElementById("sourceRunnerLatestRuns");
    if (!container) return;

    const latestByModule = getLatestByModule(runs);

    RUNNER_DEFINITIONS.forEach((definition) => {
      const run = latestByModule[definition.moduleName];

      if (!definition.active) {
        setRunnerCardStatus(definition.moduleName, "Planned, not wired");
        return;
      }

      setRunnerCardStatus(definition.moduleName, run ? formatRunnerStatus(run) : "Never run");
    });

    const health = getHealthSummary(person, runs);
    renderHealthSummary(health);

    const summaryCards = RUNNER_DEFINITIONS.map((definition) => {
      const run = latestByModule[definition.moduleName];

      if (!definition.active) {
        return renderSavedRunCard({
          title: definition.title,
          status: "Planned",
          savedAt: "",
          freshness: {
            label: "Not wired",
            className: "partial",
            detail: "Backend runner has not been built yet."
          },
          detailRows: [
            ["Module", definition.moduleName],
            ["State", "Planned, not wired"],
            ["Next step", "Add backend source runner"]
          ],
          empty: true
        });
      }

      if (!run) {
        return renderSavedRunCard({
          title: definition.title,
          status: "Never run",
          savedAt: "",
          freshness: {
            label: "Never run",
            className: "missing",
            detail: "No saved run has been created for this module."
          },
          detailRows: [
            ["Module", definition.moduleName],
            ["Saved run", "None"],
            ["Action", "Run this source"]
          ],
          empty: true
        });
      }

      return renderSavedRunCard({
        title: definition.title,
        status: run.run_status || "unknown",
        savedAt: run.completed_at || run.created_at || "",
        freshness: getRunFreshness(run),
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

  function renderHealthSummary(health) {
    const container = document.getElementById("sourceRunnerHealthSummary");
    const headerPill = document.getElementById("sourceRunnerHeaderPill");

    if (!container) return;

    const overallClass = health.failed > 0
      ? "missing"
      : health.stale > 0 || health.neverRun > 0
        ? "partial"
        : "ready";

    const overallLabel = health.failed > 0
      ? "Action needed"
      : health.stale > 0 || health.neverRun > 0
        ? "Review"
        : "Healthy";

    if (headerPill) {
      headerPill.className = `status-pill ${overallClass}`;
      headerPill.textContent = overallLabel;
    }

    container.innerHTML = `
      <div class="grid-three">
        ${renderMiniHealthCard("Completed", `${health.completed} of ${health.active}`, "ready")}
        ${renderMiniHealthCard("Stale / never", `${health.stale + health.neverRun}`, health.stale + health.neverRun > 0 ? "partial" : "ready")}
        ${renderMiniHealthCard("Failed", `${health.failed}`, health.failed > 0 ? "missing" : "ready")}
      </div>

      <div style="height: 10px"></div>

      <div class="grid-three">
        ${renderMiniHealthCard("Fresh", `${health.fresh}`, "ready")}
        ${renderMiniHealthCard("Not wired", `${health.notWired}`, health.notWired > 0 ? "partial" : "ready")}
        ${renderMiniHealthCard("Last refresh", formatDateTime(new Date().toISOString()), "ready")}
      </div>
    `;
  }

  function renderSavedRunCard({ title, status, savedAt, freshness, detailRows, empty }) {
    const normalized = normalizeRunStatus(status, freshness);
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
            <div class="info-value">${savedAt ? U.escapeHtml(formatDateTime(savedAt)) : U.escapeHtml(freshness.detail)}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(normalized)}">
            ${U.escapeHtml(freshness.label)}
          </span>
        </div>

        <div style="height: 12px"></div>

        <div class="info-label">Run status</div>
        <div class="info-value">${U.escapeHtml(status || "unknown")}</div>

        <div style="height: 12px"></div>

        ${rows || `<div class="empty">No saved data yet.</div>`}
      </div>
    `;
  }

  function renderRunToast(moduleName, run) {
    const container = document.getElementById("sourceRunnerLatestRuns");
    if (!container || !run) return;

    const freshness = getRunFreshness(run);
    const message = `${getModuleLabel(moduleName)} saved as ${run.run_status || "unknown"}.  ${freshness.detail}`;

    container.innerHTML = `
      <div class="empty">
        ${U.escapeHtml(message)}
      </div>
    `;
  }

  function getHealthSummary(person, runs) {
    const capabilities = getCapabilities(person);
    const latestByModule = getLatestByModule(runs);

    const health = {
      active: 0,
      ready: 0,
      completed: 0,
      fresh: 0,
      stale: 0,
      neverRun: 0,
      failed: 0,
      notWired: 0
    };

    RUNNER_DEFINITIONS.forEach((definition) => {
      const capability = capabilities[definition.key];
      const isWired = definition.active && capability && capability.ready;

      if (!definition.active) {
        health.notWired += 1;
        return;
      }

      health.active += 1;

      if (!isWired) {
        health.notWired += 1;
        return;
      }

      health.ready += 1;

      const run = latestByModule[definition.moduleName];

      if (!run) {
        health.neverRun += 1;
        return;
      }

      const runStatus = String(run.run_status || "").toLowerCase();

      if (runStatus.includes("failed") || runStatus.includes("error")) {
        health.failed += 1;
        return;
      }

      if (runStatus.includes("completed")) {
        health.completed += 1;
      }

      const freshness = getRunFreshness(run);

      if (freshness.state === "fresh") {
        health.fresh += 1;
      } else if (freshness.state === "stale" || freshness.state === "old") {
        health.stale += 1;
      } else if (freshness.state === "never") {
        health.neverRun += 1;
      }
    });

    return health;
  }

  function buildHealthStatusSentence(health) {
    const parts = [
      `${health.completed} completed`,
      `${health.fresh} fresh`,
      `${health.stale + health.neverRun} stale or never run`,
      `${health.failed} failed`,
      `${health.notWired} not wired`
    ];

    return `Source health: ${parts.join(", ")}.`;
  }

  function getLatestByModule(runs) {
    const latestByModule = {};

    RUNNER_DEFINITIONS.forEach((definition) => {
      latestByModule[definition.moduleName] = null;
    });

    const sortedRuns = [...runs].sort((a, b) => {
      const dateA = new Date(a.completed_at || a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.completed_at || b.updated_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    sortedRuns.forEach((run) => {
      if (!run || !run.module_name) return;

      if (Object.prototype.hasOwnProperty.call(latestByModule, run.module_name) && !latestByModule[run.module_name]) {
        latestByModule[run.module_name] = run;
      }
    });

    return latestByModule;
  }

  function getRunFreshness(run) {
    if (!run) {
      return {
        state: "never",
        label: "Never run",
        className: "missing",
        detail: "No saved run has been created."
      };
    }

    const status = String(run.run_status || "").toLowerCase();

    if (status.includes("failed") || status.includes("error")) {
      return {
        state: "failed",
        label: "Failed",
        className: "missing",
        detail: "The latest saved run failed."
      };
    }

    const rawDate = run.completed_at || run.updated_at || run.created_at || "";
    const date = new Date(rawDate);

    if (!rawDate || Number.isNaN(date.getTime())) {
      return {
        state: "unknown",
        label: "Unknown age",
        className: "partial",
        detail: "Saved run age could not be calculated."
      };
    }

    const ageHours = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60));
    const ageLabel = formatAge(ageHours);

    if (ageHours <= FRESH_HOURS) {
      return {
        state: "fresh",
        label: "Fresh",
        className: "ready",
        detail: `Last run ${ageLabel}.`
      };
    }

    if (ageHours <= STALE_HOURS) {
      return {
        state: "stale",
        label: "Stale soon",
        className: "partial",
        detail: `Last run ${ageLabel}.`
      };
    }

    return {
      state: "old",
      label: "Stale",
      className: "partial",
      detail: `Last run ${ageLabel}.`
    };
  }

  function getRunDetailRows(run) {
    const summary = run.summary || {};
    const freshness = getRunFreshness(run);

    if (run.module_name === "openfec_finance") {
      return [
        ["Profile ID", run.profile_id],
        ["Freshness", freshness.detail],
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
        ["Freshness", freshness.detail],
        ["Bioguide ID", summary.bioguide_id],
        ["Sponsored returned", summary.sponsored_returned],
        ["Cosponsored returned", summary.cosponsored_returned],
        ["Bills enriched", summary.enriched_bills_returned],
        ["Successful requests", run.diagnostics?.successful_requests]
      ];
    }

    if (run.module_name === "youtube_media") {
      return [
        ["Profile ID", run.profile_id],
        ["Freshness", freshness.detail],
        ["Channel", summary.channel_title],
        ["Videos", summary.video_count],
        ["Views", formatCount(summary.view_count)],
        ["Subscribers", summary.hidden_subscriber_count ? "Hidden" : formatCount(summary.subscriber_count)],
        ["Latest upload", summary.latest_upload_date],
        ["Proof links", Array.isArray(summary.proof_video_links) ? summary.proof_video_links.length : 0]
      ];
    }

    if (run.module_name === "official_web_contact") {
      return [
        ["Profile ID", run.profile_id],
        ["Freshness", freshness.detail],
        ["URLs checked", summary.urls_checked],
        ["Reachable", summary.reachable_count],
        ["Failed", summary.failed_count],
        ["Redirected", summary.redirected_count],
        ["Official URLs", summary.official_url_count],
        ["Campaign URLs", summary.campaign_url_count],
        ["Contact URLs", summary.contact_url_count],
        ["Social URLs", summary.social_url_count]
      ];
    }

    return [
      ["Profile ID", run.profile_id],
      ["Freshness", freshness.detail],
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

    if (sourceName === "youtube") {
      return {
        label: "YouTube Media",
        moduleName: "youtube_media",
        endpoint: (profileId) => `/api/run/youtube/${encodeURIComponent(profileId)}`,
        payload: () => ({
          max_results: DEFAULT_YOUTUBE_MAX_RESULTS
        })
      };
    }

    if (sourceName === "officialWeb") {
      return {
        label: "Official Web + Contact",
        moduleName: "official_web_contact",
        endpoint: (profileId) => `/api/run/official-web/${encodeURIComponent(profileId)}`,
        payload: () => ({
          timeout_seconds: DEFAULT_OFFICIAL_WEB_TIMEOUT_SECONDS
        })
      };
    }

    return null;
  }

  function getCapabilities(person) {
    const isFederal = person.officeTypeNormalized === "federal";
    const fecIds = getFecIds(person);
    const bioguideId = getBioguideId(person);
    const youtubeIdentity = getYoutubeIdentity(person);
    const officialWebReady = getOfficialWebReady(person);

    const openfecReady = isFederal && Boolean(fecIds.candidateId || fecIds.committeeId);
    const congressReady = isFederal && Boolean(bioguideId);
    const youtubeReady = Boolean(youtubeIdentity.channelId || youtubeIdentity.channelUrl || youtubeIdentity.searchName);

    return {
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
      },
      youtube: {
        ready: youtubeReady,
        label: youtubeReady
          ? "Channel ID, channel URL, or searchable profile name available"
          : "Missing YouTube channel ID, channel URL, and searchable profile name"
      },
      officialWeb: {
        ready: officialWebReady.ready,
        label: officialWebReady.ready
          ? `${officialWebReady.count} official, campaign, contact, social, or media URL${officialWebReady.count === 1 ? "" : "s"} found`
          : "No official, campaign, contact, social, or media URLs found"
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

  function getYoutubeIdentity(person) {
    const searchName = U.getFirstValue(
      person.displayName,
      person.name,
      person.fullName,
      person.identity?.fullName
    ) || "";

    return {
      channelId: U.getFirstValue(
        person.youtubeChannelId,
        person.ids?.youtubeChannelId,
        person.identifiers?.youtubeChannelId,
        person.sourceIdentity?.youtubeChannelId,
        person.officialLinks?.youtubeChannelId,
        person.media?.youtubeChannelId,
        person.youtubeProofVideos?.channelId
      ) || "",
      channelUrl: U.getFirstValue(
        person.youtubeChannelUrl,
        person.youtubeUrl,
        person.officialLinks?.youtube,
        person.officialLinks?.youtubeUrl,
        person.officialLinks?.youtubeChannelUrl,
        person.links?.youtube,
        person.links?.youtubeUrl,
        person.media?.youtubeChannelUrl,
        person.youtubeProofVideos?.channelUrl,
        person.social?.youtube
      ) || "",
      searchName
    };
  }

  function getOfficialWebReady(person) {
    const fields = [
      person.officialWebsite,
      person.officialWebsiteUrl,
      person.website,
      person.websiteUrl,
      person.campaignWebsite,
      person.campaignWebsiteUrl,
      person.contactForm,
      person.contactFormUrl,
      person.donateUrl,
      person.actBlueUrl,
      person.facebookUrl,
      person.instagramUrl,
      person.xUrl,
      person.twitterUrl,
      person.threadsUrl,
      person.tiktokUrl,
      person.youtubeUrl,
      person.youtubeChannelUrl,
      person.vimeoUrl,
      person.linkedinUrl,
      person.officialLinks,
      person.officialLinksAndContact,
      person.links,
      person.social,
      person.socialLinks,
      person.media,
      person.web,
      person.contact,
      person.raceContext
    ];

    const count = fields.filter((value) => {
      if (!value) return false;
      if (typeof value === "string") return value.trim() !== "";
      if (typeof value === "object") return Object.keys(value).length > 0;
      return false;
    }).length;

    return {
      ready: count > 0,
      count
    };
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
    document.querySelectorAll("[data-source-runner-button='true']").forEach((button) => {
      const runnerKey = button.getAttribute("data-runner-key");
      const definition = RUNNER_DEFINITIONS.find((item) => item.key === runnerKey);
      const defaultLabel = button.getAttribute("data-default-label") || button.textContent || "Run";

      if (!definition || !definition.active) {
        button.disabled = true;
        button.textContent = defaultLabel;
        return;
      }

      button.disabled = isBusy;
      button.textContent = isBusy ? "Working..." : defaultLabel;
    });

    const runAllButton = document.getElementById("runAllReadySourcesButton");
    const refreshButton = document.getElementById("refreshSourceRunsButton");

    if (runAllButton) {
      runAllButton.disabled = isBusy;
      runAllButton.textContent = isBusy ? "Working..." : "Run All Ready Sources";
    }

    if (refreshButton) {
      refreshButton.disabled = isBusy;
      refreshButton.textContent = isBusy ? "Working..." : "Refresh Saved Runs";
    }
  }

  function formatRunnerStatus(run) {
    if (!run) return "Never run";

    const freshness = getRunFreshness(run);
    const status = run.run_status || "unknown";
    const date = run.completed_at || run.created_at;

    return date ? `${status} · ${freshness.label} · ${formatDateTime(date)}` : `${status} · ${freshness.label}`;
  }

  function getModuleLabel(moduleName) {
    const match = RUNNER_DEFINITIONS.find((definition) => definition.moduleName === moduleName);
    return match ? match.title : U.humanizeKey(moduleName);
  }

  function normalizeRunStatus(status, freshness) {
    if (freshness && freshness.className) {
      return freshness.className;
    }

    const text = String(status || "").toLowerCase();

    if (text.includes("completed")) return "ready";
    if (text.includes("partial")) return "partial";
    if (text.includes("failed") || text.includes("error")) return "missing";
    if (text.includes("not run") || text.includes("never")) return "missing";

    return "partial";
  }

  function formatDateTime(value) {
    if (!value) return "";

    const date = value instanceof Date ? value : new Date(value);

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

  function formatAge(ageHours) {
    if (ageHours < 1) {
      const minutes = Math.max(1, Math.round(ageHours * 60));
      return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }

    if (ageHours < 24) {
      const hours = Math.round(ageHours);
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const days = Math.round(ageHours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
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

  function formatCount(value) {
    if (value === null || value === undefined || value === "") {
      return "Not returned";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    return new Intl.NumberFormat("en-US").format(number);
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