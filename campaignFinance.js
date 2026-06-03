(function () {
  const DEFAULT_CYCLE = "2026";
  const U = window.MCCUtils;

  if (!window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("MCC campaign finance enhancer could not find MCCRender.renderProfileView.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function enhancedRenderProfileView(person) {
    originalRenderProfileView(person);
    mountCampaignFinanceSnapshot(person);
  };

  function mountCampaignFinanceSnapshot(person) {
    if (!person) return;

    const section = document.getElementById("section-campaign-finance-snapshot");
    if (!section) return;

    const sectionBody = section.querySelector(".section-body");
    if (!sectionBody) return;

    sectionBody.innerHTML = renderCampaignFinancePanel(person);
    bindCampaignFinanceEvents(person);
    fetchLatestSavedOpenFecRun(person);
  }

  function renderCampaignFinancePanel(person) {
    const ids = getFecIds(person);
    const isFederal = person.officeTypeNormalized === "federal";

    if (!isFederal) {
      return `
        <div class="empty">
          OpenFEC campaign finance is designed for federal candidates and committees.  This is a state-level profile, so campaign finance should be wired to the relevant state disclosure source instead.
        </div>

        ${renderStaticFinanceFields(person)}
      `;
    }

    return `
      <div class="completion-meter">
        <div class="grid-three">
          <div class="info-card">
            <div class="info-label">FEC Candidate ID</div>
            <div class="info-value">${U.escapeHtml(ids.candidateId || "Missing")}</div>
          </div>

          <div class="info-card">
            <div class="info-label">FEC Committee ID</div>
            <div class="info-value">${U.escapeHtml(ids.committeeId || "Missing")}</div>
          </div>

          <div class="info-card">
            <div class="info-label">Cycle</div>
            <select id="openFecCycle" class="filter-select">
              ${["2026", "2024", "2022", "2020", "2018", "2016"].map((cycle) => `
                <option value="${cycle}" ${cycle === DEFAULT_CYCLE ? "selected" : ""}>${cycle}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div class="grid-three">
          <div class="info-card">
            <div class="info-label">Execution mode</div>
            <div class="info-value">Server-side OpenFEC runner</div>
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
          <button id="fetchOpenFecSnapshotButton" class="secondary-button" type="button">
            Fetch OpenFEC Snapshot
          </button>

          <button id="refreshSavedOpenFecRunButton" class="secondary-button" type="button">
            Refresh Saved Run
          </button>

          <button id="openFecRunsButton" class="secondary-button" type="button">
            View Latest Runs JSON
          </button>
        </div>

        <div id="openFecStatus" class="empty">
          Ready.  Click Fetch OpenFEC Snapshot to run the backend source fetch and save a real intelligence run.
        </div>

        <div id="openFecResults">
          ${renderStaticFinanceFields(person)}
        </div>
      </div>
    `;
  }

  function renderStaticFinanceFields(person) {
    const snapshot = person.campaignFinanceSnapshot || person.financeSnapshot || {};

    const staticRows = [
      ["Committee name", snapshot.committeeName],
      ["FEC Candidate ID", snapshot.fecCandidateId || person.fecCandidateId || person.sourceIdentity?.fecCandidateId],
      ["FEC Committee ID", snapshot.fecPrincipalCommitteeId || person.fecPrincipalCommitteeId || person.fecCommitteeId || person.sourceIdentity?.fecPrincipalCommitteeId],
      ["Itemized receipts returned", snapshot.itemizedReceiptsReturned],
      ["Itemized disbursements returned", snapshot.itemizedDisbursementsReturned],
      ["Independent expenditures returned", snapshot.independentExpendituresReturned],
      ["Latest receipt date seen", snapshot.latestReceiptDateSeen],
      ["Latest disbursement date seen", snapshot.latestDisbursementDateSeen],
      ["Outside spender proof example", snapshot.outsideSpenderProofExample],
      ["Proof notes", snapshot.proofNotes]
    ].filter(([, value]) => U.hasContent(value));

    if (!staticRows.length) {
      return `
        <div class="empty">
          No local campaign finance snapshot has been saved into this profile yet.
        </div>
      `;
    }

    return `
      <div class="info-label">Saved local snapshot fields</div>
      ${renderKeyValueGrid(staticRows, true)}
    `;
  }

  function bindCampaignFinanceEvents(person) {
    const fetchButton = document.getElementById("fetchOpenFecSnapshotButton");
    const refreshButton = document.getElementById("refreshSavedOpenFecRunButton");
    const runsButton = document.getElementById("openFecRunsButton");

    if (fetchButton) {
      fetchButton.addEventListener("click", async () => {
        await fetchAndRenderOpenFecSnapshot(person);
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener("click", async () => {
        await fetchLatestSavedOpenFecRun(person, true);
      });
    }

    if (runsButton) {
      runsButton.addEventListener("click", () => {
        const profileId = getProfileId(person);
        window.open(`/api/runs/latest?profile_id=${encodeURIComponent(profileId)}`, "_blank", "noopener,noreferrer");
      });
    }
  }

  async function fetchAndRenderOpenFecSnapshot(person) {
    const ids = getFecIds(person);
    const cycleSelect = document.getElementById("openFecCycle");
    const cycle = cycleSelect ? cycleSelect.value : DEFAULT_CYCLE;
    const profileId = getProfileId(person);

    if (!profileId) {
      setStatus("This profile does not have a stable profile ID.", "warning");
      return;
    }

    if (!ids.candidateId && !ids.committeeId) {
      setStatus("This profile does not have a FEC candidate ID or committee ID yet.", "warning");
      return;
    }

    setStatus("Running server-side OpenFEC fetch and saving intelligence run...", "loading");
    setFetchButtonBusy(true);

    try {
      const response = await fetch(`/api/run/openfec/${encodeURIComponent(profileId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cycle
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `OpenFEC backend request failed with HTTP ${response.status}.`);
      }

      renderOpenFecRunResult(payload.run);
      setStatus("OpenFEC run saved to intelligence_runs and rendered below.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "OpenFEC backend request failed.", "error");
    } finally {
      setFetchButtonBusy(false);
    }
  }

  async function fetchLatestSavedOpenFecRun(person, showStatus) {
    const profileId = getProfileId(person);

    if (!profileId) return;

    try {
      if (showStatus) {
        setStatus("Loading latest saved OpenFEC run...", "loading");
      }

      const url = `/api/runs/latest?profile_id=${encodeURIComponent(profileId)}`;
      const response = await fetch(url);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Latest runs request failed with HTTP ${response.status}.`);
      }

      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      const openFecRun = runs.find((run) => run.module_name === "openfec_finance");

      if (openFecRun) {
        renderOpenFecRunResult(openFecRun);

        if (showStatus) {
          setStatus("Latest saved OpenFEC run loaded.", "success");
        }

        return;
      }

      if (showStatus) {
        setStatus("No saved OpenFEC run found yet.  Click Fetch OpenFEC Snapshot to create one.", "warning");
      }
    } catch (error) {
      console.error(error);

      if (showStatus) {
        setStatus(error.message || "Could not load latest saved OpenFEC run.", "error");
      }
    }
  }

  function renderOpenFecRunResult(run) {
    const container = document.getElementById("openFecResults");
    if (!container) return;

    const summary = run.summary || {};
    const diagnostics = run.diagnostics || {};
    const filings = Array.isArray(summary.recent_filings) ? summary.recent_filings : [];
    const debts = Array.isArray(summary.debt_preview) ? summary.debt_preview : [];
    const loans = Array.isArray(summary.loan_preview) ? summary.loan_preview : [];

    const summaryRows = [
      ["Run status", run.run_status],
      ["Saved at", run.completed_at || run.created_at],
      ["Cycle", summary.cycle],
      ["FEC Candidate ID", summary.candidate_id],
      ["FEC Committee ID", summary.committee_id],
      ["Total receipts", formatMoney(summary.total_receipts)],
      ["Total disbursements", formatMoney(summary.total_disbursements)],
      ["Cash on hand", formatMoney(summary.cash_on_hand)],
      ["Candidate total receipts", formatMoney(summary.candidate_total_receipts)],
      ["Candidate total disbursements", formatMoney(summary.candidate_total_disbursements)],
      ["Candidate cash on hand", formatMoney(summary.candidate_cash_on_hand)],
      ["Committee total receipts", formatMoney(summary.committee_total_receipts)],
      ["Committee total disbursements", formatMoney(summary.committee_total_disbursements)],
      ["Committee cash on hand", formatMoney(summary.committee_cash_on_hand)],
      ["Committee debt", formatMoney(summary.committee_debt)],
      ["Coverage end date", summary.coverage_end_date || "Not returned"],
      ["Most recent filing", summary.latest_filing || "No recent filing returned"]
    ];

    const diagnosticsRows = Object.entries(diagnostics).map(([key, value]) => [
      humanizeDiagnosticKey(key),
      stringifyDisplayValue(value)
    ]);

    container.innerHTML = `
      <div class="info-label">Saved OpenFEC intelligence run</div>
      ${renderKeyValueGrid(summaryRows, true)}

      <div style="height: 14px"></div>

      <div class="grid-three">
        ${renderMiniCountCard("Debt records found", summary.debt_records_returned || 0)}
        ${renderMiniCountCard("Loan records found", summary.loan_records_returned || 0)}
        ${renderMiniCountCard("Recent filings found", summary.recent_filings_returned || 0)}
      </div>

      <div style="height: 14px"></div>

      ${renderLatestFilings(filings)}

      <div style="height: 14px"></div>

      ${renderDebtAndLoanPreview({ debts, loans })}

      <div style="height: 14px"></div>

      <div class="info-label">Request diagnostics</div>
      ${renderKeyValueGrid(diagnosticsRows, false)}

      <div style="height: 14px"></div>

      <div class="empty">
        This result was fetched by the Python backend using <code>FEC_API_KEY</code> from <code>server/.env</code> and saved as module <code>openfec_finance</code> in <code>intelligence_runs</code>.
      </div>
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

  function renderLatestFilings(filings) {
    if (!filings.length) {
      return `
        <div class="info-label">Recent filings</div>
        <div class="empty">No filings returned in this saved run.</div>
      `;
    }

    const rows = filings.slice(0, 5).map((filing) => {
      const reportType = getFirstValue(filing, ["report_type", "form_type", "report_type_full"]) || "Filing";
      const receiptDate = getFirstValue(filing, ["receipt_date", "filing_date"]) || "Date not returned";
      const documentUrl = getFirstValue(filing, ["document_url", "pdf_url", "fec_url"]) || "";
      const imageNumber = getFirstValue(filing, ["beginning_image_number", "image_number"]) || "";

      return `
        <div class="list-item">
          <strong>${U.escapeHtml(reportType)}</strong>
          <p>${U.escapeHtml(receiptDate)}${imageNumber ? ` · Image ${U.escapeHtml(imageNumber)}` : ""}</p>
          ${documentUrl ? `<p><a href="${U.escapeAttribute(documentUrl)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(documentUrl)}</a></p>` : ""}
        </div>
      `;
    }).join("");

    return `
      <div class="info-label">Recent filings</div>
      <div class="list">${rows}</div>
    `;
  }

  function renderDebtAndLoanPreview({ debts, loans }) {
    const debtHtml = debts.length
      ? debts.slice(0, 3).map((debt) => renderTransactionPreview(debt, "Debt")).join("")
      : `<div class="empty">No debt rows returned in the saved run.</div>`;

    const loanHtml = loans.length
      ? loans.slice(0, 3).map((loan) => renderTransactionPreview(loan, "Loan")).join("")
      : `<div class="empty">No loan rows returned in the saved run.</div>`;

    return `
      <div class="grid-two">
        <div>
          <div class="info-label">Debt preview</div>
          <div class="list">${debtHtml}</div>
        </div>

        <div>
          <div class="info-label">Loan preview</div>
          <div class="list">${loanHtml}</div>
        </div>
      </div>
    `;
  }

  function renderTransactionPreview(item, fallbackLabel) {
    const creditor = getFirstValue(item, [
      "creditor_debtor_name",
      "entity_name",
      "loan_source_name",
      "payee_name",
      "contributor_name"
    ]) || fallbackLabel;

    const amount = getNumber(item, [
      "amount",
      "balance_at_close",
      "payment_to_date",
      "incurred_amount",
      "loan_amount"
    ]);

    const date = getFirstValue(item, [
      "report_year",
      "report_type",
      "coverage_end_date",
      "transaction_date"
    ]) || "";

    return `
      <div class="list-item">
        <strong>${U.escapeHtml(creditor)}</strong>
        <p>${U.escapeHtml(formatMoney(amount))}${date ? ` · ${U.escapeHtml(date)}` : ""}</p>
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
          ? `<button class="copy-button" type="button" data-finance-copy="${U.escapeAttribute(displayValue)}">Copy</button>`
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

    window.setTimeout(bindFinanceCopyButtons, 0);

    return `<div class="grid-three">${rows}</div>`;
  }

  function bindFinanceCopyButtons() {
    document.querySelectorAll("[data-finance-copy]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const value = button.getAttribute("data-finance-copy") || "";

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

  function setStatus(message, type) {
    const status = document.getElementById("openFecStatus");
    if (!status) return;

    const className = type === "error"
      ? "empty error-state"
      : "empty";

    status.className = className;
    status.textContent = message;
  }

  function setFetchButtonBusy(isBusy) {
    const fetchButton = document.getElementById("fetchOpenFecSnapshotButton");
    if (!fetchButton) return;

    fetchButton.disabled = isBusy;
    fetchButton.textContent = isBusy ? "Fetching..." : "Fetch OpenFEC Snapshot";
  }

  function getNumber(object, keys) {
    if (!object || typeof object !== "object") return null;

    for (const key of keys) {
      const value = object[key];

      if (value !== undefined && value !== null && value !== "") {
        const number = Number(value);

        if (Number.isFinite(number)) {
          return number;
        }
      }
    }

    return null;
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

  function stringifyDisplayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";

    return U.stringifyValue(value);
  }

  function humanizeDiagnosticKey(value) {
    const labels = {
      candidate_totals_status: "Candidate totals",
      committee_totals_status: "Committee totals",
      debts_status: "Schedule D debts",
      loans_status: "Schedule C loans",
      filings_status: "Recent filings",
      attempted_requests: "Attempted requests",
      successful_requests: "Successful requests"
    };

    return labels[value] || U.humanizeKey(value);
  }
})();