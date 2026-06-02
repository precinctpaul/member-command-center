(function () {
  const CONGRESS_API_BASE = "https://api.congress.gov/v3";
  const CONGRESS_KEY_STORAGE_KEY = "mcc_congress_api_key";
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
  }

  function renderLegislativePanel(person) {
    const bioguideId = getBioguideId(person);
    const savedKey = getSavedApiKey();
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
            <label class="info-label" for="congressGovApiKey">Congress.gov API key</label>
            <input
              id="congressGovApiKey"
              class="search-input"
              type="password"
              placeholder="Paste Congress.gov API key for local testing"
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
          <button id="saveCongressGovKeyButton" class="secondary-button" type="button">
            Save Key
          </button>

          <button id="clearCongressGovKeyButton" class="secondary-button" type="button">
            Clear Key
          </button>

          <button id="fetchCongressGovSnapshotButton" class="secondary-button" type="button">
            Fetch Congress.gov Snapshot
          </button>
        </div>

        <div id="congressGovStatus" class="empty">
          Ready.  Enter a Congress.gov key, confirm Bioguide ID, then fetch the legislative snapshot.
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
    const saveButton = document.getElementById("saveCongressGovKeyButton");
    const clearButton = document.getElementById("clearCongressGovKeyButton");
    const fetchButton = document.getElementById("fetchCongressGovSnapshotButton");

    if (saveButton) {
      saveButton.addEventListener("click", () => {
        const keyInput = document.getElementById("congressGovApiKey");
        const key = keyInput ? keyInput.value.trim() : "";

        if (!key) {
          setStatus("Enter a key before saving.", "warning");
          return;
        }

        localStorage.setItem(CONGRESS_KEY_STORAGE_KEY, key);
        setStatus("Congress.gov key saved locally in this browser.", "success");
      });
    }

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        localStorage.removeItem(CONGRESS_KEY_STORAGE_KEY);

        const keyInput = document.getElementById("congressGovApiKey");
        if (keyInput) keyInput.value = "";

        setStatus("Congress.gov key cleared from localStorage.", "success");
      });
    }

    if (fetchButton) {
      fetchButton.addEventListener("click", async () => {
        await fetchAndRenderLegislativeSnapshot(person);
      });
    }
  }

  async function fetchAndRenderLegislativeSnapshot(person) {
    const bioguideId = getBioguideId(person);
    const keyInput = document.getElementById("congressGovApiKey");
    const congressSelect = document.getElementById("congressGovCongress");
    const limitSelect = document.getElementById("congressGovLimit");

    const apiKey = keyInput ? keyInput.value.trim() : "";
    const congress = congressSelect ? congressSelect.value : DEFAULT_CONGRESS;
    const limit = limitSelect ? limitSelect.value : DEFAULT_LIMIT;

    if (!apiKey) {
      setStatus("Congress.gov API key is required for this local test.", "warning");
      return;
    }

    if (!bioguideId) {
      setStatus("This profile does not have a Bioguide ID yet.", "warning");
      return;
    }

    localStorage.setItem(CONGRESS_KEY_STORAGE_KEY, apiKey);

    setStatus("Fetching Congress.gov legislative snapshot...", "loading");
    setFetchButtonBusy(true);

    try {
      const requests = {
        sponsoredLegislation: fetchCongressGovJson(`/member/${bioguideId}/sponsored-legislation`, {
          api_key: apiKey,
          format: "json",
          limit,
          offset: "0"
        }),

        cosponsoredLegislation: fetchCongressGovJson(`/member/${bioguideId}/cosponsored-legislation`, {
          api_key: apiKey,
          format: "json",
          limit,
          offset: "0"
        }),

        memberDetail: fetchCongressGovJson(`/member/${bioguideId}`, {
          api_key: apiKey,
          format: "json"
        })
      };

      const results = await settleRequests(requests);

      await enrichLatestBills({
        results,
        apiKey,
        congress,
        limit: "3"
      });

      renderCongressGovResults({
        person,
        bioguideId,
        congress,
        limit,
        results
      });

      setStatus("Congress.gov snapshot fetched. Review the results below.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Congress.gov request failed.", "error");
    } finally {
      setFetchButtonBusy(false);
    }
  }

  async function enrichLatestBills({ results, apiKey, congress, limit }) {
    const sponsored = resultList(results.sponsoredLegislation);
    const cosponsored = resultList(results.cosponsoredLegislation);

    const targets = [
      ...sponsored.slice(0, Number(limit)).map((bill) => ["sponsored", bill]),
      ...cosponsored.slice(0, Number(limit)).map((bill) => ["cosponsored", bill])
    ];

    const enriched = await Promise.all(
      targets.map(async ([type, bill]) => {
        try {
          const billRef = parseBillReference(bill, congress);
          if (!billRef) return [type, bill, null];

          const data = await fetchCongressGovJson(`/bill/${billRef.congress}/${billRef.billType}/${billRef.billNumber}`, {
            api_key: apiKey,
            format: "json"
          });

          return [type, bill, data];
        } catch (error) {
          return [type, bill, { error: error.message }];
        }
      })
    );

    results.enrichedBills = {
      ok: true,
      value: enriched
    };
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

  async function fetchCongressGovJson(path, params) {
    const url = new URL(`${CONGRESS_API_BASE}${path}`);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Congress.gov ${path} failed with ${response.status}: ${text.slice(0, 180)}`);
    }

    return response.json();
  }

  function renderCongressGovResults({ person, bioguideId, congress, limit, results }) {
    const container = document.getElementById("congressGovResults");
    if (!container) return;

    const sponsored = resultList(results.sponsoredLegislation);
    const cosponsored = resultList(results.cosponsoredLegislation);
    const memberDetail = getMemberDetail(results.memberDetail);
    const enrichedBills = getEnrichedBills(results.enrichedBills);

    const latestSponsored = sponsored[0] || null;
    const latestCosponsored = cosponsored[0] || null;

    const summaryRows = [
      ["Bioguide ID", bioguideId],
      ["Congress selector", congress],
      ["Result limit", limit],
      ["Member name", getFirstValue(memberDetail, ["directOrderName", "name", "invertedOrderName"]) || person.name || "Not returned"],
      ["State / district", buildMemberDistrictLabel(memberDetail, person)],
      ["Sponsored bills returned", sponsored.length],
      ["Cosponsored bills returned", cosponsored.length],
      ["Latest sponsored bill", getBillLabel(latestSponsored) || "Not returned"],
      ["Latest cosponsored bill", getBillLabel(latestCosponsored) || "Not returned"],
      ["Latest sponsored action", getBillLatestActionLabel(latestSponsored)],
      ["Latest cosponsored action", getBillLatestActionLabel(latestCosponsored)]
    ];

    const diagnosticsRows = buildDiagnosticsRows(results);

    container.innerHTML = `
      <div class="info-label">Live Congress.gov summary</div>
      ${renderKeyValueGrid(summaryRows, true)}

      <div style="height: 14px"></div>

      <div class="grid-three">
        ${renderMiniCountCard("Sponsored returned", sponsored.length)}
        ${renderMiniCountCard("Cosponsored returned", cosponsored.length)}
        ${renderMiniCountCard("Bills enriched", enrichedBills.length)}
      </div>

      <div style="height: 14px"></div>

      ${renderBillList({
        label: "Latest sponsored legislation",
        bills: sponsored,
        enrichedBills,
        type: "sponsored"
      })}

      <div style="height: 14px"></div>

      ${renderBillList({
        label: "Latest cosponsored legislation",
        bills: cosponsored,
        enrichedBills,
        type: "cosponsored"
      })}

      <div style="height: 14px"></div>

      ${renderPolicyAreaPreview(enrichedBills)}

      <div style="height: 14px"></div>

      <div class="info-label">Request diagnostics</div>
      ${renderKeyValueGrid(diagnosticsRows, false)}

      <div style="height: 14px"></div>

      <div class="empty">
        These results are fetched live for local proof-of-concept use.  They are not written into <code>data/people.json</code>.  For production, this should move behind a backend/proxy and a persistent refresh workflow.
      </div>
    `;
  }

  function renderBillList({ label, bills, enrichedBills, type }) {
    if (!bills.length) {
      return `
        <div class="info-label">${U.escapeHtml(label)}</div>
        <div class="empty">No bills returned in this sample request.</div>
      `;
    }

    const rows = bills.slice(0, 10).map((bill) => {
      const enriched = findEnrichedBill(enrichedBills, type, bill);
      const enrichedDetail = getBillDetailFromEnrichment(enriched);

      const billLabel = getBillLabel(bill);
      const title = getFirstValue(bill, ["title"]) || getFirstValue(enrichedDetail, ["title"]) || "No title returned";
      const introducedDate = getFirstValue(bill, ["introducedDate"]) || getFirstValue(enrichedDetail, ["introducedDate"]) || "";
      const latestAction = getBillLatestActionLabel(bill) || getBillLatestActionLabel(enrichedDetail);
      const policyArea = getPolicyArea(enrichedDetail);
      const apiUrl = getFirstValue(bill, ["url"]) || "";

      return `
        <div class="list-item">
          <strong>${U.escapeHtml(billLabel || "Bill")}</strong>
          <p>${U.escapeHtml(title)}</p>
          ${introducedDate ? `<p>Introduced: ${U.escapeHtml(introducedDate)}</p>` : ""}
          ${latestAction ? `<p>Latest action: ${U.escapeHtml(latestAction)}</p>` : ""}
          ${policyArea ? `<p>Policy area: ${U.escapeHtml(policyArea)}</p>` : ""}
          ${apiUrl ? `<p><a href="${U.escapeAttribute(apiUrl)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(apiUrl)}</a></p>` : ""}
        </div>
      `;
    }).join("");

    return `
      <div class="info-label">${U.escapeHtml(label)}</div>
      <div class="list">${rows}</div>
    `;
  }

  function renderPolicyAreaPreview(enrichedBills) {
    const policyAreas = enrichedBills
      .map((item) => getPolicyArea(getBillDetailFromEnrichment(item)))
      .filter(Boolean);

    const counts = policyAreas.reduce((accumulator, policyArea) => {
      accumulator[policyArea] = (accumulator[policyArea] || 0) + 1;
      return accumulator;
    }, {});

    const rows = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([policyArea, count]) => [policyArea, `${count} enriched bill${count === 1 ? "" : "s"}`]);

    if (!rows.length) {
      return `
        <div class="info-label">Policy area preview</div>
        <div class="empty">No policy area data returned in the enriched sample.</div>
      `;
    }

    return `
      <div class="info-label">Policy area preview</div>
      ${renderKeyValueGrid(rows, false)}
    `;
  }

  function buildDiagnosticsRows(results) {
    return Object.entries(results)
      .filter(([key]) => key !== "enrichedBills")
      .map(([key, result]) => {
        if (result.ok) {
          const count = key === "memberDetail" ? 1 : resultList(result).length;
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

  function getBioguideId(person) {
    return U.getFirstValue(
      person.bioguideId,
      person.ids?.bioguideId,
      person.identifiers?.bioguideId,
      person.sourceIdentity?.bioguideId,
      person.legislativeMechanics?.bioguideId
    ) || "";
  }

  function getSavedApiKey() {
    return localStorage.getItem(CONGRESS_KEY_STORAGE_KEY) || "";
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

  function resultList(settledResult) {
    if (!settledResult || !settledResult.ok || !settledResult.value) return [];

    const value = settledResult.value;

    if (Array.isArray(value.sponsoredLegislation)) return value.sponsoredLegislation;
    if (Array.isArray(value.cosponsoredLegislation)) return value.cosponsoredLegislation;
    if (Array.isArray(value.results)) return value.results;

    return [];
  }

  function getMemberDetail(settledResult) {
    if (!settledResult || !settledResult.ok || !settledResult.value) return {};

    return settledResult.value.member || settledResult.value || {};
  }

  function getEnrichedBills(settledResult) {
    if (!settledResult || !settledResult.ok || !settledResult.value) return [];

    return settledResult.value.map(([type, originalBill, enriched]) => ({
      type,
      originalBill,
      enriched
    }));
  }

  function findEnrichedBill(enrichedBills, type, bill) {
    const sourceRef = getBillComparableRef(bill);

    return enrichedBills.find((item) => (
      item.type === type &&
      getBillComparableRef(item.originalBill) === sourceRef
    ));
  }

  function getBillDetailFromEnrichment(enrichedItem) {
    if (!enrichedItem || !enrichedItem.enriched || enrichedItem.enriched.error) return {};

    return enrichedItem.enriched.bill || enrichedItem.enriched || {};
  }

  function parseBillReference(bill, fallbackCongress) {
    if (!bill || typeof bill !== "object") return null;

    const directCongress = getFirstValue(bill, ["congress"]) || fallbackCongress;
    const directNumber = getFirstValue(bill, ["number", "billNumber"]);
    const directType = getFirstValue(bill, ["type", "billType"]);

    if (directCongress && directNumber && directType) {
      return {
        congress: directCongress,
        billType: normalizeBillType(directType),
        billNumber: directNumber
      };
    }

    const url = getFirstValue(bill, ["url"]);

    if (url) {
      const match = url.match(/\/bill\/(\d+)\/([^/]+)\/(\d+)/i);

      if (match) {
        return {
          congress: match[1],
          billType: normalizeBillType(match[2]),
          billNumber: match[3]
        };
      }
    }

    const citation = getFirstValue(bill, ["citation", "billNumber", "bill"]);

    if (citation) {
      const citationMatch = citation.match(/([a-z. ]+)\s*(\d+)/i);

      if (citationMatch) {
        return {
          congress: directCongress,
          billType: normalizeBillType(citationMatch[1]),
          billNumber: citationMatch[2]
        };
      }
    }

    return null;
  }

  function normalizeBillType(value) {
    const cleaned = String(value || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, "");

    const map = {
      hr: "hr",
      hres: "hres",
      hjres: "hjres",
      hconres: "hconres",
      s: "s",
      sres: "sres",
      sjres: "sjres",
      sconres: "sconres"
    };

    return map[cleaned] || cleaned;
  }

  function getBillComparableRef(bill) {
    const ref = parseBillReference(bill, DEFAULT_CONGRESS);
    if (!ref) return JSON.stringify(bill || {});

    return `${ref.congress}-${ref.billType}-${ref.billNumber}`;
  }

  function getBillLabel(bill) {
    if (!bill) return "";

    const congress = getFirstValue(bill, ["congress"]);
    const type = getFirstValue(bill, ["type", "billType"]);
    const number = getFirstValue(bill, ["number", "billNumber"]);

    if (type && number) {
      return `${String(type).toUpperCase()} ${number}${congress ? `, ${congress}th` : ""}`;
    }

    const citation = getFirstValue(bill, ["citation", "bill", "title"]);
    return citation || "";
  }

  function getBillLatestActionLabel(bill) {
    if (!bill || typeof bill !== "object") return "Not returned";

    const latestAction = bill.latestAction || {};
    const actionDate = getFirstValue(latestAction, ["actionDate", "date"]) || getFirstValue(bill, ["latestActionDate", "actionDate"]);
    const actionText = getFirstValue(latestAction, ["text", "actionText"]) || getFirstValue(bill, ["latestActionText"]);

    if (actionDate && actionText) return `${actionDate}: ${actionText}`;
    if (actionDate) return actionDate;
    if (actionText) return actionText;

    return "Not returned";
  }

  function getPolicyArea(billDetail) {
    if (!billDetail || typeof billDetail !== "object") return "";

    const policyArea = billDetail.policyArea;

    if (typeof policyArea === "string") return policyArea;
    if (policyArea && typeof policyArea === "object") {
      return getFirstValue(policyArea, ["name"]);
    }

    return "";
  }

  function buildMemberDistrictLabel(memberDetail, person) {
    const state = getFirstValue(memberDetail, ["state"]) || person.state || "";
    const district = getFirstValue(memberDetail, ["district"]) || person.district || "";

    if (state && district) return `${state}-${district}`;
    if (state) return state;
    if (district) return district;

    return "Not returned";
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

  function stringifyDisplayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";

    return U.stringifyValue(value);
  }

  function humanizeDiagnosticKey(value) {
    const labels = {
      sponsoredLegislation: "Sponsored legislation",
      cosponsoredLegislation: "Cosponsored legislation",
      memberDetail: "Member detail"
    };

    return labels[value] || U.humanizeKey(value);
  }
})();