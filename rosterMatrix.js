(function () {
  const U = window.MCCUtils;

  function renderRosterMatrixView({ people, filteredPeople, activePersonId, onOpenProfile, onApplyProfileFilter }) {
    const profileView = document.getElementById("profileView");
    if (!profileView) return;

    const allPeople = Array.isArray(people) ? people : [];
    const visiblePeople = Array.isArray(filteredPeople) ? filteredPeople : allPeople;
    const matrix = buildRosterMatrix(allPeople);
    const activePerson = allPeople.find((person) => person.id === activePersonId) || allPeople[0] || null;

    profileView.innerHTML = `
      <section class="profile-hero">
        <div class="headshot-wrap">
          <div class="headshot-placeholder">
            <div class="headshot-placeholder-initials">RM</div>
            <div class="headshot-placeholder-label">Roster</div>
          </div>
        </div>

        <div class="hero-content">
          <div class="hero-kicker">Command View</div>
          <h2 class="profile-name">Roster Intelligence Matrix</h2>
          <div class="profile-title">
            Cross-profile readiness, gaps, and next actions across the full roster.
          </div>

          <div class="hero-meta">
            <span class="badge federal">${U.escapeHtml(matrix.summary.total)} profiles</span>
            <span class="badge ready">${U.escapeHtml(matrix.summary.financeReady)} finance ready</span>
            <span class="badge ready">${U.escapeHtml(matrix.summary.legislationReady)} legislation ready</span>
            <span class="badge ready">${U.escapeHtml(matrix.summary.mediaReady)} media ready</span>
          </div>
        </div>
      </section>

      <section class="section open">
        <button class="section-header" type="button">
          <span class="section-title">
            <strong>Roster Intelligence Matrix</strong>
            <span>This is an organization-level view.  It is not attached to any single candidate profile.</span>
          </span>
          <span class="status-pill ready">${U.escapeHtml(matrix.summary.total)} profiles</span>
          <span class="chevron">›</span>
        </button>

        <div class="section-body">
          <div class="grid-three">
            ${renderMetricCard("Total profiles", matrix.summary.total)}
            ${renderMetricCard("Federal", matrix.summary.federal)}
            ${renderMetricCard("State", matrix.summary.state)}
            ${renderMetricCard("Finance ready", matrix.summary.financeReady)}
            ${renderMetricCard("Legislation ready", matrix.summary.legislationReady)}
            ${renderMetricCard("Media ready", matrix.summary.mediaReady)}
            ${renderMetricCard("Missing FEC IDs", matrix.summary.missingFec)}
            ${renderMetricCard("Missing Bioguide", matrix.summary.missingBioguide)}
            ${renderMetricCard("Missing YouTube", matrix.summary.missingYouTube)}
          </div>

          <div style="height: 14px"></div>

          <div class="grid-three">
            <button class="secondary-button" type="button" data-roster-filter="all">
              Show all profiles
            </button>
            <button class="secondary-button" type="button" data-roster-filter="federal">
              Federal only
            </button>
            <button class="secondary-button" type="button" data-roster-filter="state">
              State only
            </button>
            <button class="secondary-button" type="button" data-roster-filter="missing-fec">
              Missing FEC IDs
            </button>
            <button class="secondary-button" type="button" data-roster-filter="missing-bioguide">
              Missing Bioguide
            </button>
            <button class="secondary-button" type="button" data-roster-filter="missing-youtube">
              Missing YouTube
            </button>
          </div>

          <div style="height: 14px"></div>

          <div class="grid-two">
            <div class="info-card">
              <div class="info-label">Currently active profile</div>
              <div class="info-value">${U.escapeHtml(activePerson ? activePerson.name : "None")}</div>
            </div>

            <div class="info-card">
              <div class="info-label">Highest-value next move</div>
              <div class="info-value">${U.escapeHtml(getRosterWideRecommendation(matrix))}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="section open">
        <button class="section-header" type="button">
          <span class="section-title">
            <strong>Compact Matrix</strong>
            <span>One row per profile.  Use this to decide where to work next.</span>
          </span>
          <span class="status-pill partial">${U.escapeHtml(visiblePeople.length)} visible</span>
          <span class="chevron">›</span>
        </button>

        <div class="section-body">
          ${renderCompactMatrix(matrix.rows)}
        </div>
      </section>
    `;

    bindRosterMatrixActions({
      matrix,
      onOpenProfile,
      onApplyProfileFilter
    });
  }

  function buildRosterMatrix(people) {
    const rows = people.map((person) => {
      const finance = assessFinance(person);
      const legislation = assessLegislation(person);
      const media = assessMedia(person);
      const sourceHealth = assessSourceHealth(person);
      const dataQuality = assessDataQuality(person);

      const nextStep = getNextStep(person, {
        finance,
        legislation,
        media,
        sourceHealth,
        dataQuality
      });

      return {
        id: person.id,
        name: person.name || person.displayName || person.fullName || "Unknown",
        title: person.title || person.currentOffice || person.office || "Profile",
        officeType: person.officeTypeNormalized || "unknown",
        officeTypeLabel: person.officeTypeLabel || U.toTitleCase(person.officeTypeNormalized || "unknown"),
        party: person.partyLabel || person.party || "Unknown",
        state: person.state || "",
        district: person.district || "",
        completionScore: Number(person.completionScore || 0),
        completionLabel: person.completionLabel || "Unknown",
        finance,
        legislation,
        media,
        sourceHealth,
        dataQuality,
        nextStep
      };
    });

    const summary = {
      total: rows.length,
      federal: rows.filter((row) => row.officeType === "federal").length,
      state: rows.filter((row) => row.officeType === "state").length,
      financeReady: rows.filter((row) => row.finance.status === "ready").length,
      legislationReady: rows.filter((row) => row.legislation.status === "ready").length,
      mediaReady: rows.filter((row) => row.media.status === "ready").length,
      missingFec: rows.filter((row) => row.finance.reason === "missing-fec").length,
      missingBioguide: rows.filter((row) => row.legislation.reason === "missing-bioguide").length,
      missingYouTube: rows.filter((row) => row.media.reason === "missing-youtube").length,
      stateSourceNeeded: rows.filter((row) => (
        row.finance.reason === "state-source" ||
        row.legislation.reason === "state-source"
      )).length
    };

    return {
      rows,
      summary
    };
  }

  function renderMetricCard(label, value) {
    return `
      <div class="info-card">
        <div class="info-label">${U.escapeHtml(label)}</div>
        <div class="info-value">${U.escapeHtml(String(value))}</div>
      </div>
    `;
  }

  function renderCompactMatrix(rows) {
    if (!rows.length) {
      return `
        <div class="empty">
          No profiles are available for the roster matrix.
        </div>
      `;
    }

    return `
      <div class="list">
        ${rows.map(renderCompactRow).join("")}
      </div>
    `;
  }

  function renderCompactRow(row) {
    return `
      <div class="list-item">
        <div class="copy-row" style="align-items: flex-start; gap: 12px;">
          <div style="min-width: 0; flex: 1;">
            <strong>${U.escapeHtml(row.name)}</strong>
            <p>
              ${U.escapeHtml(row.title)}
              ${row.state || row.district ? ` · ${U.escapeHtml([row.state, row.district].filter(Boolean).join(" / "))}` : ""}
              · ${U.escapeHtml(row.completionScore)}%
            </p>
          </div>

          <button class="copy-button" type="button" data-open-profile="${U.escapeAttribute(row.id)}">
            Open Profile
          </button>
        </div>

        <div style="height: 10px"></div>

        <div class="grid-three">
          ${renderStatusMini("Type", row.officeTypeLabel, statusClassFromOffice(row.officeType))}
          ${renderStatusMini("Finance", row.finance.label, row.finance.status)}
          ${renderStatusMini("Legislation", row.legislation.label, row.legislation.status)}
          ${renderStatusMini("Media", row.media.label, row.media.status)}
          ${renderStatusMini("Sources", row.sourceHealth.label, row.sourceHealth.status)}
          ${renderStatusMini("Quality", row.dataQuality.label, row.dataQuality.status)}
        </div>

        <div style="height: 10px"></div>

        <div class="info-card">
          <div class="info-label">Next step</div>
          <div class="info-value">${U.escapeHtml(row.nextStep)}</div>
        </div>
      </div>
    `;
  }

  function renderStatusMini(label, value, status) {
    return `
      <div class="info-card">
        <div class="copy-row">
          <div class="info-label">${U.escapeHtml(label)}</div>
          <span class="status-pill ${U.escapeAttribute(statusToClass(status))}">
            ${U.escapeHtml(value)}
          </span>
        </div>
      </div>
    `;
  }

  function bindRosterMatrixActions({ matrix, onOpenProfile, onApplyProfileFilter }) {
    document.querySelectorAll("#profileView .section-header").forEach((header) => {
      if (header.dataset.bound === "true") return;
      header.dataset.bound = "true";

      header.addEventListener("click", () => {
        const section = header.closest(".section");
        if (section) section.classList.toggle("open");
      });
    });

    document.querySelectorAll("[data-open-profile]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const profileId = button.getAttribute("data-open-profile");
        if (profileId && typeof onOpenProfile === "function") {
          onOpenProfile(profileId);
        }
      });
    });

    document.querySelectorAll("[data-roster-filter]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        const filterName = button.getAttribute("data-roster-filter");
        applyRosterFilter({
          filterName,
          matrix,
          onOpenProfile,
          onApplyProfileFilter
        });
      });
    });
  }

  function applyRosterFilter({ filterName, matrix, onOpenProfile, onApplyProfileFilter }) {
    if (filterName === "all") {
      if (typeof onApplyProfileFilter === "function") {
        onApplyProfileFilter({
          search: "",
          officeType: "all",
          party: "all",
          completion: "all"
        });
      }
      return;
    }

    if (filterName === "federal") {
      if (typeof onApplyProfileFilter === "function") {
        onApplyProfileFilter({
          search: "",
          officeType: "federal",
          party: "all",
          completion: "all"
        });
      }
      return;
    }

    if (filterName === "state") {
      if (typeof onApplyProfileFilter === "function") {
        onApplyProfileFilter({
          search: "",
          officeType: "state",
          party: "all",
          completion: "all"
        });
      }
      return;
    }

    const row = findFirstMatrixMatch(matrix, filterName);

    if (row && typeof onOpenProfile === "function") {
      onOpenProfile(row.id);
    }
  }

  function findFirstMatrixMatch(matrix, filterName) {
    if (!matrix || !Array.isArray(matrix.rows)) return null;

    if (filterName === "missing-fec") {
      return matrix.rows.find((row) => row.finance.reason === "missing-fec") || null;
    }

    if (filterName === "missing-bioguide") {
      return matrix.rows.find((row) => row.legislation.reason === "missing-bioguide") || null;
    }

    if (filterName === "missing-youtube") {
      return matrix.rows.find((row) => row.media.reason === "missing-youtube") || null;
    }

    return null;
  }

  function assessFinance(person) {
    const isFederal = person.officeTypeNormalized === "federal";
    const ids = getFecIds(person);

    if (!isFederal) {
      return {
        status: "api",
        label: "State source",
        reason: "state-source"
      };
    }

    if (ids.candidateId && ids.committeeId) {
      return {
        status: "ready",
        label: "Ready",
        reason: "ready"
      };
    }

    if (ids.candidateId || ids.committeeId) {
      return {
        status: "partial",
        label: "Partial",
        reason: "partial-fec"
      };
    }

    return {
      status: "missing",
      label: "Missing IDs",
      reason: "missing-fec"
    };
  }

  function assessLegislation(person) {
    const isFederal = person.officeTypeNormalized === "federal";
    const bioguideId = getBioguideId(person);

    if (!isFederal) {
      return {
        status: "api",
        label: "State source",
        reason: "state-source"
      };
    }

    if (bioguideId) {
      return {
        status: "ready",
        label: "Ready",
        reason: "ready"
      };
    }

    return {
      status: "missing",
      label: "Missing ID",
      reason: "missing-bioguide"
    };
  }

  function assessMedia(person) {
    const youtubeChannelId = getYouTubeChannelId(person);

    if (youtubeChannelId) {
      return {
        status: "ready",
        label: "Ready",
        reason: "ready"
      };
    }

    return {
      status: "missing",
      label: "Missing ID",
      reason: "missing-youtube"
    };
  }

  function assessSourceHealth(person) {
    const endpoints = person.sourceEndpoints && typeof person.sourceEndpoints === "object"
      ? Object.values(person.sourceEndpoints).filter(U.hasContent).length
      : 0;

    const sources = Array.isArray(person.sourceTracking)
      ? person.sourceTracking.filter(U.hasContent).length
      : 0;

    const proof = person.proofStatus && typeof person.proofStatus === "object"
      ? Object.values(person.proofStatus).filter(U.hasContent).length
      : 0;

    const total = endpoints + sources + proof;

    if (total >= 8) {
      return {
        status: "ready",
        label: "Ready",
        reason: "ready"
      };
    }

    if (total >= 3) {
      return {
        status: "partial",
        label: "Partial",
        reason: "partial"
      };
    }

    return {
      status: "missing",
      label: "Thin",
      reason: "thin"
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

    if (notes.length >= 2 && warnings.length <= 2) {
      return {
        status: "ready",
        label: "Ready",
        reason: "ready"
      };
    }

    if (notes.length >= 1) {
      return {
        status: "partial",
        label: "Review",
        reason: "review"
      };
    }

    return {
      status: "missing",
      label: "Missing",
      reason: "missing"
    };
  }

  function getNextStep(person, assessments) {
    if (person.officeTypeNormalized === "state") {
      if (assessments.media.reason === "missing-youtube") return "Verify YouTube channel ID.";
      return "Wire state campaign finance and state legislative sources.";
    }

    if (assessments.finance.reason === "missing-fec") return "Add FEC candidate and committee IDs.";
    if (assessments.finance.reason === "partial-fec") return "Complete missing FEC ID.";
    if (assessments.legislation.reason === "missing-bioguide") return "Add Bioguide ID.";
    if (assessments.media.reason === "missing-youtube") return "Verify YouTube channel ID.";
    if (assessments.sourceHealth.reason !== "ready") return "Strengthen source trail.";
    if (assessments.dataQuality.reason !== "ready") return "Review data quality notes.";

    return "Ready for live finance, legislation, and media checks.";
  }

  function getRosterWideRecommendation(matrix) {
    const summary = matrix.summary;

    if (summary.missingFec > 0) return `Add FEC IDs for ${summary.missingFec} federal profile${summary.missingFec === 1 ? "" : "s"}.`;
    if (summary.missingBioguide > 0) return `Add Bioguide IDs for ${summary.missingBioguide} federal profile${summary.missingBioguide === 1 ? "" : "s"}.`;
    if (summary.missingYouTube > 0) return `Verify YouTube IDs for ${summary.missingYouTube} profile${summary.missingYouTube === 1 ? "" : "s"}.`;
    if (summary.stateSourceNeeded > 0) return `Plan state-source wiring for ${summary.stateSourceNeeded} state profile${summary.stateSourceNeeded === 1 ? "" : "s"}.`;

    return "Roster is ready for live module checks.";
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

  function statusToClass(status) {
    if (status === "ready") return "ready";
    if (status === "partial") return "partial";
    if (status === "api") return "api";
    if (status === "missing") return "missing";
    return "empty";
  }

  function statusClassFromOffice(officeType) {
    if (officeType === "federal") return "ready";
    if (officeType === "state") return "api";
    return "partial";
  }

  window.MCCRosterMatrix = {
    renderRosterMatrixView,
    buildRosterMatrix
  };
})();