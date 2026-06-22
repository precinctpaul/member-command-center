(function () {
  const U = window.MCCUtils;
  const S = window.MCCStatus;

  function renderProfileList({ people, activePersonId, onSelect }) {
    const profileList = document.getElementById("profileList");
    if (!profileList) return;

    if (people.length === 0) {
      profileList.innerHTML = `
        <div class="no-results">
          No profiles match the current search and filters.
        </div>
      `;
      return;
    }

    profileList.innerHTML = people
      .map((person) => {
        const isActive = person.id === activePersonId ? "active" : "";

        return `
          <button class="profile-button ${isActive}" type="button" data-profile-id="${U.escapeAttribute(person.id)}">
            <div class="profile-button-top">
              <div>
                <div class="profile-button-name">${U.escapeHtml(person.name)}</div>
                <div class="profile-button-title">${U.escapeHtml(person.title || person.office || "Profile")}</div>
              </div>
            </div>

            <div class="profile-badges">
              <span class="badge ${U.escapeAttribute(person.officeTypeNormalized)}">${U.escapeHtml(U.toTitleCase(person.officeTypeNormalized))}</span>
              <span class="badge ${U.escapeAttribute(person.partyNormalized)}">${U.escapeHtml(person.partyLabel)}</span>
              <span class="badge ${U.escapeAttribute(person.completionNormalized)}">${U.escapeHtml(person.completionLabel)}</span>
            </div>
          </button>
        `;
      })
      .join("");

    profileList.querySelectorAll("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", () => {
        onSelect(button.getAttribute("data-profile-id"));
      });
    });
  }

  function renderFilterSummary({ total, visible }) {
    const filterSummary = document.getElementById("filterSummary");
    if (!filterSummary) return;

    filterSummary.textContent = `${visible} of ${total} profiles visible`;
  }

  function renderProfileView(person) {
    const profileView = document.getElementById("profileView");
    if (!profileView) return;

    if (!person) {
      profileView.innerHTML = `
        <div class="state-card">
          <h2>No profile selected</h2>
          <p>Adjust the search or filters to show matching profiles.</p>
        </div>
      `;
      return;
    }

    profileView.innerHTML = `
      ${renderHero(person)}
      ${renderQuickFacts(person)}
      ${renderSourceOfTruth(person)}
      ${renderSectionNav()}
      ${renderProfileCompletion(person)}
      ${renderUniversalReference(person)}
      ${renderBioLibrary(person)}
      ${renderHeadshotAndMedia(person)}
      ${renderOfficialLinksAndContact(person)}
      ${renderCommitteesAndCaucuses(person)}
      ${renderDataQualityNotes(person)}
      ${renderSourceTracking(person)}
      ${renderAdvancedSections(person)}
    `;

    bindSectionToggles();
    bindCopyButtons();
    bindBrokenHeadshotFallbacks();
    mountGreenEasyWinsPanel(person);
  }

  function renderHero(person) {
    const initials = U.getInitials(person.name);
    const headshot = U.getFirstValue(
      person.headshotUrl,
      person.photoUrl,
      person.headshot?.primaryUrl,
      person.headshot,
      person.media?.headshotUrl,
      person.media?.headshot
    );

    const headshotHtml = typeof headshot === "string" && U.hasContent(headshot)
      ? `<img src="${U.escapeAttribute(headshot)}" alt="${U.escapeAttribute(person.name)} headshot" data-headshot-initials="${U.escapeAttribute(initials)}" />`
      : renderHeadshotPlaceholder(initials);

    return `
      <section class="profile-hero">
        <div class="headshot-wrap">
          ${headshotHtml}
        </div>

        <div class="hero-content">
          <div class="hero-kicker">${U.escapeHtml(person.officeTypeLabel)} Profile</div>
          <h2 class="profile-name">${U.escapeHtml(person.name)}</h2>
          <div class="profile-title">${U.escapeHtml(person.title || person.office || person.currentOffice || "Elected official")}</div>

          <div class="hero-meta">
            <span class="badge ${U.escapeAttribute(person.officeTypeNormalized)}">${U.escapeHtml(person.officeTypeLabel)}</span>
            <span class="badge ${U.escapeAttribute(person.partyNormalized)}">${U.escapeHtml(person.partyLabel)}</span>
            <span class="badge ${U.escapeAttribute(person.completionNormalized)}">${U.escapeHtml(person.completionLabel)}</span>
            ${person.district ? `<span class="badge">${U.escapeHtml(person.district)}</span>` : ""}
            ${person.state ? `<span class="badge">${U.escapeHtml(person.state)}</span>` : ""}
          </div>
        </div>
      </section>
    `;
  }

  function renderHeadshotPlaceholder(initials) {
    return `
      <div class="headshot-placeholder">
        <div class="headshot-placeholder-initials">${U.escapeHtml(initials || "NA")}</div>
        <div class="headshot-placeholder-label">No image</div>
      </div>
    `;
  }

  function bindBrokenHeadshotFallbacks() {
    document.querySelectorAll("[data-headshot-initials]").forEach((image) => {
      image.addEventListener("error", () => {
        const initials = image.getAttribute("data-headshot-initials") || "NA";
        image.outerHTML = renderHeadshotPlaceholder(initials);
      });
    });
  }

  function renderQuickFacts(person) {
    const universalStatus = S.getSectionStatus(person, "Universal Reference");
    const bioStatus = S.getSectionStatus(person, "Bio Library");
    const mediaStatus = S.getSectionStatus(person, "Headshot and Media Asset");
    const financeStatus = S.getSectionStatus(person, "Campaign Finance Snapshot");

    return `
      <section class="quick-facts" aria-label="Quick facts">
        <div class="quick-fact-card">
          <div class="quick-fact-label">Completion</div>
          <div class="quick-fact-value">${U.escapeHtml(person.completionScore)}%</div>
        </div>

        <div class="quick-fact-card">
          <div class="quick-fact-label">Office type</div>
          <div class="quick-fact-value">${U.escapeHtml(person.officeTypeLabel)}</div>
        </div>

        <div class="quick-fact-card">
          <div class="quick-fact-label">Universal IDs</div>
          <div class="quick-fact-value">${renderStatusPill(universalStatus)}</div>
        </div>

        <div class="quick-fact-card">
          <div class="quick-fact-label">Bio and media</div>
          <div class="quick-fact-value">${renderStatusPill(S.mergeStatuses([bioStatus, mediaStatus]))}</div>
        </div>

        <div class="quick-fact-card">
          <div class="quick-fact-label">Finance</div>
          <div class="quick-fact-value">${renderStatusPill(financeStatus)}</div>
        </div>
      </section>
    `;
  }

  function renderSourceOfTruth(person) {
    const record = buildCanonicalRecordSummary(person);
    const verification = record.verification;
    const identity = record.canonical_identity;
    const links = record.links;
    const socials = record.socials;
    const brand = record.brand_assets;

    const identityRows = [
      ["Name", record.display_name],
      ["Title", identity.title],
      ["Office", identity.office],
      ["State", identity.state],
      ["District", identity.district],
      ["Group", identity.roster_group || identity.category]
    ];

    const linkRows = [
      ["Official", links.official_website],
      ["Campaign", links.campaign_website],
      ["Congress.gov", links.congress_gov_profile],
      ["OpenStates", links.openstates_profile],
      ["FEC/OpenFEC", links.fec_profile]
    ];

    const socialRows = [
      ["X", socials.x],
      ["Facebook", socials.facebook],
      ["Instagram", socials.instagram],
      ["Threads", socials.threads],
      ["YouTube", socials.youtube],
      ["TikTok", socials.tiktok],
      ["Bluesky", socials.bluesky],
      ["LinkedIn", socials.linkedin]
    ].filter(([, value]) => hasTruthValue(value));

    const missingFieldsHtml = verification.missing_core_fields.length
      ? renderCompactChipList(verification.missing_core_fields.map((field) => U.humanizeKey(field)))
      : `<div class="empty">No missing core field flagged.</div>`;

    const needsReviewHtml = verification.needs_review_fields.length
      ? renderCompactChipList(verification.needs_review_fields.map((field) => U.humanizeKey(field)))
      : `<div class="empty">No review field flagged.</div>`;

    const assetSummary = hasTruthValue(brand.status) && brand.status !== "missing"
      ? renderCompactChipList([
          `Logos: ${brand.logos.length}`,
          `Fonts: ${brand.fonts.length}`,
          `Colors: ${brand.colors.length}`,
          `Templates: ${brand.templates.length}`
        ])
      : `<div class="empty">No approved asset on file.</div>`;

    return renderSection({
      title: "Source of Truth",
      subtitle: "Canonical Member Record for staff use.",
      open: true,
      status: statusPillForCanonical(record.verification.overall_status),
      body: `
        <div class="source-truth-summary">
          <div class="source-truth-card">
            <div class="source-truth-card-title">
              <span>Identity / Office</span>
              ${renderStatusPill(statusPillForCanonical(record.identity_status))}
            </div>
            ${renderKeyValueGrid(identityRows, true)}
          </div>

          <div class="source-truth-card">
            <div class="source-truth-card-title">
              <span>Bio / Headshot</span>
              <span class="status-row">
                ${renderStatusPill(statusPillForCanonical(record.biography.status))}
                ${renderStatusPill(statusPillForCanonical(record.headshots.status))}
              </span>
            </div>
            ${renderKeyValueGrid([
              ["One-line bio", record.biography.one_line],
              ["Short bio", record.biography.short_bio],
              ["Headshot", record.headshots.primary_url],
              ["Headshot source", record.headshots.source]
            ], true)}
          </div>

          <div class="source-truth-card">
            <div class="source-truth-card-title">
              <span>Official Links</span>
              ${renderStatusPill(statusPillForCanonical(links.status))}
            </div>
            ${linkRows.some(([, value]) => hasTruthValue(value)) ? renderKeyValueGrid(linkRows, true) : renderEmpty("No official link on file.")}
          </div>

          <div class="source-truth-card">
            <div class="source-truth-card-title">
              <span>Socials</span>
              ${renderStatusPill(statusPillForCanonical(socials.status))}
            </div>
            ${socialRows.length ? renderKeyValueGrid(socialRows, true) : renderEmpty("No social handles on file.")}
          </div>

          <div class="source-truth-card">
            <div class="source-truth-card-title">
              <span>Brand / Assets</span>
              ${renderStatusPill(statusPillForCanonical(brand.status))}
            </div>
            ${assetSummary}
          </div>

          <div class="source-truth-card">
            <div class="source-truth-card-title">
              <span>Verification Summary</span>
              ${renderStatusPill(statusPillForCanonical(verification.overall_status))}
            </div>
            ${renderKeyValueGrid([
              ["Source records", verification.source_count],
              ["Official/API sources", verification.official_source_count],
              ["Last verified", verification.last_verified_at || "Not recorded"]
            ])}
            <div style="height: 12px"></div>
            <div class="grid-two">
              <div>
                <div class="info-label">Missing core fields</div>
                ${missingFieldsHtml}
              </div>
              <div>
                <div class="info-label">Needs review</div>
                ${needsReviewHtml}
              </div>
            </div>
          </div>
        </div>
      `
    });
  }

  function buildCanonicalRecordSummary(person) {
    const sourceItems = getCanonicalSourceItems(person);
    const identity = {
      full_name: getTruthValue(person.fullName, person.displayName, person.name),
      preferred_name: getTruthValue(person.preferredName, person.displayName, person.name),
      title: getTruthValue(person.title, person.officeTitle, person.currentOffice),
      office: getTruthValue(person.currentOffice, person.office, person.title, person.raceContext?.office),
      state: getTruthValue(person.state, person.stateCode, person.office?.state, person.politicalGeography?.state),
      district: getTruthValue(person.district, person.districtLabel, person.office?.district, person.politicalGeography?.district),
      jurisdiction: getTruthValue(person.jurisdiction, person.chamber),
      party: getTruthValue(person.party, person.identity?.party, person.sourceIdentity?.party),
      roster_group: getTruthValue(person.rosterGroupName, person.group),
      category: getTruthValue(person.category, person.rosterGroupName, person.group)
    };

    const bioValue = getTruthValue(person.bio?.short, person.bio?.standard, person.bio?.oneLine, person.shortBio, person.officialBio);
    const headshotUrl = getFirstTruthUrl(person.headshotUrl, person.photoUrl, person.headshot?.primaryUrl, person.media?.headshotUrl);
    const links = {
      official_website: getFirstTruthUrl(person.officialWebsite, person.officialLinks?.officialWebsite, person.links?.officialWebsite),
      campaign_website: getFirstTruthUrl(person.campaignWebsite, person.officialLinks?.campaignWebsite, person.links?.campaignWebsite, person.campaign?.website),
      congress_gov_profile: getFirstTruthUrl(person.congressGovUrl, person.officialLinks?.congressGovProfile, person.legislativeMechanics?.congressGovUrl, person.sourceEndpoints?.congressGovProfile),
      openstates_profile: getFirstTruthUrl(person.sourceIdentity?.openStatesProfile, person.officialLinks?.openStatesProfile, person.legislativeMechanics?.openStatesUrl, person.sourceEndpoints?.openStatesProfile),
      fec_profile: getFirstTruthUrl(person.fecProfile, person.campaignFinanceSnapshot?.fecProfile, person.campaignFinanceSnapshot?.sourceUrl, person.sourceEndpoints?.financeSource)
    };
    links.status = statusForGroup(Object.values(links), (value) => isSourceBacked(person, sourceItems, value, "site") || isSourceBacked(person, sourceItems, value, "source"));

    const socials = getCanonicalSocials(person, sourceItems);
    const brandAssets = getCanonicalBrandAssets(person);
    const missingCoreFields = [];
    Object.entries({
      display_name: getTruthValue(person.displayName, person.name, person.fullName),
      title: identity.title,
      office: identity.office,
      state_or_jurisdiction: getTruthValue(identity.state, identity.jurisdiction),
      roster_group_or_category: getTruthValue(identity.roster_group, identity.category),
      bio: bioValue,
      headshot: headshotUrl,
      official_website: links.official_website
    }).forEach(([field, value]) => {
      if (!hasTruthValue(value)) missingCoreFields.push(field);
    });

    const sectionStatuses = {
      biography: statusForValue(bioValue, isSourceBacked(person, sourceItems, bioValue, "bio")),
      headshots: statusForValue(headshotUrl, isSourceBacked(person, sourceItems, headshotUrl, "headshot")),
      links: links.status,
      socials: socials.status,
      brand_assets: brandAssets.status
    };
    const needsReviewFields = Object.entries(sectionStatuses)
      .filter(([, status]) => ["partial", "needs_review"].includes(status))
      .map(([field]) => field);
    const identityValues = Object.values(identity).filter(hasTruthValue);
    const identityStatus = identityValues.length >= 4
      ? sourceItems.length || U.hasContent(person.sourceIdentity) || U.hasContent(person.campaignImport)
        ? "partial"
        : "needs_review"
      : "missing";

    return {
      profile_id: person.id,
      display_name: getTruthValue(person.displayName, person.name, person.fullName),
      identity_status: identityStatus,
      canonical_identity: identity,
      biography: {
        short_bio: getTruthValue(person.bio?.short, person.shortBio),
        medium_bio: getTruthValue(person.bio?.standard, person.officialBio),
        long_bio: getTruthValue(person.bio?.long, person.longBio),
        one_line: getTruthValue(person.bio?.oneLine, person.bio?.headline),
        status: sectionStatuses.biography,
        source_url: getFirstTruthUrl(person.bioSource, person.sourceEndpoints?.bioSource),
        last_verified_at: null
      },
      headshots: {
        primary_url: headshotUrl,
        source: getTruthValue(person.headshot?.source, person.media?.headshotSource),
        alt_text: getTruthValue(person.headshot?.altText, person.media?.altText),
        status: sectionStatuses.headshots
      },
      links,
      socials,
      brand_assets: brandAssets,
      verification: {
        overall_status: overallCanonicalStatus(Object.values(sectionStatuses)),
        source_count: sourceItems.length,
        official_source_count: sourceItems.filter((item) => /official|api|congress|openstates|fec/i.test(`${item.label} ${item.type}`)).length,
        missing_core_fields: missingCoreFields,
        needs_review_fields: needsReviewFields,
        conflicting_fields: [],
        last_verified_at: null,
        source_summary: sourceItems.slice(0, 8)
      }
    };
  }

  function getCanonicalSocials(person, sourceItems) {
    const webHandles = U.normalizeArray(person.webHandles);
    const handle = (matcher) => {
      const found = webHandles.find((item) => {
        if (!item || typeof item !== "object") return false;
        return matcher(String(item.label || "").toLowerCase());
      });
      return found ? found.value : "";
    };
    const socials = {
      x: getTruthValue(person.xUrl, person.twitterUrl, person.social?.x, person.social?.twitter, handle((label) => label === "x" || label.includes("twitter") || label.includes("social handle"))),
      facebook: getTruthValue(person.facebookUrl, person.social?.facebook, handle((label) => label.includes("facebook"))),
      instagram: getTruthValue(person.instagramUrl, person.social?.instagram, handle((label) => label.includes("instagram"))),
      threads: getTruthValue(person.social?.threads, handle((label) => label.includes("thread"))),
      youtube: getTruthValue(person.youtubeUrl, person.social?.youtube, person.officialLinks?.youtubeChannelId, person.officialLinks?.youtubeChannelTitle, person.mediaTracking?.youtubeChannelId, handle((label) => label.includes("youtube"))),
      tiktok: getTruthValue(person.social?.tiktok, handle((label) => label.includes("tiktok"))),
      bluesky: getTruthValue(person.social?.bluesky, handle((label) => label.includes("bluesky"))),
      linkedin: getTruthValue(person.social?.linkedin, handle((label) => label.includes("linkedin")))
    };
    const values = Object.values(socials).filter(hasTruthValue);
    socials.status = values.length
      ? values.some((value) => isSourceBacked(person, sourceItems, value, "social"))
        ? "partial"
        : "needs_review"
      : "missing";
    return socials;
  }

  function getCanonicalBrandAssets(person) {
    const brand = person.brandAssets || {};
    const assets = person.assets || {};
    const record = {
      logos: U.normalizeArray(brand.logos || assets.logos),
      fonts: U.normalizeArray(brand.fonts),
      colors: U.normalizeArray(brand.colors),
      templates: U.normalizeArray(brand.templates),
      photo_folders: U.normalizeArray(brand.photoFolders),
      video_folders: U.normalizeArray(brand.videoFolders),
      press_kit_links: U.normalizeArray(brand.pressKitLinks),
      usage_notes: U.normalizeArray(brand.usageNotes)
    };
    const hasAsset = [
      record.logos,
      record.fonts,
      record.colors,
      record.templates,
      record.photo_folders,
      record.video_folders,
      record.press_kit_links
    ].some((items) => items.length > 0);
    record.status = hasAsset ? "partial" : "missing";
    return record;
  }

  function getCanonicalSourceItems(person) {
    const rows = [];
    U.normalizeArray(person.sourceTracking).forEach((item) => {
      if (item && typeof item === "object" && U.hasContent(item)) {
        rows.push({
          label: getTruthValue(item.label, item.type, "Source"),
          value: getTruthValue(item.value, item.sourceUrl),
          type: getTruthValue(item.type, "source"),
          source_url: getTruthValue(item.sourceUrl)
        });
      }
    });
    Object.entries(person.sourceEndpoints || {}).forEach(([key, value]) => {
      if (hasTruthValue(value)) rows.push({ label: key, value, type: "source-endpoint", source_url: value });
    });
    Object.entries(person.sourceIdentity || {}).forEach(([key, value]) => {
      if (hasTruthValue(value)) rows.push({ label: key, value, type: "source-identity", source_url: "" });
    });
    if (hasTruthValue(person.sourceNodeId) || hasTruthValue(person.campaignImport?.nodeId) || hasTruthValue(person.sourceIdentity?.campaignCommandCenterNodeId)) {
      rows.push({
        label: "Campaign Command Center node",
        value: getTruthValue(person.sourceNodeId, person.campaignImport?.nodeId, person.sourceIdentity?.campaignCommandCenterNodeId),
        type: "import-provenance",
        source_url: ""
      });
    }
    return rows.filter((item) => hasTruthValue(item.value));
  }

  function statusPillForCanonical(status) {
    const labels = {
      verified: "Verified",
      partial: "Partial",
      missing: "Missing",
      needs_review: "Needs Review",
      conflicting: "Conflicting",
      stale: "Stale"
    };
    return {
      normalized: String(status || "missing").replace(/_/g, "-"),
      label: labels[status] || U.humanizeKey(status || "missing")
    };
  }

  function statusForValue(value, sourceBacked) {
    if (!hasTruthValue(value)) return "missing";
    if (isScaffoldValue(value)) return "needs_review";
    return sourceBacked ? "verified" : "partial";
  }

  function statusForGroup(values, sourceCheck) {
    const present = values.filter(hasTruthValue);
    if (!present.length) return "missing";
    const backedCount = present.filter((value) => sourceCheck(value)).length;
    if (backedCount === present.length) return "verified";
    return backedCount > 0 ? "partial" : "needs_review";
  }

  function overallCanonicalStatus(statuses) {
    if (statuses.includes("conflicting")) return "conflicting";
    if (statuses.includes("needs_review")) return "needs_review";
    if (statuses.every((status) => status === "missing")) return "missing";
    if (statuses.every((status) => ["verified", "missing"].includes(status))) return "partial";
    if (statuses.includes("partial")) return "partial";
    return "verified";
  }

  function isSourceBacked(person, sourceItems, value, typeHint) {
    if (!hasTruthValue(value)) return false;
    const text = String(value).trim().replace(/\/$/, "");
    return sourceItems.some((item) => {
      const itemValue = String(item.value || item.source_url || "").trim().replace(/\/$/, "");
      const typeText = `${item.type || ""} ${item.label || ""}`.toLowerCase();
      return (itemValue && itemValue === text) || (typeHint && typeText.includes(typeHint.toLowerCase()));
    });
  }

  function getTruthValue(...values) {
    return values.find(hasTruthValue) || "";
  }

  function getFirstTruthUrl(...values) {
    return values.find((value) => hasTruthValue(value) && U.isUrl(String(value))) || "";
  }

  function hasTruthValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return false;
      return !["--", "-", "n/a", "na", "none", "null", "unknown", "not populated yet", "not started"].includes(text.toLowerCase());
    }
    if (Array.isArray(value)) return value.some(hasTruthValue);
    if (typeof value === "object") return Object.values(value).some(hasTruthValue);
    return true;
  }

  function isScaffoldValue(value) {
    const text = String(value || "").toLowerCase();
    return ["required", "needed", "not populated", "not started", "scaffold", "future"].some((marker) => text.includes(marker));
  }

  function renderSectionNav() {
    return `
      <nav class="section-nav" aria-label="Profile section shortcuts">
        ${S.ALL_SECTIONS.map((sectionTitle) => `
          <a href="#${U.escapeAttribute(U.getSectionId(sectionTitle))}">${U.escapeHtml(U.shortSectionLabel(sectionTitle))}</a>
        `).join("")}
      </nav>
    `;
  }

  function renderProfileCompletion(person) {
    const score = U.clampNumber(person.completionScore, 0, 100);

    const healthCards = S.ALL_SECTIONS.map((sectionTitle) => {
      const status = S.getSectionStatus(person, sectionTitle);

      return `
        <div class="section-health-card">
          <div class="section-health-title">${U.escapeHtml(sectionTitle)}</div>
          ${renderStatusPill(status)}
        </div>
      `;
    }).join("");

    return renderSection({
      title: "Profile Completion",
      subtitle: "Readiness status for this intelligence profile.",
      open: true,
      status: S.getSectionStatus(person, "Profile Completion"),
      body: `
        <div class="completion-meter">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${score}%"></div>
          </div>

          <div class="completion-text">
            <strong>${score}% complete.</strong>
            Status: ${U.escapeHtml(person.completionLabel)}.
          </div>

          ${renderKeyValueGrid([
            ["Completion status", person.completionLabel],
            ["Office type", person.officeTypeLabel],
            ["Party", person.partyLabel],
            ["Profile ID", person.id]
          ])}

          <div class="section-health-grid">
            ${healthCards}
          </div>
        </div>
      `
    });
  }

  function renderUniversalReference(person) {
    const ids = U.flattenObject({
      "Bioguide ID": U.getFirstValue(person.bioguideId, person.ids?.bioguideId, person.identifiers?.bioguideId, person.sourceIdentity?.bioguideId),
      "FEC Candidate ID": U.getFirstValue(person.fecCandidateId, person.ids?.fecCandidateId, person.identifiers?.fecCandidateId, person.sourceIdentity?.fecCandidateId),
      "FEC Committee ID": U.getFirstValue(person.fecCommitteeId, person.fecPrincipalCommitteeId, person.ids?.fecCommitteeId, person.ids?.fecPrincipalCommitteeId, person.sourceIdentity?.fecPrincipalCommitteeId),
      "PolicyNote Person ID": U.getFirstValue(person.policyNotePersonId, person.ids?.policyNotePersonId, person.identifiers?.policyNotePersonId, person.sourceIdentity?.policyNotePersonId),
      "PolicyNote Entity ID": U.getFirstValue(person.policyNoteEntityId, person.ids?.policyNoteEntityId, person.identifiers?.policyNoteEntityId, person.sourceIdentity?.policyNoteEntityId),
      "Google Knowledge Graph MID": U.getFirstValue(person.googleKgMid, person.googleKnowledgeGraphMid, person.ids?.googleKgMid, person.sourceIdentity?.googleKnowledgeGraphMid),
      "YouTube Channel ID": U.getFirstValue(person.youtubeChannelId, person.ids?.youtubeChannelId, person.social?.youtubeChannelId, person.officialLinks?.youtubeChannelId)
    });

    return renderSection({
      title: "Universal Reference",
      subtitle: "Core crosswalk IDs and reusable identifiers.",
      open: true,
      status: S.getSectionStatus(person, "Universal Reference"),
      body: ids.length ? renderKeyValueGrid(ids, true) : renderEmpty("No universal reference IDs have been added yet.")
    });
  }

  function renderBioLibrary(person) {
    const bioItems = [];

    const oneLineBio = U.getFirstValue(person.bio?.oneLine, person.bio?.headline);
    const officialBio = U.getFirstValue(person.officialBio, person.bio?.official, person.bio?.officialBio);
    const shortBio = U.getFirstValue(person.shortBio, person.bio?.short, person.bio?.shortBio);
    const standardBio = U.getFirstValue(person.bio?.standard, person.bio?.medium);
    const longBio = U.getFirstValue(person.bio?.long);
    const plainEnglishBio = U.getFirstValue(person.plainEnglishBio, person.bio?.plainEnglish, person.bio?.plainEnglishBio);

    if (oneLineBio) bioItems.push(["One-line bio", oneLineBio]);
    if (officialBio) bioItems.push(["Official bio", officialBio]);
    if (shortBio) bioItems.push(["Short bio", shortBio]);
    if (standardBio) bioItems.push(["Standard bio", standardBio]);
    if (longBio) bioItems.push(["Long bio", longBio]);
    if (plainEnglishBio) bioItems.push(["Plain-English bio", plainEnglishBio]);

    return renderSection({
      title: "Bio Library",
      subtitle: "Reusable biography copy and summary language.",
      open: true,
      status: S.getSectionStatus(person, "Bio Library"),
      body: bioItems.length ? renderTextList(bioItems) : renderEmpty("No biography copy has been added yet.")
    });
  }

  function renderHeadshotAndMedia(person) {
    const mediaItems = U.flattenObject({
      "Headshot URL": U.getFirstValue(person.headshotUrl, person.photoUrl, person.headshot?.primaryUrl, person.headshot, person.media?.headshotUrl, person.media?.headshot),
      "Headshot source": U.getFirstValue(person.headshot?.source, person.media?.headshotSource),
      "Alt text": U.getFirstValue(person.headshot?.altText, person.media?.altText),
      "Usage note": U.getFirstValue(person.headshot?.usageNote, person.media?.usageNote),
      "Image search URL": U.getFirstValue(person.imageSearchUrl, person.media?.imageSearchUrl),
      "YouTube channel": U.getFirstValue(person.youtubeChannelUrl, person.media?.youtubeChannelUrl, person.social?.youtube, person.officialLinks?.youtubeChannelTitle),
      "YouTube channel ID": U.getFirstValue(person.youtubeChannelId, person.officialLinks?.youtubeChannelId),
      "B-roll notes": U.getFirstValue(person.brollNotes, person.media?.brollNotes)
    });

    return renderSection({
      title: "Headshot and Media Asset",
      subtitle: "Visual assets, headshots, videos, and media notes.",
      open: true,
      status: S.getSectionStatus(person, "Headshot and Media Asset"),
      body: mediaItems.length ? renderKeyValueGrid(mediaItems, true) : renderEmpty("No headshot or media assets have been added yet.")
    });
  }

  function renderOfficialLinksAndContact(person) {
    const links = U.normalizeLinks([
      ["Official website", U.getFirstValue(person.officialWebsite, person.officialLinks?.officialWebsite, person.links?.officialWebsite, person.official?.website)],
      ["Contact form", U.getFirstValue(person.officialLinks?.contactForm, person.contactForm, person.links?.contactForm)],
      ["Campaign website", U.getFirstValue(person.campaignWebsite, person.links?.campaignWebsite, person.campaign?.website)],
      ["Congress.gov profile", U.getFirstValue(person.congressGovUrl, person.links?.congressGov)],
      ["Ballotpedia", U.getFirstValue(person.ballotpediaUrl, person.links?.ballotpedia)],
      ["Wikipedia", U.getFirstValue(person.wikipediaUrl, person.links?.wikipedia)],
      ["PolicyNote search", U.getFirstValue(person.officialLinks?.policyNoteSearch, person.links?.policyNoteSearch)],
      ["X / Twitter", U.getFirstValue(person.twitterUrl, person.xUrl, person.links?.twitter, person.social?.twitter, person.social?.x)],
      ["Facebook", U.getFirstValue(person.facebookUrl, person.links?.facebook, person.social?.facebook)],
      ["Instagram", U.getFirstValue(person.instagramUrl, person.links?.instagram, person.social?.instagram)],
      ["YouTube", U.getFirstValue(person.youtubeUrl, person.links?.youtube, person.social?.youtube)]
    ]);

    const phoneItems = U.normalizeArray(person.phones).map((item) => [
      item.label || "Phone",
      item.value || item
    ]);

    const officeItems = U.normalizeArray(person.offices).map((item) => [
      item.label || "Office",
      item.value || item
    ]);

    const handleItems = U.normalizeArray(person.webHandles).map((item) => [
      item.label || "Web handle",
      item.value || item
    ]);

    const contactItems = U.flattenObject({
      "Public phone": U.getFirstValue(person.phone, person.contact?.phone),
      "Public email": U.getFirstValue(person.email, person.contact?.email),
      "Office address": U.getFirstValue(person.officeAddress, person.contact?.officeAddress)
    });

    const combinedContactItems = [
      ...contactItems,
      ...phoneItems,
      ...officeItems,
      ...handleItems
    ];

    return renderSection({
      title: "Official Links and Contact",
      subtitle: "Verified official links, campaign links, and public contact details.",
      open: true,
      status: S.getSectionStatus(person, "Official Links and Contact"),
      body: `
        ${links.length ? renderLinksGrid(links) : renderEmpty("No official links have been added yet.")}
        ${combinedContactItems.length ? `<div style="height: 12px"></div>${renderKeyValueGrid(combinedContactItems, true)}` : ""}
      `
    });
  }

  function renderCommitteesAndCaucuses(person) {
    const committeeItems = U.normalizeArray(
      U.getFirstValue(person.committees, person.committeeMemberships, person.legislative?.committees)
    );

    const caucusItems = U.normalizeArray(
      U.getFirstValue(person.caucuses, person.legislative?.caucuses)
    );

    const committeeHtml = committeeItems.length
      ? renderCompactChipList(committeeItems)
      : renderEmpty("No committee memberships have been added yet.");

    const caucusHtml = caucusItems.length
      ? renderCompactChipList(caucusItems)
      : renderEmpty("No caucus memberships have been added yet.");

    return renderSection({
      title: "Committees and Caucuses",
      subtitle: "Committee assignments, caucus memberships, and institutional positioning.",
      open: true,
      status: S.getSectionStatus(person, "Committees and Caucuses"),
      body: `
        <div class="grid-two">
          <div>
            <div class="info-label">Committees</div>
            ${committeeHtml}
          </div>
          <div>
            <div class="info-label">Caucuses</div>
            ${caucusHtml}
          </div>
        </div>
      `
    });
  }

  function renderDataQualityNotes(person) {
    const notes = S.getDataQualityNotes(person);

    return renderSection({
      title: "Data Quality Notes",
      subtitle: "Known gaps, cautions, assumptions, and research notes.",
      open: false,
      status: S.getSectionStatus(person, "Data Quality Notes"),
      body: notes.length ? renderGenericList(notes) : renderEmpty("No data quality notes have been added yet.")
    });
  }

  function renderSourceTracking(person) {
    const grouped = S.getGroupedSourceTrackingItems(person);
    const summary = S.getSourceTrackingSummary(person);

    const highValueEndpointRows = summary.highValueEndpoints.slice(0, 6).map((item) => [
      U.humanizeKey(item.label),
      item.value
    ]);

    const sourceSummaryHtml = renderKeyValueGrid([
      ["Total source records", summary.total],
      ["API / official endpoints", summary.officialOrApiCount],
      ["Proof status records", summary.proofStatusCount],
      ["Manual source notes", summary.manualCount]
    ]);

    const highValueHtml = highValueEndpointRows.length
      ? `
        <div style="height: 12px"></div>
        <div class="info-label">Key endpoints</div>
        ${renderKeyValueGrid(highValueEndpointRows, true)}
      `
      : "";

    const manualHtml = grouped.manual.length
      ? `
        <div style="height: 14px"></div>
        <div class="info-label">Manual source notes</div>
        ${renderGenericList(grouped.manual)}
      `
      : "";

    const proofHtml = grouped.proofStatus.length
      ? `
        <div style="height: 14px"></div>
        <div class="info-label">Proof status</div>
        ${renderGenericList(grouped.proofStatus)}
      `
      : "";

    const endpointHtml = grouped.endpoints.length
      ? `
        <div style="height: 14px"></div>
        <div class="info-label">All API / official endpoints</div>
        ${renderGenericList(grouped.endpoints)}
      `
      : "";

    return renderSection({
      title: "Source Tracking",
      subtitle: "Compact source summary. Open for full endpoint and proof trail.",
      open: false,
      status: S.getSectionStatus(person, "Source Tracking"),
      body: summary.total
        ? `
          ${sourceSummaryHtml}
          ${highValueHtml}
          ${manualHtml}
          ${proofHtml}
          ${endpointHtml}
        `
        : renderEmpty("No source tracking items have been added yet.")
    });
  }

  function renderAdvancedSections(person) {
    return S.ADVANCED_SECTIONS.map((sectionTitle) => {
      if (sectionTitle === "Green Easy Win API Integrations") {
        return renderSection({
          title: sectionTitle,
          subtitle: "Local testing panel for API keys and proof modules.",
          open: false,
          status: S.getSectionStatus(person, sectionTitle),
          body: `<div id="greenEasyWinsMount"></div>`
        });
      }

      const content = getAdvancedSectionContent(person, sectionTitle);

      return renderSection({
        title: sectionTitle,
        subtitle: "Advanced intelligence module. Collapsed by default.",
        open: false,
        status: S.getSectionStatus(person, sectionTitle),
        body: content
      });
    }).join("");
  }

  function getAdvancedSectionContent(person, sectionTitle) {
    const value = S.getAdvancedSectionRawValue(person, sectionTitle);

    if (!U.hasContent(value)) {
      return renderEmpty("No data has been added to this module yet.");
    }

    return renderUnknownValue(value);
  }

  function renderSection({ title, subtitle, open, status, body }) {
    const openClass = open ? "open" : "";
    const sectionId = U.getSectionId(title);
    const finalStatus = status || { normalized: "empty", label: "Empty" };

    return `
      <section id="${U.escapeAttribute(sectionId)}" class="section ${openClass}" data-section-title="${U.escapeAttribute(title)}">
        <button class="section-header" type="button">
          <span class="section-title">
            <strong>${U.escapeHtml(title)}</strong>
            <span>${U.escapeHtml(subtitle || "")}</span>
          </span>
          ${renderStatusPill(finalStatus)}
          <span class="chevron">›</span>
        </button>
        <div class="section-body">
          ${body}
        </div>
      </section>
    `;
  }

  function renderStatusPill(status) {
    return `
      <span class="status-pill ${U.escapeAttribute(status.normalized)}">
        ${U.escapeHtml(status.label)}
      </span>
    `;
  }

  function renderKeyValueGrid(items, copyable = false) {
    const rows = items
      .filter((item) => U.hasContent(item[1]))
      .map(([label, value]) => {
        const displayValue = U.stringifyValue(value);
        const valueHtml = U.isUrl(displayValue)
          ? `<a href="${U.escapeAttribute(displayValue)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(displayValue)}</a>`
          : U.escapeHtml(displayValue);

        const inner = copyable
          ? `
            <div class="copy-row">
              <div class="info-value">${valueHtml}</div>
              <button class="copy-button" type="button" data-copy="${U.escapeAttribute(displayValue)}">Copy</button>
            </div>
          `
          : `<div class="info-value">${valueHtml}</div>`;

        return `
          <div class="info-card">
            <div class="info-label">${U.escapeHtml(label)}</div>
            ${inner}
          </div>
        `;
      })
      .join("");

    return `<div class="grid-three">${rows}</div>`;
  }

  function renderTextList(items) {
    return `
      <div class="list">
        ${items
          .filter((item) => U.hasContent(item[1]))
          .map(([label, value]) => {
            const text = U.stringifyValue(value);

            return `
              <div class="list-item">
                <strong>${U.escapeHtml(label)}</strong>
                <p>${U.escapeHtml(text)}</p>
                <div style="height: 10px"></div>
                <button class="copy-button" type="button" data-copy="${U.escapeAttribute(text)}">Copy</button>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderLinksGrid(links) {
    return `
      <div class="grid-three">
        ${links
          .map(([label, url]) => `
            <div class="info-card">
              <div class="info-label">${U.escapeHtml(label)}</div>
              <div class="info-value">
                <a href="${U.escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(url)}</a>
              </div>
            </div>
          `)
          .join("")}
      </div>
    `;
  }

  function renderCompactChipList(items) {
    return `
      <div class="compact-chip-grid">
        ${items
          .map((item) => {
            if (typeof item === "string") {
              return `
                <div class="compact-chip">
                  <strong>${U.escapeHtml(item)}</strong>
                </div>
              `;
            }

            if (typeof item === "object" && item !== null) {
              const title = U.getFirstValue(item.name, item.title, item.committee, item.label, "Item");
              const description = U.getFirstValue(item.role, item.description, item.notes, item.value, item.source, "");

              return `
                <div class="compact-chip">
                  <strong>${U.escapeHtml(title)}</strong>
                  ${description ? `<span>${U.escapeHtml(description)}</span>` : ""}
                </div>
              `;
            }

            return `
              <div class="compact-chip">
                <strong>${U.escapeHtml(String(item))}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderGenericList(items) {
    return `
      <div class="list">
        ${items
          .map((item) => {
            if (typeof item === "string") {
              return `
                <div class="list-item">
                  <strong>${U.escapeHtml(item)}</strong>
                </div>
              `;
            }

            if (typeof item === "object" && item !== null) {
              const title = U.getFirstValue(item.label, item.name, item.title, item.key, item.type, "Item");
              const description = U.getFirstValue(item.value, item.description, item.notes, item.status, item.source, "");

              const descriptionHtml = U.isUrl(description)
                ? `<p><a href="${U.escapeAttribute(description)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(description)}</a></p>`
                : description
                  ? `<p>${U.escapeHtml(description)}</p>`
                  : "";

              return `
                <div class="list-item">
                  <strong>${U.escapeHtml(U.humanizeKey(title))}</strong>
                  ${descriptionHtml}
                </div>
              `;
            }

            return `
              <div class="list-item">
                <strong>${U.escapeHtml(String(item))}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderUnknownValue(value) {
    if (Array.isArray(value)) {
      return value.length ? renderGenericList(value) : renderEmpty("No items added yet.");
    }

    if (typeof value === "object" && value !== null) {
      const entries = Object.entries(value).filter(([, entryValue]) => U.hasContent(entryValue));

      if (!entries.length) {
        return renderEmpty("No data has been added to this module yet.");
      }

      return renderKeyValueGrid(
        entries.map(([key, entryValue]) => [U.humanizeKey(key), U.stringifyValue(entryValue)]),
        true
      );
    }

    if (U.hasContent(value)) {
      return `
        <div class="list-item">
          <p>${U.escapeHtml(String(value))}</p>
        </div>
      `;
    }

    return renderEmpty("No data has been added to this module yet.");
  }

  function renderEmpty(message) {
    return `<div class="empty">${U.escapeHtml(message)}</div>`;
  }

  function bindSectionToggles() {
    document.querySelectorAll(".section-header").forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.closest(".section");
        if (section) section.classList.toggle("open");
      });
    });
  }

  function bindCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const value = button.getAttribute("data-copy") || "";

        try {
          await navigator.clipboard.writeText(value);
          const originalText = button.textContent;
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = originalText;
          }, 1100);
        } catch (error) {
          console.error("Clipboard copy failed", error);
          button.textContent = "Copy failed";
          setTimeout(() => {
            button.textContent = "Copy";
          }, 1100);
        }
      });
    });
  }

  function mountGreenEasyWinsPanel(person) {
    const mount = document.getElementById("greenEasyWinsMount");
    if (!mount) return;

    if (typeof window.renderGreenEasyWins === "function") {
      window.renderGreenEasyWins(mount, person);
      return;
    }

    if (typeof renderGreenEasyWins === "function") {
      renderGreenEasyWins(mount, person);
      return;
    }

    mount.innerHTML = `
      <div class="empty">
        Green Easy Win API integration file is loaded separately. No render function was detected.
      </div>
    `;
  }

  window.MCCRender = {
    renderProfileList,
    renderFilterSummary,
    renderProfileView,
    renderHeadshotPlaceholder
  };
})();
