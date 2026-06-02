(function () {
  const U = window.MCCUtils;

  if (!window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("MCC intelligence overview could not find MCCRender.renderProfileView.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function enhancedRenderProfileView(person) {
    originalRenderProfileView(person);
    mountIntelligenceOverview(person);
  };

  function mountIntelligenceOverview(person) {
    if (!person) return;

    const profileView = document.getElementById("profileView");
    if (!profileView) return;

    const existing = document.getElementById("intelligenceOverview");
    if (existing) existing.remove();

    const hero = profileView.querySelector(".profile-hero");
    if (!hero) return;

    const overview = document.createElement("section");
    overview.id = "intelligenceOverview";
    overview.className = "section open";
    overview.innerHTML = renderOverview(person);

    hero.insertAdjacentElement("afterend", overview);
    bindOverviewActions();
  }

  function renderOverview(person) {
    const overview = buildOverview(person);
    const actionItems = buildActionItems(person, overview);

    return `
      <button class="section-header" type="button">
        <span class="section-title">
          <strong>Intelligence Overview</strong>
          <span>Fast read on what is usable, what is missing, and where to work next.</span>
        </span>
        ${renderStatusPill(overview.overall)}
        <span class="chevron">›</span>
      </button>

      <div class="section-body">
        <div class="grid-three">
          ${renderOverviewCard(overview.finance)}
          ${renderOverviewCard(overview.legislation)}
          ${renderOverviewCard(overview.media)}
          ${renderOverviewCard(overview.sourceHealth)}
          ${renderOverviewCard(overview.dataQuality)}
          ${renderOverviewCard(overview.rosterReadiness)}
        </div>

        <div style="height: 14px"></div>

        <div class="grid-three">
          <div class="info-card">
            <div class="info-label">Live module readiness</div>
            <div class="info-value">${U.escapeHtml(overview.liveReadyCount)} of 3 live modules ready</div>
          </div>

          <div class="info-card">
            <div class="info-label">Profile completion</div>
            <div class="info-value">${U.escapeHtml(person.completionScore || 0)}% · ${U.escapeHtml(person.completionLabel || "Unknown")}</div>
          </div>

          <div class="info-card">
            <div class="info-label">Fast recommendation</div>
            <div class="info-value">${U.escapeHtml(overview.recommendation)}</div>
          </div>
        </div>

        <div style="height: 14px"></div>

        <div class="grid-two">
          <div>
            <div class="info-label">Recommended next actions</div>
            ${renderActionList(actionItems)}
          </div>

          <div>
            <div class="info-label">Operational notes</div>
            ${renderOperationalNotes(person, overview)}
          </div>
        </div>
      </div>
    `;
  }

  function buildOverview(person) {
    const finance = assessFinance(person);
    const legislation = assessLegislation(person);
    const media = assessMedia(person);
    const sourceHealth = assessSourceHealth(person);
    const dataQuality = assessDataQuality(person);
    const rosterReadiness = assessRosterReadiness(person);

    const liveModules = [finance, legislation, media];
    const liveReadyCount = liveModules.filter((item) => item.status === "ready").length;

    const allItems = [
      finance,
      legislation,
      media,
      sourceHealth,
      dataQuality,
      rosterReadiness
    ];

    const overall = calculateOverallStatus(allItems);
    const recommendation = buildRecommendation({
      person,
      finance,
      legislation,
      media,
      sourceHealth,
      dataQuality,
      rosterReadiness
    });

    return {
      finance,
      legislation,
      media,
      sourceHealth,
      dataQuality,
      rosterReadiness,
      overall,
      liveReadyCount,
      recommendation
    };
  }

  function assessFinance(person) {
    const isFederal = person.officeTypeNormalized === "federal";
    const ids = getFecIds(person);

    if (!isFederal) {
      return {
        key: "finance",
        label: "Finance",
        status: "api",
        statusLabel: "State source",
        headline: "State source needed",
        detail: "OpenFEC is federal-only.  Use state campaign finance data for this profile.",
        targetId: "section-campaign-finance-snapshot"
      };
    }

    if (ids.candidateId && ids.committeeId) {
      return {
        key: "finance",
        label: "Finance",
        status: "ready",
        statusLabel: "Ready",
        headline: "OpenFEC ready",
        detail: `Candidate ${ids.candidateId}, committee ${ids.committeeId}.`,
        targetId: "section-campaign-finance-snapshot"
      };
    }

    if (ids.candidateId || ids.committeeId) {
      return {
        key: "finance",
        label: "Finance",
        status: "partial",
        statusLabel: "Partial",
        headline: "Partial FEC IDs",
        detail: `Candidate ${ids.candidateId || "missing"}, committee ${ids.committeeId || "missing"}.`,
        targetId: "section-campaign-finance-snapshot"
      };
    }

    return {
      key: "finance",
      label: "Finance",
      status: "missing",
      statusLabel: "Missing",
      headline: "FEC IDs missing",
      detail: "Add FEC candidate and principal committee IDs before this module is useful.",
      targetId: "section-campaign-finance-snapshot"
    };
  }

  function assessLegislation(person) {
    const isFederal = person.officeTypeNormalized === "federal";
    const bioguideId = getBioguideId(person);

    if (!isFederal) {
      return {
        key: "legislation",
        label: "Legislation",
        status: "api",
        statusLabel: "State source",
        headline: "State source needed",
        detail: "Congress.gov is federal-only.  Use OpenStates or official state legislature data.",
        targetId: "section-legislative-mechanics-and-floor-records"
      };
    }

    if (bioguideId) {
      return {
        key: "legislation",
        label: "Legislation",
        status: "ready",
        statusLabel: "Ready",
        headline: "Congress.gov ready",
        detail: `Bioguide ID ${bioguideId}.`,
        targetId: "section-legislative-mechanics-and-floor-records"
      };
    }

    return {
      key: "legislation",
      label: "Legislation",
      status: "missing",
      statusLabel: "Missing",
      headline: "Bioguide missing",
      detail: "Add Bioguide ID before Congress.gov fetches can run.",
      targetId: "section-legislative-mechanics-and-floor-records"
    };
  }

  function assessMedia(person) {
    const youtubeChannelId = getYouTubeChannelId(person);
    const hasMediaNotes = U.hasContent(person.mediaTracking) || U.hasContent(person.media);

    if (youtubeChannelId) {
      return {
        key: "media",
        label: "Media",
        status: "ready",
        statusLabel: "Ready",
        headline: "YouTube ready",
        detail: `Channel ID ${youtubeChannelId}.`,
        targetId: "section-youtube-proof-videos"
      };
    }

    if (hasMediaNotes) {
      return {
        key: "media",
        label: "Media",
        status: "partial",
        statusLabel: "Partial",
        headline: "Media scaffolded",
        detail: "Some media data exists, but no YouTube channel ID is available.",
        targetId: "section-youtube-proof-videos"
      };
    }

    return {
      key: "media",
      label: "Media",
      status: "missing",
      statusLabel: "Missing",
      headline: "YouTube ID missing",
      detail: "Use the YouTube channel search helper or add a verified channel ID.",
      targetId: "section-youtube-proof-videos"
    };
  }

  function assessSourceHealth(person) {
    const sourceItems = getSourceItemCount(person);
    const endpoints = person.sourceEndpoints && typeof person.sourceEndpoints === "object"
      ? Object.values(person.sourceEndpoints).filter(U.hasContent).length
      : 0;

    const total = sourceItems + endpoints;

    if (total >= 8) {
      return {
        key: "sourceHealth",
        label: "Source Health",
        status: "ready",
        statusLabel: "Ready",
        headline: "Strong source trail",
        detail: `${total} source or endpoint records detected.`,
        targetId: "section-source-tracking"
      };
    }

    if (total >= 3) {
      return {
        key: "sourceHealth",
        label: "Source Health",
        status: "partial",
        statusLabel: "Partial",
        headline: "Usable source trail",
        detail: `${total} source or endpoint records detected.`,
        targetId: "section-source-tracking"
      };
    }

    if (total >= 1) {
      return {
        key: "sourceHealth",
        label: "Source Health",
        status: "missing",
        statusLabel: "Thin",
        headline: "Thin source trail",
        detail: `${total} source or endpoint record detected.`,
        targetId: "section-source-tracking"
      };
    }

    return {
      key: "sourceHealth",
      label: "Source Health",
      status: "missing",
      statusLabel: "Missing",
      headline: "No source trail",
      detail: "Add official links, IDs, endpoints, and source notes.",
      targetId: "section-source-tracking"
    };
  }

  function assessDataQuality(person) {
    const notes = Array.isArray(person.dataQualityNotes)
      ? person.dataQualityNotes
      : [];

    const warnings = notes.filter((note) => {
      const severity = String(note.severity || "").toLowerCase();
      const label = String(note.label || "").toLowerCase();
      const value = String(note.value || "").toLowerCase();

      return (
        severity.includes("warning") ||
        label.includes("missing") ||
        value.includes("missing") ||
        value.includes("not populated")
      );
    });

    if (notes.length >= 3 && warnings.length <= 1) {
      return {
        key: "dataQuality",
        label: "Data Quality",
        status: "ready",
        statusLabel: "Ready",
        headline: "Quality notes present",
        detail: `${notes.length} notes, ${warnings.length} warning.`,
        targetId: "section-data-quality-notes"
      };
    }

    if (notes.length >= 1) {
      return {
        key: "dataQuality",
        label: "Data Quality",
        status: "partial",
        statusLabel: "Partial",
        headline: "Review needed",
        detail: `${notes.length} notes, ${warnings.length} warnings.`,
        targetId: "section-data-quality-notes"
      };
    }

    return {
      key: "dataQuality",
      label: "Data Quality",
      status: "missing",
      statusLabel: "Missing",
      headline: "No quality notes",
      detail: "Add known gaps, cautions, and verification notes.",
      targetId: "section-data-quality-notes"
    };
  }

  function assessRosterReadiness(person) {
    const coreFields = [
      person.name,
      person.fullName,
      person.title,
      person.party,
      person.state,
      person.district,
      person.officeTypeNormalized,
      person.currentOffice || person.office
    ];

    const completed = coreFields.filter(U.hasContent).length;
    const score = Math.round((completed / coreFields.length) * 100);

    if (score >= 85) {
      return {
        key: "rosterReadiness",
        label: "Roster",
        status: "ready",
        statusLabel: "Ready",
        headline: "Core identity ready",
        detail: `${score}% core identity coverage.`,
        targetId: "section-profile-completion"
      };
    }

    if (score >= 50) {
      return {
        key: "rosterReadiness",
        label: "Roster",
        status: "partial",
        statusLabel: "Partial",
        headline: "Core identity partial",
        detail: `${score}% core identity coverage.`,
        targetId: "section-profile-completion"
      };
    }

    return {
      key: "rosterReadiness",
      label: "Roster",
      status: "missing",
      statusLabel: "Missing",
      headline: "Core identity weak",
      detail: `${score}% core identity coverage.`,
      targetId: "section-profile-completion"
    };
  }

  function calculateOverallStatus(items) {
    const statuses = items.map((item) => item.status);
    const readyCount = statuses.filter((status) => status === "ready").length;
    const missingCount = statuses.filter((status) => status === "missing").length;

    if (readyCount >= 4 && missingCount === 0) {
      return {
        status: "ready",
        label: "Ready"
      };
    }

    if (readyCount >= 2 && missingCount <= 2) {
      return {
        status: "partial",
        label: "Operational"
      };
    }

    if (readyCount >= 1) {
      return {
        status: "partial",
        label: "Partial"
      };
    }

    return {
      status: "missing",
      label: "Needs work"
    };
  }

  function buildRecommendation({ person, finance, legislation, media, sourceHealth, dataQuality }) {
    if (person.isTemporaryPreview) {
      return "Preview only.  Copy JSON and paste into people.json to make permanent.";
    }

    if (finance.status === "ready" && legislation.status === "ready" && media.status === "ready") {
      return "Run live finance, legislation, and media checks.";
    }

    if (finance.status === "missing" && person.officeTypeNormalized === "federal") {
      return "Add FEC IDs next.";
    }

    if (legislation.status === "missing" && person.officeTypeNormalized === "federal") {
      return "Add Bioguide ID next.";
    }

    if (media.status === "missing") {
      return "Find and verify YouTube channel ID next.";
    }

    if (sourceHealth.status === "missing") {
      return "Add official sources and endpoint trail next.";
    }

    if (dataQuality.status !== "ready") {
      return "Review data quality notes and missing-field warnings.";
    }

    return "Profile is usable.  Continue enrichment by module.";
  }

  function buildActionItems(person, overview) {
    const actions = [];

    if (overview.finance.status === "ready") {
      actions.push({
        label: "Run finance snapshot",
        value: "Open Campaign Finance Snapshot and fetch OpenFEC data.",
        targetId: overview.finance.targetId
      });
    } else if (overview.finance.status === "missing" && person.officeTypeNormalized === "federal") {
      actions.push({
        label: "Add FEC IDs",
        value: "Add FEC candidate ID and principal committee ID.",
        targetId: "section-universal-reference"
      });
    }

    if (overview.legislation.status === "ready") {
      actions.push({
        label: "Run legislative snapshot",
        value: "Open Legislative Mechanics and fetch Congress.gov data.",
        targetId: overview.legislation.targetId
      });
    } else if (overview.legislation.status === "missing" && person.officeTypeNormalized === "federal") {
      actions.push({
        label: "Add Bioguide ID",
        value: "Add official Bioguide ID to unlock Congress.gov data.",
        targetId: "section-universal-reference"
      });
    }

    if (overview.media.status === "ready") {
      actions.push({
        label: "Run YouTube snapshot",
        value: "Open YouTube Proof Videos and fetch channel/video data.",
        targetId: overview.media.targetId
      });
    } else if (overview.media.status === "missing") {
      actions.push({
        label: "Verify YouTube channel",
        value: "Use channel search, confirm official channel, then add channel ID.",
        targetId: overview.media.targetId
      });
    }

    if (person.officeTypeNormalized === "state") {
      actions.push({
        label: "Wire state sources",
        value: "Use state campaign finance and state legislative sources instead of federal-only APIs.",
        targetId: "section-source-tracking"
      });
    }

    if (overview.sourceHealth.status !== "ready") {
      actions.push({
        label: "Strengthen source trail",
        value: "Add official source links, endpoint URLs, and last-checked notes.",
        targetId: overview.sourceHealth.targetId
      });
    }

    if (!actions.length) {
      actions.push({
        label: "Continue enrichment",
        value: "Profile is operational.  Add deeper race, geography, staff, and public mention data.",
        targetId: "section-race-context-and-opponent-data"
      });
    }

    return actions.slice(0, 5);
  }

  function renderOverviewCard(item) {
    return `
      <div class="info-card">
        <div class="copy-row">
          <div class="info-label">${U.escapeHtml(item.label)}</div>
          ${renderStatusPill({ status: item.status, label: item.statusLabel })}
        </div>
        <div class="info-value">${U.escapeHtml(item.headline)}</div>
        <p style="margin: 8px 0 0; color: rgba(226, 232, 240, 0.72); font-size: 12px; line-height: 1.45;">
          ${U.escapeHtml(item.detail)}
        </p>
        <div style="height: 10px"></div>
        <button class="copy-button" type="button" data-overview-jump="${U.escapeAttribute(item.targetId)}">
          Open section
        </button>
      </div>
    `;
  }

  function renderActionList(actions) {
    return `
      <div class="list">
        ${actions.map((action) => `
          <div class="list-item">
            <strong>${U.escapeHtml(action.label)}</strong>
            <p>${U.escapeHtml(action.value)}</p>
            <button class="copy-button" type="button" data-overview-jump="${U.escapeAttribute(action.targetId)}">
              Open section
            </button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderOperationalNotes(person, overview) {
    const notes = [
      ["Profile type", person.officeTypeLabel || person.officeTypeNormalized || "Unknown"],
      ["Party", person.partyLabel || person.party || "Unknown"],
      ["State / district", [person.state, person.district].filter(Boolean).join(" · ") || "Unknown"],
      ["Live modules ready", `${overview.liveReadyCount} of 3`],
      ["Recommended next step", overview.recommendation]
    ];

    return renderKeyValueGrid(notes);
  }

  function renderKeyValueGrid(items) {
    return `
      <div class="grid-three">
        ${items.filter(([, value]) => U.hasContent(value)).map(([label, value]) => `
          <div class="info-card">
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="info-value">${U.escapeHtml(String(value))}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderStatusPill(item) {
    return `
      <span class="status-pill ${U.escapeAttribute(statusToClass(item.status))}">
        ${U.escapeHtml(item.label)}
      </span>
    `;
  }

  function statusToClass(status) {
    if (status === "ready") return "ready";
    if (status === "partial") return "partial";
    if (status === "api") return "api";
    if (status === "missing") return "missing";
    return "empty";
  }

  function bindOverviewActions() {
    const section = document.getElementById("intelligenceOverview");

    if (section) {
      const header = section.querySelector(".section-header");
      if (header) {
        header.addEventListener("click", () => {
          section.classList.toggle("open");
        });
      }
    }

    document.querySelectorAll("[data-overview-jump]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const targetId = button.getAttribute("data-overview-jump");
        const target = targetId ? document.getElementById(targetId) : null;

        if (!target) return;

        target.classList.add("open");
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    });
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
      person.ids?.bioguideId,
      person.identifiers?.bioguideId,
      person.sourceIdentity?.bioguideId,
      person.legislativeMechanics?.bioguideId
    ) || "";
  }

  function getYouTubeChannelId(person) {
    return U.getFirstValue(
      person.youtubeChannelId,
      person.ids?.youtubeChannelId,
      person.identifiers?.youtubeChannelId,
      person.sourceIdentity?.youtubeChannelId,
      person.officialLinks?.youtubeChannelId,
      person.mediaTracking?.youtubeChannelId,
      person.media?.youtubeChannelId,
      person.social?.youtubeChannelId
    ) || "";
  }

  function getSourceItemCount(person) {
    const explicitSources = Array.isArray(person.sourceTracking)
      ? person.sourceTracking.filter(U.hasContent).length
      : 0;

    const legacySources = Array.isArray(person.sources)
      ? person.sources.filter(U.hasContent).length
      : 0;

    const proofStatusItems = person.proofStatus && typeof person.proofStatus === "object"
      ? Object.values(person.proofStatus).filter(U.hasContent).length
      : 0;

    return explicitSources + legacySources + proofStatusItems;
  }

  window.MCCIntelligenceOverview = {
    mountIntelligenceOverview,
    buildOverview
  };
})();