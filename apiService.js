(function attachMemberCommandCenterApiService() {
  const OPEN_FEC_BASE_URL = "https://api.open.fec.gov";
  const CONGRESS_BASE_URL = "https://api.congress.gov";
  const YOUTUBE_BASE_URL = "https://www.googleapis.com/youtube/v3";
  const GOOGLE_CUSTOM_SEARCH_BASE_URL = "https://www.googleapis.com/customsearch/v1";

  function buildUrl(baseUrl, path, params = {}) {
    const url = new URL(path, baseUrl);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  }

  async function fetchJson(url, requestOptions = {}) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(requestOptions.headers || {})
        }
      });

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          url,
          data,
          error: getReadableApiError(data, response.statusText)
        };
      }

      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        url,
        data,
        error: null
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        statusText: "Network or CORS error",
        url,
        data: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function getReadableApiError(data, fallback) {
    if (!data) {
      return fallback || "Unknown API error";
    }

    if (typeof data === "string") {
      return data;
    }

    if (data.error && typeof data.error === "string") {
      return data.error;
    }

    if (data.message && typeof data.message === "string") {
      return data.message;
    }

    if (data.detail && typeof data.detail === "string") {
      return data.detail;
    }

    if (data.errors && Array.isArray(data.errors)) {
      return data.errors.map((item) => item.message || JSON.stringify(item)).join("; ");
    }

    return fallback || "Unknown API error";
  }

  function requireValue(value, label) {
    if (!value) {
      throw new Error(`${label} is required for this API call.`);
    }

    return value;
  }

  function createApiService() {
    return {
      async getOpenFecAudits({ apiKey, committeeId, perPage = 20, page = 1 } = {}) {
        requireValue(apiKey, "OpenFEC API key");

        const url = buildUrl(OPEN_FEC_BASE_URL, "/v1/audit/", {
          api_key: apiKey,
          committee_id: committeeId,
          per_page: perPage,
          page
        });

        return fetchJson(url);
      },

      async getOpenFecDebts({ apiKey, committeeId, perPage = 20, page = 1, sort = "-coverage_end_date" } = {}) {
        requireValue(apiKey, "OpenFEC API key");
        requireValue(committeeId, "OpenFEC committee_id");

        const url = buildUrl(OPEN_FEC_BASE_URL, "/v1/schedules/schedule_d/", {
          api_key: apiKey,
          committee_id: committeeId,
          per_page: perPage,
          page,
          sort
        });

        return fetchJson(url);
      },

      async getOpenFecLoans({ apiKey, committeeId, perPage = 20, page = 1, sort = "-loan_date" } = {}) {
        requireValue(apiKey, "OpenFEC API key");
        requireValue(committeeId, "OpenFEC committee_id");

        const url = buildUrl(OPEN_FEC_BASE_URL, "/v1/schedules/schedule_c/", {
          api_key: apiKey,
          committee_id: committeeId,
          per_page: perPage,
          page,
          sort
        });

        return fetchJson(url);
      },

      async getOpenFecElectioneeringCommunications({
        apiKey,
        candidateId,
        candidateName,
        perPage = 20,
        page = 1,
        sort = "-receipt_date"
      } = {}) {
        requireValue(apiKey, "OpenFEC API key");

        const url = buildUrl(OPEN_FEC_BASE_URL, "/v1/electioneering/", {
          api_key: apiKey,
          candidate_id: candidateId,
          q: candidateName,
          per_page: perPage,
          page,
          sort
        });

        return fetchJson(url);
      },

      async getOpenFecPartyCoordinatedExpenditures({
        apiKey,
        candidateId,
        committeeId,
        perPage = 20,
        page = 1,
        sort = "-expenditure_date"
      } = {}) {
        requireValue(apiKey, "OpenFEC API key");

        const url = buildUrl(OPEN_FEC_BASE_URL, "/v1/schedules/schedule_f/", {
          api_key: apiKey,
          candidate_id: candidateId,
          committee_id: committeeId,
          per_page: perPage,
          page,
          sort
        });

        return fetchJson(url);
      },

      async getCongressCrsReports({ apiKey, query, limit = 20, offset = 0, sort = "update-date+desc" } = {}) {
        requireValue(apiKey, "Congress.gov API key");

        const url = buildUrl(CONGRESS_BASE_URL, "/v3/crsreport", {
          api_key: apiKey,
          format: "json",
          q: query,
          limit,
          offset,
          sort
        });

        return fetchJson(url);
      },

      async getCongressNominations({ apiKey, congress = 119, limit = 20, offset = 0 } = {}) {
        requireValue(apiKey, "Congress.gov API key");

        const url = buildUrl(CONGRESS_BASE_URL, `/v3/nomination/${congress}`, {
          api_key: apiKey,
          format: "json",
          limit,
          offset
        });

        return fetchJson(url);
      },

      async getYouTubeChannelStats({ apiKey, channelId } = {}) {
        requireValue(apiKey, "YouTube API key");
        requireValue(channelId, "YouTube channelId");

        const url = buildUrl(YOUTUBE_BASE_URL, "/channels", {
          key: apiKey,
          part: "snippet,statistics,contentDetails",
          id: channelId
        });

        return fetchJson(url);
      },

      async getGoogleImageSearchResults({
        apiKey,
        cx,
        query,
        num = 10,
        start = 1,
        safe = "active"
      } = {}) {
        requireValue(apiKey, "Google Custom Search API key");
        requireValue(cx, "Google Custom Search Engine ID");
        requireValue(query, "Image search query");

        const url = buildUrl(GOOGLE_CUSTOM_SEARCH_BASE_URL, "", {
          key: apiKey,
          cx,
          q: query,
          searchType: "image",
          num,
          start,
          safe
        });

        return fetchJson(url);
      },

      async getCampaignRiskAndVulnerability({ apiKey, committeeId } = {}) {
        const [audits, debts, loans] = await Promise.all([
          this.getOpenFecAudits({ apiKey, committeeId }),
          this.getOpenFecDebts({ apiKey, committeeId }),
          this.getOpenFecLoans({ apiKey, committeeId })
        ]);

        return {
          ok: audits.ok && debts.ok && loans.ok,
          module: "Campaign Risk & Vulnerability",
          results: {
            audits,
            debts,
            loans
          }
        };
      },

      async getDarkMoneyAndOutsideSpending({ apiKey, candidateId, committeeId, candidateName } = {}) {
        const [electioneering, partyCoordinated] = await Promise.all([
          this.getOpenFecElectioneeringCommunications({ apiKey, candidateId, candidateName }),
          this.getOpenFecPartyCoordinatedExpenditures({ apiKey, candidateId, committeeId })
        ]);

        return {
          ok: electioneering.ok && partyCoordinated.ok,
          module: "Dark Money & Outside Spending",
          results: {
            electioneering,
            partyCoordinated
          }
        };
      },

      async getExpandedLegislativeTracking({ apiKey, query, congress = 119 } = {}) {
        const [crsReports, nominations] = await Promise.all([
          this.getCongressCrsReports({ apiKey, query }),
          this.getCongressNominations({ apiKey, congress })
        ]);

        return {
          ok: crsReports.ok && nominations.ok,
          module: "Expanded Legislative Tracking",
          results: {
            crsReports,
            nominations
          }
        };
      },

      async getDigitalReachAndImageStream({ youtubeApiKey, googleSearchApiKey, googleSearchCx, channelId, query } = {}) {
        const [youtubeChannelStats, imageSearch] = await Promise.all([
          this.getYouTubeChannelStats({ apiKey: youtubeApiKey, channelId }),
          this.getGoogleImageSearchResults({
            apiKey: googleSearchApiKey,
            cx: googleSearchCx,
            query
          })
        ]);

        return {
          ok: youtubeChannelStats.ok && imageSearch.ok,
          module: "Digital Reach & Image Stream",
          results: {
            youtubeChannelStats,
            imageSearch
          }
        };
      }
    };
  }

  window.MemberCommandCenterApiService = createApiService();
})();