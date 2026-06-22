(function () {
  const U = window.MCCUtils;

  const CORE_SECTIONS = [
    "Profile Completion",
    "Source of Truth",
    "Universal Reference",
    "Bio Library",
    "Headshot and Media Asset",
    "Official Links and Contact",
    "Committees and Caucuses",
    "Data Quality Notes",
    "Source Tracking"
  ];

  const ADVANCED_SECTIONS = [
    "Race Context and Opponent Data",
    "Fact-Check Index",
    "Media Tracking and Public Commentary",
    "YouTube Proof Videos",
    "Web Clippings and Public Mentions",
    "Deep Campaign Finance",
    "Legislative Mechanics and Floor Records",
    "Floor Debates and Verbal Records",
    "Political Geography and Electoral Venues",
    "Power Mapping and Staff Networks",
    "Real-Time Alerts Infrastructure",
    "Green Easy Win API Integrations",
    "Campaign Finance Snapshot",
    "Connection Status",
    "Verified Source Endpoints"
  ];

  const ALL_SECTIONS = [...CORE_SECTIONS, ...ADVANCED_SECTIONS];

  function normalizeOfficeType(person) {
    const raw = String(
      U.getFirstValue(
        person.officeType,
        person.office?.type,
        person.identity?.officeType,
        person.level,
        person.governmentLevel,
        person.chamber,
        person.office,
        ""
      )
    ).toLowerCase();

    const hasFederalId = Boolean(
      U.getFirstValue(
        person.bioguideId,
        person.ids?.bioguideId,
        person.sourceIdentity?.bioguideId,
        person.fecCandidateId,
        person.ids?.fecCandidateId,
        person.sourceIdentity?.fecCandidateId,
        person.fecPrincipalCommitteeId,
        person.ids?.fecPrincipalCommitteeId,
        person.sourceIdentity?.fecPrincipalCommitteeId
      )
    );

    if (
      raw.includes("federal") ||
      raw.includes("congress") ||
      raw.includes("house") ||
      raw.includes("senate") ||
      raw.includes("representative") ||
      raw.includes("u.s.") ||
      raw.includes("us ") ||
      hasFederalId
    ) {
      return "federal";
    }

    if (
      raw.includes("state") ||
      raw.includes("assembly") ||
      raw.includes("delegate") ||
      raw.includes("governor") ||
      raw.includes("legislature")
    ) {
      return "state";
    }

    return "state";
  }

  function normalizeParty(rawParty) {
    const value = String(rawParty || "").trim().toLowerCase();

    if (["d", "dem", "democrat", "democratic", "democratic party"].includes(value)) {
      return "democratic";
    }

    if (["r", "rep", "republican", "republican party", "gop"].includes(value)) {
      return "republican";
    }

    if (["i", "ind", "independent", "unaffiliated"].includes(value)) {
      return "independent";
    }

    if (!value) {
      return "other";
    }

    return "other";
  }

  function partyLabel(normalized, rawParty) {
    if (normalized === "democratic") return "Democratic";
    if (normalized === "republican") return "Republican";
    if (normalized === "independent") return "Independent";
    if (rawParty) return String(rawParty);
    return "Other";
  }

  function normalizeCompletion(person) {
    const explicitStatus = String(
      U.getFirstValue(
        person.completionStatus,
        person.status?.completionStatus,
        person.status,
        person.profileStatus,
        ""
      )
    )
      .trim()
      .toLowerCase();

    const explicitScore = Number(
      U.getFirstValue(
        person.completionScore,
        person.status?.completionScore,
        person.completionPercent,
        person.profileCompletionScore,
        NaN
      )
    );

    if (explicitStatus) {
      if (explicitStatus.includes("not")) {
        return {
          normalized: "not-started",
          label: "Not started",
          score: Number.isFinite(explicitScore) ? U.clampNumber(explicitScore, 0, 100) : 0
        };
      }

      if (explicitStatus.includes("complete") && !explicitStatus.includes("incomplete")) {
        return {
          normalized: "complete",
          label: "Complete",
          score: Number.isFinite(explicitScore) ? U.clampNumber(explicitScore, 0, 100) : 100
        };
      }

      if (explicitStatus.includes("missing")) {
        return {
          normalized: "missing",
          label: "Missing",
          score: Number.isFinite(explicitScore) ? U.clampNumber(explicitScore, 0, 100) : 20
        };
      }

      if (explicitStatus.includes("partial") || explicitStatus.includes("scaffold")) {
        return {
          normalized: "partial",
          label: "Partial",
          score: Number.isFinite(explicitScore) ? U.clampNumber(explicitScore, 0, 100) : 55
        };
      }
    }

    if (Number.isFinite(explicitScore)) {
      const score = U.clampNumber(explicitScore, 0, 100);

      if (score >= 90) return { normalized: "complete", label: "Complete", score };
      if (score >= 35) return { normalized: "partial", label: "Partial", score };
      if (score > 0) return { normalized: "missing", label: "Missing", score };

      return { normalized: "not-started", label: "Not started", score };
    }

    const score = calculateCompletionScore(person);

    if (score >= 90) return { normalized: "complete", label: "Complete", score };
    if (score >= 35) return { normalized: "partial", label: "Partial", score };
    if (score > 0) return { normalized: "missing", label: "Missing", score };

    return { normalized: "not-started", label: "Not started", score };
  }

  function calculateCompletionScore(person) {
    const checks = [
      person.name || person.fullName || person.identity?.fullName,
      person.title || person.office?.title || person.currentOffice,
      person.party || person.identity?.party,
      person.state || person.district || person.office?.state || person.office?.district,
      person.officialBio || person.shortBio || person.bio,
      person.headshotUrl || person.headshot || person.media?.headshotUrl || person.media?.headshot,
      person.officialWebsite || person.officialLinks?.officialWebsite || person.links?.officialWebsite,
      person.bioguideId || person.sourceIdentity?.bioguideId || person.fecCandidateId || person.sourceIdentity?.fecCandidateId,
      person.committees || person.committeeMemberships,
      person.caucuses,
      person.campaignFinance || person.finance || person.campaignFinanceSnapshot,
      person.dataQualityNotes || person.quality?.notes,
      person.sourceTracking || person.sources || person.sourceEndpoints || person.proofStatus
    ];

    const completed = checks.filter((item) => U.hasContent(item)).length;
    return Math.round((completed / checks.length) * 100);
  }

  function getAdvancedSectionRawValue(person, sectionTitle) {
    const keyMap = {
      "Race Context and Opponent Data": ["raceContext", "opponents", "electionContext"],
      "Fact-Check Index": ["factChecks", "factCheckIndex"],
      "Media Tracking and Public Commentary": ["mediaTracking", "publicCommentary"],
      "YouTube Proof Videos": ["youtubeProofVideos", "youtubeVideos", "videos", "mediaTracking.proofVideos"],
      "Web Clippings and Public Mentions": ["webClippings", "publicMentions"],
      "Deep Campaign Finance": ["deepCampaignFinance", "campaignFinance", "finance"],
      "Legislative Mechanics and Floor Records": ["legislativeMechanics", "floorRecords"],
      "Floor Debates and Verbal Records": ["floorDebates", "verbalRecords"],
      "Political Geography and Electoral Venues": ["politicalGeography", "electoralVenues"],
      "Power Mapping and Staff Networks": ["powerMapping", "staffNetworks"],
      "Real-Time Alerts Infrastructure": ["alerts", "realTimeAlerts", "alertingInfrastructure"],
      "Campaign Finance Snapshot": ["campaignFinanceSnapshot", "financeSnapshot"],
      "Connection Status": ["connectionStatus", "connections", "proofStatus"],
      "Verified Source Endpoints": ["verifiedSourceEndpoints", "sourceEndpoints"]
    };

    const candidateKeys = keyMap[sectionTitle] || [];

    for (const key of candidateKeys) {
      const value = getByPath(person, key);
      if (U.hasContent(value)) return value;
    }

    return undefined;
  }

  function getSectionStatus(person, sectionTitle) {
    if (sectionTitle === "Profile Completion") {
      if (person.completionNormalized === "complete") return { normalized: "ready", label: "Ready" };
      if (person.completionNormalized === "partial") return { normalized: "partial", label: "Partial" };
      if (person.completionNormalized === "missing") return { normalized: "missing", label: "Missing" };
      return { normalized: "empty", label: "Not started" };
    }

    if (sectionTitle === "Source of Truth") {
      const sourceCount = getSourceTrackingSummary(person).total;
      const hasIdentity = U.hasContent(person.name || person.displayName || person.fullName) &&
        U.hasContent(person.title || person.currentOffice) &&
        U.hasContent(person.state || person.jurisdiction);
      const hasCoreSource = sourceCount > 0 || U.hasContent(person.sourceIdentity) || U.hasContent(person.campaignImport);

      if (hasIdentity && hasCoreSource) return { normalized: "partial", label: "Partial" };
      if (hasIdentity) return { normalized: "needs-review", label: "Needs Review" };
      return { normalized: "missing", label: "Missing" };
    }

    if (sectionTitle === "Green Easy Win API Integrations") {
      return { normalized: "api", label: "API" };
    }

    if (sectionTitle === "Universal Reference") {
      const values = [
        person.bioguideId,
        person.ids?.bioguideId,
        person.identifiers?.bioguideId,
        person.sourceIdentity?.bioguideId,
        person.fecCandidateId,
        person.ids?.fecCandidateId,
        person.identifiers?.fecCandidateId,
        person.sourceIdentity?.fecCandidateId,
        person.fecCommitteeId,
        person.fecPrincipalCommitteeId,
        person.ids?.fecCommitteeId,
        person.ids?.fecPrincipalCommitteeId,
        person.sourceIdentity?.fecPrincipalCommitteeId,
        person.policyNotePersonId,
        person.sourceIdentity?.policyNotePersonId,
        person.policyNoteEntityId,
        person.sourceIdentity?.policyNoteEntityId,
        person.googleKgMid,
        person.googleKnowledgeGraphMid,
        person.sourceIdentity?.googleKnowledgeGraphMid,
        person.youtubeChannelId,
        person.officialLinks?.youtubeChannelId
      ].filter(U.hasContent);

      if (values.length >= 4) return { normalized: "ready", label: "Ready" };
      if (values.length >= 1) return { normalized: "partial", label: "Partial" };
      return { normalized: "empty", label: "Empty" };
    }

    if (sectionTitle === "Bio Library") {
      const values = [
        person.officialBio,
        person.bio?.official,
        person.bio?.officialBio,
        person.bio?.oneLine,
        person.shortBio,
        person.bio?.short,
        person.bio?.shortBio,
        person.bio?.standard,
        person.bio?.long,
        person.plainEnglishBio,
        person.bio?.plainEnglish,
        person.bio?.plainEnglishBio
      ].filter(U.hasContent);

      if (values.length >= 2) return { normalized: "ready", label: "Ready" };
      if (values.length === 1) return { normalized: "partial", label: "Partial" };
      return { normalized: "empty", label: "Empty" };
    }

    if (sectionTitle === "Headshot and Media Asset") {
      const values = [
        person.headshotUrl,
        person.photoUrl,
        person.headshot,
        person.headshot?.primaryUrl,
        person.media?.headshotUrl,
        person.media?.headshot,
        person.imageSearchUrl,
        person.media?.imageSearchUrl,
        person.youtubeChannelUrl,
        person.officialLinks?.youtubeChannelId,
        person.officialLinks?.youtubeChannelTitle,
        person.media?.youtubeChannelUrl,
        person.social?.youtube,
        person.brollNotes,
        person.headshot?.usageNote,
        person.media?.brollNotes
      ].filter(U.hasContent);

      if (values.length >= 2) return { normalized: "ready", label: "Ready" };
      if (values.length === 1) return { normalized: "partial", label: "Partial" };
      return { normalized: "empty", label: "Empty" };
    }

    if (sectionTitle === "Official Links and Contact") {
      const values = [
        person.officialWebsite,
        person.officialLinks?.officialWebsite,
        person.links?.officialWebsite,
        person.campaignWebsite,
        person.links?.campaignWebsite,
        person.congressGovUrl,
        person.links?.congressGov,
        person.officialLinks?.contactForm,
        person.ballotpediaUrl,
        person.wikipediaUrl,
        person.twitterUrl,
        person.xUrl,
        person.facebookUrl,
        person.instagramUrl,
        person.youtubeUrl,
        person.phone,
        person.email,
        person.officeAddress,
        person.contact?.phone,
        person.contact?.email,
        person.contact?.officeAddress,
        person.phones,
        person.offices,
        person.webHandles
      ].filter(U.hasContent);

      if (values.length >= 4) return { normalized: "ready", label: "Ready" };
      if (values.length >= 1) return { normalized: "partial", label: "Partial" };
      return { normalized: "empty", label: "Empty" };
    }

    if (sectionTitle === "Committees and Caucuses") {
      const committees = U.normalizeArray(
        U.getFirstValue(person.committees, person.committeeMemberships, person.legislative?.committees)
      );

      const caucuses = U.normalizeArray(
        U.getFirstValue(person.caucuses, person.legislative?.caucuses)
      );

      const total = committees.length + caucuses.length;

      if (total >= 3) return { normalized: "ready", label: "Ready" };
      if (total >= 1) return { normalized: "partial", label: "Partial" };
      return { normalized: "empty", label: "Empty" };
    }

    if (sectionTitle === "Data Quality Notes") {
      const notes = getDataQualityNotes(person);

      if (notes.length >= 3) return { normalized: "ready", label: "Ready" };
      if (notes.length >= 1) return { normalized: "partial", label: "Partial" };
      return { normalized: "empty", label: "Empty" };
    }

    if (sectionTitle === "Source Tracking") {
      const grouped = getGroupedSourceTrackingItems(person);
      const total = grouped.manual.length + grouped.endpoints.length + grouped.proofStatus.length;

      if (total >= 5) return { normalized: "ready", label: "Ready" };
      if (total >= 1) return { normalized: "partial", label: "Partial" };
      return { normalized: "empty", label: "Empty" };
    }

    const content = getAdvancedSectionRawValue(person, sectionTitle);

    if (sectionTitle === "Campaign Finance Snapshot") {
      if (U.hasContent(content)) return { normalized: "ready", label: "Ready" };

      if (
        U.hasContent(person.fecCandidateId) ||
        U.hasContent(person.fecPrincipalCommitteeId) ||
        U.hasContent(person.fecCommitteeId) ||
        U.hasContent(person.sourceIdentity?.fecCandidateId) ||
        U.hasContent(person.sourceIdentity?.fecPrincipalCommitteeId)
      ) {
        return { normalized: "api", label: "API ready" };
      }

      return { normalized: "empty", label: "Empty" };
    }

    if (sectionTitle === "Connection Status" || sectionTitle === "Verified Source Endpoints") {
      if (U.hasContent(content)) return { normalized: "ready", label: "Ready" };
      return { normalized: "empty", label: "Empty" };
    }

    if (U.hasContent(content)) {
      return { normalized: "partial", label: "Partial" };
    }

    return { normalized: "empty", label: "Empty" };
  }

  function getDataQualityNotes(person) {
    const explicitNotes = U.normalizeArray(U.getFirstValue(person.dataQualityNotes, person.quality?.notes));
    const generatedNotes = [];

    if (!U.hasContent(person.headshot?.primaryUrl) && !U.hasContent(person.headshotUrl) && !U.hasContent(person.photoUrl)) {
      generatedNotes.push({
        label: "Missing headshot",
        value: "No official or campaign-approved headshot URL is currently available."
      });
    }

    if (person.officeTypeNormalized === "state") {
      generatedNotes.push({
        label: "State-level profile",
        value: "Do not assume federal IDs, Congress.gov records, or OpenFEC coverage apply."
      });
    }

    if (!U.hasContent(person.officialLinks?.officialWebsite) && !U.hasContent(person.officialWebsite)) {
      generatedNotes.push({
        label: "Official website missing",
        value: "Add and verify the official government website."
      });
    }

    if (!U.hasContent(person.committees) && !U.hasContent(person.committeeMemberships)) {
      generatedNotes.push({
        label: "Committee data missing",
        value: "Committee and caucus data has not been populated."
      });
    }

    if (person.profileCompletion && typeof person.profileCompletion === "object") {
      generatedNotes.push({
        label: "Completion map available",
        value: "This profile includes field-level completion notes in profileCompletion."
      });
    }

    return [...explicitNotes, ...generatedNotes].filter(U.hasContent);
  }

  function getSourceTrackingItems(person) {
    const grouped = getGroupedSourceTrackingItems(person);
    return [...grouped.manual, ...grouped.endpoints, ...grouped.proofStatus];
  }

  function getGroupedSourceTrackingItems(person) {
    const manual = U.normalizeArray(U.getFirstValue(person.sourceTracking, person.sources))
      .filter(U.hasContent)
      .map((item) => ({
        ...normalizeSourceItem(item),
        group: "manual"
      }));

    const endpoints = person.sourceEndpoints && typeof person.sourceEndpoints === "object"
      ? Object.entries(person.sourceEndpoints)
          .filter(([, value]) => U.hasContent(value))
          .map(([label, value]) => ({
            label,
            value,
            type: "endpoint",
            group: "endpoints"
          }))
      : [];

    const proofStatus = person.proofStatus && typeof person.proofStatus === "object"
      ? Object.entries(person.proofStatus)
          .filter(([, value]) => U.hasContent(value))
          .map(([label, value]) => ({
            label,
            value,
            type: "proofStatus",
            group: "proofStatus"
          }))
      : [];

    return {
      manual,
      endpoints,
      proofStatus
    };
  }

  function getSourceTrackingSummary(person) {
    const grouped = getGroupedSourceTrackingItems(person);

    const total = grouped.manual.length + grouped.endpoints.length + grouped.proofStatus.length;

    const officialOrApiCount = grouped.endpoints.length;
    const proofStatusCount = grouped.proofStatus.length;
    const manualCount = grouped.manual.length;

    const highValueLabels = [
      "congressSponsoredLegislation",
      "congressCosponsoredLegislation",
      "fecReceipts",
      "fecDisbursements",
      "fecIndependentExpenditures",
      "policyNoteSearch",
      "googleFactCheckSearch",
      "youtubeSearch",
      "govInfoPackages",
      "googleCustomSearch"
    ];

    const highValueEndpoints = grouped.endpoints.filter((item) =>
      highValueLabels.includes(item.label)
    );

    return {
      total,
      officialOrApiCount,
      proofStatusCount,
      manualCount,
      highValueEndpoints
    };
  }

  function normalizeSourceItem(item) {
    if (typeof item === "string") {
      return {
        label: item,
        value: item,
        type: "manual"
      };
    }

    if (item && typeof item === "object") {
      return {
        label: U.getFirstValue(item.label, item.name, item.title, item.key, "Source"),
        value: U.getFirstValue(item.value, item.sourceUrl, item.url, item.status, item.description, ""),
        type: U.getFirstValue(item.type, "manual"),
        sourceName: U.getFirstValue(item.sourceName, item.source, ""),
        lastChecked: U.getFirstValue(item.lastChecked, ""),
        confidence: U.getFirstValue(item.confidence, "")
      };
    }

    return {
      label: "Source",
      value: String(item),
      type: "manual"
    };
  }

  function mergeStatuses(statuses) {
    const normalizedValues = statuses.map((status) => status.normalized);

    if (normalizedValues.every((value) => value === "ready")) {
      return { normalized: "ready", label: "Ready" };
    }

    if (normalizedValues.some((value) => value === "ready" || value === "partial")) {
      return { normalized: "partial", label: "Partial" };
    }

    if (normalizedValues.some((value) => value === "api")) {
      return { normalized: "api", label: "API" };
    }

    return { normalized: "empty", label: "Empty" };
  }

  function getByPath(object, path) {
    return String(path)
      .split(".")
      .reduce((current, key) => {
        if (!current || typeof current !== "object") return undefined;
        return current[key];
      }, object);
  }

  window.MCCStatus = {
    CORE_SECTIONS,
    ADVANCED_SECTIONS,
    ALL_SECTIONS,
    normalizeOfficeType,
    normalizeParty,
    partyLabel,
    normalizeCompletion,
    calculateCompletionScore,
    getAdvancedSectionRawValue,
    getSectionStatus,
    getDataQualityNotes,
    getSourceTrackingItems,
    getGroupedSourceTrackingItems,
    getSourceTrackingSummary,
    mergeStatuses
  };
})();
