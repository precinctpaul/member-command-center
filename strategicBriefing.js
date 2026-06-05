(function () {
  const U = window.MCCUtils;

  if (!U) {
    console.warn("Strategic briefing could not find MCCUtils.");
    return;
  }

  if (!window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("Strategic briefing could not find MCCRender.renderProfileView.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function enhancedRenderProfileView(person) {
    originalRenderProfileView(person);
    mountStrategicBriefing(person);
  };

  function mountStrategicBriefing(person) {
    if (!person) return;

    const profileView = document.getElementById("profileView");
    if (!profileView) return;

    const existing = document.getElementById("strategicBriefingPanel");
    if (existing) existing.remove();

    const sourceRunnerPanel = document.getElementById("sourceRunnerControlPanel");
    const quickFacts = profileView.querySelector(".quick-facts");
    const hero = profileView.querySelector(".profile-hero");

    const panel = document.createElement("section");
    panel.id = "strategicBriefingPanel";
    panel.className = "section open";
    panel.innerHTML = renderLoadingShell(person);

    if (sourceRunnerPanel && sourceRunnerPanel.parentNode) {
      sourceRunnerPanel.insertAdjacentElement("beforebegin", panel);
    } else if (quickFacts && quickFacts.parentNode) {
      quickFacts.insertAdjacentElement("afterend", panel);
    } else if (hero && hero.parentNode) {
      hero.insertAdjacentElement("afterend", panel);
    } else {
      profileView.prepend(panel);
    }

    bindStrategicBriefingShell(panel);
    loadStrategicBriefing(person);
  }

  function renderLoadingShell(person) {
    return `
      <button class="section-header" type="button" aria-label="Toggle strategic intelligence briefing">
        <div>
          <h3>Strategic Intelligence Briefing</h3>
          <p>30-second source-backed readout for ${U.escapeHtml(person.name || "this profile")}.</p>
        </div>
        <div class="section-header-right">
          <span id="strategicBriefingHeaderPill" class="status-pill partial">Loading</span>
          <span class="chevron">›</span>
        </div>
      </button>

      <div class="section-body">
        <div class="completion-meter">
          <div id="strategicBriefingStatus" class="empty">
            Loading deterministic source-backed briefing...
          </div>

          <div id="strategicBriefingContent"></div>
        </div>
      </div>
    `;
  }

  function bindStrategicBriefingShell(panel) {
    const header = panel.querySelector(".section-header");
    if (header) {
      header.addEventListener("click", () => {
        panel.classList.toggle("open");
      });
    }
  }

  async function loadStrategicBriefing(person) {
    const profileId = getProfileId(person);

    if (!profileId) {
      renderBriefingError("This profile does not have a stable profile ID.");
      return;
    }

    setBriefingStatus("Loading strategic briefing...", "loading");

    try {
      const response = await fetch(`/api/briefing/profile/${encodeURIComponent(profileId)}`);
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Strategic briefing request failed with HTTP ${response.status}.`);
      }

      renderBriefing(payload.briefing || {});
    } catch (error) {
      console.error(error);
      renderBriefingError(error.message || "Could not load strategic briefing.");
    }
  }

  function renderBriefing(briefing) {
    const container = document.getElementById("strategicBriefingContent");
    const headerPill = document.getElementById("strategicBriefingHeaderPill");

    if (!container) return;

    const warnings = Array.isArray(briefing.briefing_warnings) ? briefing.briefing_warnings : [];
    const executiveBullets = buildExecutiveBullets(briefing).slice(0, 5);
    const keySignals = buildExecutiveKeySignals(briefing);
    const primaryActions = buildPrimaryActions(briefing).slice(0, 3);

    if (headerPill) {
      headerPill.className = `status-pill ${warnings.length ? "partial" : "ready"}`;
      headerPill.textContent = warnings.length ? "Warnings" : "Ready";
    }

    setBriefingStatus(
      briefing.source_backed_only === true && briefing.ai_generated === false
        ? "Source-backed briefing loaded.  No AI-generated claims included."
        : "Briefing loaded.",
      warnings.length ? "warning" : "success"
    );

    container.innerHTML = `
      <div class="info-card" style="border-color: rgba(96, 165, 250, 0.26); background: rgba(15, 23, 42, 0.82);">
        <div class="copy-row">
          <div>
            <div class="info-label">30-Second Read</div>
            <div class="info-value">${U.escapeHtml(briefing.profile_name || "Strategic Intelligence Briefing")}</div>
          </div>
          <span class="status-pill ${warnings.length ? "partial" : "ready"}">
            ${warnings.length ? "Review" : "Ready"}
          </span>
        </div>

        <div style="height: 14px"></div>

        <div class="briefing-executive-read">
          ${executiveBullets.map((bullet) => `
            <div class="list-item" style="padding: 12px 14px;">
              <p style="font-size: 14px; line-height: 1.55; color: var(--text);">
                ${U.escapeHtml(bullet)}
              </p>
            </div>
          `).join("")}
        </div>
      </div>

      <div style="height: 14px"></div>

      <div class="info-card">
        <div class="info-label">Key Signals</div>
        <div style="height: 10px"></div>
        <div class="grid-three">
          ${keySignals.map((signal) => renderSignalCard(signal.label, signal.value, signal.tone)).join("")}
        </div>
      </div>

      <div style="height: 14px"></div>

      <div class="info-card">
        <div class="info-label">Primary Actions</div>
        <div style="height: 10px"></div>
        <div class="grid-three">
          ${primaryActions.map((action) => renderPrimaryActionCard(action)).join("")}
        </div>
      </div>

      <div style="height: 14px"></div>

      ${renderCompactOpponentSnapshot(briefing.opposition_intelligence)}

      <div class="grid-three">
        <button id="copyStrategicBriefButton" class="secondary-button" type="button">
          Copy Brief
        </button>

        <button id="openStrategicBriefJsonButton" class="secondary-button" type="button">
          View Brief JSON
        </button>

        <button id="refreshStrategicBriefButton" class="secondary-button" type="button">
          Refresh Brief
        </button>
      </div>

      <div style="height: 16px"></div>

      <details class="info-card">
        <summary style="cursor: pointer; font-weight: 900; color: var(--text);">
          View Supporting Details
        </summary>

        <div style="height: 14px"></div>

        ${renderMoneySnapshot(briefing.money_position)}
        ${renderMediaLegislativeSnapshot(briefing.media_attention, briefing.legislative_activity)}
        ${renderOfficialWebReadiness(briefing.official_web_readiness)}
        ${renderSourceGapsSnapshot(briefing.source_gaps, warnings)}
      </details>

      <div style="height: 14px"></div>

      <details class="info-card">
        <summary style="cursor: pointer; font-weight: 900; color: var(--text);">
          Expand Raw Briefing Details
        </summary>

        <div style="height: 14px"></div>

        ${renderOverallRead(briefing.overall_read)}
        ${renderRaceContext(briefing.race_context)}
        ${renderOppositionIntelligence(briefing.opposition_intelligence)}
        ${renderMoneyPosition(briefing.money_position)}
        ${renderLegislativeActivity(briefing.legislative_activity)}
        ${renderMediaAttention(briefing.media_attention)}
        ${renderOfficialWebReadiness(briefing.official_web_readiness)}
        ${renderSourceGaps(briefing.source_gaps)}
        ${renderBriefingWarnings(warnings)}
      </details>

      <div style="height: 14px"></div>

      <div class="empty">
        Source-backed only.  No AI-generated claims or unsourced inferences included.
      </div>
    `;

    bindStrategicBriefingActions(briefing);
  }

  function buildExecutiveBullets(briefing) {
    const bullets = [];
    const sourceGaps = briefing.source_gaps || {};
    const statusCounts = sourceGaps.status_counts || briefing.overall_read?.status_counts || {};
    const coverageScore = sourceGaps.completion_score ?? briefing.overall_read?.completion_score;
    const race = briefing.race_context?.metrics || {};
    const opposition = briefing.opposition_intelligence?.metrics || {};
    const congressWarnings = getCoverageWarningLabels(briefing).filter((label) => /congress/i.test(label));

    const completeCount = Number(statusCounts.complete || 0);
    const warningCount = Number(statusCounts.complete_with_warnings || 0);
    const missingCount = Number(statusCounts.missing || 0);
    const partialCount = Number(statusCounts.partial || 0);

    if (coverageScore !== undefined && coverageScore !== null) {
      if (Number(coverageScore) >= 85) {
        bullets.push("Federal profile coverage is strong.");
      } else if (Number(coverageScore) >= 50) {
        bullets.push("Profile coverage is usable but still incomplete.");
      } else {
        bullets.push("Profile coverage is still early and source gaps remain.");
      }
    } else if (completeCount > 0 || warningCount > 0) {
      bullets.push("Source-backed coverage is available for this profile.");
    }

    if (race.opponent_context_status === "source_backed" || Number(opposition.source_backed_opponent_count || 0) > 0) {
      bullets.push("Race context is source-backed through OpenFEC.");
    } else if (briefing.race_context?.status === "profile_scaffold" || briefing.opposition_intelligence?.status === "scaffold_only") {
      bullets.push("Race context is scaffolded only until additional filing sources are connected.");
    }

    if (Number(opposition.source_backed_opponent_count || 0) > 0) {
      const count = Number(opposition.source_backed_opponent_count || 0);
      bullets.push(`${count} source-backed opponent record${count === 1 ? "" : "s"} found.`);
    }

    if (Number(opposition.raised_funds_opponent_count || 0) > 0) {
      const count = Number(opposition.raised_funds_opponent_count || 0);
      bullets.push(`${count} opponent record${count === 1 ? "" : "s"} show raised-funds signals.`);
    }

    if (congressWarnings.length) {
      bullets.push("Congress.gov coverage is usable but has warnings.");
    } else if (warningCount > 0) {
      bullets.push("Some source coverage is usable but has warnings.");
    }

    if (!bullets.length && (missingCount > 0 || partialCount > 0)) {
      bullets.push("Source runs are incomplete and should be reviewed before staff use.");
    }

    if (!bullets.length) {
      bullets.push("No source-backed briefing claims are available yet.");
    }

    return bullets;
  }

  function buildExecutiveKeySignals(briefing) {
    const race = briefing.race_context?.metrics || {};
    const opposition = briefing.opposition_intelligence?.metrics || {};
    const sourceGaps = briefing.source_gaps || {};

    return [
      {
        label: "Race",
        value: race.race_label || opposition.race_label || "Not available",
        tone: race.race_label || opposition.race_label ? "ready" : "partial",
      },
      {
        label: "Candidate Pool",
        value: hasContent(opposition.candidate_pool_count) ? String(opposition.candidate_pool_count) : "0",
        tone: Number(opposition.candidate_pool_count || 0) > 0 ? "ready" : "partial",
      },
      {
        label: "Opponents",
        value: hasContent(opposition.source_backed_opponent_count) ? String(opposition.source_backed_opponent_count) : "0",
        tone: Number(opposition.source_backed_opponent_count || 0) > 0 ? "ready" : "partial",
      },
      {
        label: "Raised-Funds Opponents",
        value: hasContent(opposition.raised_funds_opponent_count) ? String(opposition.raised_funds_opponent_count) : "0",
        tone: Number(opposition.raised_funds_opponent_count || 0) > 0 ? "ready" : "partial",
      },
      {
        label: "Coverage Score",
        value: sourceGaps.completion_score !== undefined && sourceGaps.completion_score !== null
          ? `${sourceGaps.completion_score}%`
          : "Unknown",
        tone: Number(sourceGaps.completion_score || 0) >= 85 ? "ready" : "partial",
      },
    ];
  }

  function buildPrimaryActions(briefing) {
    const actions = [];
    const oppositionActions = briefing.opposition_intelligence?.next_actions;
    const sourceNextAction = briefing.source_gaps?.next_best_action;
    const warnings = getCoverageWarningLabels(briefing);

    if (Array.isArray(oppositionActions)) {
      oppositionActions.forEach((action) => {
        if (action && !actions.includes(action)) actions.push(action);
      });
    }

    if (sourceNextAction && sourceNextAction.next_action && !actions.includes(sourceNextAction.next_action)) {
      actions.push(sourceNextAction.next_action);
    }

    warnings.forEach((label) => {
      const action = `Review ${label} warnings.`;
      if (!actions.includes(action)) actions.push(action);
    });

    if (!actions.length) {
      actions.push("No immediate source action identified.");
    }

    return actions;
  }

  function getCoverageWarningLabels(briefing) {
    const warnings = briefing.source_gaps?.warnings;

    if (!Array.isArray(warnings)) return [];

    return warnings
      .map((warning) => warning && (warning.label || warning.module_name))
      .filter(Boolean);
  }

  function renderSignalCard(label, value, tone) {
    return `
      <div class="info-card" style="min-height: 72px;">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="info-value" style="font-size: 15px;">${U.escapeHtml(hasContent(value) ? String(value) : "Not available")}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(tone || "partial")}">
            ${U.escapeHtml((tone || "partial") === "ready" ? "OK" : "Review")}
          </span>
        </div>
      </div>
    `;
  }

  function renderPrimaryActionCard(action) {
    return `
      <div class="info-card" style="min-height: 86px;">
        <div class="info-label">Action</div>
        <p style="margin: 8px 0 0; color: var(--text); line-height: 1.5; font-weight: 700;">
          ${U.escapeHtml(String(action || ""))}
        </p>
      </div>
    `;
  }

  function renderCompactOpponentSnapshot(section) {
    const metrics = section?.metrics || {};
    const segments = section?.opponent_segments || {};
    const watchItems = section?.watch_items || {};
    const baseline = Array.isArray(section?.baseline_opponent_information) ? section.baseline_opponent_information : [];
    const primary = Array.isArray(segments.primary_opponents) ? segments.primary_opponents : [];
    const general = Array.isArray(segments.general_election_opponents) ? segments.general_election_opponents : [];
    const other = Array.isArray(segments.third_party_or_other_opponents) ? segments.third_party_or_other_opponents : [];
    const raised = Array.isArray(watchItems.opponents_with_has_raised_funds_true) ? watchItems.opponents_with_has_raised_funds_true : [];

    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">Opponent Snapshot</div>
            <div class="info-value">${U.escapeHtml(statusLabel(section?.status))}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(statusClass(section?.status))}">
            ${U.escapeHtml(statusLabel(section?.status))}
          </span>
        </div>

        <div style="height: 12px"></div>

        <div class="grid-three">
          ${renderSignalCard("Primary", String(primary.length), primary.length ? "ready" : "partial")}
          ${renderSignalCard("General", String(general.length), general.length ? "ready" : "partial")}
          ${renderSignalCard("Raised Funds", String(raised.length), raised.length ? "ready" : "partial")}
        </div>

        <div style="height: 12px"></div>

        ${baseline.length ? renderCompactOpponentTable(baseline) : renderEmpty("No source-backed opponent records are currently available.")}

        <div style="height: 10px"></div>

        ${renderKeyValueRows([
          ["Source-backed opponents", metrics.source_backed_opponent_count],
          ["Third-party or other", other.length],
          ["Candidate status C", metrics.candidate_status_c_count],
          ["Candidate pool", metrics.candidate_pool_count]
        ])}
      </div>

      <div style="height: 14px"></div>
    `;
  }

  function renderCompactOpponentTable(opponents) {
    return `
      <div class="list-stack">
        ${opponents.map((opponent) => {
          const finance = opponent.finance || {};
          const raised = finance.has_raised_funds === true ? "Raised funds" : "No raised-funds flag";
          const status = opponent.candidate_status || "Status unknown";

          return `
            <div class="list-item">
              <div class="copy-row">
                <div>
                  <p style="margin: 0; color: var(--text); font-weight: 900;">
                    ${U.escapeHtml(opponent.name || "Unnamed opponent")}
                  </p>
                  <p style="margin: 4px 0 0; color: var(--muted); line-height: 1.45;">
                    ${U.escapeHtml([
                      opponent.party,
                      opponent.opponent_type,
                      opponent.state && opponent.district ? `${opponent.state}-${String(opponent.district).padStart(2, "0")}` : opponent.state || opponent.district,
                      opponent.reelection_year
                    ].filter(Boolean).join(" • "))}
                  </p>
                </div>
                <span class="status-pill ${finance.has_raised_funds ? "ready" : "partial"}">
                  ${U.escapeHtml(raised)}
                </span>
              </div>

              <div style="height: 8px"></div>

              ${renderKeyValueRows([
                ["Candidate ID", opponent.candidate_id],
                ["Candidate status", status],
                ["First filed", opponent.first_file_date],
                ["Last filed", opponent.last_file_date],
                ["FEC", opponent.fec_url]
              ])}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMoneySnapshot(section) {
    const metrics = section?.metrics || {};
    const filings = Array.isArray(section?.recent_filings) ? section.recent_filings : [];

    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">Money Snapshot</div>
            <div class="info-value">${U.escapeHtml(section?.status || "missing")}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(statusClass(section?.status))}">
            ${U.escapeHtml(statusLabel(section?.status))}
          </span>
        </div>

        <div style="height: 12px"></div>

        <div class="grid-three">
          ${renderSignalCard("Cash on Hand", formatMoney(metrics.cash_on_hand) || "Not available", hasContent(metrics.cash_on_hand) ? "ready" : "partial")}
          ${renderSignalCard("Receipts", formatMoney(metrics.total_receipts) || "Not available", hasContent(metrics.total_receipts) ? "ready" : "partial")}
          ${renderSignalCard("Debt", formatMoney(metrics.committee_debt) || "Not available", hasContent(metrics.committee_debt) ? "ready" : "partial")}
        </div>

        <div style="height: 12px"></div>

        ${renderKeyValueRows([
          ["Committee ID", metrics.committee_id],
          ["Coverage end date", metrics.coverage_end_date],
          ["Recent filings returned", metrics.recent_filings_returned],
          ["Latest filing", metrics.latest_filing]
        ])}

        ${filings.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Latest filing preview</div>
          ${renderSimpleCards(filings.slice(0, 1), (filing) => ({
            title: filing.document_description || filing.report_type || "Filing",
            rows: [
              ["Report type", filing.report_type],
              ["Receipt date", filing.receipt_date],
              ["Coverage end", filing.coverage_end_date],
              ["Cash on hand", formatMoney(filing.cash_on_hand_end_period)]
            ],
            link: filing.html_url || filing.pdf_url
          }))}
        ` : ""}
      </div>

      <div style="height: 14px"></div>
    `;
  }

  function renderMediaLegislativeSnapshot(mediaSection, legislativeSection) {
    const youtube = mediaSection?.youtube || {};
    const youtubeMetrics = youtube.metrics || {};
    const mentions = mediaSection?.web_mentions || {};
    const mentionsMetrics = mentions.metrics || {};
    const congress = legislativeSection?.congress || {};
    const congressMetrics = congress.metrics || {};
    const openstates = legislativeSection?.openstates || {};
    const openstatesMetrics = openstates.metrics || {};

    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">Media / Legislative Snapshot</div>
            <div class="info-value">Public attention and official activity</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(statusClass(mediaSection?.status || legislativeSection?.status))}">
            Review
          </span>
        </div>

        <div style="height: 12px"></div>

        <div class="grid-three">
          ${renderSignalCard("Web Mentions", String(mentionsMetrics.external_mentions_returned || 0), Number(mentionsMetrics.external_mentions_returned || 0) > 0 ? "ready" : "partial")}
          ${renderSignalCard("YouTube Videos", String(youtubeMetrics.video_count || 0), Number(youtubeMetrics.video_count || 0) > 0 ? "ready" : "partial")}
          ${renderSignalCard("Sponsored Items", String(congressMetrics.sponsored_returned || 0), Number(congressMetrics.sponsored_returned || 0) > 0 ? "ready" : "partial")}
        </div>

        <div style="height: 12px"></div>

        ${renderKeyValueRows([
          ["YouTube channel", youtubeMetrics.channel_title],
          ["Latest upload date", youtubeMetrics.latest_upload_date],
          ["Latest mention date", mentionsMetrics.latest_published_date],
          ["Congress", congressMetrics.congress],
          ["Cosponsored items", congressMetrics.cosponsored_returned],
          ["OpenStates bills", openstatesMetrics.bills_returned],
          ["OpenStates request errors", openstatesMetrics.request_error_count]
        ])}
      </div>

      <div style="height: 14px"></div>
    `;
  }

  function renderSourceGapsSnapshot(section, briefingWarnings) {
    const gaps = Array.isArray(section?.gaps) ? section.gaps : [];
    const warnings = Array.isArray(section?.warnings) ? section.warnings : [];
    const nextBestAction = section?.next_best_action || {};
    const totalWarnings = Array.isArray(briefingWarnings) ? briefingWarnings.length : 0;

    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">Source Gaps</div>
            <div class="info-value">${U.escapeHtml(section?.completion_score !== undefined && section?.completion_score !== null ? `${section.completion_score}% coverage score` : "Coverage score unavailable")}</div>
          </div>
          <span class="status-pill ${gaps.length || warnings.length ? "partial" : "ready"}">
            ${gaps.length || warnings.length ? "Review" : "OK"}
          </span>
        </div>

        <div style="height: 12px"></div>

        <div class="grid-three">
          ${renderSignalCard("Gaps", String(gaps.length), gaps.length ? "partial" : "ready")}
          ${renderSignalCard("Warnings", String(warnings.length + totalWarnings), warnings.length || totalWarnings ? "partial" : "ready")}
          ${renderSignalCard("Next Module", nextBestAction.label || "None", nextBestAction.label ? "partial" : "ready")}
        </div>

        <div style="height: 12px"></div>

        ${renderKeyValueRows([
          ["Next status", nextBestAction.status],
          ["Next action", nextBestAction.next_action]
        ])}

        ${warnings.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Warnings preview</div>
          ${renderActionCards(warnings.slice(0, 3))}
        ` : ""}
      </div>

      <div style="height: 14px"></div>
    `;
  }

  function bindStrategicBriefingActions(briefing) {
    const copyButton = document.getElementById("copyStrategicBriefButton");
    const jsonButton = document.getElementById("openStrategicBriefJsonButton");
    const refreshButton = document.getElementById("refreshStrategicBriefButton");

    if (copyButton) {
      copyButton.addEventListener("click", async (event) => {
        event.stopPropagation();

        const text = briefing.copy_brief || "";

        try {
          await navigator.clipboard.writeText(text);
          const original = copyButton.textContent;
          copyButton.textContent = "Copied";
          setTimeout(() => {
            copyButton.textContent = original;
          }, 1100);
        } catch (error) {
          console.error("Brief copy failed", error);
          copyButton.textContent = "Copy failed";
          setTimeout(() => {
            copyButton.textContent = "Copy Brief";
          }, 1100);
        }
      });
    }

    if (jsonButton) {
      jsonButton.addEventListener("click", (event) => {
        event.stopPropagation();

        if (!briefing.profile_id) {
          setBriefingStatus("This briefing does not include a profile ID.", "error");
          return;
        }

        window.open(`/api/briefing/profile/${encodeURIComponent(briefing.profile_id)}`, "_blank", "noopener,noreferrer");
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener("click", (event) => {
        event.stopPropagation();

        if (!briefing.profile_id) {
          setBriefingStatus("This briefing does not include a profile ID.", "error");
          return;
        }

        loadStrategicBriefing({ id: briefing.profile_id, profile_id: briefing.profile_id, name: briefing.profile_name });
      });
    }
  }

  function renderOverallRead(section) {
    return renderBriefingBlock({
      title: "Overall Read",
      status: getStatusFromCounts(section?.status_counts),
      statements: section?.statements,
      body: `
        ${renderKeyValueRows([
          ["Profile", section?.profile_name],
          ["Completion score", section?.completion_score !== undefined && section?.completion_score !== null ? `${section.completion_score}%` : ""],
          ["Source-backed only", section?.source_backed_only === true ? "Yes" : ""]
        ])}
      `
    });
  }

  function renderRaceContext(section) {
    const metrics = section?.metrics || {};
    const opponents = Array.isArray(section?.opponents) ? section.opponents : [];

    return renderBriefingBlock({
      title: "Political / Race Context",
      status: section?.status,
      statements: section?.statements,
      body: `
        ${renderKeyValueRows([
          ["Race", metrics.race_label],
          ["Cycle", metrics.cycle],
          ["Office type", metrics.office_type],
          ["State", metrics.state],
          ["District", metrics.district],
          ["Incumbency", metrics.incumbency],
          ["FEC-supported", metrics.is_federal_fec_supported === true ? "Yes" : metrics.is_federal_fec_supported === false ? "No" : ""],
          ["Candidate pool", metrics.candidate_pool_count],
          ["Source-backed opponents", metrics.source_backed_opponent_count],
          ["Opponent context", metrics.opponent_context_status]
        ])}

        ${opponents.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Opponent records preview</div>
          ${renderOpponentCards(opponents.slice(0, 4))}
        ` : ""}
      `
    });
  }

  function renderOppositionIntelligence(section) {
    const metrics = section?.metrics || {};
    const segments = section?.opponent_segments || {};
    const watchItems = section?.watch_items || {};
    const baseline = Array.isArray(section?.baseline_opponent_information) ? section.baseline_opponent_information : [];

    return renderBriefingBlock({
      title: "Opponent / Opposition Intelligence",
      status: section?.status,
      statements: section?.statements,
      body: `
        ${renderKeyValueRows([
          ["Source-backed opponents", metrics.source_backed_opponent_count],
          ["Primary opponents", metrics.primary_opponent_count],
          ["General election opponents", metrics.general_election_opponent_count],
          ["Third-party or other opponents", metrics.third_party_or_other_opponent_count],
          ["Raised-funds opponents", metrics.raised_funds_opponent_count],
          ["Active candidate-status C records", metrics.candidate_status_c_count],
          ["Candidate pool", metrics.candidate_pool_count],
          ["Race", metrics.race_label],
          ["Cycle", metrics.cycle]
        ])}

        ${baseline.length ? `
          <div style="height: 14px"></div>
          <div class="info-label">Baseline opponent information</div>
          ${renderOpponentCards(baseline)}
        ` : renderEmpty("No source-backed opponent records are currently available.")}

        <div style="height: 14px"></div>
        <div class="grid-three">
          ${renderSegmentCard("Primary", segments.primary_opponents)}
          ${renderSegmentCard("General", segments.general_election_opponents)}
          ${renderSegmentCard("Third-party / other", segments.third_party_or_other_opponents)}
        </div>

        <div style="height: 14px"></div>
        ${renderWatchItems(watchItems)}

        ${renderNextActions(section?.next_actions)}
      `
    });
  }

  function renderMoneyPosition(section) {
    const metrics = section?.metrics || {};
    const filings = Array.isArray(section?.recent_filings) ? section.recent_filings : [];

    return renderBriefingBlock({
      title: "Money Position",
      status: section?.status,
      statements: section?.statements,
      body: `
        ${renderKeyValueRows([
          ["Candidate ID", metrics.candidate_id],
          ["Committee ID", metrics.committee_id],
          ["Cycle", metrics.cycle],
          ["Cash on hand", formatMoney(metrics.cash_on_hand)],
          ["Total receipts", formatMoney(metrics.total_receipts)],
          ["Total disbursements", formatMoney(metrics.total_disbursements)],
          ["Committee debt", formatMoney(metrics.committee_debt)],
          ["Coverage end date", metrics.coverage_end_date],
          ["Recent filings returned", metrics.recent_filings_returned]
        ])}

        ${filings.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Recent filings</div>
          ${renderSimpleCards(filings, (filing) => ({
            title: filing.document_description || filing.report_type || "Filing",
            rows: [
              ["Report type", filing.report_type],
              ["Receipt date", filing.receipt_date],
              ["Coverage end", filing.coverage_end_date],
              ["Receipts", formatMoney(filing.total_receipts)],
              ["Disbursements", formatMoney(filing.total_disbursements)],
              ["Cash on hand", formatMoney(filing.cash_on_hand_end_period)]
            ],
            link: filing.html_url || filing.pdf_url
          }))}
        ` : ""}
      `
    });
  }

  function renderLegislativeActivity(section) {
    const congress = section?.congress || {};
    const congressMetrics = congress.metrics || {};
    const openstates = section?.openstates || {};
    const openstatesMetrics = openstates.metrics || {};
    const sponsored = Array.isArray(congress.sponsored_legislation) ? congress.sponsored_legislation : [];
    const cosponsored = Array.isArray(congress.cosponsored_legislation) ? congress.cosponsored_legislation : [];

    return renderBriefingBlock({
      title: "Legislative / Official Activity",
      status: section?.status,
      statements: section?.statements,
      body: `
        <div class="grid-three">
          ${renderSignalCard("Sponsored", String(congressMetrics.sponsored_returned || 0), congressMetrics.sponsored_returned ? "ready" : "partial")}
          ${renderSignalCard("Cosponsored", String(congressMetrics.cosponsored_returned || 0), congressMetrics.cosponsored_returned ? "ready" : "partial")}
          ${renderSignalCard("OpenStates bills", String(openstatesMetrics.bills_returned || 0), openstatesMetrics.bills_returned ? "ready" : "partial")}
        </div>

        <div style="height: 14px"></div>

        ${renderKeyValueRows([
          ["Bioguide ID", congressMetrics.bioguide_id],
          ["Congress", congressMetrics.congress],
          ["Enriched bills", congressMetrics.enriched_bills_returned],
          ["OpenStates person ID", openstatesMetrics.openstates_person_id],
          ["OpenStates URL", openstatesMetrics.openstates_url],
          ["OpenStates votes", openstatesMetrics.votes_returned],
          ["OpenStates committees", openstatesMetrics.committees_returned],
          ["OpenStates request errors", openstatesMetrics.request_error_count]
        ])}

        ${sponsored.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Sponsored legislation preview</div>
          ${renderBillCards(sponsored)}
        ` : ""}

        ${cosponsored.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Cosponsored legislation preview</div>
          ${renderBillCards(cosponsored)}
        ` : ""}
      `
    });
  }

  function renderMediaAttention(section) {
    const youtube = section?.youtube || {};
    const youtubeMetrics = youtube.metrics || {};
    const mentions = section?.web_mentions || {};
    const mentionsMetrics = mentions.metrics || {};
    const latestVideos = Array.isArray(youtube.latest_videos) ? youtube.latest_videos : [];
    const mentionList = Array.isArray(mentions.mentions) ? mentions.mentions : [];

    return renderBriefingBlock({
      title: "Media / Public Attention",
      status: section?.status,
      statements: section?.statements,
      body: `
        ${renderKeyValueRows([
          ["YouTube channel", youtubeMetrics.channel_title],
          ["YouTube URL", youtubeMetrics.channel_url],
          ["Video count", youtubeMetrics.video_count],
          ["View count", youtubeMetrics.view_count],
          ["Subscriber count", youtubeMetrics.subscriber_count],
          ["Latest upload date", youtubeMetrics.latest_upload_date],
          ["External mentions returned", mentionsMetrics.external_mentions_returned],
          ["Raw results returned", mentionsMetrics.raw_results_returned],
          ["Latest mention date", mentionsMetrics.latest_published_date],
          ["Search query used", mentionsMetrics.search_query_used]
        ])}

        ${latestVideos.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Latest videos</div>
          ${renderGenericItemCards(latestVideos)}
        ` : ""}

        ${mentionList.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Mention preview</div>
          ${renderGenericItemCards(mentionList)}
        ` : ""}
      `
    });
  }

  function renderOfficialWebReadiness(section) {
    const metrics = section?.metrics || {};
    const reachable = Array.isArray(section?.reachable_urls) ? section.reachable_urls : [];
    const failed = Array.isArray(section?.failed_urls) ? section.failed_urls : [];
    const skipped = Array.isArray(section?.skipped_source_urls) ? section.skipped_source_urls : [];

    return renderBriefingBlock({
      title: "Official Web / Contact Readiness",
      status: section?.status,
      statements: section?.statements,
      body: `
        ${renderKeyValueRows([
          ["URLs checked", metrics.urls_checked],
          ["Reachable", metrics.reachable_count],
          ["Failed", metrics.failed_count],
          ["Redirected", metrics.redirected_count],
          ["Skipped source URLs", metrics.skipped_source_url_count],
          ["Official URLs", metrics.official_url_count],
          ["Campaign URLs", metrics.campaign_url_count],
          ["Contact URLs", metrics.contact_url_count],
          ["Social URLs", metrics.social_url_count],
          ["Primary official URL", metrics.primary_official_url],
          ["Primary campaign URL", metrics.primary_campaign_url],
          ["Primary contact URL", metrics.primary_contact_url]
        ])}

        <div style="height: 12px"></div>
        <div class="grid-three">
          ${renderUrlCountCard("Reachable URLs", reachable, "ready")}
          ${renderUrlCountCard("Failed URLs", failed, failed.length ? "missing" : "ready")}
          ${renderUrlCountCard("Skipped source URLs", skipped, skipped.length ? "partial" : "ready")}
        </div>
      `
    });
  }

  function renderSourceGaps(section) {
    const gaps = Array.isArray(section?.gaps) ? section.gaps : [];
    const warnings = Array.isArray(section?.warnings) ? section.warnings : [];
    const nextBestAction = section?.next_best_action || {};

    return renderBriefingBlock({
      title: "Source Gaps and Next Actions",
      status: gaps.length ? "partial" : warnings.length ? "complete_with_warnings" : "complete",
      statements: [],
      body: `
        ${renderKeyValueRows([
          ["Completion score", section?.completion_score !== undefined && section?.completion_score !== null ? `${section.completion_score}%` : ""],
          ["Next module", nextBestAction.label],
          ["Next status", nextBestAction.status],
          ["Next action", nextBestAction.next_action]
        ])}

        ${gaps.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Gaps</div>
          ${renderActionCards(gaps)}
        ` : ""}

        ${warnings.length ? `
          <div style="height: 12px"></div>
          <div class="info-label">Warnings</div>
          ${renderActionCards(warnings)}
        ` : ""}
      `
    });
  }

  function renderBriefingWarnings(warnings) {
    if (!warnings.length) return "";

    return `
      <div class="info-card">
        <div class="info-label">Briefing warnings</div>
        <div class="list-stack">
          ${warnings.map((warning) => `
            <div class="list-item">
              <p>${U.escapeHtml(String(warning))}</p>
            </div>
          `).join("")}
        </div>
      </div>

      <div style="height: 14px"></div>
    `;
  }

  function renderBriefingBlock({ title, status, statements, body }) {
    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(title)}</div>
            <div class="info-value">${U.escapeHtml(status || "available")}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(statusClass(status))}">
            ${U.escapeHtml(statusLabel(status))}
          </span>
        </div>

        ${renderStatements(statements)}

        ${body ? `
          <div style="height: 12px"></div>
          ${body}
        ` : ""}
      </div>

      <div style="height: 14px"></div>
    `;
  }

  function renderStatements(statements) {
    if (!Array.isArray(statements) || !statements.length) return "";

    return `
      <div style="height: 12px"></div>
      <div class="list-stack">
        ${statements.map((statement) => {
          const text = typeof statement === "object" && statement !== null ? statement.text : statement;

          return `
            <div class="list-item">
              <p>${U.escapeHtml(String(text || ""))}</p>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderKeyValueRows(rows) {
    const cleanRows = rows.filter(([, value]) => hasContent(value));

    if (!cleanRows.length) {
      return renderEmpty("No source-backed values available for this section yet.");
    }

    return `
      <div class="key-value-grid">
        ${cleanRows.map(([label, value]) => {
          const renderedValue = renderValue(value);

          return `
            <div class="kv-row">
              <div class="kv-key">${U.escapeHtml(label)}</div>
              <div class="kv-value">${renderedValue}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderOpponentCards(opponents) {
    if (!Array.isArray(opponents) || !opponents.length) {
      return renderEmpty("No opponent records available.");
    }

    return `
      <div class="grid-three">
        ${opponents.map((opponent) => {
          const finance = opponent.finance || {};
          const committeeIds = Array.isArray(finance.principal_committee_ids) ? finance.principal_committee_ids.join(", ") : "";

          return `
            <div class="info-card">
              <div class="copy-row">
                <div>
                  <div class="info-label">${U.escapeHtml(opponent.opponent_type || "opponent")}</div>
                  <div class="info-value">${U.escapeHtml(opponent.name || "Unnamed opponent")}</div>
                </div>
                <span class="status-pill ${finance.has_raised_funds ? "ready" : "partial"}">
                  ${finance.has_raised_funds ? "Raised $" : "Review"}
                </span>
              </div>

              ${renderKeyValueRows([
                ["Title", opponent.title],
                ["Party", opponent.party],
                ["State", opponent.state],
                ["District", opponent.district],
                ["Reelection year", opponent.reelection_year],
                ["Candidate ID", opponent.candidate_id],
                ["Candidate status", opponent.candidate_status],
                ["Incumbent/challenge", opponent.incumbent_challenge],
                ["First filed", opponent.first_file_date],
                ["Last filed", opponent.last_file_date],
                ["Committee IDs", committeeIds],
                ["FEC", opponent.fec_url]
              ])}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSegmentCard(label, items) {
    const list = Array.isArray(items) ? items : [];

    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="info-value">${U.escapeHtml(String(list.length))}</div>
          </div>
          <span class="status-pill ${list.length ? "ready" : "partial"}">
            ${list.length ? "Found" : "None"}
          </span>
        </div>

        ${list.length ? `
          <div style="height: 10px"></div>
          <p style="margin: 0; color: var(--muted); line-height: 1.5;">
            ${U.escapeHtml(list.map((item) => item.name).filter(Boolean).join(", "))}
          </p>
        ` : ""}
      </div>
    `;
  }

  function renderWatchItems(watchItems) {
    const raised = Array.isArray(watchItems?.opponents_with_has_raised_funds_true) ? watchItems.opponents_with_has_raised_funds_true : [];
    const active = Array.isArray(watchItems?.opponents_with_candidate_status_c) ? watchItems.opponents_with_candidate_status_c : [];
    const missingCommittees = Array.isArray(watchItems?.opponents_missing_principal_committee_ids) ? watchItems.opponents_missing_principal_committee_ids : [];

    return `
      <div class="info-label">Watch items</div>
      <div class="grid-three">
        ${renderSegmentCard("Raised funds", raised)}
        ${renderSegmentCard("Candidate status C", active)}
        ${renderSegmentCard("Missing committee IDs", missingCommittees)}
      </div>
    `;
  }

  function renderNextActions(actions) {
    if (!Array.isArray(actions) || !actions.length) return "";

    return `
      <div style="height: 14px"></div>
      <div class="info-label">Next actions</div>
      <div class="list-stack">
        ${actions.map((action) => `
          <div class="list-item">
            <p>${U.escapeHtml(String(action))}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderSimpleCards(items, mapper) {
    if (!Array.isArray(items) || !items.length) return "";

    return `
      <div class="grid-three">
        ${items.map((item) => {
          const mapped = mapper(item);

          return `
            <div class="info-card">
              <div class="info-label">${U.escapeHtml(mapped.title || "Item")}</div>
              ${renderKeyValueRows(mapped.rows || [])}
              ${mapped.link ? `<div style="height: 10px"></div><a href="${U.escapeAttribute(mapped.link)}" target="_blank" rel="noopener noreferrer">Open source</a>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderBillCards(bills) {
    return renderSimpleCards(bills, (bill) => ({
      title: [bill.type, bill.number].filter(Boolean).join(" ") || "Bill",
      rows: [
        ["Title", bill.title],
        ["Introduced", bill.introduced_date],
        ["Policy area", bill.policy_area],
        ["Latest action date", bill.latest_action_date],
        ["Latest action", bill.latest_action_text],
        ["URL", bill.url]
      ],
      link: bill.url
    }));
  }

  function renderGenericItemCards(items) {
    if (!Array.isArray(items) || !items.length) return "";

    return `
      <div class="grid-three">
        ${items.slice(0, 6).map((item) => {
          if (typeof item === "string") {
            return `
              <div class="info-card">
                <p style="margin: 0; color: var(--muted); line-height: 1.5;">${U.escapeHtml(item)}</p>
              </div>
            `;
          }

          if (typeof item !== "object" || item === null) {
            return "";
          }

          const title = item.title || item.name || item.video_title || item.article_title || item.url || "Item";
          const description = item.snippet || item.description || item.summary || item.published_at || item.published_date || "";
          const link = item.url || item.link || item.video_url || item.article_url || "";

          return `
            <div class="info-card">
              <div class="info-label">${U.escapeHtml(title)}</div>
              ${description ? `<p style="margin: 8px 0 0; color: var(--muted); line-height: 1.5;">${U.escapeHtml(String(description))}</p>` : ""}
              ${link ? `<div style="height: 10px"></div><a href="${U.escapeAttribute(link)}" target="_blank" rel="noopener noreferrer">Open source</a>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderActionCards(items) {
    if (!Array.isArray(items) || !items.length) return "";

    return `
      <div class="grid-three">
        ${items.map((item) => `
          <div class="info-card">
            <div class="copy-row">
              <div>
                <div class="info-label">${U.escapeHtml(item.label || item.module_name || "Source")}</div>
                <div class="info-value">${U.escapeHtml(item.status || "Review")}</div>
              </div>
              <span class="status-pill ${U.escapeAttribute(statusClass(item.status))}">
                ${U.escapeHtml(statusLabel(item.status))}
              </span>
            </div>
            ${item.next_action ? `<p style="margin: 10px 0 0; color: var(--muted); line-height: 1.5;">${U.escapeHtml(item.next_action)}</p>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderUrlCountCard(label, urls, status) {
    const list = Array.isArray(urls) ? urls : [];

    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="info-value">${U.escapeHtml(String(list.length))}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(status)}">${U.escapeHtml(status === "ready" ? "OK" : "Review")}</span>
        </div>
      </div>
    `;
  }

  function renderEmpty(message) {
    return `<div class="empty">${U.escapeHtml(message)}</div>`;
  }

  function renderValue(value) {
    if (!hasContent(value)) return "";

    if (typeof value === "number") {
      return U.escapeHtml(String(value));
    }

    if (typeof value === "boolean") {
      return U.escapeHtml(value ? "Yes" : "No");
    }

    if (typeof value === "string" && isUrl(value)) {
      return `<a href="${U.escapeAttribute(value)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(value)}</a>`;
    }

    if (Array.isArray(value)) {
      return U.escapeHtml(value.join(", "));
    }

    if (typeof value === "object") {
      return U.escapeHtml(JSON.stringify(value));
    }

    return U.escapeHtml(String(value));
  }

  function formatMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "";

    return `$${number.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  function getStatusFromCounts(counts) {
    if (!counts || typeof counts !== "object") return "available";

    if (Number(counts.failed || 0) > 0) return "failed";
    if (Number(counts.missing || 0) > 0 || Number(counts.partial || 0) > 0) return "partial";
    if (Number(counts.complete_with_warnings || 0) > 0) return "complete_with_warnings";
    return "complete";
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();

    if (["complete", "source_backed", "available", "completed"].includes(value)) return "ready";
    if (["missing", "failed"].includes(value)) return "missing";
    return "partial";
  }

  function statusLabel(status) {
    const value = String(status || "").toLowerCase();

    if (value === "complete_with_warnings") return "Warnings";
    if (value === "source_backed") return "Source-backed";
    if (value === "scaffold_only") return "Scaffold";
    if (value === "complete" || value === "completed") return "Complete";
    if (value === "missing") return "Missing";
    if (value === "failed") return "Failed";
    if (value === "partial") return "Partial";
    if (value === "available") return "Available";
    return "Review";
  }

  function setBriefingStatus(message, tone) {
    const status = document.getElementById("strategicBriefingStatus");
    if (!status) return;

    const toneClass = tone === "error"
      ? "missing"
      : tone === "success"
        ? "ready"
        : "partial";

    status.className = `empty briefing-status-${toneClass}`;
    status.textContent = message;
  }

  function renderBriefingError(message) {
    const container = document.getElementById("strategicBriefingContent");
    const headerPill = document.getElementById("strategicBriefingHeaderPill");

    if (headerPill) {
      headerPill.className = "status-pill missing";
      headerPill.textContent = "Error";
    }

    setBriefingStatus(message, "error");

    if (container) {
      container.innerHTML = `
        <div class="info-card">
          <div class="info-label">Strategic briefing unavailable</div>
          <p style="margin: 8px 0 0; color: var(--muted); line-height: 1.5;">
            ${U.escapeHtml(message)}
          </p>
        </div>
      `;
    }
  }

  function getProfileId(person) {
    return U.getFirstValue(
      person.profile_id,
      person.profileId,
      person.id,
      person.slug,
      person.sourceIdentity?.profile_id,
      person.sourceIdentity?.profileId,
      person.sourceIdentity?.id
    );
  }

  function hasContent(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return String(value).trim() !== "";
  }

  function isUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }
})();