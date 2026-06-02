const peopleList = document.getElementById("peopleList");
const profileRoot = document.getElementById("profileRoot");

let people = [];
let selectedPersonId = null;

const identityFields = [
  { key: "bioguideId", label: "Bioguide ID", copyable: true },
  { key: "fecCandidateId", label: "FEC Candidate ID", copyable: true },
  { key: "fecPrincipalCommitteeId", label: "FEC Principal Committee ID", copyable: true },
  { key: "policyNotePersonId", label: "PolicyNote Person ID", copyable: true },
  { key: "policyNoteEntityId", label: "PolicyNote Entity ID", copyable: true },
  { key: "googleKnowledgeGraphMid", label: "Google Knowledge Graph MID", copyable: true }
];

const universalProfileFields = [
  { key: "preferredName", label: "Preferred Name" },
  { key: "fullName", label: "Full Name" },
  { key: "title", label: "Title" },
  { key: "party", label: "Party" },
  { key: "district", label: "District" },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "currentOffice", label: "Current Office", wide: true },
  { key: "activeStatus", label: "Active Status" },
  { key: "reelectionYear", label: "Reelection Year" },
  { key: "pronunciation", label: "Pronunciation" },
  { key: "birthday", label: "Birthday" },
  { key: "birthplace", label: "Birthplace" },
  { key: "family", label: "Family" }
];

const headshotFields = [
  { key: "source", label: "Headshot Source" },
  { key: "altText", label: "Alt Text" },
  { key: "usageNote", label: "Usage Note", wide: true },
  { key: "primaryUrl", label: "Primary URL", wide: true, copyable: true, link: true }
];

const bioFields = [
  { key: "oneLine", label: "One-Line Bio", copyable: true },
  { key: "short", label: "Short Bio", copyable: true },
  { key: "standard", label: "Standard Bio", copyable: true },
  { key: "long", label: "Long Background Bio", copyable: true }
];

const raceContextFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "electionCycle", label: "Election Cycle" },
  { key: "office", label: "Office" },
  { key: "district", label: "District" },
  { key: "incumbentStatus", label: "Incumbent Status" },
  { key: "reelectionYear", label: "Reelection Year" },
  { key: "openSeatStatus", label: "Open Seat Status", wide: true },
  { key: "declaredChallengers", label: "Declared Challengers" },
  { key: "filingDeadline", label: "Filing Deadline" },
  { key: "electionRulesSource", label: "Election Rules Source" },
  { key: "opponentDataSource", label: "Opponent Data Source", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const factCheckFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "googleFactCheckQuery", label: "Google Fact Check Query" },
  { key: "latestProofResult", label: "Latest Proof Result", wide: true },
  { key: "sourceApi", label: "Source API" },
  { key: "intendedUse", label: "Intended Use", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const mediaTrackingFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "youtubeChannelTitle", label: "YouTube Channel Title" },
  { key: "youtubeChannelId", label: "YouTube Channel ID" },
  { key: "youtubeSearchResultsReturned", label: "YouTube Search Results Returned", format: "number" },
  { key: "officialChannelPublishedAt", label: "Official Channel Published" },
  { key: "publicCommentaryStatus", label: "Public Commentary Status" },
  { key: "sentimentStatus", label: "Sentiment Status", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const webClippingFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "sourceApi", label: "Source API" },
  { key: "queryPattern", label: "Query Pattern" },
  { key: "currentStatus", label: "Current Status" },
  { key: "intendedUse", label: "Intended Use", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const deepFinanceFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "receiptsEndpoint", label: "Receipts Endpoint" },
  { key: "disbursementsEndpoint", label: "Disbursements Endpoint" },
  { key: "independentExpendituresEndpoint", label: "Independent Expenditures Endpoint" },
  { key: "receiptsAvailable", label: "Receipts Available", format: "number" },
  { key: "disbursementsAvailable", label: "Disbursements Available", format: "number" },
  { key: "independentExpendituresAvailable", label: "Independent Expenditures Available", format: "number" },
  { key: "donorFieldsToTrack", label: "Donor Fields To Track", wide: true },
  { key: "spendingFieldsToTrack", label: "Spending Fields To Track", wide: true },
  { key: "outsideMoneyFieldsToTrack", label: "Outside Money Fields To Track", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const legislativeMechanicsFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "bioguideId", label: "Bioguide ID" },
  { key: "sponsoredLegislationCount", label: "Sponsored Legislation Count", format: "number" },
  { key: "cosponsoredLegislationStatus", label: "Cosponsored Legislation Status" },
  { key: "votingRecordStatus", label: "Voting Record Status" },
  { key: "sponsoredLegislationEndpoint", label: "Sponsored Legislation Endpoint", wide: true, link: true },
  { key: "cosponsoredLegislationEndpoint", label: "Cosponsored Legislation Endpoint", wide: true, link: true },
  { key: "votingRecordEndpointStatus", label: "Voting Record Endpoint Status", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const verbalRecordFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "sourceApi", label: "Source API" },
  { key: "primarySource", label: "Primary Source" },
  { key: "currentStatus", label: "Current Status" },
  { key: "intendedUse", label: "Intended Use", wide: true },
  { key: "parserRequirement", label: "Parser Requirement", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const geographyFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "district", label: "District" },
  { key: "state", label: "State" },
  { key: "googleCivicStatus", label: "Google Civic Status", wide: true },
  { key: "electionAdministrationBody", label: "Election Administration Body" },
  { key: "electionInfoUrl", label: "Election Info URL", wide: true, link: true },
  { key: "voterRegistrationUrl", label: "Voter Registration URL", wide: true, link: true },
  { key: "voterRegistrationConfirmationUrl", label: "Registration Confirmation URL", wide: true, link: true },
  { key: "absenteeVotingInfoUrl", label: "Absentee Voting Info URL", wide: true, link: true },
  { key: "votingLocationFinderUrl", label: "Voting Location Finder URL", wide: true, link: true },
  { key: "ballotInfoUrl", label: "Ballot Info URL", wide: true, link: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const powerMappingFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "sourceApi", label: "Source API" },
  { key: "staffDirectoryStatus", label: "Staff Directory Status" },
  { key: "stakeholderDirectoryStatus", label: "Stakeholder Directory Status" },
  { key: "committeeGatekeeperStatus", label: "Committee Gatekeeper Status" },
  { key: "intendedUse", label: "Intended Use", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const alertingFields = [
  { key: "moduleStatus", label: "Module Status" },
  { key: "currentStatus", label: "Current Status" },
  { key: "dataSourceType", label: "Data Source Type" },
  { key: "alertBehavior", label: "Alert Behavior" },
  { key: "schedulerRequirement", label: "Scheduler Requirement", wide: true },
  { key: "suggestedPollingTargets", label: "Suggested Polling Targets", wide: true },
  { key: "implementationNote", label: "Implementation Note", wide: true }
];

const financeSnapshotFields = [
  { key: "committeeName", label: "Committee" },
  { key: "fecCandidateId", label: "FEC Candidate ID" },
  { key: "fecPrincipalCommitteeId", label: "Principal Committee ID" },
  { key: "itemizedReceiptsReturned", label: "Itemized Receipts Returned", format: "number" },
  { key: "itemizedDisbursementsReturned", label: "Itemized Disbursements Returned", format: "number" },
  { key: "independentExpendituresReturned", label: "Independent Expenditures Returned", format: "number" },
  { key: "latestReceiptDateSeen", label: "Latest Receipt Date Seen" },
  { key: "latestDisbursementDateSeen", label: "Latest Disbursement Date Seen" },
  { key: "outsideSpenderProofExample", label: "Outside Spender Proof Example" },
  { key: "proofNotes", label: "Proof Notes", wide: true }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrl(value) {
  const url = String(value || "").trim();

  if (!url) {
    return "";
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url}`;
}

function isLikelyUrl(value) {
  const text = String(value || "").trim();

  return (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.includes(".gov") ||
    text.includes(".com") ||
    text.includes(".org") ||
    text.includes(".net") ||
    text.includes(".social")
  );
}

function formatValue(value, format) {
  if (value === null || value === undefined || value === "") {
    return "Not added yet";
  }

  if (format === "number") {
    return Number(value).toLocaleString();
  }

  return value;
}

function labelizeKey(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .replace("Youtube", "YouTube")
    .replace("Id", "ID")
    .replace("Fec", "FEC")
    .replace("Gov", "Gov");
}

function renderCopyButton(value, label = "Copy") {
  const safeValue = escapeHtml(value);

  return `
    <button class="copy-button" type="button" data-copy-value="${safeValue}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderValueContent(value, field = {}) {
  const displayValue = formatValue(value, field.format);
  const isMissing = value === null || value === undefined || value === "";

  if (isMissing) {
    return `<span class="identity-value missing">Not added yet</span>`;
  }

  if (field.link || isLikelyUrl(displayValue)) {
    const href = normalizeUrl(displayValue);

    return `
      <a class="identity-value value-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(displayValue)}
      </a>
    `;
  }

  return `<span class="identity-value">${escapeHtml(displayValue)}</span>`;
}

function renderFieldGrid(fields, sourceObject = {}) {
  return fields
    .map((field) => {
      const rawValue = sourceObject[field.key];
      const isMissing = rawValue === null || rawValue === undefined || rawValue === "";
      const wideClass = field.wide ? "wide" : "";
      const longTextClass = field.wide ? "long-text" : "";
      const valueBlockClass = field.wide ? "field-value-block wide-value-block" : "field-value-block";

      return `
        <div class="identity-item ${wideClass}">
          <div class="field-topline">
            <div class="identity-label">${escapeHtml(field.label)}</div>
            ${field.copyable && !isMissing ? renderCopyButton(rawValue) : ""}
          </div>
          <div class="${valueBlockClass} ${longTextClass}">
            ${renderValueContent(rawValue, field)}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPeopleList(selectedId) {
  peopleList.innerHTML = people
    .map((person) => {
      const activeClass = person.id === selectedId ? "active" : "";
      const completion = person.profileCompletion || {};
      const completionSummary = [
        completion.universalReference,
        completion.bioLibrary,
        completion.headshot,
        completion.contact
      ].filter(Boolean).join(" · ");

      return `
        <button class="person-button ${activeClass}" type="button" data-person-id="${escapeHtml(person.id)}">
          <strong>${escapeHtml(person.displayName)}</strong>
          <span>${escapeHtml(person.title || "Unknown title")} · ${escapeHtml(person.district || "No district")}</span>
          <span>${escapeHtml(person.officeType || "Unknown office type")} · ${escapeHtml(completionSummary || "No completion status")}</span>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".person-button").forEach((button) => {
    button.addEventListener("click", () => {
      const personId = button.getAttribute("data-person-id");
      const person = people.find((item) => item.id === personId);

      if (person) {
        selectedPersonId = person.id;
        window.MEMBER_COMMAND_CENTER_SELECTED_PERSON_ID = selectedPersonId;
        window.MEMBER_COMMAND_CENTER_SELECTED_PERSON = person;
        renderPeopleList(person.id);
        renderProfile(person);
      }
    });
  });
}

function renderModuleCard(title, status, fields, sourceObject, options = {}) {
  const openAttribute = options.openByDefault ? "open" : "";

  return `
    <details class="card details-card secondary-card" ${openAttribute}>
      <summary class="card-header details-summary">
        <h3>${escapeHtml(title)}</h3>
        <div class="summary-actions">
          <div class="source-status">${escapeHtml(status)}</div>
          <span class="chevron" aria-hidden="true">▾</span>
        </div>
      </summary>
      <div class="identity-grid">
        ${renderFieldGrid(fields, sourceObject || {})}
      </div>
    </details>
  `;
}

function renderOpenCard(title, status, bodyHtml, extraClass = "") {
  return `
    <section class="card ${extraClass}">
      <div class="card-header">
        <h3>${escapeHtml(title)}</h3>
        <div class="source-status">${escapeHtml(status)}</div>
      </div>
      ${bodyHtml}
    </section>
  `;
}

function renderCompletionCard(person) {
  const completion = person.profileCompletion || {};
  const rows = Object.entries(completion)
    .map(([key, value]) => {
      return `
        <div class="list-row">
          <span>${escapeHtml(labelizeKey(key))}</span>
          <strong>${escapeHtml(value || "Missing")}</strong>
        </div>
      `;
    })
    .join("");

  return renderOpenCard(
    "Profile Completion",
    "Data Readiness",
    `<div class="list-block">${rows}</div>`,
    "secondary-card"
  );
}

function renderSourceIdentityHub(person) {
  const sourceIdentity = person.sourceIdentity || {};

  const rows = identityFields
    .map((field) => {
      const rawValue = sourceIdentity[field.key];
      const isMissing = rawValue === null || rawValue === undefined || rawValue === "";

      return `
        <div class="identity-item">
          <div class="field-topline">
            <div class="identity-label">${escapeHtml(field.label)}</div>
            ${!isMissing ? renderCopyButton(rawValue) : ""}
          </div>
          <div class="field-value-block">
            ${renderValueContent(rawValue, field)}
          </div>
        </div>
      `;
    })
    .join("");

  return renderOpenCard(
    "Source Identity Hub",
    "Reference IDs",
    `<div class="identity-grid">${rows}</div>`,
    "secondary-card"
  );
}

function renderUniversalReference(person) {
  const universalProfile = person.universalProfile || {};

  return renderOpenCard(
    "Universal Reference",
    "Everyday Use",
    `<div class="identity-grid">${renderFieldGrid(universalProfileFields, universalProfile)}</div>`,
    "priority-card"
  );
}

function renderHeadshotCard(person) {
  const headshot = person.headshot || {};
  const imageUrl = headshot.primaryUrl || person.photoUrl;
  const imageHtml = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(headshot.altText || person.displayName)}" />`
    : `<div class="missing-photo">No headshot added</div>`;

  const bodyHtml = `
    <div class="media-card-content">
      <div class="media-preview">
        ${imageHtml}
        ${imageUrl ? renderCopyButton(imageUrl, "Copy Headshot URL") : ""}
      </div>
      <div class="media-meta identity-grid">
        ${renderFieldGrid(headshotFields, headshot)}
      </div>
    </div>
  `;

  return renderOpenCard("Headshot and Media Asset", "Primary Image", bodyHtml);
}

function renderBioLibrary(person) {
  const bio = person.bio || {};

  const rows = bioFields
    .map((field) => {
      const rawValue = bio[field.key];
      const isMissing = rawValue === null || rawValue === undefined || rawValue === "";

      return `
        <div class="bio-block">
          <div class="field-topline">
            <div class="identity-label">${escapeHtml(field.label)}</div>
            ${field.copyable && !isMissing ? renderCopyButton(rawValue) : ""}
          </div>
          <p>${escapeHtml(formatValue(rawValue))}</p>
        </div>
      `;
    })
    .join("");

  return renderOpenCard(
    "Bio Library",
    "Copy Reference",
    `<div class="bio-library">${rows}</div>`,
    "priority-card"
  );
}

function renderCopyableListRow(label, value, options = {}) {
  const safeValue = escapeHtml(formatValue(value));
  const isMissing = value === null || value === undefined || value === "";

  const valueHtml = options.link && !isMissing
    ? `<a href="${escapeHtml(normalizeUrl(value))}" target="_blank" rel="noopener noreferrer">${safeValue}</a>`
    : `<strong>${safeValue}</strong>`;

  return `
    <div class="list-row copyable-list-row">
      <span>${escapeHtml(label)}</span>
      <div class="list-value-group">
        ${valueHtml}
        ${options.copyable && !isMissing ? renderCopyButton(value) : ""}
      </div>
    </div>
  `;
}

function renderOfficialLinksAndContact(person) {
  const officialLinks = person.officialLinks || {};
  const phones = person.phones || [];
  const offices = person.offices || [];
  const webHandles = person.webHandles || [];

  const officialRows = Object.entries(officialLinks)
    .map(([key, value]) => {
      return renderCopyableListRow(labelizeKey(key), value, {
        link: isLikelyUrl(value),
        copyable: key === "officialWebsite" || key === "contactForm"
      });
    })
    .join("");

  const phoneRows = phones.length
    ? phones.map((phone) => renderCopyableListRow(phone.label, phone.value, { copyable: true })).join("")
    : '<p class="note">No phone numbers added yet.</p>';

  const officeRows = offices.length
    ? offices.map((office) => renderCopyableListRow(office.label, office.value, { copyable: true })).join("")
    : '<p class="note">No office addresses added yet.</p>';

  const handleRows = webHandles.length
    ? webHandles.map((handle) => renderCopyableListRow(handle.label, handle.value, {
        link: isLikelyUrl(handle.value),
        copyable: false
      })).join("")
    : '<p class="note">No social or web handles added yet.</p>';

  const bodyHtml = `
    <div class="contact-grid">
      <div class="contact-column">
        <h4>Official Links</h4>
        <div class="list-block compact-list">
          ${officialRows}
        </div>
      </div>
      <div class="contact-column">
        <h4>Phones</h4>
        <div class="list-block compact-list">
          ${phoneRows}
        </div>
      </div>
      <div class="contact-column wide-column">
        <h4>Offices</h4>
        <div class="list-block compact-list">
          ${officeRows}
        </div>
      </div>
      <div class="contact-column wide-column">
        <h4>Social and Web Handles</h4>
        <div class="list-block compact-list">
          ${handleRows}
        </div>
      </div>
    </div>
  `;

  return renderOpenCard("Official Links and Contact", "Reference", bodyHtml);
}

function renderCampaignFinanceSnapshot(person) {
  return renderModuleCard(
    "Campaign Finance Snapshot",
    "OpenFEC Proof",
    financeSnapshotFields,
    person.campaignFinanceSnapshot || {},
    { openByDefault: false }
  );
}

function renderYouTubeProofVideos(person) {
  const mediaTracking = person.mediaTracking || {};
  const videos = mediaTracking.proofVideos || [];

  if (!videos.length) {
    return renderModuleCard(
      "YouTube Proof Videos",
      "Video IDs",
      [],
      {},
      { openByDefault: false }
    );
  }

  const rows = videos
    .map((video) => {
      const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;

      return `
        <div class="list-row video-row">
          <span>${escapeHtml(video.videoId)}</span>
          <div class="list-value-group">
            <a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(video.title)}
            </a>
            ${renderCopyButton(youtubeUrl, "Copy Link")}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <details class="card details-card secondary-card">
      <summary class="card-header details-summary">
        <h3>YouTube Proof Videos</h3>
        <div class="summary-actions">
          <div class="source-status">Video IDs</div>
          <span class="chevron" aria-hidden="true">▾</span>
        </div>
      </summary>
      <div class="list-block">
        ${rows}
      </div>
    </details>
  `;
}

function renderCommittees(person) {
  const committees = person.committees || [];

  const rows = committees.length
    ? committees
        .map((committee) => {
          return `
            <div class="list-row committee-row">
              <span>${escapeHtml(committee.source)} · ${committee.active ? "Active" : "Inactive"}</span>
              <strong>${escapeHtml(committee.name)}</strong>
              <em>${escapeHtml(committee.role || "Member")}</em>
            </div>
          `;
        })
        .join("")
    : '<p class="note">No committee memberships added yet.</p>';

  return renderOpenCard(
    "Committees and Caucuses",
    "Memberships",
    `<div class="list-block">${rows}</div>`
  );
}

function renderSourceEndpoints(person) {
  const sourceEndpoints = person.sourceEndpoints || {};

  const rows = Object.entries(sourceEndpoints)
    .map(([key, value]) => {
      const label = labelizeKey(key);

      return `
        <div class="list-row endpoint-row">
          <span>${escapeHtml(label)}</span>
          <div class="list-value-group">
            <a href="${escapeHtml(normalizeUrl(value))}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(value)}
            </a>
            ${renderCopyButton(value, "Copy")}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <details class="card details-card secondary-card">
      <summary class="card-header details-summary">
        <h3>Verified Source Endpoints</h3>
        <div class="summary-actions">
          <div class="source-status">API Links</div>
          <span class="chevron" aria-hidden="true">▾</span>
        </div>
      </summary>
      <div class="list-block">
        ${rows || '<p class="note">No source endpoints added yet.</p>'}
      </div>
    </details>
  `;
}

function renderProofStatus(person) {
  const proofStatus = person.proofStatus || {};

  const rows = Object.entries(proofStatus)
    .map(([key, value]) => {
      const label = labelizeKey(key);

      return `
        <div class="list-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <details class="card details-card secondary-card">
      <summary class="card-header details-summary">
        <h3>Connection Status</h3>
        <div class="summary-actions">
          <div class="source-status">Status</div>
          <span class="chevron" aria-hidden="true">▾</span>
        </div>
      </summary>
      <div class="list-block">
        ${rows || '<p class="note">No connection statuses added yet.</p>'}
      </div>
    </details>
  `;
}

function bindCopyButtons() {
  document.querySelectorAll(".copy-button").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const copyValue = button.getAttribute("data-copy-value") || "";
      const originalText = button.textContent;

      try {
        await navigator.clipboard.writeText(copyValue);
        button.textContent = "Copied ✓";
        button.classList.add("copied");
      } catch (error) {
        fallbackCopyText(copyValue);
        button.textContent = "Copied ✓";
        button.classList.add("copied");
      }

      window.setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove("copied");
      }, 1400);
    });
  });
}

function fallbackCopyText(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function renderProfile(person) {
  const headshot = person.headshot || {};
  const heroImage = headshot.primaryUrl || person.photoUrl;
  const heroImageHtml = heroImage
    ? `<img src="${escapeHtml(heroImage)}" alt="${escapeHtml(headshot.altText || person.displayName)}" />`
    : `<div class="missing-photo">No headshot</div>`;

  window.MEMBER_COMMAND_CENTER_SELECTED_PERSON_ID = person.id;
  window.MEMBER_COMMAND_CENTER_SELECTED_PERSON = person;

  profileRoot.innerHTML = `
    <article>
      <section class="profile-hero">
        <div class="photo-wrap">
          ${heroImageHtml}
        </div>
        <div class="profile-title">
          <p class="eyebrow">${escapeHtml(person.title || "Profile")}</p>
          <h2>${escapeHtml(person.displayName)}</h2>
          <p>${escapeHtml(person.currentOffice || person.jurisdiction || "Office not added")} · ${escapeHtml(person.district || "District not added")}</p>
          <div class="badges">
            <span class="badge">${escapeHtml(person.party || "Party not added")}</span>
            <span class="badge">${person.active ? "Active" : "Inactive"}</span>
            <span class="badge">${person.pronunciation ? `Pronounced ${escapeHtml(person.pronunciation)}` : "Pronunciation not added"}</span>
          </div>
        </div>
      </section>

      <section class="profile-content">
        ${renderCompletionCard(person)}
        ${renderUniversalReference(person)}
        ${renderBioLibrary(person)}
        ${renderHeadshotCard(person)}
        ${renderOfficialLinksAndContact(person)}
        ${renderCommittees(person)}

        ${renderModuleCard("Race Context and Opponent Data", "Scaffold", raceContextFields, person.raceContext)}
        ${renderModuleCard("Fact-Check Index", "Fact Check", factCheckFields, person.factCheckIndex)}
        ${renderModuleCard("Media Tracking and Public Commentary", "Media", mediaTrackingFields, person.mediaTracking)}
        ${renderYouTubeProofVideos(person)}
        ${renderModuleCard("Web Clippings and Public Mentions", "Search", webClippingFields, person.webClippings)}
        ${renderModuleCard("Deep Campaign Finance", "OpenFEC", deepFinanceFields, person.deepCampaignFinance)}
        ${renderModuleCard("Legislative Mechanics and Floor Records", "Congress.gov", legislativeMechanicsFields, person.legislativeMechanics)}
        ${renderModuleCard("Floor Debates and Verbal Records", "GovInfo Parser Needed", verbalRecordFields, person.verbalRecords)}
        ${renderModuleCard("Political Geography and Electoral Venues", "Google Civic", geographyFields, person.politicalGeography)}
        ${renderModuleCard("Power Mapping and Staff Networks", "PolicyNote", powerMappingFields, person.powerMapping)}
        ${renderModuleCard("Real-Time Alerts Infrastructure", "Polling Required", alertingFields, person.alertingInfrastructure)}

        ${renderSourceIdentityHub(person)}
        ${renderCampaignFinanceSnapshot(person)}
        ${renderProofStatus(person)}
        ${renderSourceEndpoints(person)}
      </section>
    </article>
  `;

  bindCopyButtons();

  window.dispatchEvent(new CustomEvent("member-command-center:profile-rendered", {
    detail: {
      person
    }
  }));
}

function showLoadError(error) {
  profileRoot.innerHTML = `
    <section class="profile-content">
      <section class="card">
        <div class="card-header">
          <h3>Data Load Error</h3>
          <div class="source-status">Check Local Server</div>
        </div>
        <div class="note">
          <p>Could not load <strong>data/people.json</strong>.</p>
          <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
          <p>Run this from Command Prompt:</p>
          <pre>cd /d C:\\dev\\member-command-center
py -m http.server 8080</pre>
          <p>Then open <strong>http://localhost:8080</strong>.</p>
        </div>
      </section>
    </section>
  `;
}

async function loadPeople() {
  const response = await fetch("data/people.json", {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const loadedPeople = await response.json();

  if (!Array.isArray(loadedPeople)) {
    throw new Error("data/people.json must contain an array of people.");
  }

  return loadedPeople;
}

async function boot() {
  try {
    people = await loadPeople();
    window.MEMBER_COMMAND_CENTER_PEOPLE = people;

    if (!people.length) {
      profileRoot.innerHTML = '<p class="note">No people records available.</p>';
      return;
    }

    const firstPerson = people[0];
    selectedPersonId = firstPerson.id;

    renderPeopleList(firstPerson.id);
    renderProfile(firstPerson);
  } catch (error) {
    showLoadError(error);
  }
}

boot();