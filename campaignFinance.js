(function () {
  const OPENFEC_API_BASE = "https://api.open.fec.gov/v1";
  const OPENFEC_KEY_STORAGE_KEY = "mcc_openfec_api_key";
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
  }

  function renderCampaignFinancePanel(person) {
    const ids = getFecIds(person);
    const savedKey = getSavedApiKey();
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
            <label class="info-label" for="openFecApiKey">OpenFEC API key</label>
            <input
              id="openFecApiKey"
              class="search-input"
              type="password"
              placeholder="Paste OpenFEC API key for local testing"
              value="${U.escapeAttribute(savedKey)}"
              autocomplete="off"
            />
          </div>

          <div class="info-card">
            <div class="info-label">Local key storage</div>
            <div class="info-value">
              ${savedKey ? "Saved in this browser localStorage." : "No key saved yet."}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Security note</div>
            <div class="info-value">
              Local-only testing.  Production needs a backend/proxy so keys are not exposed in browser JavaScript.
            </div>
          </div>
        </div>

        <div class="grid-three">
          <button id="saveOpenFecKeyButton" class="secondary-button" type="button">
            Save Key
          </button>

          <button id="clearOpenFecKeyButton" class="secondary-button" type="button">
            Clear Key
          </button>

          <button id="fetchOpenFecSnapshotButton" class="secondary-button" type="button">
            Fetch OpenFEC Snapshot
          </button>
        </div>

        <div id="openFecStatus" class="empty">
          Ready.  Enter an OpenFEC key, confirm IDs, then fetch the snapshot.
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
    const saveButton = document.getElementById("saveOpenFecKeyButton");
    const clearButton = document.getElementById("clearOpenFecKeyButton");
    const fetchButton = document.getElementById("fetchOpenFecSnapshotButton");

    if (saveButton) {
      saveButton.addEventListener("click", () => {
        const keyInput = document.getElementById("openFecApiKey");
        const key = keyInput ? keyInput.value.trim() : "";

        if (!key) {
          setStatus("Enter a key before saving.", "warning");
          return;
        }

        localStorage.setItem(OPENFEC_KEY_STORAGE_KEY, key);
        setStatus("OpenFEC key saved locally in this browser.", "success");
      });
    }

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        localStorage.removeItem(OPENFEC_KEY_STORAGE_KEY);

        const keyInput = document.getElementById("openFecApiKey");
        if (keyInput) keyInput.value = "";

        setStatus("OpenFEC key cleared from localStorage.", "success");
      });
    }

    if (fetchButton) {
      fetchButton.addEventListener("click", async () => {
        await fetchAndRenderOpenFecSnapshot(person);
      });
    }
  }

  async function fetchAndRenderOpenFecSnapshot(person) {
    const ids = getFecIds(person);
    const keyInput = document.getElementById("openFecApiKey");
    const cycleSelect = document.getElementById("openFecCycle");

    const apiKey = keyInput ? keyInput.value.trim() : "";
    const cycle = cycleSelect ? cycleSelect.value : DEFAULT_CYCLE;

    if (!apiKey) {
      setStatus("OpenFEC API key is required for this local test.", "warning");
      return;
    }

    if (!ids.candidateId && !ids.committeeId) {
      setStatus("This profile does not have a FEC candidate ID or committee ID yet.", "warning");
      return;
    }

    localStorage.setItem(OPENFEC_KEY_STORAGE_KEY, apiKey);

    setStatus("Fetching OpenFEC campaign finance snapshot...", "loading");
    setFetchButtonBusy(true);

    try {
      const requests = {
        candidateTotals: ids.candidateId
          ? fetchOpenFecJson(`/candidate/${ids.candidateId}/totals/`, {
              api_key: apiKey,
              cycle,
              sort: "-cycle",
              per_page: "5"
            })
          : Promise.resolve(null),

        committeeTotals: ids.committeeId
          ? fetchOpenFecJson(`/committee/${ids.committeeId}/totals/`, {
              api_key: apiKey,
              cycle,
              sort: "-cycle",
              per_page: "5"
            })
          : Promise.resolve(null),

        debts: ids.committeeId
          ? fetchOpenFecJson("/schedules/schedule_d/", {
              api_key: apiKey,
              committee_id: ids.committeeId,
              cycle,
              per_page: "5",
              sort_hide_null: "false",
              sort: "-report_year"
            })
          : Promise.resolve(null),

        loans: ids.committeeId
          ? fetchOpenFecJson("/schedules/schedule_c/", {
              api_key: apiKey,
              committee_id: ids.committeeId,
              cycle,
              per_page: "5",
              sort_hide_null: "false",
              sort: "-report_year"
            })
          : Promise.resolve(null),

        filings: ids.committeeId
          ? fetchOpenFecJson("/filings/", {
              api_key: apiKey,
              committee_id: ids.committeeId,
              cycle,
              per_page: "5",
              sort: "-receipt_date"
            })
          : Promise.resolve(null)
      };

      const results = await settleRequests(requests);
      renderOpenFecResults({ person, ids, cycle, results });
      setStatus("OpenFEC snapshot fetched. Review the results below.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "OpenFEC request failed.", "error");
    } finally {
      setFetchButtonBusy(false);
    }
  }

  async function settleRequests(requests) {
    const entries = Object.entries(requests);

    const settled = await Promise.all(
      entries.map(async ([key, promise]) => {
        try {
          const value = await promise;
          return [key, { ok: true, value }];
        } catch (error) {
          return [key, { ok: false, error }];
        }
      })
    );

    return Object.fromEntries(settled);
  }

  async function fetchOpenFecJson(path, params) {
    const url = new URL(`${OPENFEC_API_BASE}${path}`);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenFEC ${path} failed with ${response.status}: ${text.slice(0, 180)}`);
    }

    return response.json();
  }

  function renderOpenFecResults({ person, ids, cycle, results }) {
    const container = document.getElementById("openFecResults");
    if (!container) return;

    const candidateTotals = firstResult(results.candidateTotals);
    const committeeTotals = firstResult(results.committeeTotals);

    const debts = resultList(results.debts);
    const loans = resultList(results.loans);
    const filings = resultList(results.filings);

    const summaryRows = buildSummaryRows({
      ids,
      cycle,
      candidateTotals,
      committeeTotals,
      debts,
      loans,
      filings
    });

    const diagnosticsRows = buildDiagnosticsRows(results);

    container.innerHTML = `
      <div class="info-label">Live OpenFEC summary</div>
      ${renderKeyValueGrid(summaryRows, true)}

      <div style="height: 14px"></div>

      <div class="grid-three">
        ${renderMiniCountCard("Debt records found", debts.length)}
        ${renderMiniCountCard("Loan records found", loans.length)}
        ${renderMiniCountCard("Recent filings found", filings.length)}
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
        These results are fetched live for local proof-of-concept use.  They are not written into <code>data/people.json</code>.  For production, this should move behind a backend/proxy and a persistent refresh workflow.
      </div>
    `;
  }

  function buildSummaryRows({ ids, cycle, candidateTotals, committeeTotals, debts, loans, filings }) {
    return [
      ["Cycle", cycle],
      ["FEC Candidate ID", ids.candidateId || "Missing"],
      ["FEC Committee ID", ids.committeeId || "Missing"],

      ["Candidate total receipts", formatMoney(getNumber(candidateTotals, ["receipts", "total_receipts"]))],
      ["Candidate total disbursements", formatMoney(getNumber(candidateTotals, ["disbursements", "total_disbursements"]))],
      ["Candidate cash on hand", formatMoney(getNumber(candidateTotals, ["cash_on_hand_end_period", "cash_on_hand"]))],

      ["Committee total receipts", formatMoney(getNumber(committeeTotals, ["receipts", "total_receipts"]))],
      ["Committee total disbursements", formatMoney(getNumber(committeeTotals, ["disbursements", "total_disbursements"]))],
      ["Committee cash on hand", formatMoney(getNumber(committeeTotals, ["cash_on_hand_end_period", "cash_on_hand"]))],

      ["Committee debt", formatMoney(getNumber(committeeTotals, ["debts_owed_by_committee", "debt_owed_by_committee"]))],
      ["Latest coverage end date", getFirstValueFromObjects([committeeTotals, candidateTotals], ["coverage_end_date", "coverage_end_date_full"]) || "Not returned"],
      ["Most recent filing", getLatestFilingLabel(filings)],

      ["Debt records flag", debts.length > 0 ? "Debt records returned" : "No debt records returned in sample"],
      ["Loan records flag", loans.length > 0 ? "Loan records returned" : "No loan records returned in sample"]
    ];
  }

  function buildDiagnosticsRows(results) {
    return Object.entries(results).map(([key, result]) => {
      if (result.ok) {
        const count = resultList(result).length;
        return [humanizeDiagnosticKey(key), `OK, ${count} result${count === 1 ? "" : "s"} returned`];
      }

      return [humanizeDiagnosticKey(key), result.error ? result.error.message : "Request failed"];
    });
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
        <div class="empty">No filings returned in this sample request.</div>
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
      : `<div class="empty">No debt rows returned in the sample.</div>`;

    const loanHtml = loans.length
      ? loans.slice(0, 3).map((loan) => renderTransactionPreview(loan, "Loan")).join("")
      : `<div class="empty">No loan rows returned in the sample.</div>`;

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

  function getSavedApiKey() {
    return localStorage.getItem(OPENFEC_KEY_STORAGE_KEY) || "";
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

  function firstResult(settledResult) {
    if (!settledResult || !settledResult.ok || !settledResult.value) return null;

    const results = settledResult.value.results;

    if (Array.isArray(results) && results.length) {
      return results[0];
    }

    return null;
  }

  function resultList(settledResult) {
    if (!settledResult || !settledResult.ok || !settledResult.value) return [];

    const results = settledResult.value.results;

    if (Array.isArray(results)) {
      return results;
    }

    return [];
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

  function getFirstValueFromObjects(objects, keys) {
    for (const object of objects) {
      const value = getFirstValue(object, keys);
      if (value) return value;
    }

    return "";
  }

  function getLatestFilingLabel(filings) {
    if (!filings.length) return "No recent filing returned";

    const filing = filings[0];

    const reportType = getFirstValue(filing, ["report_type", "form_type", "report_type_full"]) || "Filing";
    const receiptDate = getFirstValue(filing, ["receipt_date", "filing_date"]) || "date unknown";

    return `${reportType}, ${receiptDate}`;
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
      candidateTotals: "Candidate totals",
      committeeTotals: "Committee totals",
      debts: "Schedule D debts",
      loans: "Schedule C loans",
      filings: "Recent filings"
    };

    return labels[value] || U.humanizeKey(value);
  }
})();