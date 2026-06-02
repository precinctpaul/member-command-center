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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMissing(value) {
  if (value === null || value === undefined || value === "") {
    return '<span class="identity-value missing">Not added yet</span>';
  }

  return `<span class="identity-value">${escapeHtml(value)}</span>`;
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
        <div class="source-status">Verified</div>
      </div>
      <div class="identity-grid">
        ${rows}
      </div>
    </section>
  `;
}

function renderCoreDetails(person) {
  return `
    <section class="card">
      <div class="card-header">
        <h3>Core Profile</h3>
      </div>
      <div class="details-grid">
        <div class="detail-item">
          <div class="detail-label">Jurisdiction</div>
          <div class="detail-value">${escapeHtml(person.jurisdiction)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">District</div>
          <div class="detail-value">${escapeHtml(person.district)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Party</div>
          <div class="detail-value">${escapeHtml(person.party)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Reelection Year</div>
          <div class="detail-value">${escapeHtml(person.reelectionYear)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Birthplace</div>
          <div class="detail-value">${escapeHtml(person.birthPlace)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Family</div>
          <div class="detail-value">${escapeHtml(person.family)}</div>
        </div>
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
            <div class="list-row">
              <span>${escapeHtml(committee.source)}</span>
              <strong>${escapeHtml(committee.name)}</strong>
            </div>
          `;
        })
        .join("")
    : '<p class="note">No committee memberships added yet.</p>';

  return `
    <section class="card">
      <div class="card-header">
        <h3>Committee and Caucus Proof Slice</h3>
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
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (character) => character.toUpperCase());

      return `
        <div class="list-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card">
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
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (character) => character.toUpperCase());

      return `
        <div class="list-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card">
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
  profileRoot.innerHTML = `
    <article>
      <section class="profile-hero">
        <div class="photo-wrap">
          <img src="${escapeHtml(person.photoUrl)}" alt="${escapeHtml(person.displayName)}" />
        </div>
        <div class="profile-title">
          <p class="eyebrow">${escapeHtml(person.title)}</p>
          <h2>${escapeHtml(person.displayName)}</h2>
          <p>${escapeHtml(person.jurisdiction)} · ${escapeHtml(person.district)}</p>
          <div class="badges">
            <span class="badge">${escapeHtml(person.party)}</span>
            <span class="badge">${person.active ? "Active" : "Inactive"}</span>
            <span class="badge">Pronounced ${escapeHtml(person.pronunciation)}</span>
          </div>
        </div>
      </section>

      <section class="profile-content">
        ${renderSourceIdentityHub(person)}
        ${renderCoreDetails(person)}
        ${renderCommittees(person)}
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
