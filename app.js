const STORAGE = {
  apiKey: "fog_youtube_api_key",
  playlists: "fog_playlists",
  liked: "fog_liked",
  recent: "fog_recent",
  settings: "fog_settings",
  player: "fog_player_state"
};

const DEFAULT_PLAYLISTS = [
  { id: crypto.randomUUID(), name: "Night Drive", tracks: [] },
  { id: crypto.randomUUID(), name: "Late Hours", tracks: [] },
  { id: crypto.randomUUID(), name: "On Repeat", tracks: [] },
  { id: crypto.randomUUID(), name: "Archive", tracks: [] },
  { id: crypto.randomUUID(), name: "4AM", tracks: [] }
];

let state = {
  apiKey: localStorage.getItem(STORAGE.apiKey) || "",
  playlists: loadJSON(STORAGE.playlists, DEFAULT_PLAYLISTS),
  liked: loadJSON(STORAGE.liked, []),
  recent: loadJSON(STORAGE.recent, []),
  settings: loadJSON(STORAGE.settings, {
    bgUrl: "",
    glass: 20,
    motion: "full"
  }),
  current: null,
  queue: [],
  queueIndex: -1,
  shuffled: false,
  repeated: false,
  muted: false,
  yt: null,
  ytReady: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveState() {
  localStorage.setItem(STORAGE.playlists, JSON.stringify(state.playlists));
  localStorage.setItem(STORAGE.liked, JSON.stringify(state.liked));
  localStorage.setItem(STORAGE.recent, JSON.stringify(state.recent));
  localStorage.setItem(STORAGE.settings, JSON.stringify(state.settings));
}

function init() {
  applySettings();
  renderSidebar();
  renderPlaylists();
  renderLibrary("liked");
  bindEvents();
  updateCounts();
  updatePlayerUI();
  showView("home");
  setupYouTube();
}

function bindEvents() {
  $$(".nav-item[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("#startSearching").addEventListener("click", () => {
    showView("search");
    $("#searchInput").focus();
  });
  $("#scrollPlaylists").addEventListener("click", () => $("#playlistCarousel").scrollIntoView({behavior:"smooth", block:"center"}));
  $("#seeAllPlaylists").addEventListener("click", () => showView("library"));
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") searchYouTube(e.target.value.trim());
  });
  $("#settingsBtn").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#apiBtn").addEventListener("click", openApiDialog);
  $("#backgroundBtn").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#newPlaylistBtn").addEventListener("click", () => $("#playlistDialog").showModal());
  $("#createPlaylist").addEventListener("click", createPlaylist);
  $("#saveApi").addEventListener("click", saveApiKey);
  $("#clearApi").addEventListener("click", () => {
    state.apiKey = "";
    localStorage.removeItem(STORAGE.apiKey);
    $("#apiKeyInput").value = "";
    toast("YouTube API key cleared.");
    renderSearchStatus();
  });
  $("#saveSettings").addEventListener("click", saveSettings);
  $("#playBtn").addEventListener("click", togglePlay);
  $("#nextBtn").addEventListener("click", () => playRelative(1));
  $("#prevBtn").addEventListener("click", () => playRelative(-1));
  $("#shuffleBtn").addEventListener("click", () => {
    state.shuffled = !state.shuffled;
    $("#shuffleBtn").classList.toggle("active", state.shuffled);
    toast(state.shuffled ? "Shuffle on." : "Shuffle off.");
  });
  $("#repeatBtn").addEventListener("click", () => {
    state.repeated = !state.repeated;
    $("#repeatBtn").classList.toggle("active", state.repeated);
    toast(state.repeated ? "Repeat on." : "Repeat off.");
  });
  $("#likeCurrent").addEventListener("click", () => state.current && toggleLiked(state.current));
  $("#queueBtn").addEventListener("click", () => {
    renderQueue();
    $("#queueDialog").showModal();
  });
  $("#volumeBar").addEventListener("input", e => {
    const v = Number(e.target.value);
    if (state.yt && state.yt.setVolume) state.yt.setVolume(v);
  });
  $("#volumeBtn").addEventListener("click", () => {
    state.muted = !state.muted;
    if (state.yt?.isMuted) {
      state.muted ? state.yt.mute() : state.yt.unMute();
    }
    $("#volumeBtn").textContent = state.muted ? "⊘" : "◖";
  });
  $("#progressBar").addEventListener("input", e => {
    if (!state.yt || !state.yt.getDuration) return;
    const duration = state.yt.getDuration();
    state.yt.seekTo((Number(e.target.value) / 100) * duration, true);
  });
  $("#expandPlayer").addEventListener("click", () => document.body.classList.toggle("player-expanded"));
  $("#backFromPlaylist").addEventListener("click", () => showView("library"));
  $("#mobileMenuBtn").addEventListener("click", () => {
    $(".sidebar").classList.toggle("open");
    $(".overlay").style.display = "block";
  });
  $(".overlay").addEventListener("click", () => {
    $(".sidebar").classList.remove("open");
    $(".overlay").style.display = "none";
  });
  $$("[data-close-dialog]").forEach(btn => btn.addEventListener("click", () => document.getElementById(btn.dataset.closeDialog).close()));
  $$("[data-search]").forEach(card => card.addEventListener("click", () => {
    const q = card.dataset.search;
    $("#searchInput").value = q;
    showView("search");
    searchYouTube(q);
  }));
  $$(".library-tab").forEach(tab => tab.addEventListener("click", () => {
    $$(".library-tab").forEach(x => x.classList.remove("active"));
    tab.classList.add("active");
    renderLibrary(tab.dataset.libraryTab);
  }));
  $$(".segmented button").forEach(btn => btn.addEventListener("click", () => {
    $$(".segmented button").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
  }));
}

function showView(view) {
  const views = {
    home: "#homeView",
    search: "#searchView",
    library: "#libraryView"
  };
  if (!views[view]) return;
  $$(".view").forEach(x => x.classList.remove("active"));
  $(views[view]).classList.add("active");
  $$(".nav-item[data-view]").forEach(x => x.classList.toggle("active", x.dataset.view === view));
  $(".sidebar").classList.remove("open");
  $(".overlay").style.display = "none";
  if (view === "search") renderSearchStatus();
  if (view === "library") renderLibrary("liked");
}

function renderSearchStatus() {
  const el = $("#searchStatus");
  el.textContent = state.apiKey ? "YouTube connected · search is ready." : "Connect a YouTube API key to search.";
}

function openApiDialog() {
  $("#apiKeyInput").value = state.apiKey;
  $("#apiDialog").showModal();
}

async function saveApiKey() {
  state.apiKey = $("#apiKeyInput").value.trim();
  if (state.apiKey) {
    localStorage.setItem(STORAGE.apiKey, state.apiKey);
    toast("API key saved in this browser.");
  } else {
    localStorage.removeItem(STORAGE.apiKey);
    toast("API key removed.");
  }
  renderSearchStatus();
  $("#apiDialog").close();
}

function applySettings() {
  const bg = state.settings.bgUrl?.trim();
  const bgEl = $("#backgroundImage");
  bgEl.style.backgroundImage = bg
    ? `url("${bg}")`
    : `radial-gradient(circle at 60% 20%, rgba(121, 104, 255, .17), transparent 34%), radial-gradient(circle at 15% 75%, rgba(0, 205, 255, .1), transparent 30%), #08080a`;
  document.documentElement.style.setProperty("--blur", `${state.settings.glass}px`);
  document.body.classList.toggle("reduced-motion", state.settings.motion === "reduced");
  $("#bgUrlInput").value = state.settings.bgUrl || "";
  $("#glassRange").value = state.settings.glass || 20;
  $$(".segmented button").forEach(btn => btn.classList.toggle("active", btn.dataset.motion === state.settings.motion));
}

function saveSettings() {
  state.settings.bgUrl = $("#bgUrlInput").value.trim();
  state.settings.glass = Number($("#glassRange").value);
  state.settings.motion = $(".segmented button.active")?.dataset.motion || "full";
  saveState();
  applySettings();
  $("#settingsDialog").close();
  toast("Appearance saved.");
}

function renderSidebar() {
  const host = $("#sidebarPlaylists");
  host.innerHTML = state.playlists.map(pl => `
    <button class="sidebar-playlist" data-playlist="${pl.id}">
      ${smallPlaylistArt(pl)}
      <span>${escapeHTML(pl.name)}</span>
    </button>
  `).join("");
  $$(".sidebar-playlist", host).forEach(btn => btn.addEventListener("click", () => openPlaylist(btn.dataset.playlist)));
}

function renderPlaylists() {
  const host = $("#playlistCarousel");
  if (!state.playlists.length) {
    host.innerHTML = "<div class=\"empty-state glass\"><h3>No playlists yet.</h3><p>Create one from the + button in the sidebar.</p></div>";
    return;
  }

  host.classList.add("immersive-carousel");
  host.innerHTML = state.playlists.map((pl, index) => {
    const art = playlistArtwork(pl);
    return `
      <button class="playlist-card" data-playlist="${pl.id}" data-index="${index}">
        <div class="playlist-art">${art}</div>
        <span class="playlist-card-number">${String(index + 1).padStart(2, "0")}</span>
        <div class="playlist-meta">
          <small>PLAYLIST</small>
          <strong>${escapeHTML(pl.name)}</strong>
          <span>${pl.tracks.length} ${pl.tracks.length === 1 ? "TRACK" : "TRACKS"}</span>
        </div>
      </button>
    `;
  }).join("");

  const buttons = $(".playlist-card", host);
  buttons.forEach((btn, index) => btn.addEventListener("click", () => {
    const centered = Math.abs(index - getNearestCarouselIndex(host, buttons)) < 0.5;
    if (!centered) {
      centerPlaylistCard(index, host, buttons);
      return;
    }
    openPlaylist(btn.dataset.playlist);
  }));

  enhancePlaylistCarousel(host, buttons);
  requestAnimationFrame(() => updatePlaylistCarousel(host, buttons));
}

let carouselDrag = null;

function getNearestCarouselIndex(host, buttons) {
  if (!buttons.length) return 0;
  const center = host.getBoundingClientRect().left + host.clientWidth / 2;
  let nearest = 0;
  let min = Infinity;
  buttons.forEach((button, index) => {
    const box = button.getBoundingClientRect();
    const distance = Math.abs((box.left + box.width / 2) - center);
    if (distance < min) {
      min = distance;
      nearest = index;
    }
  });
  return nearest;
}

function centerPlaylistCard(index, host, buttons) {
  const button = buttons[index];
  if (!button) return;
  const target = button.offsetLeft - (host.clientWidth - button.offsetWidth) / 2;
  host.scrollTo({ left: target, behavior: "smooth" });
}

function updatePlaylistCarousel(host, buttons) {
  if (!host || !buttons.length) return;
  const center = host.getBoundingClientRect().left + host.clientWidth / 2;

  buttons.forEach((button, index) => {
    const box = button.getBoundingClientRect();
    const distance = (box.left + box.width / 2) - center;
    const normalized = Math.max(-2.5, Math.min(2.5, distance / 300));
    const abs = Math.abs(normalized);
    const scale = abs < 0.5 ? 1.04 : Math.max(0.76, 1 - abs * 0.09);
    const x = normalized * 10;
    const y = abs * abs * 6;
    const rotateY = normalized * -9;
    const rotateZ = normalized * -2.8;
    const opacity = Math.max(.13, 1 - Math.max(0, abs - 1.35) * .48);

    button.style.transform = "translate3d(" + x + "px," + y + "px,0) rotateY(" + rotateY + "deg) rotateZ(" + rotateZ + "deg) scale(" + scale + ")";
    button.style.opacity = String(opacity);
    button.style.zIndex = String(100 - Math.round(abs * 15));
    button.classList.toggle("is-center", abs < .5);
  });
}

function enhancePlaylistCarousel(host, buttons) {
  if (host.__b1apiEnhanced) return;
  host.__b1apiEnhanced = true;

  const onScroll = () => requestAnimationFrame(() => updatePlaylistCarousel(host, buttons));
  host.addEventListener("scroll", onScroll, { passive: true });

  host.addEventListener("wheel", (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    host.scrollLeft += delta * 0.9;
  }, { passive: false });

  host.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    carouselDrag = {
      x: event.clientX,
      scroll: host.scrollLeft,
      moved: false
    };
    host.setPointerCapture?.(event.pointerId);
  });

  host.addEventListener("pointermove", (event) => {
    if (!carouselDrag) return;
    const dx = event.clientX - carouselDrag.x;
    if (Math.abs(dx) > 6) carouselDrag.moved = true;
    if (carouselDrag.moved) {
      event.preventDefault();
      host.scrollLeft = carouselDrag.scroll - dx;
    }
  });

  host.addEventListener("pointerup", () => {
    if (!carouselDrag) return;
    if (carouselDrag.moved) {
      const index = getNearestCarouselIndex(host, buttons);
      centerPlaylistCard(index, host, buttons);
    }
    carouselDrag = null;
  });

  window.addEventListener("resize", () => updatePlaylistCarousel(host, buttons));
}

function playlistArtwork(pl) {
  const first = pl.tracks[0];
  if (first?.thumbnail) return `<img src="${safeUrl(first.thumbnail)}" alt="">`;
  const gradients = [
    "linear-gradient(135deg,#7666ff,#131018)",
    "linear-gradient(135deg,#ff708e,#171013)",
    "linear-gradient(135deg,#55dfdf,#101618)",
    "linear-gradient(135deg,#d8b06f,#17140e)"
  ];
  return `<div style="width:100%;height:100%;background:${gradients[state.playlists.indexOf(pl)%gradients.length]};display:grid;place-items:center;font:800 46px 'Plus Jakarta Sans'">${escapeHTML((pl.name[0] || "F").toUpperCase())}</div>`;
}

function smallPlaylistArt(pl) {
  const first = pl.tracks[0];
  if (first?.thumbnail) return `<img src="${safeUrl(first.thumbnail)}" alt="">`;
  return `<span class="fallback-art">${escapeHTML((pl.name[0] || "F").toUpperCase())}</span>`;
}

function createPlaylist() {
  const name = $("#playlistNameInput").value.trim();
  if (!name) return toast("Give the playlist a name.");
  state.playlists.unshift({ id: crypto.randomUUID(), name, tracks: [] });
  saveState();
  renderSidebar();
  renderPlaylists();
  $("#playlistNameInput").value = "";
  $("#playlistDialog").close();
  toast(`Created “${name}”.`);
}

async function searchYouTube(query) {
  if (!query) return;
  showView("search");
  renderSearchStatus();
  const host = $("#searchResults");
  host.innerHTML = `<div class="empty-state glass"><div class="empty-icon">⋯</div><h3>Searching.</h3><p>Looking through YouTube…</p></div>`;
  if (!state.apiKey) {
    openApiDialog();
    return;
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "24");
    url.searchParams.set("q", query);
    url.searchParams.set("key", state.apiKey);
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "YouTube API request failed.");
    const items = (data.items || []).filter(item => item.id?.videoId);
    renderResults(items.map(normalizeYouTubeResult));
    $("#searchStatus").textContent = `${items.length} results · YouTube`;
  } catch (error) {
    host.innerHTML = `<div class="empty-state glass"><div class="empty-icon">!</div><h3>Search failed.</h3><p>${escapeHTML(error.message || "Unknown error.")}</p></div>`;
    toast("YouTube search failed.");
  }
}

function normalizeYouTubeResult(item) {
  const snippet = item.snippet || {};
  const id = item.id.videoId;
  return {
    id,
    title: snippet.title || "Untitled",
    artist: snippet.channelTitle || "YouTube",
    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
    publishedAt: snippet.publishedAt || ""
  };
}

function renderResults(results) {
  const host = $("#searchResults");
  if (!results.length) {
    host.innerHTML = `<div class="empty-state glass"><div class="empty-icon">∅</div><h3>No results.</h3><p>Try another artist, song, or search phrase.</p></div>`;
    return;
  }

  host.innerHTML = results.map(track => {
    const liked = state.liked.some(x => x.id === track.id);
    return `
      <article class="result-card">
        <div class="result-thumb">
          <img loading="lazy" src="${safeUrl(track.thumbnail)}" alt="">
          <button class="play-overlay" data-play="${track.id}">▶</button>
        </div>
        <div class="result-info">
          <strong title="${escapeAttr(track.title)}">${escapeHTML(track.title)}</strong>
          <span title="${escapeAttr(track.artist)}">${escapeHTML(track.artist)}</span>
        </div>
        <div class="result-actions">
          <button class="tiny-button" data-add="${track.id}">+ Playlist</button>
          <button class="tiny-button favorite ${liked ? "active" : ""}" data-like="${track.id}">${liked ? "♥ Liked" : "♡ Like"}</button>
        </div>
      </article>
    `;
  }).join("");

  const map = new Map(results.map(x => [x.id, x]));
  $$("[data-play]", host).forEach(btn => btn.addEventListener("click", () => {
    const track = map.get(btn.dataset.play);
    setQueue(results, results.indexOf(track));
    playTrack(track);
  }));
  $$("[data-like]", host).forEach(btn => btn.addEventListener("click", () => {
    const track = map.get(btn.dataset.like);
    toggleLiked(track);
    btn.classList.toggle("active", state.liked.some(x => x.id === track.id));
    btn.textContent = state.liked.some(x => x.id === track.id) ? "♥ Liked" : "♡ Like";
    updateCounts();
  }));
  $$("[data-add]", host).forEach(btn => btn.addEventListener("click", () => openAddToPlaylist(map.get(btn.dataset.add))));
}

function setQueue(tracks, startIndex = 0) {
  state.queue = [...tracks];
  state.queueIndex = startIndex;
  renderQueue();
}

function playTrack(track, remember = true) {
  state.current = track;
  updatePlayerUI();
  setBackgroundFromTrack(track);
  if (remember) {
    state.recent = [track, ...state.recent.filter(x => x.id !== track.id)].slice(0, 50);
    saveState();
  }
  if (!state.ytReady || !state.yt) {
    toast("YouTube player is still loading.");
    return;
  }
  state.yt.loadVideoById(track.id);
}

function playRelative(delta) {
  if (!state.queue.length) return;
  if (state.shuffled) {
    const candidates = state.queue.filter(x => x.id !== state.current?.id);
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    if (target) {
      state.queueIndex = state.queue.findIndex(x => x.id === target.id);
      playTrack(target);
    }
    return;
  }
  let next = state.queueIndex + delta;
  if (next < 0) next = state.queue.length - 1;
  if (next >= state.queue.length) next = 0;
  state.queueIndex = next;
  playTrack(state.queue[next]);
}

function togglePlay() {
  if (!state.current) {
    if (state.queue[0]) playTrack(state.queue[0]);
    else toast("Search for a song first.");
    return;
  }
  if (!state.yt) return;
  const playerState = state.yt.getPlayerState?.();
  if (playerState === 1) state.yt.pauseVideo();
  else state.yt.playVideo();
}

function setupYouTube() {
  window.onYouTubeIframeAPIReady = () => {
    state.yt = new YT.Player("yt-player", {
      width: "480",
      height: "270",
      playerVars: {
        playsinline: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: () => {
          state.ytReady = true;
          state.yt.setVolume(Number($("#volumeBar").value));
          syncProgress();
        },
        onStateChange: onYTStateChange,
        onError: () => toast("YouTube couldn't play this video.")
      }
    });
  };
}

function onYTStateChange(event) {
  const states = window.YT?.PlayerState;
  if (!states) return;
  if (event.data === states.PLAYING) {
    $("#playBtn").textContent = "Ⅱ";
  } else {
    $("#playBtn").textContent = "▶";
  }
  if (event.data === states.ENDED) {
    if (state.repeated && state.current) {
      state.yt.playVideo();
    } else {
      playRelative(1);
    }
  }
}

function syncProgress() {
  setInterval(() => {
    if (!state.yt?.getCurrentTime) return;
    const duration = state.yt.getDuration?.() || 0;
    const current = state.yt.getCurrentTime?.() || 0;
    $("#currentTime").textContent = formatTime(current);
    $("#duration").textContent = formatTime(duration);
    $("#progressBar").value = duration ? (current / duration) * 100 : 0;
  }, 500);
}

function updatePlayerUI() {
  const track = state.current;
  $("#nowTitle").textContent = track?.title || "Nothing playing";
  $("#nowArtist").textContent = track?.artist || "Choose a track to begin";
  $("#likeCurrent").classList.toggle("active", !!track && state.liked.some(x => x.id === track.id));
  $("#likeCurrent").textContent = track && state.liked.some(x => x.id === track.id) ? "♥" : "♡";
  $("#nowArt").innerHTML = track?.thumbnail
    ? `<img src="${safeUrl(track.thumbnail)}" alt="">`
    : "<span>♪</span>";
}

function setBackgroundFromTrack(track) {
  if (!track?.thumbnail || state.settings.bgUrl) return;
  $("#backgroundImage").style.backgroundImage = `url("${track.thumbnail}")`;
  $("#backgroundImage").style.filter = "blur(12px) saturate(1.25)";
}

function toggleLiked(track) {
  const exists = state.liked.some(x => x.id === track.id);
  state.liked = exists ? state.liked.filter(x => x.id !== track.id) : [track, ...state.liked];
  saveState();
  updatePlayerUI();
  renderLibrary($("#libraryContent").dataset.tab || "liked");
  toast(exists ? "Removed from Liked Songs." : "Added to Liked Songs.");
}

function openAddToPlaylist(track) {
  const options = state.playlists.map(pl => `
    <button class="sidebar-playlist add-track-option" data-playlist="${pl.id}">
      ${smallPlaylistArt(pl)}
      <span>${escapeHTML(pl.name)}</span>
    </button>`
  ).join("");
  const dialog = document.createElement("dialog");
  dialog.className = "modal glass";
  dialog.innerHTML = `
    <div class="modal-head">
      <div><span class="eyebrow">ADD TRACK</span><h3>Choose a playlist.</h3></div>
      <button class="icon-button close-temp">×</button>
    </div>
    <div style="display:grid;gap:6px;margin-top:18px">${options || "<p class='modal-copy'>Create a playlist first.</p>"}</div>
  `;
  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.querySelector(".close-temp").addEventListener("click", () => {
    dialog.close();
    dialog.remove();
  });
  $$(".add-track-option", dialog).forEach(btn => btn.addEventListener("click", () => {
    addToPlaylist(btn.dataset.playlist, track);
    dialog.close();
    dialog.remove();
  }));
}

function addToPlaylist(id, track) {
  const pl = state.playlists.find(x => x.id === id);
  if (!pl) return;
  if (pl.tracks.some(x => x.id === track.id)) return toast("Track is already in that playlist.");
  pl.tracks.push(track);
  saveState();
  renderSidebar();
  renderPlaylists();
  toast(`Added to “${pl.name}”.`);
}

function openPlaylist(id) {
  const pl = state.playlists.find(x => x.id === id);
  if (!pl) return;
  $$(".view").forEach(x => x.classList.remove("active"));
  $("#playlistView").classList.add("active");
  $$(".nav-item[data-view]").forEach(x => x.classList.remove("active"));
  renderPlaylistPage(pl);
}

function renderPlaylistPage(pl) {
  const art = playlistArtwork(pl);
  $("#playlistHero").innerHTML = `
    <div class="playlist-page-hero">
      <div class="playlist-page-art">${art}</div>
      <div class="playlist-page-copy">
        <span class="eyebrow">PLAYLIST</span>
        <h2>${escapeHTML(pl.name)}</h2>
        <p>${pl.tracks.length} ${pl.tracks.length === 1 ? "track" : "tracks"} · stored only in this browser</p>
        <div class="playlist-controls">
          <button class="primary-button" id="playPlaylist">▶ Play all</button>
          <button class="ghost-button" id="deletePlaylist">Delete</button>
        </div>
      </div>
    </div>
  `;

  const host = $("#playlistTracks");
  if (!pl.tracks.length) {
    host.innerHTML = `<div class="empty-state glass"><div class="empty-icon">♪</div><h3>This playlist is empty.</h3><p>Search for music and use “+ Playlist” to add tracks.</p></div>`;
  } else {
    host.innerHTML = `
      <div class="library-list">${pl.tracks.map((track, i) => `
        <div class="track-row">
          <div class="track-thumb"><img src="${safeUrl(track.thumbnail)}" alt=""></div>
          <button class="track-main" data-play-track="${track.id}" style="text-align:left">
            <strong>${escapeHTML(track.title)}</strong>
            <span>${escapeHTML(track.artist)}</span>
          </button>
          <span class="track-artist">${escapeHTML(formatDate(track.publishedAt))}</span>
          <span class="track-duration">YouTube</span>
          <div class="track-actions">
            <button class="track-action" data-remove-track="${track.id}" title="Remove">×</button>
          </div>
        </div>
      `).join("")}</div>`;
    const map = new Map(pl.tracks.map(x => [x.id, x]));
    $$("[data-play-track]", host).forEach(btn => btn.addEventListener("click", () => {
      setQueue(pl.tracks, pl.tracks.findIndex(x => x.id === btn.dataset.playTrack));
      playTrack(map.get(btn.dataset.playTrack));
    }));
    $$("[data-remove-track]", host).forEach(btn => btn.addEventListener("click", () => {
      pl.tracks = pl.tracks.filter(x => x.id !== btn.dataset.removeTrack);
      saveState();
      renderSidebar();
      renderPlaylists();
      renderPlaylistPage(pl);
      toast("Removed from playlist.");
    }));
  }

  $("#playPlaylist").addEventListener("click", () => {
    if (!pl.tracks.length) return toast("This playlist is empty.");
    setQueue(pl.tracks, 0);
    playTrack(pl.tracks[0]);
  });
  $("#deletePlaylist").addEventListener("click", () => {
    if (state.playlists.length <= 1) return toast("Keep at least one playlist.");
    state.playlists = state.playlists.filter(x => x.id !== pl.id);
    saveState();
    renderSidebar();
    renderPlaylists();
    showView("library");
    toast("Playlist deleted.");
  });
}

function renderLibrary(tab) {
  const host = $("#libraryContent");
  host.dataset.tab = tab;
  if (tab === "liked") {
    if (!state.liked.length) return renderEmptyLibrary("No liked songs yet.", "Search for music and tap “Like”.");
    renderTrackList(host, state.liked);
  } else if (tab === "recent") {
    if (!state.recent.length) return renderEmptyLibrary("Nothing played yet.", "Play a YouTube track and it will appear here.");
    renderTrackList(host, state.recent);
  } else {
    host.innerHTML = `<div class="library-list">${state.playlists.map(pl => `
      <button class="discover-card glass" data-open-library-playlist="${pl.id}">
        <span class="discover-art" style="overflow:hidden">${playlistArtwork(pl)}</span>
        <span><strong>${escapeHTML(pl.name)}</strong><small>${pl.tracks.length} tracks</small></span>
        <span class="arrow">→</span>
      </button>
    `).join("")}</div>`;
    $$("[data-open-library-playlist]", host).forEach(btn => btn.addEventListener("click", () => openPlaylist(btn.dataset.openLibraryPlaylist)));
  }
}

function renderTrackList(host, tracks) {
  host.innerHTML = `<div class="library-list">${tracks.map(track => `
    <div class="track-row">
      <div class="track-thumb"><img src="${safeUrl(track.thumbnail)}" alt=""></div>
      <button class="track-main track-play" data-track-id="${track.id}" style="text-align:left">
        <strong>${escapeHTML(track.title)}</strong>
        <span>${escapeHTML(track.artist)}</span>
      </button>
      <span class="track-artist">${escapeHTML(formatDate(track.publishedAt))}</span>
      <span class="track-duration">YouTube</span>
      <div class="track-actions">
        <button class="track-action" data-quick-like="${track.id}" title="Like">♡</button>
      </div>
    </div>
  `).join("")}</div>`;
  const map = new Map(tracks.map(x => [x.id, x]));
  $$(".track-play", host).forEach(btn => btn.addEventListener("click", () => {
    const track = map.get(btn.dataset.trackId);
    setQueue(tracks, tracks.findIndex(x => x.id === track.id));
    playTrack(track);
  }));
  $$("[data-quick-like]", host).forEach(btn => btn.addEventListener("click", () => toggleLiked(map.get(btn.dataset.quickLike))));
}

function renderEmptyLibrary(title, text) {
  $("#libraryContent").innerHTML = `<div class="empty-state glass"><div class="empty-icon">♪</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p></div>`;
}

function renderQueue() {
  const host = $("#queueContent");
  host.innerHTML = state.queue.length ? state.queue.map((track, index) => `
    <button class="queue-item" data-queue-index="${index}">
      <img src="${safeUrl(track.thumbnail)}" alt="">
      <span><strong>${escapeHTML(track.title)}</strong><span>${escapeHTML(track.artist)}</span></span>
      <span>${index === state.queueIndex ? "NOW" : ""}</span>
    </button>
  `).join("") : "<p class='modal-copy'>Your queue is empty.</p>";
  $$("[data-queue-index]", host).forEach(btn => btn.addEventListener("click", () => {
    state.queueIndex = Number(btn.dataset.queueIndex);
    playTrack(state.queue[state.queueIndex]);
    $("#queueDialog").close();
  }));
}

function updateCounts() {
  $("#likedCount").textContent = state.liked.length;
  $("#recentCount").textContent = state.recent.length;
}

function formatTime(seconds) {
  seconds = Math.floor(Number(seconds) || 0);
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatDate(date) {
  if (!date) return "";
  try { return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(date)); }
  catch { return ""; }
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2300);
}

function safeUrl(url) {
  try {
    const u = new URL(url, location.href);
    if (u.protocol === "https:" || u.protocol === "http:") return u.href;
  } catch {}
  return "";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[char]));
}
function escapeAttr(value) { return escapeHTML(value); }

init();
