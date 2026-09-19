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
  apiKey: window.B1API_CONFIG?.youtubeApiKey?.trim() || "",
  profileName: localStorage.getItem("b1api_profile_name") || "",
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

let progressTimer = 0;
let backgroundObjectUrl = null;
let selectedBackgroundFile = null;
const BG_DB_NAME = "b1api_assets";
const BG_STORE = "files";

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
  renderLocalProfile();
  showView("home");
  loadSavedBackground();
  // YouTube iframe is created lazily on first playback.
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
  $("#saveSettings").addEventListener("click", saveSettings);
  $("#bgFileInput")?.addEventListener("change", handleBackgroundFile);
  $("#clearBgFile")?.addEventListener("click", clearBackgroundFile);
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
  updateApiStatusChip();
}

function openApiDialog() {
  $("#apiDialog").showModal();
}

function applySettings() {
  const bg = state.settings.bgUrl?.trim();
  const bgEl = $("#backgroundImage");
  bgEl.style.backgroundImage = bg
    ? `url("${safeUrl(bg)}")`
    : "radial-gradient(circle at 70% 20%, rgba(121,104,255,.14), transparent 32%), radial-gradient(circle at 15% 80%, rgba(0,190,255,.08), transparent 28%), #08080a";
  document.documentElement.style.setProperty("--blur", `${Math.min(24, Number(state.settings.glass) || 18)}px`);
  document.body.classList.toggle("reduced-motion", state.settings.motion === "reduced");
  $("#bgUrlInput").value = state.settings.bgUrl || "";
  $("#glassRange").value = state.settings.glass || 18;
  $("#profileNameInput") && ($("#profileNameInput").value = state.profileName || "");
  $$(".segmented button").forEach(btn => btn.classList.toggle("active", btn.dataset.motion === state.settings.motion));
}

async function loadSavedBackground() {
  try {
    const blob = await getAsset("background");
    if (!blob) return;
    if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl = URL.createObjectURL(blob);
    $("#backgroundImage").style.backgroundImage = `url("${backgroundObjectUrl}")`;
  } catch {}
}

function openAssetDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BG_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BG_STORE)) db.createObjectStore(BG_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAsset(key, value) {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BG_STORE, "readwrite");
    tx.objectStore(BG_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getAsset(key) {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BG_STORE, "readonly");
    const request = tx.objectStore(BG_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function clearStoredBackground() {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BG_STORE, "readwrite");
    tx.objectStore(BG_STORE).delete("background");
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function handleBackgroundFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) return toast("Image must be 8 MB or smaller.");
  selectedBackgroundFile = file;
  try {
    await putAsset("background", file);
    state.settings.bgMode = "file";
    state.settings.bgUrl = "";
    saveState();
    if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl = URL.createObjectURL(file);
    $("#backgroundImage").style.backgroundImage = `url("${backgroundObjectUrl}")`;
    const label = $("#bgFileName");
    if (label) label.textContent = file.name;
    toast("Background image saved.");
  } catch {
    toast("Couldn't save that image.");
  }
}

async function clearBackgroundFile() {
  try { await clearStoredBackground(); } catch {}
  selectedBackgroundFile = null;
  if (backgroundObjectUrl) {
    URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl = null;
  }
  state.settings.bgMode = "";
  saveState();
  applySettings();
  const label = $("#bgFileName");
  if (label) label.textContent = "No file selected";
  toast("Custom background cleared.");
}

function saveSettings() {
  const profileInput = $("#profileNameInput");
  if (profileInput) {
    const name = profileInput.value.trim().replace(/\s+/g, " ");
    if (name) {
      state.profileName = name.slice(0, 24);
      localStorage.setItem("b1api_profile_name", state.profileName);
      renderLocalProfile();
    }
  }
  state.settings.bgUrl = $("#bgUrlInput").value.trim();
  state.settings.glass = Number($("#glassRange").value);
  if (state.settings.bgUrl) {
    state.settings.bgMode = "url";
    clearStoredBackground().catch(() => {});
    if (backgroundObjectUrl) {
      URL.revokeObjectURL(backgroundObjectUrl);
      backgroundObjectUrl = null;
    }
  }
  state.settings.motion = $(".segmented button.active")?.dataset.motion || "full";
  saveState();
  applySettings();
  if (state.settings.bgMode === "file" && !state.settings.bgUrl) loadSavedBackground();
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

  const buttons = host.querySelectorAll(".playlist-card");
  buttons.forEach((btn, index) => btn.addEventListener("click", () => {
    if (host.__b1apiSuppressClick) return;
    const centered = Math.abs(index - getNearestCarouselIndex(host, buttons)) < 0.5;
    if (!centered) {
      centerPlaylistCard(index, host, buttons);
      return;
    }
    openPlaylist(btn.dataset.playlist);
  }));

  enhancePlaylistCarousel(host, buttons);
  requestAnimationFrame(() => { centerPlaylistCard(0, host, buttons); updatePlaylistCarousel(host, buttons); });
}

let carouselDrag = null;

function getNearestCarouselIndex(host, buttons) {
  if (!buttons.length) return 0;
  const center = host.scrollLeft + host.clientWidth / 2;
  let nearest = 0;
  let min = Infinity;
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const distance = Math.abs((button.offsetLeft + button.offsetWidth / 2) - center);
    if (distance < min) {
      min = distance;
      nearest = i;
    }
  }
  return nearest;
}

function centerPlaylistCard(index, host, buttons) {
  const button = buttons[index];
  if (!button) return;
  const target = Math.max(0, button.offsetLeft - (host.clientWidth - button.offsetWidth) / 2);
  host.scrollTo({ left: target, behavior: "smooth" });
}

function updatePlaylistCarousel(host, buttons) {
  if (!host || !buttons.length) return;
  const center = host.scrollLeft + host.clientWidth / 2;
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const distance = (button.offsetLeft + button.offsetWidth / 2) - center;
    const normalized = Math.max(-2.2, Math.min(2.2, distance / 300));
    const abs = Math.abs(normalized);
    const scale = abs < 0.48 ? 1.04 : Math.max(.82, 1 - abs * .07);
    const rotate = normalized * -7;
    const y = Math.min(18, abs * abs * 4);
    const opacity = Math.max(.2, 1 - Math.max(0, abs - 1.1) * .38);

    button.style.transform = `translate3d(0,${y}px,0) rotateY(${rotate}deg) scale(${scale})`;
    button.style.opacity = String(opacity);
    button.style.zIndex = String(100 - Math.round(abs * 12));
    button.classList.toggle("is-center", abs < .48);
  }
}

function enhancePlaylistCarousel(host, buttons) {
  host.__b1apiCleanup?.();

  let raf = 0;
  let drag = null;

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updatePlaylistCarousel(host, buttons);
    });
  };

  const onScroll = schedule;
  const onResize = schedule;

  const onWheel = (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    host.scrollLeft += delta;
    schedule();
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag = { x: event.clientX, scroll: host.scrollLeft, moved: false };
    host.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 5) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    host.scrollLeft = drag.scroll - dx;
    schedule();
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.moved) {
      centerPlaylistCard(getNearestCarouselIndex(host, buttons), host, buttons);
      host.__b1apiSuppressClick = true;
      window.clearTimeout(host.__b1apiSuppressTimer);
      host.__b1apiSuppressTimer = window.setTimeout(() => {
        host.__b1apiSuppressClick = false;
      }, 220);
    }
    drag = null;
  };

  host.addEventListener("scroll", onScroll, { passive: true });
  host.addEventListener("wheel", onWheel, { passive: false });
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("resize", onResize, { passive: true });

  host.__b1apiCleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    host.removeEventListener("scroll", onScroll);
    host.removeEventListener("wheel", onWheel);
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerup", onPointerUp);
    host.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("resize", onResize);
    window.clearTimeout(host.__b1apiSuppressTimer);
    host.__b1apiSuppressClick = false;
  };
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
    if (localStorage.getItem("b1api_first_run_seen") === "1") openApiDialog();
    else openFirstRun();
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

  const player = ensureYouTubePlayer();
  if (!player) {
    toast("YouTube player is still loading.");
    return;
  }
  if (state.ytReady) {
    state.yt.loadVideoById(track.id);
  }
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
  const player = ensureYouTubePlayer();
  if (!player) return;
  const playerState = player.getPlayerState?.();
  if (playerState === 1) player.pauseVideo();
  else player.playVideo();
}

function setupYouTube() {
  const ready = () => {
    state.ytApiReady = true;
    if (state.current) ensureYouTubePlayer();
  };
  window.onYouTubeIframeAPIReady = ready;
  if (window.YT?.Player) ready();
}

function ensureYouTubePlayer() {
  if (state.yt || !window.YT?.Player) return state.yt;
  $("#yt-container").classList.add("ready");
  state.yt = new YT.Player("yt-player", {
    width: "480",
    height: "270",
    host: "https://www.youtube-nocookie.com",
    playerVars: {
      playsinline: 1,
      controls: 1,
      rel: 0,
      origin: window.location.origin,
      enablejsapi: 1,
      widget_referrer: window.location.href
    },
    events: {
      onReady: () => {
        state.ytReady = true;
        state.yt.setVolume(Number($("#volumeBar").value));
        if (state.current) state.yt.loadVideoById(state.current.id);
      },
      onStateChange: onYTStateChange,
      onError: () => toast("YouTube couldn't play this video.")
    }
  });
  return state.yt;
}


function onYTStateChange(event) {
  const states = window.YT?.PlayerState;
  if (!states) return;
  if (event.data === states.PLAYING) {
    $("#playBtn").textContent = "Ⅱ";
    syncProgress();
  } else {
    $("#playBtn").textContent = "▶";
    if (progressTimer) cancelAnimationFrame(progressTimer);
    progressTimer = 0;
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
  if (progressTimer) return;
  const tick = () => {
    if (!state.yt?.getCurrentTime) {
      progressTimer = 0;
      return;
    }
    const duration = state.yt.getDuration?.() || 0;
    const current = state.yt.getCurrentTime?.() || 0;
    $("#currentTime").textContent = formatTime(current);
    $("#duration").textContent = formatTime(duration);
    $("#progressBar").value = duration ? (current / duration) * 100 : 0;
    if (state.yt.getPlayerState?.() === 1) {
      progressTimer = requestAnimationFrame(tick);
    } else {
      progressTimer = 0;
    }
  };
  progressTimer = requestAnimationFrame(tick);
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

function renderLocalProfile() {
  const name = state.profileName?.trim() || "LOCAL";
  const avatar = name.charAt(0).toUpperCase() || "B";
  $("#profileChipText") && ($("#profileChipText").textContent = name);
  $("#profileAvatar") && ($("#profileAvatar").textContent = avatar);
  $("#localProfileName") && ($("#localProfileName").textContent = name);
}

function saveLocalProfile() {
  const input = $("#firstRunName");
  const name = input?.value.trim().replace(/\s+/g, " ");
  if (!name) {
    toast("Choose a nickname first.");
    input?.focus();
    return;
  }
  state.profileName = name.slice(0, 24);
  localStorage.setItem("b1api_profile_name", state.profileName);
  renderLocalProfile();
  closeFirstRun(true);
  toast("Welcome to b1api.");
}

function updateApiStatusChip() {
  const chip = $("#apiStatus");
  const label = $("#heroApiLabel");
  const settings = $("#settingsApiStatus");
  if (!chip) return;
  chip.classList.toggle("connected", !!state.apiKey);
  const textEl = chip.querySelector("b");
  if (textEl) textEl.textContent = state.apiKey ? "API ON" : "API OFF";
  if (label) label.textContent = state.apiKey ? "CONNECTED" : "CONNECT API";
  if (settings) settings.textContent = state.apiKey ? "Connected · YouTube Data API v3" : "Not connected";
}

function openFirstRun() {
  const el = $("#firstRun");
  if (!el) return;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("first-run-open");
  $("#firstRunName")?.focus();
}

function closeFirstRun(markSeen = true) {
  const el = $("#firstRun");
  if (!el) return;
  if (markSeen && state.profileName) localStorage.setItem("b1api_first_run_seen", "1");
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  document.body.classList.remove("first-run-open");
}

function updateRoute(view) {
  const names = { home:["01","Home"], search:["02","Search"], library:["03","Library"], playlist:["04","Playlist"] };
  const item = names[view] || names.home;
  if ($("#routeNumber")) $("#routeNumber").textContent = item[0];
  if ($("#routeName")) $("#routeName").textContent = item[1];
  $$(".home-top-button, .nav-item[data-view]").forEach(btn => {
    const key = btn.dataset.view;
    if (key === view) btn.classList.add("active");
    else if (key) btn.classList.remove("active");
  });
}

function addProfessionalInteractions() {
  // CSS handles hover and motion; keep JS off the hot path.
}

function enhanceNavigation() {
  const originalShowView = showView;
  showView = function(view) {
    originalShowView(view);
    updateRoute(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  $("#homeTopBtn")?.addEventListener("click", () => showView("home"));
  $("#profileChip")?.addEventListener("click", () => $("#settingsDialog").showModal());
  $("#apiStatus")?.addEventListener("click", openApiDialog);
  $("#queueBtnTop")?.addEventListener("click", () => { renderQueue(); $("#queueDialog").showModal(); });

  $("#carouselPrev")?.addEventListener("click", () => {
    const host = $("#playlistCarousel");
    const cards = $$(".playlist-card", host);
    if (!cards.length) return;
    centerPlaylistCard(Math.max(0, getNearestCarouselIndex(host, cards) - 1), host, cards);
  });
  $("#carouselNext")?.addEventListener("click", () => {
    const host = $("#playlistCarousel");
    const cards = $$(".playlist-card", host);
    if (!cards.length) return;
    centerPlaylistCard(Math.min(cards.length - 1, getNearestCarouselIndex(host, cards) + 1), host, cards);
  });

  $("#closeFirstRun")?.addEventListener("click", () => closeFirstRun(true));
  $("#mobileScrim")?.addEventListener("click", () => { $(".sidebar")?.classList.remove("open"); $("#mobileScrim")?.classList.remove("active"); });
  updateRoute("home");
  renderLocalProfile();
  updateApiStatusChip();
}

function enhanceShortcuts() {
  window.addEventListener("keydown", event => {
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA";
    if (event.key === "/" && !typing) { event.preventDefault(); $("#searchInput")?.focus(); showView("search"); }
    if (event.key.toLowerCase() === "h" && !typing) showView("home");
    if (event.key.toLowerCase() === "s" && !typing) showView("search");
    if (event.key.toLowerCase() === "l" && !typing) showView("library");
    if (event.key === "Escape") { closeFirstRun(false); $(".sidebar")?.classList.remove("open"); }
  });
}

function enhanceFirstRun() {
  if (!state.profileName) window.setTimeout(openFirstRun, 350);
  $("#saveProfile")?.addEventListener("click", saveLocalProfile);
  $("#firstRunName")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveLocalProfile();
    }
  });
}

function enhanceB1api() {
  enhanceNavigation();
  addProfessionalInteractions();
  enhanceShortcuts();
  enhanceFirstRun();
  updateApiStatusChip();
}

init();
enhanceB1api();