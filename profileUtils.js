(function () {
  function hasContent(value) {
    if (value === null || value === undefined) return false;

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }

    return true;
  }

  function getFirstValue(...values) {
    return values.find((value) => hasContent(value));
  }

  function stringifyValue(value) {
    if (value === null || value === undefined) return "";

    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    if (Array.isArray(value)) {
      return value.map((item) => stringifyValue(item)).join(", ");
    }

    if (typeof value === "object") {
      return Object.entries(value)
        .filter(([, entryValue]) => hasContent(entryValue))
        .map(([key, entryValue]) => `${humanizeKey(key)}: ${stringifyValue(entryValue)}`)
        .join("; ");
    }

    return String(value);
  }

  function isUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function getInitials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function humanizeKey(key) {
    return String(key)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  }

  function toTitleCase(value) {
    return String(value || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function shortSectionLabel(sectionTitle) {
    const labels = {
      "Profile Completion": "Completion",
      "Source of Truth": "Truth",
      "Universal Reference": "IDs",
      "Bio Library": "Bio",
      "Headshot and Media Asset": "Media",
      "Official Links and Contact": "Links",
      "Committees and Caucuses": "Committees",
      "Race Context and Opponent Data": "Race",
      "Fact-Check Index": "Fact-check",
      "Media Tracking and Public Commentary": "Tracking",
      "YouTube Proof Videos": "YouTube",
      "Web Clippings and Public Mentions": "Clippings",
      "Deep Campaign Finance": "Finance",
      "Legislative Mechanics and Floor Records": "Legislative",
      "Floor Debates and Verbal Records": "Floor",
      "Political Geography and Electoral Venues": "Geography",
      "Power Mapping and Staff Networks": "Power map",
      "Real-Time Alerts Infrastructure": "Alerts",
      "Green Easy Win API Integrations": "APIs",
      "Campaign Finance Snapshot": "Snapshot",
      "Connection Status": "Connections",
      "Verified Source Endpoints": "Sources"
    };

    return labels[sectionTitle] || sectionTitle;
  }

  function getSectionId(sectionTitle) {
    return `section-${slugify(sectionTitle)}`;
  }

  function clampNumber(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeArray(value) {
    if (!hasContent(value)) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  function normalizeLinks(items) {
    return items.filter(([, url]) => typeof url === "string" && url.trim().length > 0);
  }

  function flattenObject(object) {
    return Object.entries(object).filter(([, value]) => hasContent(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function showElement(id) {
    const element = document.getElementById(id);
    if (element) element.classList.remove("hidden");
  }

  function hideElement(id) {
    const element = document.getElementById(id);
    if (element) element.classList.add("hidden");
  }

  window.MCCUtils = {
    hasContent,
    getFirstValue,
    stringifyValue,
    isUrl,
    getInitials,
    slugify,
    humanizeKey,
    toTitleCase,
    shortSectionLabel,
    getSectionId,
    clampNumber,
    normalizeArray,
    normalizeLinks,
    flattenObject,
    escapeHtml,
    escapeAttribute,
    showElement,
    hideElement
  };
})();
