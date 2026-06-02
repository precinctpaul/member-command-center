(function () {
  const U = window.MCCUtils;

  function renderProfileBuilder({ existingPeople, onBackToProfiles, onPreviewGeneratedProfile }) {
    const profileView = document.getElementById("profileView");
    if (!profileView) return;

    profileView.innerHTML = `
      <section class="profile-hero">
        <div class="headshot-wrap">
          <div class="headshot-placeholder">
            <div class="headshot-placeholder-initials">+</div>
            <div class="headshot-placeholder-label">New profile</div>
          </div>
        </div>

        <div class="hero-content">
          <div class="hero-kicker">Profile Builder</div>
          <h2 class="profile-name">New Profile JSON</h2>
          <div class="profile-title">
            Generate, preview, and copy a profile object for <code>data/people.json</code>.  This helper does not write to disk.
          </div>

          <div class="hero-meta">
            <span class="badge partial">Local helper</span>
            <span class="badge state">Static app safe</span>
            <span class="badge other">Manual paste required</span>
            <span class="badge federal">v0.8.2</span>
          </div>
        </div>
      </section>

      <section class="section open">
        <button class="section-header" type="button">
          <span class="section-title">
            <strong>Required Identity Fields</strong>
            <span>These are the minimum useful fields for adding a new official.</span>
          </span>
          <span class="status-pill partial">Required</span>
          <span class="chevron">›</span>
        </button>

        <div class="section-body">
          <div class="grid-three">
            ${renderInput("fullName", "Full name", "Jane Smith")}
            ${renderInput("preferredName", "Preferred name", "Jane")}
            ${renderInput("title", "Title", "Representative")}

            ${renderSelect("party", "Party", [
              ["Democratic", "Democratic"],
              ["Republican", "Republican"],
              ["Independent", "Independent"],
              ["Other", "Other"]
            ])}

            ${renderSelect("officeType", "Office type", [
              ["Federal", "Federal"],
              ["State", "State"]
            ])}

            ${renderInput("state", "State", "NC")}

            ${renderInput("district", "District", "NC-01")}
            ${renderInput("jurisdiction", "Jurisdiction", "United States House of Representatives")}
            ${renderInput("currentOffice", "Current office", "U.S. Representative for North Carolina's 1st Congressional District")}
          </div>
        </div>
      </section>

      <section class="section open">
        <button class="section-header" type="button">
          <span class="section-title">
            <strong>Useful Source Fields</strong>
            <span>Add whatever IDs or links you already have.  Missing fields stay safely blank.</span>
          </span>
          <span class="status-pill api">Optional</span>
          <span class="chevron">›</span>
        </button>

        <div class="section-body">
          <div class="grid-three">
            ${renderInput("officialWebsite", "Official website", "https://example.house.gov")}
            ${renderInput("campaignWebsite", "Campaign website", "https://example.com")}
            ${renderInput("policyNoteSearch", "PolicyNote search URL", "https://data.policynote.com/v1/people/search?name=Jane%20Smith")}

            ${renderInput("headshotUrl", "Headshot URL", "https://example.com/headshot.jpg")}
            ${renderInput("bioguideId", "Bioguide ID", "A000000")}
            ${renderInput("fecCandidateId", "FEC Candidate ID", "H0NC00000")}

            ${renderInput("fecPrincipalCommitteeId", "FEC principal committee ID", "C00000000")}
            ${renderInput("policyNotePersonId", "PolicyNote person ID", "abc123")}
            ${renderInput("policyNoteEntityId", "PolicyNote entity ID", "legislator-00000000")}

            ${renderInput("googleKnowledgeGraphMid", "Google Knowledge Graph MID", "kg:/g/...")}
            ${renderInput("youtubeChannelId", "YouTube channel ID", "UC...")}
            ${renderInput("openStatesPersonId", "OpenStates person ID", "ocd-person/...")}
          </div>

          <div style="height: 14px"></div>

          <div class="info-card">
            <div class="info-label">Builder notes</div>
            <textarea
              id="builderNotes"
              class="search-input"
              rows="5"
              placeholder="Add research notes, known gaps, source cautions, or next steps."
              style="resize: vertical; min-height: 110px;"
            ></textarea>
          </div>
        </div>
      </section>

      <section class="section open">
        <button class="section-header" type="button">
          <span class="section-title">
            <strong>Builder Status</strong>
            <span>Checks whether the generated object is safe enough to paste into <code>people.json</code>.</span>
          </span>
          <span id="builderStatusPill" class="status-pill partial">Checking</span>
          <span class="chevron">›</span>
        </button>

        <div class="section-body">
          <div id="builderValidationSummary" class="empty">
            Fill in the identity fields to generate a stronger profile shell.
          </div>

          <div style="height: 14px"></div>

          <div class="grid-three">
            <button id="previewGeneratedProfileButton" class="secondary-button" type="button">
              Preview Generated Profile
            </button>

            <button id="generateProfileJsonButton" class="secondary-button" type="button">
              Generate JSON
            </button>

            <button id="copyProfileJsonButton" class="secondary-button" type="button">
              Copy JSON Object
            </button>
          </div>

          <div style="height: 10px"></div>

          <div class="grid-three">
            <button id="copyProfileJsonWithCommaButton" class="secondary-button" type="button">
              Copy With Leading Comma
            </button>

            <button id="selectGeneratedJsonButton" class="secondary-button" type="button">
              Select JSON Text
            </button>

            <button id="clearBuilderButton" class="secondary-button" type="button">
              Clear Builder
            </button>
          </div>

          <div style="height: 10px"></div>

          <button id="backToProfilesButton" class="secondary-button" type="button">
            Back to Profiles
          </button>
        </div>
      </section>

      <section class="section open">
        <button class="section-header" type="button">
          <span class="section-title">
            <strong>Generated JSON</strong>
            <span>Paste this object into the top-level array in <code>data/people.json</code>.</span>
          </span>
          <span class="status-pill api">Output</span>
          <span class="chevron">›</span>
        </button>

        <div class="section-body">
          <div class="empty">
            Manual paste workflow: open <code>data\\people.json</code>, add a comma after the previous profile object, paste this object, save, then hard refresh the browser.  Use “Copy With Leading Comma” when pasting after the last existing object.
          </div>

          <div style="height: 14px"></div>

          <pre id="generatedProfileJson" class="info-card" style="white-space: pre-wrap; overflow: auto; max-height: 720px;"></pre>
        </div>
      </section>
    `;

    bindBuilderEvents({
      existingPeople,
      onBackToProfiles,
      onPreviewGeneratedProfile
    });

    generateAndDisplayJson(existingPeople);
  }

  function renderInput(id, label, placeholder) {
    return `
      <div class="info-card">
        <label class="info-label" for="${U.escapeAttribute(id)}">${U.escapeHtml(label)}</label>
        <input
          id="${U.escapeAttribute(id)}"
          class="search-input"
          type="text"
          placeholder="${U.escapeAttribute(placeholder)}"
          autocomplete="off"
        />
      </div>
    `;
  }

  function renderSelect(id, label, options) {
    return `
      <div class="info-card">
        <label class="info-label" for="${U.escapeAttribute(id)}">${U.escapeHtml(label)}</label>
        <select id="${U.escapeAttribute(id)}" class="filter-select">
          ${options.map(([value, text]) => `
            <option value="${U.escapeAttribute(value)}">${U.escapeHtml(text)}</option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function bindBuilderEvents({ existingPeople, onBackToProfiles, onPreviewGeneratedProfile }) {
    const generateButton = document.getElementById("generateProfileJsonButton");
    const copyButton = document.getElementById("copyProfileJsonButton");
    const copyWithCommaButton = document.getElementById("copyProfileJsonWithCommaButton");
    const previewButton = document.getElementById("previewGeneratedProfileButton");
    const backButton = document.getElementById("backToProfilesButton");
    const clearButton = document.getElementById("clearBuilderButton");
    const selectButton = document.getElementById("selectGeneratedJsonButton");

    getBuilderFieldIds().forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (!field) return;

      field.addEventListener("input", () => {
        generateAndDisplayJson(existingPeople);
      });

      field.addEventListener("change", () => {
        generateAndDisplayJson(existingPeople);
      });
    });

    if (generateButton) {
      generateButton.addEventListener("click", () => {
        generateAndDisplayJson(existingPeople);
      });
    }

    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        await copyGeneratedJson({ includeLeadingComma: false, button: copyButton });
      });
    }

    if (copyWithCommaButton) {
      copyWithCommaButton.addEventListener("click", async () => {
        await copyGeneratedJson({ includeLeadingComma: true, button: copyWithCommaButton });
      });
    }

    if (previewButton) {
      previewButton.addEventListener("click", () => {
        const profile = buildProfileObject(existingPeople);
        onPreviewGeneratedProfile(profile);
      });
    }

    if (backButton) {
      backButton.addEventListener("click", () => {
        onBackToProfiles();
      });
    }

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        clearBuilder(existingPeople);
      });
    }

    if (selectButton) {
      selectButton.addEventListener("click", () => {
        selectGeneratedJson();
      });
    }

    document.querySelectorAll(".section-header").forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.closest(".section");
        if (section) section.classList.toggle("open");
      });
    });
  }

  function getBuilderFieldIds() {
    return [
      "fullName",
      "preferredName",
      "title",
      "party",
      "officeType",
      "state",
      "district",
      "jurisdiction",
      "currentOffice",
      "officialWebsite",
      "campaignWebsite",
      "policyNoteSearch",
      "headshotUrl",
      "bioguideId",
      "fecCandidateId",
      "fecPrincipalCommitteeId",
      "policyNotePersonId",
      "policyNoteEntityId",
      "googleKnowledgeGraphMid",
      "youtubeChannelId",
      "openStatesPersonId",
      "builderNotes"
    ];
  }

  async function copyGeneratedJson({ includeLeadingComma, button }) {
    const output = document.getElementById("generatedProfileJson");
    const text = output ? output.textContent : "";
    const copyText = includeLeadingComma ? `,\n${text}` : text;

    try {
      await navigator.clipboard.writeText(copyText);
      const originalText = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = originalText;
      }, 1200);
    } catch (error) {
      console.error("Copy failed", error);
      button.textContent = "Copy failed";
      setTimeout(() => {
        button.textContent = includeLeadingComma ? "Copy With Leading Comma" : "Copy JSON Object";
      }, 1200);
    }
  }

  function clearBuilder(existingPeople) {
    getBuilderFieldIds().forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (!field) return;

      if (field.tagName === "SELECT") {
        if (fieldId === "party") field.value = "Democratic";
        if (fieldId === "officeType") field.value = "Federal";
        return;
      }

      field.value = "";
    });

    generateAndDisplayJson(existingPeople);
  }

  function selectGeneratedJson() {
    const output = document.getElementById("generatedProfileJson");
    if (!output) return;

    const range = document.createRange();
    range.selectNodeContents(output);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function generateAndDisplayJson(existingPeople) {
    const output = document.getElementById("generatedProfileJson");
    if (!output) return;

    const profile = buildProfileObject(existingPeople);
    output.textContent = JSON.stringify(profile, null, 2);

    updateBuilderValidation(profile, existingPeople);
  }

  function updateBuilderValidation(profile, existingPeople) {
    const summary = document.getElementById("builderValidationSummary");
    const pill = document.getElementById("builderStatusPill");

    if (!summary || !pill) return;

    const issues = getBuilderIssues(profile, existingPeople);

    if (!issues.length) {
      summary.innerHTML = `
        <strong>Ready to paste.</strong>
        This generated profile has the minimum identity fields, a unique ID, and valid JSON structure.
      `;
      pill.className = "status-pill ready";
      pill.textContent = "Ready";
      return;
    }

    summary.innerHTML = `
      <strong>${issues.length} item${issues.length === 1 ? "" : "s"} to review before paste:</strong>
      <div style="height: 8px"></div>
      <div class="list">
        ${issues.map((issue) => `
          <div class="list-item">
            <strong>${U.escapeHtml(issue.label)}</strong>
            <p>${U.escapeHtml(issue.value)}</p>
          </div>
        `).join("")}
      </div>
    `;

    pill.className = issues.some((issue) => issue.severity === "blocking")
      ? "status-pill missing"
      : "status-pill partial";

    pill.textContent = issues.some((issue) => issue.severity === "blocking")
      ? "Needs fixes"
      : "Review";
  }

  function getBuilderIssues(profile, existingPeople) {
    const issues = [];

    if (!profile.fullName || profile.fullName === "New Profile") {
      issues.push({
        label: "Full name missing",
        value: "Add the official or preferred public name before pasting into people.json.",
        severity: "blocking"
      });
    }

    if (!profile.title) {
      issues.push({
        label: "Title missing",
        value: "Add a role such as Representative, Senator, Assemblymember, Governor, or Candidate.",
        severity: "blocking"
      });
    }

    if (!profile.state) {
      issues.push({
        label: "State missing",
        value: "Add a two-letter state abbreviation where possible.",
        severity: "blocking"
      });
    }

    if (!profile.district) {
      issues.push({
        label: "District missing",
        value: "Add a district like NC-01, CA-14, statewide, or leave intentionally blank only when appropriate.",
        severity: "warning"
      });
    }

    if (!profile.officialLinks.officialWebsite) {
      issues.push({
        label: "Official website missing",
        value: "The profile can be pasted without it, but source confidence will be weaker.",
        severity: "warning"
      });
    }

    if (!profile.headshot.primaryUrl) {
      issues.push({
        label: "Headshot missing",
        value: "The app will show initials until an official or campaign-approved image URL is added.",
        severity: "warning"
      });
    }

    const existingIds = new Set((existingPeople || []).map((person) => String(person.id || "")));
    if (existingIds.has(profile.id)) {
      issues.push({
        label: "Duplicate profile ID",
        value: `The generated ID "${profile.id}" already exists. Change the full name or manually edit the ID.`,
        severity: "blocking"
      });
    }

    return issues;
  }

  function buildProfileObject(existingPeople) {
    const fullName = readField("fullName");
    const preferredName = readField("preferredName") || getFirstName(fullName);
    const title = readField("title");
    const party = readField("party");
    const officeType = readField("officeType");
    const state = readField("state").toUpperCase();
    const district = readField("district").toUpperCase();
    const jurisdiction = readField("jurisdiction");
    const currentOffice = readField("currentOffice");
    const officialWebsite = readField("officialWebsite");
    const campaignWebsite = readField("campaignWebsite");
    const policyNoteSearch = readField("policyNoteSearch");
    const headshotUrl = readField("headshotUrl");
    const bioguideId = readField("bioguideId");
    const fecCandidateId = readField("fecCandidateId");
    const fecPrincipalCommitteeId = readField("fecPrincipalCommitteeId");
    const policyNotePersonId = readField("policyNotePersonId");
    const policyNoteEntityId = readField("policyNoteEntityId");
    const googleKnowledgeGraphMid = readField("googleKnowledgeGraphMid");
    const youtubeChannelId = readField("youtubeChannelId");
    const openStatesPersonId = readField("openStatesPersonId");
    const notes = readField("builderNotes");

    const fallbackName = fullName || "New Profile";
    const id = buildUniqueId(U.slugify(fallbackName), existingPeople);
    const generatedAt = getTodayIsoDate();

    return {
      id,
      displayName: fallbackName,
      preferredName,
      fullName: fallbackName,
      title,
      party,
      district,
      state,
      officeType,
      jurisdiction,
      currentOffice,
      active: true,
      reelectionYear: null,
      pronunciation: "",
      birthPlace: "",
      birthday: "",
      family: "",
      photoUrl: headshotUrl,

      profileCompletion: {
        universalReference: hasAnyValue([
          bioguideId,
          fecCandidateId,
          fecPrincipalCommitteeId,
          policyNotePersonId,
          policyNoteEntityId,
          googleKnowledgeGraphMid,
          youtubeChannelId,
          openStatesPersonId
        ]) ? "Partial" : "Not started",
        bioLibrary: "Partial",
        headshot: headshotUrl ? "Partial" : "Missing",
        contact: officialWebsite || campaignWebsite || policyNoteSearch ? "Partial" : "Not started",
        committees: "Not started",
        sourceIds: hasAnyValue([
          bioguideId,
          fecCandidateId,
          fecPrincipalCommitteeId,
          policyNotePersonId,
          policyNoteEntityId,
          googleKnowledgeGraphMid,
          youtubeChannelId,
          openStatesPersonId
        ]) ? "Partial" : "Not started",
        intelligence: "Not started",
        dataQuality: "Partial",
        sourceTracking: policyNoteSearch || officialWebsite || campaignWebsite ? "Partial" : "Not started"
      },

      headshot: {
        primaryUrl: headshotUrl,
        source: headshotUrl ? "Builder input" : "",
        altText: fallbackName ? `Headshot of ${fallbackName}` : "",
        usageNote: headshotUrl
          ? "Verify image rights and source before production use."
          : "Missing. Add an official or campaign-approved image URL."
      },

      bio: {
        oneLine: buildOneLineBio({
          fullName: fallbackName,
          party,
          title,
          officeType,
          district,
          state
        }),
        short: "",
        standard: "",
        long: "",
        plainEnglish: ""
      },

      universalProfile: {
        preferredName,
        fullName: fallbackName,
        title,
        party,
        district,
        jurisdiction,
        currentOffice,
        activeStatus: "Active",
        reelectionYear: "",
        pronunciation: "",
        birthday: "",
        birthplace: "",
        family: ""
      },

      officialLinks: {
        officialWebsite,
        contactForm: "",
        campaignWebsite,
        congressGovProfile: "",
        ballotpedia: "",
        wikipedia: "",
        youtubeChannelTitle: "",
        youtubeChannelId,
        policyNoteSearch
      },

      phones: [],
      offices: [],
      webHandles: buildWebHandles({
        officialWebsite,
        campaignWebsite,
        policyNoteSearch
      }),

      committees: [],
      caucuses: [],

      sourceIdentity: {
        bioguideId,
        fecCandidateId,
        fecPrincipalCommitteeId,
        policyNotePersonId,
        policyNoteEntityId,
        googleKnowledgeGraphMid,
        youtubeChannelId,
        openStatesPersonId,
        stateLegislatureId: "",
        stateCampaignFinanceId: ""
      },

      dataQualityNotes: buildDataQualityNotes({
        fullName: fallbackName,
        officeType,
        officialWebsite,
        policyNoteSearch,
        headshotUrl,
        notes,
        generatedAt
      }),

      sourceTracking: buildSourceTracking({
        officialWebsite,
        campaignWebsite,
        policyNoteSearch,
        headshotUrl,
        generatedAt
      }),

      campaignFinanceSnapshot: {
        committeeName: "",
        fecCandidateId,
        fecPrincipalCommitteeId,
        itemizedReceiptsReturned: "",
        itemizedDisbursementsReturned: "",
        independentExpendituresReturned: "",
        latestReceiptDateSeen: "",
        latestDisbursementDateSeen: "",
        outsideSpenderProofExample: "",
        proofNotes: officeType === "State"
          ? "State-level campaign finance should be handled separately from federal OpenFEC records."
          : ""
      },

      raceContext: {
        moduleStatus: "Not started",
        electionCycle: "",
        office: title,
        district,
        incumbentStatus: "",
        reelectionYear: "",
        openSeatStatus: "",
        declaredChallengers: "Not populated yet",
        filingDeadline: "Not populated yet",
        electionRulesSource: "",
        opponentDataSource: "",
        implementationNote: officeType === "State"
          ? "State-level election context requires state election sources."
          : "Federal election context can be expanded with FEC, district, and election authority data."
      },

      factCheckIndex: {
        moduleStatus: "Not started",
        googleFactCheckQuery: fallbackName,
        latestProofResult: "",
        sourceApi: "Google Fact Check Tools API",
        intendedUse: "Track verified third-party fact-checks of claims made by or about the official.",
        implementationNote: "Not populated yet."
      },

      mediaTracking: {
        moduleStatus: "Not started",
        youtubeChannelTitle: "",
        youtubeChannelId,
        youtubeSearchResultsReturned: "",
        officialChannelPublishedAt: "",
        proofVideos: [],
        publicCommentaryStatus: "Not populated yet",
        sentimentStatus: "Requires separate sentiment analysis layer",
        implementationNote: "Not populated yet."
      },

      webClippings: {
        moduleStatus: "Not started",
        sourceApi: "Google Custom Search JSON API",
        queryPattern: fallbackName,
        currentStatus: "Not populated yet",
        intendedUse: "Track public web mentions, news clips, interviews, releases, and other searchable web results.",
        implementationNote: "Not populated yet."
      },

      deepCampaignFinance: {
        moduleStatus: officeType === "State" ? "State source required" : "Not started",
        receiptsEndpoint: "",
        disbursementsEndpoint: "",
        independentExpendituresEndpoint: "",
        receiptsAvailable: "",
        disbursementsAvailable: "",
        independentExpendituresAvailable: "",
        donorFieldsToTrack: "",
        spendingFieldsToTrack: "",
        outsideMoneyFieldsToTrack: "",
        implementationNote: officeType === "State"
          ? "Do not use federal OpenFEC assumptions for this profile."
          : "Federal campaign finance can be connected through OpenFEC once FEC IDs are added."
      },

      legislativeMechanics: {
        moduleStatus: "Not started",
        bioguideId,
        sponsoredLegislationCount: "",
        cosponsoredLegislationStatus: "",
        votingRecordStatus: "",
        sponsoredLegislationEndpoint: bioguideId ? `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation` : "",
        cosponsoredLegislationEndpoint: bioguideId ? `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation` : "",
        votingRecordEndpointStatus: officeType === "State"
          ? "Needs state legislative source wiring"
          : "Needs Congress.gov wiring",
        implementationNote: officeType === "State"
          ? "State legislative tracking will need a state source, not Congress.gov."
          : "Federal legislative tracking can use Congress.gov once Bioguide ID is added."
      },

      verbalRecords: {
        moduleStatus: "Not started",
        sourceApi: "",
        primarySource: "",
        currentStatus: "",
        intendedUse: "Track floor speeches, remarks, debate participation, and verbal mentions.",
        parserRequirement: "",
        implementationNote: "Not populated yet."
      },

      politicalGeography: {
        moduleStatus: "Not started",
        district,
        state,
        googleCivicStatus: "",
        electionAdministrationBody: "",
        electionInfoUrl: "",
        voterRegistrationUrl: "",
        voterRegistrationConfirmationUrl: "",
        absenteeVotingInfoUrl: "",
        votingLocationFinderUrl: "",
        ballotInfoUrl: "",
        implementationNote: "Not populated yet."
      },

      powerMapping: {
        moduleStatus: "Not started",
        sourceApi: "",
        staffDirectoryStatus: "Not populated yet",
        stakeholderDirectoryStatus: "Not populated yet",
        committeeGatekeeperStatus: "Not populated yet",
        intendedUse: "Track staffers, aides, committee staff, caucus contacts, and stakeholder relationships connected to the official.",
        implementationNote: "Not populated yet."
      },

      alertingInfrastructure: {
        moduleStatus: "Scaffolded",
        currentStatus: "Not live",
        dataSourceType: "REST APIs",
        alertBehavior: "Requires scheduled polling",
        schedulerRequirement: "REST APIs do not push updates automatically. A scheduled task or backend worker must poll APIs and compare new results against stored prior results.",
        suggestedPollingTargets: officeType === "State"
          ? "State legislative updates, state campaign filings, Google Fact Check claims, YouTube videos/comments, Custom Search results, PolicyNote updates"
          : "Congress.gov actions, OpenFEC filings, Google Fact Check claims, YouTube videos/comments, Custom Search results, GovInfo packages, PolicyNote updates",
        implementationNote: "Alerts should be generated from detected changes, not from page refreshes."
      },

      sourceEndpoints: buildSourceEndpoints({
        fullName: fallbackName,
        policyNoteSearch,
        bioguideId,
        fecCandidateId,
        fecPrincipalCommitteeId
      }),

      proofStatus: {
        identityHub: "Generated shell",
        universalProfile: "Generated shell",
        biography: "Needs research",
        headshot: headshotUrl ? "Needs image-rights verification" : "Missing",
        officialLinks: officialWebsite || campaignWebsite ? "Partial" : "Not started",
        committees: "Not started",
        raceContext: "Not started",
        factCheckIndex: "Not started",
        mediaTracking: "Not started",
        deepCampaignFinance: officeType === "State" ? "State source required" : "Not started",
        legislativeMechanics: officeType === "State" ? "State source required" : "Not started",
        verbalRecords: "Not started",
        politicalGeography: "Not started",
        powerMapping: "Not started",
        alertingInfrastructure: "Polling required"
      }
    };
  }

  function readField(id) {
    const element = document.getElementById(id);
    return element ? element.value.trim() : "";
  }

  function getFirstName(fullName) {
    return String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] || "";
  }

  function buildUniqueId(baseId, existingPeople) {
    const safeBase = baseId || "new-profile";
    const existingIds = new Set((existingPeople || []).map((person) => String(person.id || "")));

    if (!existingIds.has(safeBase)) {
      return safeBase;
    }

    let counter = 2;
    let nextId = `${safeBase}-${counter}`;

    while (existingIds.has(nextId)) {
      counter += 1;
      nextId = `${safeBase}-${counter}`;
    }

    return nextId;
  }

  function buildOneLineBio({ fullName, party, title, officeType, district, state }) {
    if (!fullName || !title) return "";

    const article = startsWithVowelSound(title) ? "an" : "a";
    const partyText = party ? `${party} ` : "";
    const officeText = officeType === "State"
      ? `${title}${district || state ? ` for ${district || state}` : ""}`
      : `${title}${district ? ` for ${district}` : ""}`;

    return `${fullName} is ${article} ${partyText}${officeText}.`;
  }

  function startsWithVowelSound(value) {
    return /^[aeiou]/i.test(String(value || "").trim());
  }

  function buildWebHandles({ officialWebsite, campaignWebsite, policyNoteSearch }) {
    const handles = [];

    if (officialWebsite) {
      handles.push({
        label: "Official Website",
        value: officialWebsite
      });
    }

    if (campaignWebsite) {
      handles.push({
        label: "Campaign Website",
        value: campaignWebsite
      });
    }

    if (policyNoteSearch) {
      handles.push({
        label: "PolicyNote Search",
        value: policyNoteSearch
      });
    }

    return handles;
  }

  function buildDataQualityNotes({ fullName, officeType, officialWebsite, policyNoteSearch, headshotUrl, notes, generatedAt }) {
    const qualityNotes = [
      {
        label: "Generated shell profile",
        value: "This profile was created with the local profile builder and still needs source verification.",
        severity: "note",
        owner: "research",
        lastChecked: generatedAt
      },
      {
        label: "Committee data missing",
        value: "Committee and caucus data has not been populated.",
        severity: "warning",
        owner: "research",
        lastChecked: generatedAt
      }
    ];

    if (!headshotUrl) {
      qualityNotes.push({
        label: "Missing headshot",
        value: "Add an official or campaign-approved image URL.",
        severity: "warning",
        owner: "research",
        lastChecked: generatedAt
      });
    }

    if (officeType === "State") {
      qualityNotes.push({
        label: "State-level profile",
        value: "Do not assume federal IDs, Congress.gov records, or OpenFEC coverage apply.",
        severity: "note",
        owner: "research",
        lastChecked: generatedAt
      });
    }

    if (!officialWebsite) {
      qualityNotes.push({
        label: "Official website missing",
        value: "Add and verify the official government website.",
        severity: "warning",
        owner: "research",
        lastChecked: generatedAt
      });
    }

    if (!policyNoteSearch) {
      qualityNotes.push({
        label: "PolicyNote search missing",
        value: "Add a PolicyNote search URL or relevant source lookup path.",
        severity: "note",
        owner: "research",
        lastChecked: generatedAt
      });
    }

    if (notes) {
      qualityNotes.push({
        label: "Builder notes",
        value: notes,
        severity: "note",
        owner: "research",
        lastChecked: generatedAt
      });
    }

    if (!fullName || fullName === "New Profile") {
      qualityNotes.push({
        label: "Name missing",
        value: "Replace placeholder name before adding this profile to people.json.",
        severity: "warning",
        owner: "research",
        lastChecked: generatedAt
      });
    }

    return qualityNotes;
  }

  function buildSourceTracking({ officialWebsite, campaignWebsite, policyNoteSearch, headshotUrl, generatedAt }) {
    const sources = [
      {
        label: "Profile builder",
        value: "Generated locally in Member Command Center.",
        type: "local-builder",
        sourceName: "Member Command Center",
        sourceUrl: "",
        lastChecked: generatedAt,
        confidence: "Low"
      }
    ];

    if (officialWebsite) {
      sources.push({
        label: "Official website",
        value: officialWebsite,
        type: "official-site",
        sourceName: "Official website",
        sourceUrl: officialWebsite,
        lastChecked: generatedAt,
        confidence: "Needs verification"
      });
    }

    if (campaignWebsite) {
      sources.push({
        label: "Campaign website",
        value: campaignWebsite,
        type: "campaign-site",
        sourceName: "Campaign website",
        sourceUrl: campaignWebsite,
        lastChecked: generatedAt,
        confidence: "Needs verification"
      });
    }

    if (policyNoteSearch) {
      sources.push({
        label: "PolicyNote search",
        value: policyNoteSearch,
        type: "api-search",
        sourceName: "PolicyNote",
        sourceUrl: policyNoteSearch,
        lastChecked: generatedAt,
        confidence: "Needs verification"
      });
    }

    if (headshotUrl) {
      sources.push({
        label: "Headshot URL",
        value: headshotUrl,
        type: "media-asset",
        sourceName: "Builder input",
        sourceUrl: headshotUrl,
        lastChecked: generatedAt,
        confidence: "Needs rights verification"
      });
    }

    return sources;
  }

  function buildSourceEndpoints({ fullName, policyNoteSearch, bioguideId, fecCandidateId, fecPrincipalCommitteeId }) {
    const encodedName = encodeURIComponent(fullName || "");

    return {
      congressSponsoredLegislation: bioguideId ? `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation` : "",
      congressCosponsoredLegislation: bioguideId ? `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation` : "",
      fecReceipts: fecPrincipalCommitteeId ? `https://api.open.fec.gov/v1/schedules/schedule_a/?committee_id=${fecPrincipalCommitteeId}` : "",
      fecDisbursements: fecPrincipalCommitteeId ? `https://api.open.fec.gov/v1/schedules/schedule_b/?committee_id=${fecPrincipalCommitteeId}` : "",
      fecIndependentExpenditures: fecCandidateId ? `https://api.open.fec.gov/v1/schedules/schedule_e/?candidate_id=${fecCandidateId}` : "",
      policyNoteSearch: policyNoteSearch || (encodedName ? `https://data.policynote.com/v1/people/search?name=${encodedName}` : ""),
      googleFactCheckSearch: encodedName ? `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodedName}` : "",
      googleCivicVoterInfo: "https://www.googleapis.com/civicinfo/v2/voterinfo",
      youtubeSearch: "https://www.googleapis.com/youtube/v3/search",
      googleCustomSearch: "https://www.googleapis.com/customsearch/v1"
    };
  }

  function hasAnyValue(values) {
    return values.some((value) => U.hasContent(value));
  }

  function getTodayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  window.MCCBuilder = {
    renderProfileBuilder
  };
})();