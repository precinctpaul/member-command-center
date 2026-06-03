(function () {
  const DEFAULT_CONGRESS = "119";
  const DEFAULT_LIMIT = "10";

  const U = window.MCCUtils;

  if (!window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("MCC legislative snapshot enhancer could not find MCCRender.renderProfileView.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function enhancedRenderProfileView(person) {
    originalRenderProfileView(person);
    mountLegislativeSnapshot(person);
  };

  function mountLegislativeSnapshot(person) {
    if (!person) return;

    const section = document.getElementById("section-legislative-mechanics-and-floor-records");
    if (!section) return;

    const sectionBody = section.querySelector(".section-body");
    if (!sectionBody) return;

    sectionBody.innerHTML = renderLegislativePanel(person);
    bindLegislativeEvents(person);
    fetchLatestSavedCongressRun(person);
  }

  function renderLegislativePanel(person) {
    const bioguideId = getBioguideId(person);
    const isFederal = person.officeTypeNormalized === "federal";

    if (!isFederal) {
      return `
        <div class="empty">
          Congress.gov legislative data is federal-only.  This is a state-level profile, so legislative mechanics should be wired to OpenStates or the relevant state legislature source instead.
        </div>

        ${renderStaticLegislativeFields(person)}
      `;
    }

    return `
      <div class="completion-meter">
        <div class="grid-three">
          <div class="info-card">
            <div class="info-label">Bioguide ID</div>
            <div class="info-value">${U.escapeHtml(bioguideId || "Missing")}</div>
          </div>

          <div class="info-card">
            <div class="info-label">Congress</div>
            <select id="congressGovCongress" class="filter-select">
              ${["119", "118", "117", "116", "115", "114"].map((congress) => `
                <option value="${congress}" ${congress === DEFAULT_CONGRESS ? "selected" : ""}>${congress}</option>
              `).join("")}
            </select>
          </div>

          <div class="info-card">
            <div class="info-label">Result limit</div>
            <select id="congressGovLimit" class="filter-select">
              ${["5", "10", "20", "50"].map((limit) => `
                <option value="${limit}" ${limit === DEFAULT_LIMIT ? "selected" : ""}>${limit}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div class="grid-three">
          <div class="info-card">
            <div class="info-label">Execution mode</div>
            <div class="info-value">Server-side Congress.gov runner</div>
          </div>

          <div class="info-card">
            <div class="info-label">API key location</div>
            <div class="info-value">server/.env only</div>
          </div>

          <div class="info-card">
            <div class="info-label">Persistence</div>
            <div class="info-value">Saves to intelligence_runs</div>
          </div>
        </div>

        <div class="grid-three">
          <button id="fetchCongressGovSnapshotButton" class="secondary-button" type="button">
            Fetch Congress.gov Snapshot
          </button>

          <button id="refreshSavedCongressGovRunButton" class="secondary-button" type="button">
            Refresh Saved Run
          </button>

          <button id="congressGovRunsButton" class="secondary-button" type="button">
            View Latest Runs JSON
          </button>
        </div>

        <div id="congressGovStatus" class="empty">
          Ready.  Click Fetch Congress.gov Snapshot to run the backend source fetch and save a real intelligence run.
        </div>

        <div id="congressGovResults">
          ${renderStaticLegislativeFields(person)}
        </div>
      </div>
    `;
  }

  function renderStaticLegislativeFields(person) {
    const mechanics = person.legislativeMechanics || {};

    const staticRows = [
      ["Bioguide ID", mechanics.bioguideId || getBioguideId(person)],
      ["Sponsored legislation count", mechanics.sponsoredLegislationCount],
      ["Cosponsored legislation status", mechanics.cosponsoredLegislationStatus],
      ["Voting record status", mechanics.votingRecordStatus],
      ["Sponsored legislation endpoint", mechanics.sponsoredLegislationEndpoint],
      ["Cosponsored legislation endpoint", mechanics.cosponsoredLegislationEndpoint],
      ["Voting record endpoint status", mechanics.votingRecordEndpointStatus],
      ["Implementation note", mechanics.implementationNote]
    ].filter(([, value]) => U.hasContent(value));

    if (!staticRows.length) {
      return `
        <div class="empty">
          No local legislative mechanics snapshot has been saved into this profile yet.
        </div>
      `;
    }

    return `
      <div class="info-label">Saved local legislative fields</div>
      ${renderKeyValueGrid(staticRows, true)}
    `;
  }

  function bindLegislativeEvents(person) {
    const fetchButton = document.getElementById("fetchCongressGovSnapshotButton");
    const refreshButton = document.getElementById("refreshSavedCongressGovRunButton");
    const runsButton = document.getElementById("congressGovRunsButton");

    if (fetchButton) {
      fetchButton.addEventListener("click", async () => {
        await fetchAndRenderLegislativeSnapshot(person);
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener("click", async () => {
        await fetchLatestSavedCongressRun(person, true);
      });
    }

    if (runsButton) {
      runsButton.addEventListener("click", () => {
        const profileId = getProfileId(person);
        window.open(`/api/runs/latest?profile_id=${encodeURIComponent(profileId)}`, "_blank", "noopener,noreferrer");
      });
    }
  }

  async function fetchAndRenderLegislativeSnapshot(person) {
    const bioguideId = getBioguideId(person);
    const congressSelect = document.getElementById("congressGovCongress");
    const limitSelect = document.getElementById("congressGovLimit");

    const congress = congressSelect ? congressSelect.value : DEFAULT_CONGRESS;
    const limit = limitSelect ? limitSelect.value : DEFAULT_LIMIT;
    const profileId = getProfileId(person);

    if (!profileId) {
      setStatus("This profile does not have a stable profile ID.", "warning");
      return;
    }

    if (!bioguideId) {
      setStatus("This profile does not have a Bioguide ID yet.", "warning");
      return;
    }

    setStatus("Running server-side Congress.gov fetch and saving intelligence run...", "loading");
    setFetchButtonBusy(true);

    try {
      const response = await fetch(`/api/run/congress/${encodeURIComponent(profileId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          congress,
          limit
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Congress.gov backend request failed with HTTP ${response.status}.`);
      }

      renderCongressRunResult(payload.run);
      setStatus("Congress.gov run saved to intelligence_runs and rendered below.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Congress.gov backend request failed.", "error");
    } finally {
      setFetchButtonBusy(false);
    }
  }

  async function fetchLatestSavedCongressRun(person, showStatus) {
    const profileId = getProfileId(person);

    if (!profileId) return;

    try {
      if (showStatus) {
        setStatus("Loading latest saved Congress.gov run...", "loading");
      }

      const url = `/api/runs/latest?profile_id=${encodeURIComponent(profileId)}`;
      const response = await fetch(url);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Latest runs request failed with HTTP ${response.status}.`);
      }

      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      const congressRun = runs.find((run) => run.module_name === "congress_legislation");

      if (congressRun) {
        renderCongressRunResult(congressRun);

        if (showStatus) {
          setStatus("Latest saved Congress.gov run loaded.", "success");
        }

        return;
      }

      if (showStatus) {
        setStatus("No saved Congress.gov run found yet.  Click Fetch Congress.gov Snapshot to create one.", "warning");
      }
    } catch (error) {
      console.error(error);

      if (showStatus) {
        setStatus(error.message || "Could not load latest saved Congress.gov run.", "error");
      }
    }
  }

  function renderCongressRunResult(run) {
    const container = document.getElementById("congressGovResults");
    if (!container) return;

    const summary = run.summary || {};
    const diagnostics = run.diagnostics || {};
    const sponsored = Array.isArray(summary.sponsored_legislation) ? summary.sponsored_legislation : [];
    const cosponsored = Array.isArray(summary.cosponsored_legislation) ? summary.cosponsored_legislation : [];
    const enrichedBills = Array.isArray(summary.enriched_bills) ? summary.enriched_bills : [];
    const policyAreas = Array.isArray(summary.policy_areas_preview) ? summary.policy_areas_preview : [];

    const summaryRows = [
      ["Run status", run.run_status],
      ["Saved at", run.completed_at || run.created_at],
      ["Bioguide ID", summary.bioguide_id],
      ["Congress", summary.congress],
      ["Result limit", summary.limit],
      ["Member name", summary.member_name],
      ["State / district", summary.state_district],
      ["Sponsored bills returned", summary.sponsored_returned],
      ["Cosponsored bills returned", summary.cosponsored_returned],
      ["Bills enriched", summary.enriched_bills_returned],
      ["Latest sponsored bill", summary.latest_sponsored_bill],
      ["Latest cosponsored bill", summary.latest_cosponsored_bill],
      ["Latest sponsored action", summary.latest_sponsored_action],
      ["Latest cosponsored action", summary.latest_cosponsored_action]
    ];

    const diagnosticsRows = Object.entries(diagnostics).map(([key, value]) => [
      humanizeDiagnosticKey(key),
      stringifyDisplayValue(value)
    ]);

    container.innerHTML = `
      <div class="info-label">Saved Congress.gov intelligence run</div>
      ${renderKeyValueGrid(summaryRows, true)}

      <div style="height: 14px"></div>

      <div class="grid-three">
        ${renderMiniCountCard("Sponsored returned", summary.sponsored_returned || 0)}
        ${renderMiniCountCard("Cosponsored returned", summary.cosponsored_returned || 0)}
        ${renderMiniCountCard("Bills enriched", summary.enriched_bills_returned || 0)}
      </div>

      <div style="height: 14px"></div>

      ${renderPolicyAreas(policyAreas)}

      <div style="height: 14px"></div>

      ${renderBillList("Sponsored legislation", sponsored)}

      <div style="height: 14px"></div>

      ${renderBillList("Cosponsored legislation", cosponsored)}

      <div style="height: 14px"></div>

      ${renderEnrichedBills(enrichedBills)}

      <div style="height: 14px"></div>

      <div class="info-label">Request diagnostics</div>
      ${renderKeyValueGrid(diagnosticsRows, false)}

      <div style="height: 14px"></div>

      <div class="empty">
        This result was fetched by the Python backend using <code>CONGRESS_API_KEY</code> from <code>server/.env</code> and saved as module <code>congress_legislation</code> in <code>intelligence_runs</code>.
      </div>
    `;
  }

  function renderPolicyAreas(policyAreas) {
    if (!policyAreas.length) {
      return `
        <div class="info-label">Policy areas preview</div>
        <div class="empty">No policy areas returned from enriched bill detail.</div>
      `;
    }

    const tags = policyAreas.map((policyArea) => `
      <span class="status-pill">${U.escapeHtml(policyArea)}</span>
    `).join("");

    return `
      <div class="info-label">Policy areas preview</div>
      <div class="tag-row">${tags}</div>
    `;
  }

  function renderBillList(label, bills) {
    if (!bills.length) {
      return `
        <div class="info-label">${U.escapeHtml(label)}</div>
        <div class="empty">No bills returned in this saved run.</div>
      `;
    }

    const rows = bills.slice(0, 10).map((bill) => {
      const billLabel = getBillLabel(bill) || "Bill";
      const latestAction = getBillLatestActionLabel(bill);
      const url = getFirstValue(bill, ["url"]);

      return `
        <div class="list-item">
          <strong>${U.escapeHtml(billLabel)}</strong>
          <p>${U.escapeHtml(latestAction)}</p>
          ${url ? `<p><a href="${U.escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(url)}</a></p>` : ""}
        </div>
      `;
    }).join("");

    return `
      <div class="info-label">${U.escapeHtml(label)}</div>
      <div class="list">${rows}</div>
    `;
  }

  function renderEnrichedBills(enrichedBills) {
    if (!enrichedBills.length) {
      return `
        <div class="info-label">Enriched bill detail</div>
        <div class="empty">No bill detail enrichment returned.</div>
      `;
    }

    const rows = enrichedBills.slice(0, 6).map((row) => {
      const bill = row.bill || {};
      const detail = row.detail || {};
      const detailBill = detail.bill || {};
      const policyArea = detailBill.policyArea && detailBill.policyArea.name
        ? detailBill.policyArea.name
        : "Policy area not returned";

      return `
        <div class="list-item">
          <strong>${U.escapeHtml(row.relationship_type || "bill")} · ${U.escapeHtml(getBillLabel(bill) || "Bill")}</strong>
          <p>${U.escapeHtml(policyArea)}</p>
          ${row.error ? `<p>${U.escapeHtml(row.error)}</p>` : ""}
        </div>
      `;
    }).join("");

    return `
      <div class="info-label">Enriched bill detail</div>
      <div class="list">${rows}</div>
    `;
  }

  function renderMiniCountCard(label, count) {
    return `
      <div class="info-card">
        <div class="info-label">${U.escapeHtml(label)}</div>
        <div class="info-value">${U.escapeHtml(count)}</div>
      </div>
    `;
  }

  function renderKeyValueGrid(items, copyable) {
    const rows = items
      .filter((item) => U.hasContent(item[1]))
      .map(([label, value]) => {
        const displayValue = stringifyDisplayValue(value);
        const valueHtml = U.isUrl(displayValue)
          ? `<a href="${U.escapeAttribute(displayValue)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(displayValue)}</a>`
          : U.escapeHtml(displayValue);

        const copyButton = copyable
          ? `<button class="copy-button" type="button" data-legislative-copy="${U.escapeAttribute(displayValue)}">Copy</button>`
          : "";

        return `
          <div class="info-card">
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="copy-row">
              <div class="info-value">${valueHtml}</div>
              ${copyButton}
            </div>
          </div>
        `;
      })
      .join("");

    window.setTimeout(bindLegislativeCopyButtons, 0);

    return `<div class="grid-three">${rows}</div>`;
  }

  function bindLegislativeCopyButtons() {
    document.querySelectorAll("[data-legislative-copy]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const value = button.getAttribute("data-legislative-copy") || "";

        try {
          await navigator.clipboard.writeText(value);
          const originalText = button.textContent;
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = originalText;
          }, 1100);
        } catch (error) {
          console.error(error);
          button.textContent = "Copy failed";
          setTimeout(() => {
            button.textContent = "Copy";
          }, 1100);
        }
      });
    });
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

  function getBioguideId(person) {
    return U.getFirstValue(
      person.bioguideId,
      person.ids?.bioguideId,
      person.identifiers?.bioguideId,
      person.sourceIdentity?.bioguideId,
      person.legislativeMechanics?.bioguideId
    ) || "";
  }

  function setStatus(message, type) {
    const status = document.getElementById("congressGovStatus");
    if (!status) return;

    const className = type === "error"
      ? "empty error-state"
      : "empty";

    status.className = className;
    status.textContent = message;
  }

  function setFetchButtonBusy(isBusy) {
    const fetchButton = document.getElementById("fetchCongressGovSnapshotButton");
    if (!fetchButton) return;

    fetchButton.disabled = isBusy;
    fetchButton.textContent = isBusy ? "Fetching..." : "Fetch Congress.gov Snapshot";
  }

  function getFirstValue(object, keys) {
    if (!object || typeof object !== "object") return "";

    for (const key of keys) {
      const value = object[key];

      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value);
      }
    }

    return "";
  }

  function getBillLabel(bill) {
    if (!bill || typeof bill !== "object") return "";

    const congress = getFirstValue(bill, ["congress"]);
    const billType = getFirstValue(bill, ["type", "billType"]);
    const number = getFirstValue(bill, ["number", "billNumber"]);
    const title = getFirstValue(bill, ["title"]);

    const prefix = [congress, billType ? billType.toUpperCase() : "", number].filter(Boolean).join(" ");

    if (prefix && title) return `${prefix}: ${title}`;
    return title || prefix;
  }

  function getBillLatestActionLabel(bill) {
    if (!bill || typeof bill !== "object") return "Not returned";

    const latestAction = bill.latestAction;

    if (latestAction && typeof latestAction === "object") {
      const actionDate = getFirstValue(latestAction, ["actionDate"]);
      const actionText = getFirstValue(latestAction, ["text"]);

      if (actionDate && actionText) return `${actionDate}: ${actionText}`;
      return actionText || actionDate || "Not returned";
    }

    return "Not returned";
  }

  function stringifyDisplayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";

    return U.stringifyValue(value);
  }

  function humanizeDiagnosticKey(value) {
    const labels = {
      member_detail_status: "Member detail",
      sponsored_legislation_status: "Sponsored legislation",
      cosponsored_legislation_status: "Cosponsored legislation",
      enriched_bills_status: "Enriched bills",
      attempted_requests: "Attempted requests",
      successful_requests: "Successful requests"
    };

    return labels[value] || U.humanizeKey(value);
  }
})();