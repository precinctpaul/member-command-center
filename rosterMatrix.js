(function () {
  const U = window.MCCUtils;

  if (!window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("MCC roster matrix could not find MCCRender.renderProfileView.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function enhancedRenderProfileView(person) {
    originalRenderProfileView(person);

    window.setTimeout(() => {
      mountRosterMatrix(person);
    }, 0);
  };

  function mountRosterMatrix(activePersonFromRender) {
    const app = window.MCCApp;
    if (!app || !app.state || !Array.isArray(app.state.people)) return;

    const profileView = document.getElementById("profileView");
    if (!profileView || profileView.classList.contains("hidden")) return;

    const existing = document.getElementById("rosterIntelligenceMatrix");
    if (existing) existing.remove();

    const people = app.state.people.filter((person) => !person.isTemporaryPreview);
    if (!people.length) return;

    const matrix = buildRosterMatrix(people);
    const activePerson =
      activePersonFromRender ||
      people.find((person) => person.id === app.state.activePersonId) ||
      people[0];

    const section = document.createElement("section");
    section.id = "rosterIntelligenceMatrix";
    section.className = "section open";
    section.innerHTML = renderRosterMatrix({
      matrix,
      activePerson
    });

    const intelligenceOverview = document.getElementById("intelligenceOverview");
    const hero = profileView.querySelector(".profile-hero");

    if (intelligenceOverview) {
      intelligenceOverview.insertAdjacentElement("afterend", section);
    } else if (hero) {
      hero.insertAdjacentElement("afterend", section);
    } else {
      profileView.prepend(section);
    }

    bindRosterMatrixActions();
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

  function renderRosterMatrix({ matrix, activePerson }) {
    const summary = matrix.summary;
    const rows = matrix.rows;

    return `
      <button class="section-header" type="button">
        <span class="section-title">
          <strong>Roster Intelligence Matrix</strong>
          <span>Cross-profile command view for readiness, gaps, and next actions.</span>
        </span>
        <span class="status-pill ready">${U.escapeHtml(summary.total)} profiles</span>
        <span class="chevron">›</span>
      </button>

      <div class="section-body">
        <div class="grid-three">
          ${renderMetricCard("Total profiles", summary.total)}
          ${renderMetricCard("Federal", summary.federal)}
          ${renderMetricCard("State", summary.state)}
          ${renderMetricCard("Finance ready", summary.financeReady)}
          ${renderMetricCard("Legislation ready", summary.legislationReady)}
          ${renderMetricCard("Media ready", summary.mediaReady)}
          ${renderMetricCard("Missing FEC IDs", summary.missingFec)}
          ${renderMetricCard("Missing Bioguide", summary.missingBioguide)}
          ${renderMetricCard("Missing YouTube", summary.missingYouTube)}
        </div>

        <div style="height: 14px"></div>

        <div class="grid-three">
          <button class="secondary-button" type="button" data-roster-filter="all">
            Show all
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
            <div class="info-label">Active profile</div>
            <div class="info-value">${U.escapeHtml(activePerson.name || activePerson.displayName || "Unknown")}</div>
          </div>

          <div class="info-card">
            <div class="info-label">Highest-value next move</div>
            <div class="info-value">${U.escapeHtml(getRosterWideRecommendation(matrix))}</div>
          </div>
        </div>

        <div style="height: 14px"></div>

        <div class="list">
          ${rows.map(renderMatrixRow).join("")}
        </div>
      </div>
    `;
  }

  function renderMetricCard(label, value) {
    return `
      <div class="info-card">
        <div class="info-label">${U.escapeHtml(label)}</div>
        <div class="info-value">${U.escapeHtml(String(value))}</div>
      </div>
    `;
  }

  function renderMatrixRow(row) {
    return `
      <div class="list-item">
        <div class="copy-row" style="align-items: flex-start; gap: 12px;">
          <div style="min-width: 0; flex: 1;">
            <strong>${U.escapeHtml(row.name)}</strong>
            <p>
              ${U.escapeHtml(row.title)}
              ${row.state || row.district ? ` · ${U.escapeHtml([row.state, row.district].filter(Boolean).join(" / "))}` : ""}
            </p>
          </div>

          <button class="copy-button" type="button" data-open-profile="${U.escapeAttribute(row.id)}">
            Open
          </button>
        </div>

        <div style="height: 10px"></div>

        <div class="grid-three">
          ${renderStatusMini("Office", row.officeTypeLabel, statusClassFromOffice(row.officeType))}
          ${renderStatusMini("Finance", row.finance.label, row.finance.status)}
          ${renderStatusMini("Legislation", row.legislation.label, row.legislation.status)}
          ${renderStatusMini("Media", row.media.label, row.media.status)}
          ${renderStatusMini("Sources", row.sourceHealth.label, row.sourceHealth.status)}
          ${renderStatusMini("Quality", row.dataQuality.label, row.dataQuality.status)}
        </div>

        <div style="height: 10px"></div>

        <div class="info-card">
          <div class="info-label">Recommended next step</div>
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

  function bindRosterMatrixActions() {
    const matrix = document.getElementById("rosterIntelligenceMatrix");

    if (matrix) {
      const header = matrix.querySelector(".section-header");
      if (header) {
        header.addEventListener("click", () => {
          matrix.classList.toggle("open");
        });
      }
    }

    document.querySelectorAll("[data-roster-filter]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        applyRosterFilter(button.getAttribute("data-roster-filter"));
      });
    });

    document.querySelectorAll("[data-open-profile]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", () => {
        openProfile(button.getAttribute("data-open-profile"));
      });
    });
  }

  function applyRosterFilter(filterName) {
    const app = window.MCCApp;
    if (!app || !app.state) return;

    const profileSearch = document.getElementById("profileSearch");
    const officeTypeFilter = document.getElementById("officeTypeFilter");
    const partyFilter = document.getElementById("partyFilter");
    const completionFilter = document.getElementById("completionFilter");

    if (profileSearch) profileSearch.value = "";
    if (officeTypeFilter) officeTypeFilter.value = "all";
    if (partyFilter) partyFilter.value = "all";
    if (completionFilter) completionFilter.value = "all";

    app.state.filters = {
      search: "",
      officeType: "all",
      party: "all",
      completion: "all"
    };

    if (filterName === "federal") {
      setFilterValues({ officeType: "federal" });
      return;
    }

    if (filterName === "state") {
      setFilterValues({ officeType: "state" });
      return;
    }

    if (filterName === "missing-fec") {
      openFirstMatchingProfile((person) => assessFinance(person).reason === "missing-fec");
      return;
    }

    if (filterName === "missing-bioguide") {
      openFirstMatchingProfile((person) => assessLegislation(person).reason === "missing-bioguide");
      return;
    }

    if (filterName === "missing-youtube") {
      openFirstMatchingProfile((person) => assessMedia(person).reason === "missing-youtube");
      return;
    }

    app.applyFilters();
  }

  function setFilterValues({ officeType }) {
    const app = window.MCCApp;
    const officeTypeFilter = document.getElementById("officeTypeFilter");

    if (!app || !app.state) return;

    if (officeTypeFilter) officeTypeFilter.value = officeType || "all";

    app.state.filters = {
      search: "",
      officeType: officeType || "all",
      party: "all",
      completion: "all"
    };

    app.applyFilters();
  }

  function openFirstMatchingProfile(predicate) {
    const app = window.MCCApp;
    if (!app || !app.state || !Array.isArray(app.state.people)) return;

    const match = app.state.people
      .filter((person) => !person.isTemporaryPreview)
      .find(predicate);

    if (match) {
      openProfile(match.id);
    }
  }

  function openProfile(profileId) {
    const app = window.MCCApp;
    if (!app || !profileId) return;

    app.state.mode = "profile";
    app.state.activePersonId = profileId;

    const profileSearch = document.getElementById("profileSearch");
    const officeTypeFilter = document.getElementById("officeTypeFilter");
    const partyFilter = document.getElementById("partyFilter");
    const completionFilter = document.getElementById("completionFilter");

    if (profileSearch) profileSearch.value = "";
    if (officeTypeFilter) officeTypeFilter.value = "all";
    if (partyFilter) partyFilter.value = "all";
    if (completionFilter) completionFilter.value = "all";

    app.state.filters = {
      search: "",
      officeType: "all",
      party: "all",
      completion: "all"
    };

    app.applyFilters();

    window.setTimeout(() => {
      const profileView = document.getElementById("profileView");
      if (profileView) {
        profileView.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    }, 50);
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
    mountRosterMatrix,
    buildRosterMatrix
  };
})();