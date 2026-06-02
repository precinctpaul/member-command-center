(function () {
  const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
  const YOUTUBE_KEY_STORAGE_KEY = "mcc_youtube_api_key";
  const DEFAULT_MAX_RESULTS = "10";

  const U = window.MCCUtils;

  if (!window.MCCRender || typeof window.MCCRender.renderProfileView !== "function") {
    console.warn("MCC YouTube snapshot enhancer could not find MCCRender.renderProfileView.");
    return;
  }

  const originalRenderProfileView = window.MCCRender.renderProfileView;

  window.MCCRender.renderProfileView = function enhancedRenderProfileView(person) {
    originalRenderProfileView(person);
    mountYouTubeSnapshot(person);
  };

  function mountYouTubeSnapshot(person) {
    if (!person) return;

    const section = document.getElementById("section-youtube-proof-videos");
    if (!section) return;

    const sectionBody = section.querySelector(".section-body");
    if (!sectionBody) return;

    sectionBody.innerHTML = renderYouTubePanel(person);
    bindYouTubeEvents(person);
  }

  function renderYouTubePanel(person) {
    const channelId = getYouTubeChannelId(person);
    const savedKey = getSavedApiKey();
    const suggestedSearch = buildSuggestedSearch(person);

    return `
      <div class="completion-meter">
        <div class="grid-three">
          <div class="info-card">
            <div class="info-label">Detected YouTube Channel ID</div>
            <div class="info-value">${U.escapeHtml(channelId || "Missing")}</div>
          </div>

          <div class="info-card">
            <div class="info-label">Result limit</div>
            <select id="youtubeMaxResults" class="filter-select">
              ${["5", "10", "20", "50"].map((limit) => `
                <option value="${limit}" ${limit === DEFAULT_MAX_RESULTS ? "selected" : ""}>${limit}</option>
              `).join("")}
            </select>
          </div>

          <div class="info-card">
            <div class="info-label">Mode</div>
            <div class="info-value">
              ${channelId ? "Channel snapshot available" : "Channel discovery needed"}
            </div>
          </div>
        </div>

        <div class="grid-three">
          <div class="info-card">
            <label class="info-label" for="youtubeApiKey">YouTube Data API key</label>
            <input
              id="youtubeApiKey"
              class="search-input"
              type="password"
              placeholder="Paste YouTube API key for local testing"
              value="${U.escapeAttribute(savedKey)}"
              autocomplete="off"
            />
          </div>

          <div class="info-card">
            <div class="info-label">Local key storage</div>
            <div class="info-value">
              ${savedKey ? "Saved in this browser localStorage." : "No key saved yet."}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Security note</div>
            <div class="info-value">
              Local-only testing.  Production needs a backend/proxy so keys are not exposed in browser JavaScript.
            </div>
          </div>
        </div>

        <div class="grid-three">
          <button id="saveYouTubeKeyButton" class="secondary-button" type="button">
            Save Key
          </button>

          <button id="clearYouTubeKeyButton" class="secondary-button" type="button">
            Clear Key
          </button>

          <button id="fetchYouTubeSnapshotButton" class="secondary-button" type="button">
            Fetch YouTube Snapshot
          </button>
        </div>

        <div style="height: 12px"></div>

        <div class="grid-three">
          <div class="info-card">
            <label class="info-label" for="youtubeChannelSearchQuery">Channel search query</label>
            <input
              id="youtubeChannelSearchQuery"
              class="search-input"
              type="text"
              value="${U.escapeAttribute(suggestedSearch)}"
              placeholder="Search for an official YouTube channel"
              autocomplete="off"
            />
          </div>

          <div class="info-card">
            <div class="info-label">Search purpose</div>
            <div class="info-value">
              Use this when a profile has no YouTube channel ID yet.
            </div>
          </div>

          <button id="searchYouTubeChannelsButton" class="secondary-button" type="button">
            Search Channels
          </button>
        </div>

        <div id="youtubeStatus" class="empty">
          Ready.  Enter a YouTube API key, then fetch a channel snapshot or search for channel candidates.
        </div>

        <div id="youtubeResults">
          ${renderStaticYouTubeFields(person)}
        </div>
      </div>
    `;
  }

  function renderStaticYouTubeFields(person) {
    const media = person.mediaTracking || {};
    const links = person.officialLinks || {};
    const social = person.social || {};

    const rows = [
      ["YouTube Channel ID", getYouTubeChannelId(person)],
      ["YouTube Channel Title", links.youtubeChannelTitle || media.youtubeChannelTitle],
      ["YouTube URL", person.youtubeUrl || person.links?.youtube || social.youtube || person.media?.youtubeChannelUrl],
      ["Proof videos", Array.isArray(media.proofVideos) ? `${media.proofVideos.length} saved proof videos` : ""],
      ["YouTube search status", media.youtubeSearchResultsReturned],
      ["Official channel published at", media.officialChannelPublishedAt],
      ["Implementation note", media.implementationNote]
    ].filter(([, value]) => U.hasContent(value));

    if (!rows.length) {
      return `
        <div class="empty">
          No local YouTube or media proof fields have been saved into this profile yet.
        </div>
      `;
    }

    return `
      <div class="info-label">Saved local YouTube/media fields</div>
      ${renderKeyValueGrid(rows, true)}
    `;
  }

  function bindYouTubeEvents(person) {
    const saveButton = document.getElementById("saveYouTubeKeyButton");
    const clearButton = document.getElementById("clearYouTubeKeyButton");
    const fetchButton = document.getElementById("fetchYouTubeSnapshotButton");
    const searchButton = document.getElementById("searchYouTubeChannelsButton");

    if (saveButton) {
      saveButton.addEventListener("click", () => {
        const keyInput = document.getElementById("youtubeApiKey");
        const key = keyInput ? keyInput.value.trim() : "";

        if (!key) {
          setStatus("Enter a key before saving.", "warning");
          return;
        }

        localStorage.setItem(YOUTUBE_KEY_STORAGE_KEY, key);
        setStatus("YouTube API key saved locally in this browser.", "success");
      });
    }

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        localStorage.removeItem(YOUTUBE_KEY_STORAGE_KEY);

        const keyInput = document.getElementById("youtubeApiKey");
        if (keyInput) keyInput.value = "";

        setStatus("YouTube API key cleared from localStorage.", "success");
      });
    }

    if (fetchButton) {
      fetchButton.addEventListener("click", async () => {
        await fetchAndRenderYouTubeSnapshot(person);
      });
    }

    if (searchButton) {
      searchButton.addEventListener("click", async () => {
        await searchAndRenderYouTubeChannels(person);
      });
    }
  }

  async function fetchAndRenderYouTubeSnapshot(person) {
    const channelId = getYouTubeChannelId(person);
    const keyInput = document.getElementById("youtubeApiKey");
    const maxResultsSelect = document.getElementById("youtubeMaxResults");

    const apiKey = keyInput ? keyInput.value.trim() : "";
    const maxResults = maxResultsSelect ? maxResultsSelect.value : DEFAULT_MAX_RESULTS;

    if (!apiKey) {
      setStatus("YouTube API key is required for this local test.", "warning");
      return;
    }

    if (!channelId) {
      setStatus("This profile does not have a YouTube channel ID yet.  Use Search Channels first.", "warning");
      return;
    }

    localStorage.setItem(YOUTUBE_KEY_STORAGE_KEY, apiKey);

    setStatus("Fetching YouTube channel and latest videos...", "loading");
    setFetchButtonBusy(true);

    try {
      const channelData = await fetchYouTubeJson("/channels", {
        key: apiKey,
        part: "snippet,statistics,contentDetails",
        id: channelId
      });

      const channel = Array.isArray(channelData.items) ? channelData.items[0] : null;

      if (!channel) {
        throw new Error("YouTube did not return a channel for this channel ID.");
      }

      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads || "";

      const playlistData = uploadsPlaylistId
        ? await fetchYouTubeJson("/playlistItems", {
            key: apiKey,
            part: "snippet,contentDetails",
            playlistId: uploadsPlaylistId,
            maxResults
          })
        : null;

      const videos = playlistData && Array.isArray(playlistData.items)
        ? playlistData.items
        : [];

      const videoIds = videos
        .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
        .filter(Boolean);

      const videoDetails = videoIds.length
        ? await fetchYouTubeJson("/videos", {
            key: apiKey,
            part: "snippet,statistics,contentDetails",
            id: videoIds.join(",")
          })
        : null;

      renderYouTubeSnapshotResults({
        person,
        channel,
        uploadsPlaylistId,
        videos,
        videoDetails,
        diagnostics: {
          channel: { ok: true, count: channel ? 1 : 0 },
          playlistItems: { ok: Boolean(playlistData), count: videos.length },
          videoDetails: { ok: Boolean(videoDetails), count: videoDetails?.items?.length || 0 }
        }
      });

      setStatus("YouTube snapshot fetched.  Review channel stats and latest videos below.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "YouTube request failed.", "error");
    } finally {
      setFetchButtonBusy(false);
    }
  }

  async function searchAndRenderYouTubeChannels(person) {
    const keyInput = document.getElementById("youtubeApiKey");
    const queryInput = document.getElementById("youtubeChannelSearchQuery");
    const maxResultsSelect = document.getElementById("youtubeMaxResults");

    const apiKey = keyInput ? keyInput.value.trim() : "";
    const query = queryInput ? queryInput.value.trim() : "";
    const maxResults = maxResultsSelect ? maxResultsSelect.value : DEFAULT_MAX_RESULTS;

    if (!apiKey) {
      setStatus("YouTube API key is required for channel search.", "warning");
      return;
    }

    if (!query) {
      setStatus("Enter a channel search query first.", "warning");
      return;
    }

    localStorage.setItem(YOUTUBE_KEY_STORAGE_KEY, apiKey);

    setStatus("Searching YouTube channel candidates...", "loading");
    setSearchButtonBusy(true);

    try {
      const searchData = await fetchYouTubeJson("/search", {
        key: apiKey,
        part: "snippet",
        q: query,
        type: "channel",
        maxResults,
        order: "relevance"
      });

      const candidates = Array.isArray(searchData.items) ? searchData.items : [];

      const candidateIds = candidates
        .map((item) => item.id?.channelId || item.snippet?.channelId)
        .filter(Boolean);

      const detailsData = candidateIds.length
        ? await fetchYouTubeJson("/channels", {
            key: apiKey,
            part: "snippet,statistics,contentDetails",
            id: candidateIds.join(",")
          })
        : null;

      renderYouTubeChannelSearchResults({
        person,
        query,
        candidates,
        details: detailsData && Array.isArray(detailsData.items) ? detailsData.items : []
      });

      setStatus("Channel search complete.  Review candidates and copy the correct channel ID into people.json when verified.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "YouTube channel search failed.", "error");
    } finally {
      setSearchButtonBusy(false);
    }
  }

  async function fetchYouTubeJson(path, params) {
    const url = new URL(`${YOUTUBE_API_BASE}${path}`);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`YouTube ${path} failed with ${response.status}: ${text.slice(0, 220)}`);
    }

    return response.json();
  }

  function renderYouTubeSnapshotResults({ person, channel, uploadsPlaylistId, videos, videoDetails, diagnostics }) {
    const container = document.getElementById("youtubeResults");
    if (!container) return;

    const snippet = channel.snippet || {};
    const stats = channel.statistics || {};
    const detailItems = videoDetails && Array.isArray(videoDetails.items) ? videoDetails.items : [];

    const summaryRows = [
      ["Channel title", snippet.title || "Not returned"],
      ["Channel ID", channel.id || "Not returned"],
      ["Custom URL", snippet.customUrl || "Not returned"],
      ["Published at", formatDateTime(snippet.publishedAt) || "Not returned"],
      ["Subscribers", formatNumber(stats.subscriberCount)],
      ["Total channel views", formatNumber(stats.viewCount)],
      ["Video count", formatNumber(stats.videoCount)],
      ["Uploads playlist ID", uploadsPlaylistId || "Not returned"],
      ["Latest videos returned", videos.length],
      ["Profile", person.name || "Profile"]
    ];

    container.innerHTML = `
      <div class="info-label">Live YouTube channel summary</div>
      ${renderKeyValueGrid(summaryRows, true)}

      <div style="height: 14px"></div>

      <div class="grid-three">
        ${renderMiniCountCard("Subscribers", formatNumber(stats.subscriberCount))}
        ${renderMiniCountCard("Total views", formatNumber(stats.viewCount))}
        ${renderMiniCountCard("Videos returned", videos.length)}
      </div>

      <div style="height: 14px"></div>

      ${renderLatestVideos({
        videos,
        videoDetails: detailItems
      })}

      <div style="height: 14px"></div>

      ${renderVideoStatsPreview(detailItems)}

      <div style="height: 14px"></div>

      <div class="info-label">Request diagnostics</div>
      ${renderKeyValueGrid([
        ["Channel lookup", `${diagnostics.channel.ok ? "OK" : "Failed"}, ${diagnostics.channel.count} result${diagnostics.channel.count === 1 ? "" : "s"}`],
        ["Uploads playlist lookup", `${diagnostics.playlistItems.ok ? "OK" : "Failed"}, ${diagnostics.playlistItems.count} result${diagnostics.playlistItems.count === 1 ? "" : "s"}`],
        ["Video detail lookup", `${diagnostics.videoDetails.ok ? "OK" : "Failed"}, ${diagnostics.videoDetails.count} result${diagnostics.videoDetails.count === 1 ? "" : "s"}`]
      ], false)}

      <div style="height: 14px"></div>

      <div class="empty">
        These results are fetched live for local proof-of-concept use.  They are not written into <code>data/people.json</code>.  For production, this should move behind a backend/proxy and a persistent refresh workflow.
      </div>
    `;
  }

  function renderYouTubeChannelSearchResults({ person, query, candidates, details }) {
    const container = document.getElementById("youtubeResults");
    if (!container) return;

    const detailById = new Map(details.map((detail) => [detail.id, detail]));

    const rows = candidates.map((candidate) => {
      const channelId = candidate.id?.channelId || candidate.snippet?.channelId || "";
      const detail = detailById.get(channelId) || {};
      const snippet = detail.snippet || candidate.snippet || {};
      const stats = detail.statistics || {};
      const url = channelId ? `https://www.youtube.com/channel/${channelId}` : "";

      return `
        <div class="list-item">
          <strong>${U.escapeHtml(snippet.title || "Channel candidate")}</strong>
          <p>${U.escapeHtml(snippet.description || "No description returned.")}</p>
          <p>Channel ID: ${U.escapeHtml(channelId || "Not returned")}</p>
          <p>Subscribers: ${U.escapeHtml(formatNumber(stats.subscriberCount))} · Videos: ${U.escapeHtml(formatNumber(stats.videoCount))} · Views: ${U.escapeHtml(formatNumber(stats.viewCount))}</p>
          ${url ? `<p><a href="${U.escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(url)}</a></p>` : ""}
          ${channelId ? `<button class="copy-button" type="button" data-youtube-copy="${U.escapeAttribute(channelId)}">Copy Channel ID</button>` : ""}
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <div class="info-label">YouTube channel search candidates</div>

      <div class="grid-three">
        ${renderMiniCountCard("Search query", query)}
        ${renderMiniCountCard("Candidates returned", candidates.length)}
        ${renderMiniCountCard("Profile", person.name || "Profile")}
      </div>

      <div style="height: 14px"></div>

      ${rows ? `<div class="list">${rows}</div>` : `<div class="empty">No channel candidates returned.</div>`}

      <div style="height: 14px"></div>

      <div class="empty">
        Verification rule: do not paste a channel ID into <code>people.json</code> until you confirm it is the official channel.  Use the channel URL, description, linked official website, and public branding to verify.
      </div>
    `;

    bindYouTubeCopyButtons();
  }

  function renderLatestVideos({ videos, videoDetails }) {
    if (!videos.length) {
      return `
        <div class="info-label">Latest videos</div>
        <div class="empty">No uploaded videos returned in this sample request.</div>
      `;
    }

    const detailsById = new Map(videoDetails.map((detail) => [detail.id, detail]));

    const rows = videos.map((item) => {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
      const detail = detailsById.get(videoId) || {};
      const snippet = detail.snippet || item.snippet || {};
      const stats = detail.statistics || {};
      const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
      const publishedAt = item.contentDetails?.videoPublishedAt || snippet.publishedAt || item.snippet?.publishedAt || "";

      return `
        <div class="list-item">
          <strong>${U.escapeHtml(snippet.title || "Video")}</strong>
          <p>${U.escapeHtml(snippet.description ? truncateText(snippet.description, 220) : "No description returned.")}</p>
          <p>Published: ${U.escapeHtml(formatDateTime(publishedAt) || "Not returned")}</p>
          <p>Views: ${U.escapeHtml(formatNumber(stats.viewCount))} · Likes: ${U.escapeHtml(formatNumber(stats.likeCount))} · Comments: ${U.escapeHtml(formatNumber(stats.commentCount))}</p>
          ${videoUrl ? `<p><a href="${U.escapeAttribute(videoUrl)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(videoUrl)}</a></p>` : ""}
          ${videoId ? `<button class="copy-button" type="button" data-youtube-copy="${U.escapeAttribute(videoUrl)}">Copy Video URL</button>` : ""}
        </div>
      `;
    }).join("");

    window.setTimeout(bindYouTubeCopyButtons, 0);

    return `
      <div class="info-label">Latest videos</div>
      <div class="list">${rows}</div>
    `;
  }

  function renderVideoStatsPreview(videoDetails) {
    if (!videoDetails.length) {
      return `
        <div class="info-label">Video performance preview</div>
        <div class="empty">No video detail stats returned.</div>
      `;
    }

    const sortedByViews = [...videoDetails]
      .sort((a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0))
      .slice(0, 5);

    const rows = sortedByViews.map((video) => {
      const title = video.snippet?.title || "Video";
      const stats = video.statistics || {};
      const url = video.id ? `https://www.youtube.com/watch?v=${video.id}` : "";

      return [
        title,
        `${formatNumber(stats.viewCount)} views${url ? ` | ${url}` : ""}`
      ];
    });

    return `
      <div class="info-label">Top returned videos by views</div>
      ${renderKeyValueGrid(rows, true)}
    `;
  }

  function renderMiniCountCard(label, value) {
    return `
      <div class="info-card">
        <div class="info-label">${U.escapeHtml(label)}</div>
        <div class="info-value">${U.escapeHtml(value)}</div>
      </div>
    `;
  }

  function renderKeyValueGrid(items, copyable) {
    const rows = items
      .filter((item) => U.hasContent(item[1]))
      .map(([label, value]) => {
        const displayValue = stringifyDisplayValue(value);
        const valueHtml = U.isUrl(displayValue)
          ? `<a href="${U.escapeAttribute(displayValue)}" target="_blank" rel="noopener noreferrer">${U.escapeHtml(displayValue)}</a>`
          : U.escapeHtml(displayValue);

        const copyButton = copyable
          ? `<button class="copy-button" type="button" data-youtube-copy="${U.escapeAttribute(displayValue)}">Copy</button>`
          : "";

        return `
          <div class="info-card">
            <div class="info-label">${U.escapeHtml(label)}</div>
            <div class="copy-row">
              <div class="info-value">${valueHtml}</div>
              ${copyButton}
            </div>
          </div>
        `;
      })
      .join("");

    window.setTimeout(bindYouTubeCopyButtons, 0);

    return `<div class="grid-three">${rows}</div>`;
  }

  function bindYouTubeCopyButtons() {
    document.querySelectorAll("[data-youtube-copy]").forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";

      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const value = button.getAttribute("data-youtube-copy") || "";

        try {
          await navigator.clipboard.writeText(value);
          const originalText = button.textContent;
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = originalText;
          }, 1100);
        } catch (error) {
          console.error(error);
          button.textContent = "Copy failed";
          setTimeout(() => {
            button.textContent = "Copy";
          }, 1100);
        }
      });
    });
  }

  function getYouTubeChannelId(person) {
    return U.getFirstValue(
      person.youtubeChannelId,
      person.ids?.youtubeChannelId,
      person.identifiers?.youtubeChannelId,
      person.sourceIdentity?.youtubeChannelId,
      person.officialLinks?.youtubeChannelId,
      person.mediaTracking?.youtubeChannelId,
      person.media?.youtubeChannelId,
      person.social?.youtubeChannelId
    ) || "";
  }

  function buildSuggestedSearch(person) {
    const name = U.getFirstValue(
      person.fullName,
      person.displayName,
      person.name,
      person.preferredName,
      ""
    );

    const title = U.getFirstValue(
      person.title,
      person.currentOffice,
      person.office,
      ""
    );

    const state = U.getFirstValue(person.state, person.stateCode, "");

    return [name, title, state, "official YouTube"]
      .filter(Boolean)
      .join(" ");
  }

  function getSavedApiKey() {
    return localStorage.getItem(YOUTUBE_KEY_STORAGE_KEY) || "";
  }

  function setStatus(message, type) {
    const status = document.getElementById("youtubeStatus");
    if (!status) return;

    const className = type === "error"
      ? "empty error-state"
      : "empty";

    status.className = className;
    status.textContent = message;
  }

  function setFetchButtonBusy(isBusy) {
    const fetchButton = document.getElementById("fetchYouTubeSnapshotButton");
    if (!fetchButton) return;

    fetchButton.disabled = isBusy;
    fetchButton.textContent = isBusy ? "Fetching..." : "Fetch YouTube Snapshot";
  }

  function setSearchButtonBusy(isBusy) {
    const searchButton = document.getElementById("searchYouTubeChannelsButton");
    if (!searchButton) return;

    searchButton.disabled = isBusy;
    searchButton.textContent = isBusy ? "Searching..." : "Search Channels";
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
      return "Not returned";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    return new Intl.NumberFormat("en-US").format(number);
  }

  function formatDateTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function truncateText(value, maxLength) {
    const text = String(value || "").trim();

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
  }

  function stringifyDisplayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";

    return U.stringifyValue(value);
  }
})();