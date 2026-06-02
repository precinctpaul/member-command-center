(function () {
  const PEOPLE_URL = "data/people.json";

  const U = window.MCCUtils;
  const S = window.MCCStatus;
  const F = window.MCCFilters;
  const R = window.MCCRender;

  const state = {
    people: [],
    filteredPeople: [],
    activePersonId: null,
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

  function applyFilters() {
    state.filteredPeople = F.getFilteredPeople(state.people, state.filters);

    if (
      state.filteredPeople.length > 0 &&
      !state.filteredPeople.some((person) => person.id === state.activePersonId)
    ) {
      state.activePersonId = state.filteredPeople[0].id;
    }

    if (state.filteredPeople.length === 0) {
      state.activePersonId = null;
    }

    renderApp();
  }

  function renderApp() {
    R.renderProfileList({
      people: state.filteredPeople,
      activePersonId: state.activePersonId,
      onSelect: (profileId) => {
        state.activePersonId = profileId;
        renderApp();
      }
    });

    R.renderFilterSummary({
      total: state.people.length,
      visible: state.filteredPeople.length
    });

    const activePerson = state.people.find((person) => person.id === state.activePersonId) || null;
    R.renderProfileView(activePerson);
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
    renderApp
  };
})();