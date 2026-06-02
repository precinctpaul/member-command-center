const people = window.MEMBER_COMMAND_CENTER_PEOPLE || [];

const peopleList = document.getElementById("peopleList");
const profileRoot = document.getElementById("profileRoot");

const identityFields = [
  {
    key: "bioguideId",
    label: "Bioguide ID"
  },
  {
    key: "fecCandidateId",
    label: "FEC Candidate ID"
  },
  {
    key: "fecPrincipalCommitteeId",
    label: "FEC Principal Committee ID"
  },
  {
    key: "policyNotePersonId",
    label: "PolicyNote Person ID"
  },
  {
    key: "policyNoteEntityId",
    label: "PolicyNote Entity ID"
  },
  {
    key: "googleKnowledgeGraphMid",
    label: "Google Knowledge Graph MID"
  }
];

const universalProfileFields = [
  {
    key: "preferredName",
    label: "Preferred Name"
  },
  {
    key: "fullName",
    label: "Full Name"
  },
  {
    key: "title",
    label: "Title"
  },
  {
    key: "party",
    label: "Party"
  },
  {
    key: "district",
    label: "District"
  },
  {
    key: "jurisdiction",
    label: "Jurisdiction"
  },
  {
    key: "currentOffice",
    label: "Current Office",
    wide: true
  },
  {
    key: "activeStatus",
    label: "Active Status"
  },
  {
    key: "reelectionYear",
    label: "Reelection Year"
  },
  {
    key: "pronunciation",
    label: "Pronunciation"
  },
  {
    key: "birthday",
    label: "Birthday"
  },
  {
    key: "birthplace",
    label: "Birthplace"
  },
  {
    key: "family",
    label: "Family"
  }
];

const headshotFields = [
  {
    key: "source",
    label: "Headshot Source"
  },
  {
    key: "altText",
    label: "Alt Text"
  },
  {
    key: "usageNote",
    label: "Usage Note",
    wide: true
  },
  {
    key: "primaryUrl",
    label: "Primary URL",
    wide: true
  }
];

const bioFields = [
  {
    key: "oneLine",
    label: "One-Line Bio"
  },
  {
    key: "short",
    label: "Short Bio"
  },
  {
    key: "standard",
    label: "Standard Bio"
  },
  {
    key: "long",
    label: "Long Background Bio"
  }
];

const financeSnapshotFields = [
  {
    key: "committeeName",
    label: "Committee"
  },
  {
    key: "fecCandidateId",
    label: "FEC Candidate ID"
  },
  {
    key: "fecPrincipalCommitteeId",
    label: "Principal Committee ID"
  },
  {
    key: "itemizedReceiptsReturned",
    label: "Itemized Receipts Returned",
    format: "number"
  },
  {
    key: "itemizedDisbursementsReturned",
    label: "Itemized Disbursements Returned",
    format: "number"
  },
  {
    key: "independentExpendituresReturned",
    label: "Independent Expenditures Returned",
    format: "number"
  },
  {
    key: "latestReceiptDateSeen",
    label: "Latest Receipt Date Seen"
  },
  {
    key: "latestDisbursementDateSeen",
    label: "Latest Disbursement Date Seen"
  },
  {
    key: "outsideSpenderProofExample",
    label: "Outside Spender Proof Example"
  },
  {
    key: "proofNotes",
    label: "Proof Notes",
    wide: true
  }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function formatMissing(value) {
  if (value === null || value === undefined || value === "") {
    return '<span class="identity-value missing">Not added yet</span>';
  }

  return `<span class="identity-value">${escapeHtml(value)}</span>`;
}

function labelizeKey(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function renderPeopleList(selectedId) {
  peopleList.innerHTML = people
    .map((person) => {
      const activeClass = person.id === selectedId ? "active" : "";

      return `
        <button class="person-button ${activeClass}" type="button" data-person-id="${escapeHtml(person.id)}">
          <strong>${escapeHtml(person.displayName)}</strong>
          <span>${escapeHtml(person.title)} · ${escapeHtml(person.district)}</span>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".person-button").forEach((button) => {
    button.addEventListener("click", () => {
      const personId = button.getAttribute("data-person-id");
      const person = people.find((item) => item.id === personId);

      if (person) {
        renderPeopleList(person.id);
        renderProfile(person);
      }
    });
  });
}

function renderFieldGrid(fields, sourceObject) {
  return fields
    .map((field) => {
      const rawValue = sourceObject[field.key];
      const displayValue = formatValue(rawValue, field.format);
      const isMissing = rawValue === null || rawValue === undefined || rawValue === "";
      const valueClass = isMissing ? "missing" : "";
      const wideClass = field.wide ? "wide" : "";
      const longTextClass = field.wide ? "long-text" : "";

      return `
        <div class="identity-item ${wideClass}">
          <div class="identity-label">${escapeHtml(field.label)}</div>
          <span class="identity-value ${valueClass} ${longTextClass}">${escapeHtml(displayValue)}</span>
        </div>
      `;
    })
    .join("");
}

function renderSourceIdentityHub(person) {
  const sourceIdentity = person.sourceIdentity || {};

  const rows = identityFields
    .map((field) => {
      return `
        <div class="identity-item">
          <div class="identity-label">${escapeHtml(field.label)}</div>
          ${formatMissing(sourceIdentity[field.key])}
        </div>
      `;
    })
    .join("");

  return `
    <section class="card">
      <div class="card-header">
        <h3>Source Identity Hub</h3>
        <div class="source-status">Reference IDs</div>
      </div>
      <div class="identity-grid">
        ${rows}
      </div>
    </section>
  `;
}

function renderUniversalReference(person) {
  const universalProfile = person.universalProfile || {};

  return `
    <section class="card priority-card">
      <div class="card-header">
        <h3>Universal Reference</h3>
        <div class="source-status">Everyday Use</div>
      </div>
      <div class="identity-grid">
        ${renderFieldGrid(universalProfileFields, universalProfile)}
      </div>
    </section>
  `;
}

function renderHeadshotCard(person) {
  const headshot = person.headshot || {};

  return `
    <section class="card">
      <div class="card-header">
        <h3>Headshot and Media Asset</h3>
        <div class="source-status">Primary Image</div>
      </div>
      <div class="media-card-content">
        <div class="media-preview">
          <img src="${escapeHtml(headshot.primaryUrl || person.photoUrl)}" alt="${escapeHtml(headshot.altText || person.displayName)}" />
        </div>
        <div class="media-meta identity-grid">
          ${renderFieldGrid(headshotFields, headshot)}
        </div>
      </div>
    </section>
  `;
}

function renderBioLibrary(person) {
  const bio = person.bio || {};

  const rows = bioFields
    .map((field) => {
      return `
        <div class="bio-block">
          <div class="identity-label">${escapeHtml(field.label)}</div>
          <p>${escapeHtml(formatValue(bio[field.key]))}</p>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card priority-card">
      <div class="card-header">
        <h3>Bio Library</h3>
        <div class="source-status">Copy Reference</div>
      </div>
      <div class="bio-library">
        ${rows}
      </div>
    </section>
  `;
}

function renderOfficialLinksAndContact(person) {
  const officialLinks = person.officialLinks || {};
  const phones = person.phones || [];
  const offices = person.offices || [];
  const webHandles = person.webHandles || [];

  const officialRows = Object.entries(officialLinks)
    .map(([key, value]) => {
      return `
        <div class="list-row">
          <span>${escapeHtml(labelizeKey(key))}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `;
    })
    .join("");

  const phoneRows = phones
    .map((phone) => {
      return `
        <div class="list-row">
          <span>${escapeHtml(phone.label)}</span>
          <strong>${escapeHtml(phone.value)}</strong>
        </div>
      `;
    })
    .join("");

  const officeRows = offices
    .map((office) => {
      return `
        <div class="list-row">
          <span>${escapeHtml(office.label)}</span>
          <strong>${escapeHtml(office.value)}</strong>
        </div>
      `;
    })
    .join("");

  const handleRows = webHandles
    .map((handle) => {
      return `
        <div class="list-row">
          <span>${escapeHtml(handle.label)}</span>
          <strong>${escapeHtml(handle.value)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card">
      <div class="card-header">
        <h3>Official Links and Contact</h3>
        <div class="source-status">Reference</div>
      </div>
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
    </section>
  `;
}

function renderCampaignFinanceSnapshot(person) {
  const snapshot = person.campaignFinanceSnapshot || {};

  return `
    <section class="card secondary-card">
      <div class="card-header">
        <h3>Campaign Finance Snapshot</h3>
        <div class="source-status">OpenFEC Proof</div>
      </div>
      <div class="identity-grid">
        ${renderFieldGrid(financeSnapshotFields, snapshot)}
      </div>
    </section>
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

  return `
    <section class="card">
      <div class="card-header">
        <h3>Committees and Caucuses</h3>
        <div class="source-status">Memberships</div>
      </div>
      <div class="list-block">
        ${rows}
      </div>
    </section>
  `;
}

function renderSourceEndpoints(person) {
  const sourceEndpoints = person.sourceEndpoints || {};

  const rows = Object.entries(sourceEndpoints)
    .map(([key, value]) => {
      const label = labelizeKey(key);

      return `
        <div class="list-row endpoint-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card secondary-card">
      <div class="card-header">
        <h3>Verified Source Endpoints</h3>
      </div>
      <div class="list-block">
        ${rows}
      </div>
    </section>
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
    <section class="card secondary-card">
      <div class="card-header">
        <h3>Connection Status</h3>
      </div>
      <div class="list-block">
        ${rows}
      </div>
    </section>
  `;
}

function renderProfile(person) {
  const headshot = person.headshot || {};

  profileRoot.innerHTML = `
    <article>
      <section class="profile-hero">
        <div class="photo-wrap">
          <img src="${escapeHtml(headshot.primaryUrl || person.photoUrl)}" alt="${escapeHtml(headshot.altText || person.displayName)}" />
        </div>
        <div class="profile-title">
          <p class="eyebrow">${escapeHtml(person.title)}</p>
          <h2>${escapeHtml(person.displayName)}</h2>
          <p>${escapeHtml(person.currentOffice || person.jurisdiction)} · ${escapeHtml(person.district)}</p>
          <div class="badges">
            <span class="badge">${escapeHtml(person.party)}</span>
            <span class="badge">${person.active ? "Active" : "Inactive"}</span>
            <span class="badge">Pronounced ${escapeHtml(person.pronunciation)}</span>
          </div>
        </div>
      </section>

      <section class="profile-content">
        ${renderUniversalReference(person)}
        ${renderBioLibrary(person)}
        ${renderHeadshotCard(person)}
        ${renderOfficialLinksAndContact(person)}
        ${renderCommittees(person)}
        ${renderSourceIdentityHub(person)}
        ${renderCampaignFinanceSnapshot(person)}
        ${renderProofStatus(person)}
        ${renderSourceEndpoints(person)}
      </section>
    </article>
  `;
}

function boot() {
  if (!people.length) {
    profileRoot.innerHTML = '<p class="note">No people records available.</p>';
    return;
  }

  const firstPerson = people[0];

  renderPeopleList(firstPerson.id);
  renderProfile(firstPerson);
}

boot();