(function () {
  const U = window.MCCUtils;

  if (!U || !window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("Readiness dashboard could not find required MCC modules.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function readinessEnhancedRenderProfileView(person) {
    originalRenderProfileView(person);
    mountStrategicSnapshot(person);
  };

  function mountStrategicSnapshot(person) {
    if (!person) return;

    const profileView = document.getElementById("profileView");
    if (!profileView) return;

    const existing = document.getElementById("strategicSnapshotPanel");
    if (existing) existing.remove();

    const quickFacts = profileView.querySelector(".quick-facts");
    const hero = profileView.querySelector(".profile-hero");
    const panel = document.createElement("section");
    panel.id = "strategicSnapshotPanel";
    panel.className = "section open";
    panel.innerHTML = renderSnapshotShell(person);

    if (quickFacts && quickFacts.parentNode) {
      quickFacts.insertAdjacentElement("afterend", panel);
    } else if (hero && hero.parentNode) {
      hero.insertAdjacentElement("afterend", panel);
    } else {
      profileView.prepend(panel);
    }

    bindSectionToggle(panel);
    loadProfileReadiness(person);
  }

  function renderSnapshotShell(person) {
    return `
      <button class="section-header" type="button" aria-label="Toggle strategic snapshot">
        <span class="section-title">
          <strong>Strategic Snapshot</strong>
          <span>Staff reliance, constraints, and next action.</span>
        </span>
        <span id="strategicSnapshotHeaderPill" class="status-pill partial">Loading</span>
        <span class="chevron">&rsaquo;</span>
      </button>

      <div class="section-body">
        <div id="strategicSnapshotStatus" class="empty">
          Loading readiness for ${U.escapeHtml(person.name || "this profile")}...
        </div>
        <div id="strategicSnapshotContent"></div>
      </div>
    `;
  }

  function bindSectionToggle(panel) {
    const header = panel.querySelector(".section-header");
    if (!header) return;

    header.addEventListener("click", () => {
      panel.classList.toggle("open");
    });
  }

  async function loadProfileReadiness(person) {
    const profileId = getProfileId(person);

    if (!profileId) {
      renderSnapshotError("This profile does not have a stable profile ID.");
      return;
    }

    try {
      const response = await fetch(`/api/readiness/profile/${encodeURIComponent(profileId)}`);
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Readiness request failed with HTTP ${response.status}.`);
      }

      renderStrategicSnapshot(payload.readiness || {});
    } catch (error) {
      console.error(error);
      renderSnapshotError(error.message || "Could not load readiness.");
    }
  }

  function renderStrategicSnapshot(readiness) {
    const status = document.getElementById("strategicSnapshotStatus");
    const content = document.getElementById("strategicSnapshotContent");
    const headerPill = document.getElementById("strategicSnapshotHeaderPill");
    if (!content) return;

    const frameworks = Array.isArray(readiness.framework_statuses) ? readiness.framework_statuses : [];
    const gaps = Array.isArray(readiness.strategic_gaps) ? readiness.strategic_gaps : [];
    const mainConstraint = readiness.main_constraint || {};
    const sourceHealth = readiness.source_health_summary || {};
    const tierClassName = tierClass(readiness.readiness_tier);

    if (headerPill) {
      headerPill.className = `status-pill ${tierClassName}`;
      headerPill.textContent = tierLabel(readiness.readiness_tier);
    }

    if (status) {
      status.className = `empty briefing-status-${tierClassName}`;
      status.textContent = "Strategic readiness loaded.";
    }

    content.innerHTML = `
      <div style="height: 14px"></div>

      <div class="grid-three">
        ${renderMetricCard("Readiness", `${readiness.readiness_score ?? 0}%`, tierClassName)}
        ${renderMetricCard("Tier", tierLabel(readiness.readiness_tier), tierClassName)}
        ${renderMetricCard("Main Constraint", mainConstraint.framework_label || "None", statusClass(mainConstraint.status))}
      </div>

      <div style="height: 14px"></div>

      <div class="info-card">
        <div class="info-label">Recommended Next Action</div>
        <div class="info-value">${U.escapeHtml(readiness.recommended_next_action || "Monitor source freshness.")}</div>
      </div>

      <div style="height: 14px"></div>

      <div class="grid-three">
        ${renderFrameworkCards(frameworks)}
      </div>

      <div style="height: 14px"></div>

      <div class="grid-two">
        <div class="info-card">
          <div class="info-label">Strategic Gaps</div>
          <div style="height: 8px"></div>
          ${renderGapList(gaps)}
        </div>

        <div class="info-card">
          <div class="info-label">Source Health</div>
          <div style="height: 8px"></div>
          ${renderKeyValueRows([
            ["Status", sourceHealth.status],
            ["Coverage score", sourceHealth.coverage_completion_score !== undefined ? `${sourceHealth.coverage_completion_score}%` : ""],
            ["Latest runs", sourceHealth.latest_run_count],
            ["Missing", sourceHealth.missing_count],
            ["Warnings", sourceHealth.warning_count],
            ["Failed", sourceHealth.failed_count],
            ["Next action", sourceHealth.next_action]
          ])}
        </div>
      </div>
    `;
  }

  function renderFrameworkCards(frameworks) {
    return frameworks.map((framework) => `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(framework.label || framework.key || "Framework")}</div>
            <div class="info-value">${U.escapeHtml(String(framework.score ?? 0))}%</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(statusClass(framework.status))}">
            ${U.escapeHtml(statusLabel(framework.status))}
          </span>
        </div>
        <p style="margin: 10px 0 0; color: var(--muted); line-height: 1.45;">
          ${U.escapeHtml(framework.reason || "")}
        </p>
      </div>
    `).join("");
  }

  function renderMetricCard(label, value, tone) {
    return `
      <div class="info-card">
        <div class="copy-row">
          <div>
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="info-value">${U.escapeHtml(String(value || ""))}</div>
          </div>
          <span class="status-pill ${U.escapeAttribute(tone || "partial")}">${U.escapeHtml(tone === "ready" ? "OK" : "Review")}</span>
        </div>
      </div>
    `;
  }

  function renderGapList(gaps) {
    if (!gaps.length) {
      return `<div class="empty">No immediate strategic readiness gaps.</div>`;
    }

    return `
      <div class="list">
        ${gaps.slice(0, 5).map((gap) => `
          <div class="list-item">
            <div class="copy-row">
              <strong>${U.escapeHtml(gap.framework_label || "Gap")}</strong>
              <span class="status-pill ${U.escapeAttribute(statusClass(gap.status))}">${U.escapeHtml(statusLabel(gap.status))}</span>
            </div>
            <p>${U.escapeHtml(gap.reason || gap.recommended_action || "")}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderKeyValueRows(rows) {
    const cleanRows = rows.filter(([, value]) => hasContent(value));

    if (!cleanRows.length) {
      return `<div class="empty">No source health details available.</div>`;
    }

    return `
      <div class="key-value-grid">
        ${cleanRows.map(([label, value]) => `
          <div class="kv-row">
            <div class="kv-key">${U.escapeHtml(label)}</div>
            <div class="kv-value">${U.escapeHtml(String(value))}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderSnapshotError(message) {
    const status = document.getElementById("strategicSnapshotStatus");
    const content = document.getElementById("strategicSnapshotContent");
    const headerPill = document.getElementById("strategicSnapshotHeaderPill");

    if (headerPill) {
      headerPill.className = "status-pill missing";
      headerPill.textContent = "Error";
    }

    if (status) {
      status.className = "empty briefing-status-missing";
      status.textContent = message;
    }

    if (content) {
      content.innerHTML = "";
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

  function tierClass(tier) {
    if (tier === "command_ready") return "ready";
    if (tier === "nearly_ready") return "partial";
    if (tier === "source_poor" || tier === "needs_work" || tier === "insufficient_data") return "missing";
    return "partial";
  }

  function tierLabel(tier) {
    const labels = {
      command_ready: "Command Ready",
      nearly_ready: "Nearly Ready",
      needs_work: "Needs Work",
      source_poor: "Source Poor",
      insufficient_data: "Insufficient Data"
    };
    return labels[tier] || "Review";
  }

  function statusClass(status) {
    if (status === "complete") return "ready";
    if (status === "not_applicable") return "api";
    if (status === "missing" || status === "source_poor") return "missing";
    return "partial";
  }

  function statusLabel(status) {
    const labels = {
      complete: "Complete",
      partial: "Partial",
      missing: "Missing",
      source_poor: "Source Poor",
      not_applicable: "N/A"
    };
    return labels[status] || "Review";
  }
})();
