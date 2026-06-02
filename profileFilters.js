(function () {
  function bindFilterControls({ state, onChange }) {
    const profileSearch = document.getElementById("profileSearch");
    const officeTypeFilter = document.getElementById("officeTypeFilter");
    const partyFilter = document.getElementById("partyFilter");
    const completionFilter = document.getElementById("completionFilter");
    const clearFiltersButton = document.getElementById("clearFiltersButton");

    if (profileSearch) {
      profileSearch.addEventListener("input", () => {
        state.filters.search = profileSearch.value.trim().toLowerCase();
        onChange();
      });
    }

    if (officeTypeFilter) {
      officeTypeFilter.addEventListener("change", () => {
        state.filters.officeType = officeTypeFilter.value;
        onChange();
      });
    }

    if (partyFilter) {
      partyFilter.addEventListener("change", () => {
        state.filters.party = partyFilter.value;
        onChange();
      });
    }

    if (completionFilter) {
      completionFilter.addEventListener("change", () => {
        state.filters.completion = completionFilter.value;
        onChange();
      });
    }

    if (clearFiltersButton) {
      clearFiltersButton.addEventListener("click", () => {
        state.filters = {
          search: "",
          officeType: "all",
          party: "all",
          completion: "all"
        };

        if (profileSearch) profileSearch.value = "";
        if (officeTypeFilter) officeTypeFilter.value = "all";
        if (partyFilter) partyFilter.value = "all";
        if (completionFilter) completionFilter.value = "all";

        onChange();
      });
    }
  }

  function getFilteredPeople(people, filters) {
    return people.filter((person) => {
      const searchBlob = [
        person.name,
        person.preferredName,
        person.fullName,
        person.title,
        person.office,
        person.district,
        person.state,
        person.party,
        person.officeType,
        person.completionStatus
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !filters.search || searchBlob.includes(filters.search);

      const matchesOfficeType =
        filters.officeType === "all" ||
        person.officeTypeNormalized === filters.officeType;

      const matchesParty =
        filters.party === "all" ||
        person.partyNormalized === filters.party;

      const matchesCompletion =
        filters.completion === "all" ||
        person.completionNormalized === filters.completion;

      return matchesSearch && matchesOfficeType && matchesParty && matchesCompletion;
    });
  }

  window.MCCFilters = {
    bindFilterControls,
    getFilteredPeople
  };
})();