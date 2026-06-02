(function () {
  const PEOPLE_URL = "data/people.json";
  const TEMP_PROFILE_PREFIX = "temp-preview-";

  const U = window.MCCUtils;
  const S = window.MCCStatus;
  const F = window.MCCFilters;
  const R = window.MCCRender;
  const B = window.MCCBuilder;
  const M = window.MCCRosterMatrix;

  const state = {
    people: [],
    filteredPeople: [],
    activePersonId: null,
    mode: "profile",
    filters: {
      search: "",
      officeType: "all",
      party: "all",
      completion: "all"
    }
  };

  document.addEventListener("DOMContentLoaded", initApp);

  async function initApp() {
    F.bindFilterControls({
      state,
      onChange: applyFilters
    });

    bindNewProfileButton();
    bindRosterMatrixButton();

    try {
      const response = await fetch(PEOPLE_URL, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`GET ${PEOPLE_URL} failed with status ${response.status}`);
      }

      const data = await response.json();
      state.people = normalizePeoplePayload(data);
      state.filteredPeople = [...state.people];

      const firstPerson = state.people[0];
      state.activePersonId = firstPerson ? firstPerson.id : null;

      U.hideElement("loadingState");
      U.showElement("profileView");

      applyFilters();
    } catch (error) {
      U.hideElement("loadingState");
      U.showElement("errorState");

      const errorMessage = document.getElementById("errorMessage");
      if (errorMessage) {
        errorMessage.textContent = error.message || "Unknown error loading profile data.";
      }

      console.error(error);
    }
  }

  function bindNewProfileButton() {
    const newProfileButton = document.getElementById("newProfileButton");

    if (!newProfileButton) return;

    newProfileButton.addEventListener("click", () => {
      state.mode = "builder";
      state.activePersonId = null;
      renderApp();
    });
  }

  function bindRosterMatrixButton() {
    const rosterMatrixButton = document.getElementById("rosterMatrixButton");

    if (!rosterMatrixButton) return;

    rosterMatrixButton.addEventListener("click", () => {
      state.mode = "roster";

      if (!state.activePersonId && state.filteredPeople.length > 0) {
        state.activePersonId = state.filteredPeople[0].id;
      }

      renderApp();
    });
  }

  function applyFilters() {
    state.filteredPeople = F.getFilteredPeople(state.people, state.filters);

    if (state.mode === "profile") {
      if (
        state.filteredPeople.length > 0 &&
        !state.filteredPeople.some((person) => person.id === state.activePersonId)
      ) {
        state.activePersonId = state.filteredPeople[0].id;
      }

      if (state.filteredPeople.length === 0) {
        state.activePersonId = null;
      }
    }

    renderApp();
  }

  function renderApp() {
    R.renderProfileList({
      people: state.filteredPeople,
      activePersonId: state.activePersonId,
      onSelect: (profileId) => {
        state.mode = "profile";
        state.activePersonId = profileId;
        renderApp();
      }
    });

    R.renderFilterSummary({
      total: state.people.length,
      visible: state.filteredPeople.length
    });

    if (state.mode === "builder") {
      B.renderProfileBuilder({
        existingPeople: state.people,
        onBackToProfiles: () => {
          state.mode = "profile";

          if (!state.activePersonId && state.filteredPeople.length > 0) {
            state.activePersonId = state.filteredPeople[0].id;
          }

          renderApp();
        },
        onPreviewGeneratedProfile: (rawProfile) => {
          previewGeneratedProfile(rawProfile);
        }
      });

      return;
    }

    if (state.mode === "roster") {
      if (M && typeof M.renderRosterMatrixView === "function") {
        M.renderRosterMatrixView({
          people: state.people.filter((person) => !person.isTemporaryPreview),
          filteredPeople: state.filteredPeople.filter((person) => !person.isTemporaryPreview),
          activePersonId: state.activePersonId,
          onOpenProfile: (profileId) => {
            state.mode = "profile";
            state.activePersonId = profileId;
            clearUiFilters();
            state.filters = {
              search: "",
              officeType: "all",
              party: "all",
              completion: "all"
            };
            applyFilters();
          },
          onApplyProfileFilter: (nextFilters) => {
            state.mode = "profile";
            applyUiFilters(nextFilters);
          }
        });
      }

      return;
    }

    const activePerson = state.people.find((person) => person.id === state.activePersonId) || null;
    R.renderProfileView(activePerson);
  }

  function previewGeneratedProfile(rawProfile) {
    if (!rawProfile || typeof rawProfile !== "object") return;

    const tempId = `${TEMP_PROFILE_PREFIX}${rawProfile.id || U.slugify(rawProfile.fullName || rawProfile.displayName || "new-profile")}`;

    const tempRawProfile = {
      ...rawProfile,
      id: tempId,
      displayName: `${rawProfile.displayName || rawProfile.fullName || "New Profile"} Preview`,
      fullName: rawProfile.fullName || rawProfile.displayName || "New Profile",
      isTemporaryPreview: true,
      dataQualityNotes: [
        ...(Array.isArray(rawProfile.dataQualityNotes) ? rawProfile.dataQualityNotes : []),
        {
          label: "Temporary preview",
          value: "This profile exists only in browser memory. Refreshing the page removes it. Copy the JSON and paste it into data/people.json to make it permanent.",
          severity: "note",
          owner: "builder",
          lastChecked: new Date().toISOString().slice(0, 10)
        }
      ],
      sourceTracking: [
        ...(Array.isArray(rawProfile.sourceTracking) ? rawProfile.sourceTracking : []),
        {
          label: "Temporary profile preview",
          value: "Generated profile was previewed locally without writing to disk.",
          type: "local-preview",
          sourceName: "Member Command Center",
          sourceUrl: "",
          lastChecked: new Date().toISOString().slice(0, 10),
          confidence: "Preview only"
        }
      ],
      proofStatus: {
        ...(rawProfile.proofStatus || {}),
        temporaryPreview: "Preview only, not saved to people.json"
      }
    };

    const normalizedPreview = normalizePerson(tempRawProfile, state.people.length);
    normalizedPreview.isTemporaryPreview = true;
    normalizedPreview.name = `${normalizedPreview.name} Preview`;

    state.people = [
      ...state.people.filter((person) => !person.isTemporaryPreview),
      normalizedPreview
    ];

    state.mode = "profile";
    state.activePersonId = normalizedPreview.id;

    temporarilyClearFiltersForPreview(normalizedPreview);
    applyFilters();
  }

  function temporarilyClearFiltersForPreview(previewProfile) {
    const profileWouldBeVisible = F.getFilteredPeople([previewProfile], state.filters).length > 0;

    if (profileWouldBeVisible) return;

    state.filters = {
      search: "",
      officeType: "all",
      party: "all",
      completion: "all"
    };

    clearUiFilters();
  }

  function clearUiFilters() {
    const profileSearch = document.getElementById("profileSearch");
    const officeTypeFilter = document.getElementById("officeTypeFilter");
    const partyFilter = document.getElementById("partyFilter");
    const completionFilter = document.getElementById("completionFilter");

    if (profileSearch) profileSearch.value = "";
    if (officeTypeFilter) officeTypeFilter.value = "all";
    if (partyFilter) partyFilter.value = "all";
    if (completionFilter) completionFilter.value = "all";
  }

  function applyUiFilters(nextFilters) {
    const profileSearch = document.getElementById("profileSearch");
    const officeTypeFilter = document.getElementById("officeTypeFilter");
    const partyFilter = document.getElementById("partyFilter");
    const completionFilter = document.getElementById("completionFilter");

    const mergedFilters = {
      search: "",
      officeType: "all",
      party: "all",
      completion: "all",
      ...(nextFilters || {})
    };

    state.filters = mergedFilters;

    if (profileSearch) profileSearch.value = mergedFilters.search;
    if (officeTypeFilter) officeTypeFilter.value = mergedFilters.officeType;
    if (partyFilter) partyFilter.value = mergedFilters.party;
    if (completionFilter) completionFilter.value = mergedFilters.completion;

    applyFilters();
  }

  function normalizePeoplePayload(data) {
    const rawPeople = Array.isArray(data)
      ? data
      : Array.isArray(data.people)
        ? data.people
        : Array.isArray(data.profiles)
          ? data.profiles
          : [];

    return rawPeople.map((rawPerson, index) => normalizePerson(rawPerson, index));
  }

  function normalizePerson(rawPerson, index) {
    const name = U.getFirstValue(
      rawPerson.name,
      rawPerson.fullName,
      rawPerson.preferredName,
      rawPerson.displayName,
      `Profile ${index + 1}`
    );

    const id = String(
      U.getFirstValue(
        rawPerson.id,
        rawPerson.slug,
        rawPerson.bioguideId,
        rawPerson.fecCandidateId,
        rawPerson.sourceIdentity?.bioguideId,
        rawPerson.sourceIdentity?.fecCandidateId,
        U.slugify(name),
        `profile-${index + 1}`
      )
    );

    const officeTypeNormalized = S.normalizeOfficeType(rawPerson);
    const partyNormalized = S.normalizeParty(rawPerson.party);
    const completion = S.normalizeCompletion(rawPerson);

    return {
      ...rawPerson,
      id,
      name,
      officeTypeNormalized,
      officeTypeLabel: U.toTitleCase(officeTypeNormalized),
      partyNormalized,
      partyLabel: S.partyLabel(partyNormalized, rawPerson.party),
      completionNormalized: completion.normalized,
      completionLabel: completion.label,
      completionScore: completion.score,
      title: U.getFirstValue(rawPerson.title, rawPerson.officeTitle, rawPerson.office, rawPerson.currentOffice, ""),
      district: U.getFirstValue(rawPerson.district, rawPerson.districtLabel, rawPerson.jurisdiction, ""),
      state: U.getFirstValue(rawPerson.state, rawPerson.stateCode, rawPerson.region, "")
    };
  }

  window.MCCApp = {
    state,
    applyFilters,
    renderApp,
    previewGeneratedProfile
  };
})();