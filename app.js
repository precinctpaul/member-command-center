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

const raceContextFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "electionCycle",
    label: "Election Cycle"
  },
  {
    key: "office",
    label: "Office"
  },
  {
    key: "district",
    label: "District"
  },
  {
    key: "incumbentStatus",
    label: "Incumbent Status"
  },
  {
    key: "reelectionYear",
    label: "Reelection Year"
  },
  {
    key: "openSeatStatus",
    label: "Open Seat Status",
    wide: true
  },
  {
    key: "declaredChallengers",
    label: "Declared Challengers"
  },
  {
    key: "filingDeadline",
    label: "Filing Deadline"
  },
  {
    key: "electionRulesSource",
    label: "Election Rules Source"
  },
  {
    key: "opponentDataSource",
    label: "Opponent Data Source",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const factCheckFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "googleFactCheckQuery",
    label: "Google Fact Check Query"
  },
  {
    key: "latestProofResult",
    label: "Latest Proof Result",
    wide: true
  },
  {
    key: "sourceApi",
    label: "Source API"
  },
  {
    key: "intendedUse",
    label: "Intended Use",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const mediaTrackingFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "youtubeChannelTitle",
    label: "YouTube Channel Title"
  },
  {
    key: "youtubeChannelId",
    label: "YouTube Channel ID"
  },
  {
    key: "youtubeSearchResultsReturned",
    label: "YouTube Search Results Returned",
    format: "number"
  },
  {
    key: "officialChannelPublishedAt",
    label: "Official Channel Published"
  },
  {
    key: "publicCommentaryStatus",
    label: "Public Commentary Status"
  },
  {
    key: "sentimentStatus",
    label: "Sentiment Status",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const webClippingFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "sourceApi",
    label: "Source API"
  },
  {
    key: "queryPattern",
    label: "Query Pattern"
  },
  {
    key: "currentStatus",
    label: "Current Status"
  },
  {
    key: "intendedUse",
    label: "Intended Use",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const deepFinanceFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "receiptsEndpoint",
    label: "Receipts Endpoint"
  },
  {
    key: "disbursementsEndpoint",
    label: "Disbursements Endpoint"
  },
  {
    key: "independentExpendituresEndpoint",
    label: "Independent Expenditures Endpoint"
  },
  {
    key: "receiptsAvailable",
    label: "Receipts Available",
    format: "number"
  },
  {
    key: "disbursementsAvailable",
    label: "Disbursements Available",
    format: "number"
  },
  {
    key: "independentExpendituresAvailable",
    label: "Independent Expenditures Available",
    format: "number"
  },
  {
    key: "donorFieldsToTrack",
    label: "Donor Fields To Track",
    wide: true
  },
  {
    key: "spendingFieldsToTrack",
    label: "Spending Fields To Track",
    wide: true
  },
  {
    key: "outsideMoneyFieldsToTrack",
    label: "Outside Money Fields To Track",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const legislativeMechanicsFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "bioguideId",
    label: "Bioguide ID"
  },
  {
    key: "sponsoredLegislationCount",
    label: "Sponsored Legislation Count",
    format: "number"
  },
  {
    key: "cosponsoredLegislationStatus",
    label: "Cosponsored Legislation Status"
  },
  {
    key: "votingRecordStatus",
    label: "Voting Record Status"
  },
  {
    key: "sponsoredLegislationEndpoint",
    label: "Sponsored Legislation Endpoint",
    wide: true
  },
  {
    key: "cosponsoredLegislationEndpoint",
    label: "Cosponsored Legislation Endpoint",
    wide: true
  },
  {
    key: "votingRecordEndpointStatus",
    label: "Voting Record Endpoint Status",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const verbalRecordFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "sourceApi",
    label: "Source API"
  },
  {
    key: "primarySource",
    label: "Primary Source"
  },
  {
    key: "currentStatus",
    label: "Current Status"
  },
  {
    key: "intendedUse",
    label: "Intended Use",
    wide: true
  },
  {
    key: "parserRequirement",
    label: "Parser Requirement",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const geographyFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "district",
    label: "District"
  },
  {
    key: "state",
    label: "State"
  },
  {
    key: "googleCivicStatus",
    label: "Google Civic Status",
    wide: true
  },
  {
    key: "electionAdministrationBody",
    label: "Election Administration Body"
  },
  {
    key: "electionInfoUrl",
    label: "Election Info URL",
    wide: true
  },
  {
    key: "voterRegistrationUrl",
    label: "Voter Registration URL",
    wide: true
  },
  {
    key: "voterRegistrationConfirmationUrl",
    label: "Registration Confirmation URL",
    wide: true
  },
  {
    key: "absenteeVotingInfoUrl",
    label: "Absentee Voting Info URL",
    wide: true
  },
  {
    key: "votingLocationFinderUrl",
    label: "Voting Location Finder URL",
    wide: true
  },
  {
    key: "ballotInfoUrl",
    label: "Ballot Info URL",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const powerMappingFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "sourceApi",
    label: "Source API"
  },
  {
    key: "staffDirectoryStatus",
    label: "Staff Directory Status"
  },
  {
    key: "stakeholderDirectoryStatus",
    label: "Stakeholder Directory Status"
  },
  {
    key: "committeeGatekeeperStatus",
    label: "Committee Gatekeeper Status"
  },
  {
    key: "intendedUse",
    label: "Intended Use",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
  }
];

const alertingFields = [
  {
    key: "moduleStatus",
    label: "Module Status"
  },
  {
    key: "currentStatus",
    label: "Current Status"
  },
  {
    key: "dataSourceType",
    label: "Data Source Type"
  },
  {
    key: "alertBehavior",
    label: "Alert Behavior"
  },
  {
    key: "schedulerRequirement",
    label: "Scheduler Requirement",
    wide: true
  },
  {
    key: "suggestedPollingTargets",
    label: "Suggested Polling Targets",
    wide: true
  },
  {
    key: "implementationNote",
    label: "Implementation Note",
    wide: true
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
    .replace(/^./, (character) => character.toUpperCase())
    .replace("Youtube", "YouTube")
    .replace("Gov", "Gov");
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

function renderModuleCard(title, status, fields, sourceObject) {
  return `
    <section class="card secondary-card">
      <div class="card-header">
        <h3>${escapeHtml(title)}</h3>
        <div class="source-status">${escapeHtml(status)}</div>
      </div>
      <div class="identity-grid">
        ${renderFieldGrid(fields, sourceObject || {})}
      </div>
    </section>
  `;
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

function renderYouTubeProofVideos(person) {
  const mediaTracking = person.mediaTracking || {};
  const videos = mediaTracking.proofVideos || [];

  if (!videos.length) {
    return "";
  }

  const rows = videos
    .map((video) => {
      return `
        <div class="list-row">
          <span>${escapeHtml(video.videoId)}</span>
          <strong>${escapeHtml(video.title)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card secondary-card">
      <div class="card-header">
        <h3>YouTube Proof Videos</h3>
        <div class="source-status">Video IDs</div>
      </div>
      <div class="list-block">
        ${rows}
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