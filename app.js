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
    bgMode: "",
    glass: 16,
    motion: "full",
    primaryColor: "#e7e7e7",
    secondaryColor: "#8f8f8f",
    accentColor: "#c8c8c8",
    surfaceColor: "#111111",
    backgroundColor: "#070707",
    bgOpacity: 100,
    bgBlur: 0,
    bgColorEnabled: true
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
const PLAYLIST_COVER_PREFIX = "playlist-cover:";
const playlistCoverObjectUrls = new Map();
let editingPlaylistId = null;
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
  state.settings = {
    bgUrl: "",
    bgMode: "",
    glass: 16,
    motion: "full",
    primaryColor: "#e7e7e7",
    secondaryColor: "#8f8f8f",
    accentColor: "#c8c8c8",
    surfaceColor: "#111111",
    backgroundColor: "#070707",
    bgOpacity: 100,
    bgBlur: 0,
    bgColorEnabled: true,
    ...state.settings
  };
  saveState();
  applySettings();
  renderSidebar();
  renderPlaylists();
  renderLibrary("liked");
  loadPlaylistCovers();
  bindEvents();
  updateCounts();
  updatePlayerUI();
  renderLocalProfile();
  showView("home");
  loadSavedBackground().then(() => {
    applySettings();
  });
  // YouTube iframe is created lazily on first playback.
  setupYouTube();
}

function bindEvents() {
  $$(".nav-item[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("#startSearching")?.addEventListener("click", () => {
    showView("search");
    $("#searchInput")?.focus();
  });
  $("#scrollPlaylists")?.addEventListener("click", () => $("#playlistCarousel")?.scrollIntoView({behavior:"smooth", block:"center"}));
  $("#seeAllPlaylists")?.addEventListener("click", () => showView("library"));
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") searchYouTube(e.target.value.trim());
  });
  $("#settingsBtn").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#apiBtn").addEventListener("click", openApiDialog);
  $("#backgroundBtn").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#newPlaylistBtn").addEventListener("click", () => $("#playlistDialog").showModal());
  $("#createPlaylist").addEventListener("click", createPlaylist);
  $("#playlistSettingsSave")?.addEventListener("click", savePlaylistSettings);
  $("#playlistSettingsRemoveCover")?.addEventListener("click", removeEditingPlaylistCover);
  $("#playlistSettingsCoverFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file && $("#playlistSettingsCoverName")) $("#playlistSettingsCoverName").textContent = file.name;
  });
  $("#playlistCoverFile")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label = $("#playlistCoverFileName");
    if (label) label.textContent = file.name;
  });
  $("#saveSettings").addEventListener("click", saveSettings);
  $("#resetAppearance")?.addEventListener("click", resetAppearance);
  ["primaryColor","secondaryColor","accentColor","surfaceColor","backgroundColor"].forEach(id => {
    $("#"+id)?.addEventListener("input", e => {
      state.settings[id] = e.target.value;
      applySettings();
    });
  });
  $("#bgOpacityRange")?.addEventListener("input", e => {
    if ($("#bgOpacityValue")) $("#bgOpacityValue").textContent = e.target.value + "%";
    state.settings.bgOpacity = Number(e.target.value);
    applySettings();
  });
  $("#bgColorEnabled")?.addEventListener("change", e => {
    state.settings.bgColorEnabled = e.target.checked;
    applySettings();
  });
  $("#glassRange")?.addEventListener("input", e => {
    const value = Number(e.target.value);
    state.settings.glass = value;
    const label = $("#glassValue");
    if (label) label.textContent = value + "px";
    applySettings();
  });
  $("#bgBlurRange")?.addEventListener("input", e => {
    if ($("#bgBlurValue")) $("#bgBlurValue").textContent = e.target.value + "px";
    state.settings.bgBlur = 0;
    applySettings();
  });
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
  $("#expandPlayer").addEventListener("click", () => setExpandedPlayer(!document.body.classList.contains("player-expanded")));
  $("#miniVideoExpand")?.addEventListener("click", () => setExpandedPlayer(true));
  $("#nowArt").addEventListener("click", () => {
    if (state.current) setExpandedPlayer(true);
  });
  $("#fullPlayerClose").addEventListener("click", () => setExpandedPlayer(false));
  $("#fullPlayerQueue").addEventListener("click", () => {
    renderQueue();
    $("#queueDialog").showModal();
  });
  $("#fullPlayerPlay").addEventListener("click", togglePlay);
  $("#fullPlayerPrev").addEventListener("click", () => playRelative(-1));
  $("#fullPlayerNext").addEventListener("click", () => playRelative(1));
  $("#fullPlayerShuffle").addEventListener("click", () => {
    state.shuffled = !state.shuffled;
    syncPlayerModes();
    toast(state.shuffled ? "Shuffle on." : "Shuffle off.");
  });
  $("#fullPlayerRepeat").addEventListener("click", () => {
    state.repeated = !state.repeated;
    syncPlayerModes();
    toast(state.repeated ? "Repeat on." : "Repeat off.");
  });
  $("#fullPlayerLike").addEventListener("click", () => state.current && toggleLiked(state.current));
  $("#fullPlayerProgress").addEventListener("input", e => {
    if (!state.yt || !state.yt.getDuration) return;
    const duration = state.yt.getDuration();
    state.yt.seekTo((Number(e.target.value) / 100) * duration, true);
  });

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
  const s = state.settings;
  const root = document.documentElement;
  const bgEl = $("#backgroundImage");
  root.style.setProperty("--theme-primary", s.primaryColor || "#e7e7e7");
  root.style.setProperty("--theme-secondary", s.secondaryColor || "#8f8f8f");
  root.style.setProperty("--theme-accent", s.accentColor || "#c8c8c8");
  root.style.setProperty("--theme-surface", s.surfaceColor || "#111111");
  root.style.setProperty("--theme-background", s.backgroundColor || "#070707");
  root.style.setProperty("--bg-image-opacity", "1");
  root.style.setProperty("--bg-image-blur", "0px");
  root.style.setProperty("--glass-blur", `${Math.max(0, Math.min(35, Number(s.glass) || 0))}px`);
  document.body.classList.toggle("reduced-motion", s.motion === "reduced");
  document.body.classList.toggle("no-bg-color", s.bgColorEnabled === false);
  if ($("#bgColorEnabled")) $("#bgColorEnabled").checked = s.bgColorEnabled !== false;
  if (bgEl) {
    if (s.bgUrl?.trim()) {
      bgEl.style.backgroundImage = `url("${safeUrl(s.bgUrl)}")`;
    } else if (s.bgMode === "file" && backgroundObjectUrl) {
      bgEl.style.backgroundImage = `url("${backgroundObjectUrl}")`;
    } else {
      bgEl.style.backgroundImage = "none";
    }
  }
  const setValue = (id, value) => { const el = $("#" + id); if (el) el.value = value; };
  setValue("bgUrlInput", s.bgUrl || "");
  setValue("glassRange", s.glass ?? 16);
  if ($("#glassValue")) $("#glassValue").textContent = `${s.glass ?? 16}px`;
  setValue("bgOpacityRange", 100);
  setValue("bgBlurRange", 0);
  setValue("primaryColor", s.primaryColor || "#e7e7e7");
  setValue("secondaryColor", s.secondaryColor || "#8f8f8f");
  setValue("accentColor", s.accentColor || "#c8c8c8");
  setValue("surfaceColor", s.surfaceColor || "#111111");
  setValue("backgroundColor", s.backgroundColor || "#070707");
  if ($("#bgOpacityValue")) $("#bgOpacityValue").textContent = "100%";
  if ($("#bgBlurValue")) $("#bgBlurValue").textContent = "0px";
  if ($("#profileNameInput")) $("#profileNameInput").value = state.profileName || "";
  $$(".segmented button").forEach(btn => btn.classList.toggle("active", btn.dataset.motion === s.motion));
  updateThemeMeta();
}
function updateThemeMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", state.settings.backgroundColor || "#070707");
}
async function loadSavedBackground() {
  try {
    const blob = await getAsset("background");
    if (!blob || state.settings.bgMode !== "file" || state.settings.bgUrl) return;
    if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl = URL.createObjectURL(blob);
    $("#backgroundImage").style.backgroundImage = `url("${backgroundObjectUrl}")`;
    if ($("#bgFileName")) $("#bgFileName").textContent = "Saved local image";
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

async function deleteAsset(key) {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BG_STORE, "readwrite");
    tx.objectStore(BG_STORE).delete(key);
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
  state.settings.bgUrl = "";
  saveState();
  applySettings();
  if ($("#bgFileInput")) $("#bgFileInput").value = "";
  const label = $("#bgFileName");
  if (label) label.textContent = "No local image selected";
  toast("Custom background cleared.");
}

function saveSettings() {
  const profileInput = $("#profileNameInput");
  if (profileInput) {
    const name = profileInput.value.trim().replace(/\s+/g, " ");
    if (name) { state.profileName = name.slice(0, 24); localStorage.setItem("b1api_profile_name", state.profileName); renderLocalProfile(); }
  }
  const value = id => $("#" + id)?.value;
  state.settings.primaryColor = value("primaryColor") || "#e7e7e7";
  state.settings.secondaryColor = value("secondaryColor") || "#8f8f8f";
  state.settings.accentColor = value("accentColor") || "#c8c8c8";
  state.settings.surfaceColor = value("surfaceColor") || "#111111";
  state.settings.backgroundColor = value("backgroundColor") || "#070707";
  state.settings.bgUrl = (value("bgUrlInput") || "").trim();
  state.settings.bgOpacity = 100;
  state.settings.bgBlur = 0;
  state.settings.bgColorEnabled = !!$("#bgColorEnabled")?.checked;
  state.settings.glass = Number(value("glassRange") || 16);
  state.settings.motion = $(".segmented button.active")?.dataset.motion || "full";
  if (state.settings.bgUrl) {
    state.settings.bgMode = "url";
    clearStoredBackground().catch(() => {});
    if (backgroundObjectUrl) { URL.revokeObjectURL(backgroundObjectUrl); backgroundObjectUrl = null; }
  }
  saveState();
  applySettings();
  if (state.settings.bgMode === "file" && !state.settings.bgUrl) loadSavedBackground();
  $("#settingsDialog")?.close();
  toast("Settings saved.");
}

function resetAppearance() {
  state.settings = { ...state.settings, bgUrl:"", bgMode:"", glass:16, motion:"full", primaryColor:"#e7e7e7", secondaryColor:"#8f8f8f", accentColor:"#c8c8c8", surfaceColor:"#111111", backgroundColor:"#070707", bgOpacity:100, bgBlur:0, bgColorEnabled:true };
  clearStoredBackground().catch(() => {});
  if (backgroundObjectUrl) { URL.revokeObjectURL(backgroundObjectUrl); backgroundObjectUrl = null; }
  saveState();
  applySettings();
  if ($("#bgFileInput")) $("#bgFileInput").value = "";
  if ($("#bgFileName")) $("#bgFileName").textContent = "No local image selected";
  toast("Appearance reset.");
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
  if (!host) return;
  host.__b1apiCleanup?.();

  if (!state.playlists.length) {
    host.className = "playlist-carousel immersive-stage";
    host.innerHTML = '<div class="empty-state glass"><h3>No playlists yet.</h3><p>Create one from the + button.</p></div>';
    return;
  }

  host.className = "playlist-carousel immersive-stage";
  host.innerHTML =
    '<div class="playlist-stage-track">' +
    state.playlists.map((pl, index) => `
      <button class="playlist-card" data-playlist="${pl.id}" data-index="${index}" type="button" aria-label="Open ${escapeAttr(pl.name)}">
        <div class="playlist-art">${playlistArtwork(pl)}</div>
        <div class="playlist-card-sheen" aria-hidden="true"></div>
        <span class="playlist-card-number">${String(index + 1).padStart(2, "0")}</span>
        <div class="playlist-meta">
          <small>PLAYLIST</small>
          <strong>${escapeHTML(pl.name)}</strong>
          <span>${pl.tracks.length} ${pl.tracks.length === 1 ? "TRACK" : "TRACKS"}</span>
        </div>
      </button>
    `).join("") +
    '</div>' +
    '<button class="carousel-arrow carousel-prev" id="carouselPrevInner" aria-label="Previous playlist">←</button>' +
    '<button class="carousel-arrow carousel-next" id="carouselNextInner" aria-label="Next playlist">→</button>';

  const buttons = $$(".playlist-card", host);
  let phase = 0;
  let target = 0;
  let frame = 0;
  let drag = null;
  let suppressClick = false;
  let suppressTimer = 0;

  const wrap = (value, total) => ((value + total / 2) % total + total) % total - total / 2;
  const modulo = (value, total) => ((value % total) + total) % total;
  const requestRender = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  function render() {
    const width = host.clientWidth;
    const step = width < 680 ? 255 : width < 1000 ? 300 : 330;
    const total = buttons.length;
    phase += (target - phase) * 0.14;
    if (Math.abs(target - phase) < 0.0005) phase = target;

    buttons.forEach((button, index) => {
      const slot = wrap(index - phase, total);
      const abs = Math.abs(slot);
      const x = slot * step + slot * abs * 13;
      const y = abs * abs * 8;
      const scale = abs < 0.5 ? 1.06 : Math.max(0.72, 1 - abs * 0.078);
      const rotate = slot * -3.2;
      const rotateY = slot * -9;
      const opacity = Math.max(0.08, 1 - Math.max(0, abs - 2.1) * 0.48);

      button.style.transform = "translate3d(" + x + "px," + y + "px,0) rotateZ(" + rotate + "deg) rotateY(" + rotateY + "deg) scale(" + scale + ")";
      button.style.opacity = String(opacity);
      button.style.zIndex = String(100 - Math.round(abs * 12));
      button.classList.toggle("is-center", abs < 0.5);
      button.tabIndex = abs < 0.5 ? 0 : -1;
    });

    if (Math.abs(target - phase) > 0.0005 && !host.classList.contains("is-open")) {
      frame = requestAnimationFrame(render);
    } else {
      frame = 0;
    }
  }

  const nearestVirtualIndex = (index) => {
    const total = buttons.length;
    const cycle = Math.round((target - index) / total);
    return index + cycle * total;
  };

  const moveBy = (direction) => {
    if (host.classList.contains("is-open")) return;
    target = Math.round(target) + direction;
    requestRender();
  };

  const closePreview = () => {
    host.classList.remove("is-open");
    $(".playlist-open", host)?.remove();
    requestRender();
  };

  const openPreview = (index) => {
    const pl = state.playlists[index];
    if (!pl) return;
    host.classList.add("is-open");
    renderPlaylistPreview(host, pl, closePreview);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        window.clearTimeout(suppressTimer);
        return;
      }

      const slot = wrap(index - phase, buttons.length);
      if (Math.abs(slot) >= 0.5) {
        target = nearestVirtualIndex(index);
        requestRender();
        return;
      }
      openPreview(index);
    });
  });

  const onWheel = (event) => {
    if (host.classList.contains("is-open")) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    target = Math.round(target) + (delta > 0 ? 1 : -1);
    requestRender();
  };

  const onPointerDown = (event) => {
    if (host.classList.contains("is-open")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startTarget: target, moved: false };
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!drag || drag.pointerId !== event.pointerId || host.classList.contains("is-open")) return;
    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) > 8) drag.moved = true;
    if (drag.moved) {
      event.preventDefault();
      target = drag.startTarget - dx / 245;
      requestRender();
    }
  };

  const onPointerUp = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      target = Math.round(target);
      requestRender();
      suppressClick = true;
      window.clearTimeout(suppressTimer);
      suppressTimer = window.setTimeout(() => { suppressClick = false; }, 260);
    }
    drag = null;
  };

  const onKey = (event) => {
    if (host.classList.contains("is-open")) {
      if (event.key === "Escape") closePreview();
      return;
    }
    if (event.key === "ArrowRight") { event.preventDefault(); moveBy(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(-1); }
  };

  $("#carouselPrevInner", host)?.addEventListener("click", () => moveBy(-1));
  $("#carouselNextInner", host)?.addEventListener("click", () => moveBy(1));
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: false });
  window.addEventListener("pointercancel", onPointerUp, { passive: false });
  window.addEventListener("keydown", onKey);
  host.addEventListener("wheel", onWheel, { passive: false });
  host.addEventListener("pointerdown", onPointerDown, { passive: false });

  host.__b1apiCleanup = () => {
    if (frame) cancelAnimationFrame(frame);
    window.clearTimeout(suppressTimer);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", onKey);
    host.removeEventListener("wheel", onWheel);
    host.removeEventListener("pointerdown", onPointerDown);
  };

  requestRender();
}

function renderPlaylistPreview(host, pl, closePreview) {
  const panel = document.createElement("div");
  panel.className = "playlist-open";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", pl.name);
  const tracks = pl.tracks;
  const rows = tracks.length ? tracks.map((track, i) => `
    <button class="playlist-open-track" data-preview-track="${track.id}" type="button">
      <span class="playlist-open-index">${String(i + 1).padStart(2, "0")}</span>
      <img src="${safeUrl(track.thumbnail)}" alt="">
      <span class="playlist-open-track-copy"><strong>${escapeHTML(track.title)}</strong><small>${escapeHTML(track.artist)}</small></span>
      <span class="playlist-open-play">▶</span>
    </button>`).join("") : '<div class="playlist-open-empty">This playlist has no tracks yet.</div>';
  panel.innerHTML=`
    <div class="playlist-open-media">${playlistArtwork(pl)}</div>
    <div class="playlist-open-body">
      <div class="playlist-open-scroll">
        <div class="playlist-open-heading">
          <div><span>${String(state.playlists.indexOf(pl)+1).padStart(2,"0")} / PLAYLIST</span><h3>${escapeHTML(pl.name)}</h3><p class="playlist-open-accent">${pl.tracks.length} ${pl.tracks.length===1?"track":"tracks"}</p></div>
          <button type="button" class="playlist-open-settings" data-preview-settings aria-label="Playlist settings">⚙</button>
        </div>
        <div class="playlist-open-list">${rows}</div>
      </div>
      <div class="playlist-open-foot">
        <span>LOCAL PLAYLIST</span>
        <div><button class="playlist-open-action" data-preview-play type="button">PLAY ALL <span>▶</span></button><button class="playlist-open-close" type="button">CLOSE ×</button></div>
      </div>
    </div>`;
  host.appendChild(panel);
  panel.addEventListener("click", event => {
    event.stopPropagation();
    if(event.target.closest(".playlist-open-close")) return closePreview();
    if(event.target.closest("[data-preview-settings]")) return openPlaylistSettings(pl.id);
    const trackButton=event.target.closest("[data-preview-track]");
    if(trackButton){
      const track=pl.tracks.find(x=>x.id===trackButton.dataset.previewTrack);
      if(track){setQueue(pl.tracks,pl.tracks.findIndex(x=>x.id===track.id));playTrack(track);}
      return;
    }
    if(event.target.closest("[data-preview-play]")){
      if(!pl.tracks.length) return toast("This playlist is empty.");
      setQueue(pl.tracks,0); playTrack(pl.tracks[0]);
    }
  });
}

function openPlaylistSettings(id){
  if(!state.playlists.some(x=>x.id===id)) return;
  editingPlaylistId=id;
  if($("#playlistSettingsCoverFile")) $("#playlistSettingsCoverFile").value="";
  if($("#playlistSettingsCoverName")) $("#playlistSettingsCoverName").textContent=playlistCoverObjectUrls.has(id)?"Custom cover is active.":"Using the first track cover.";
  $("#playlistSettingsDialog")?.showModal();
}

async function savePlaylistSettings(){
  if(!editingPlaylistId) return;
  const file=$("#playlistSettingsCoverFile")?.files?.[0];
  if(file) await setPlaylistCover(editingPlaylistId,file);
  $("#playlistSettingsDialog")?.close();
  editingPlaylistId=null;
  toast("Playlist settings saved.");
}

async function removeEditingPlaylistCover(){
  if(!editingPlaylistId) return;
  await clearPlaylistCover(editingPlaylistId);
  $("#playlistSettingsDialog")?.close();
  editingPlaylistId=null;
  toast("Playlist cover reset.");
}

async function loadPlaylistCovers() {
  for (const pl of state.playlists) {
    try {
      const blob = await getAsset(PLAYLIST_COVER_PREFIX + pl.id);
      if (!blob) continue;
      const old = playlistCoverObjectUrls.get(pl.id);
      if (old) URL.revokeObjectURL(old);
      playlistCoverObjectUrls.set(pl.id, URL.createObjectURL(blob));
    } catch {}
  }
  renderSidebar();
  renderPlaylists();
  const openPlaylistId = $("#playlistView")?.dataset.playlistId;
  if (openPlaylistId) {
    const pl = state.playlists.find(x => x.id === openPlaylistId);
    if (pl) renderPlaylistPage(pl);
  }
}

async function setPlaylistCover(id, file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) return toast("Image must be 8 MB or smaller.");
  try {
    await putAsset(PLAYLIST_COVER_PREFIX + id, file);
    const old = playlistCoverObjectUrls.get(id);
    if (old) URL.revokeObjectURL(old);
    playlistCoverObjectUrls.set(id, URL.createObjectURL(file));
    renderSidebar();
    renderPlaylists();
    const pl = state.playlists.find(x => x.id === id);
    if (pl) renderPlaylistPage(pl);
    toast("Playlist cover updated.");
  } catch {
    toast("Couldn't save that cover.");
  }
}

async function clearPlaylistCover(id) {
  try { await deleteAsset(PLAYLIST_COVER_PREFIX + id); } catch {}
  const old = playlistCoverObjectUrls.get(id);
  if (old) URL.revokeObjectURL(old);
  playlistCoverObjectUrls.delete(id);
  renderSidebar();
  renderPlaylists();
  const pl = state.playlists.find(x => x.id === id);
  if (pl) renderPlaylistPage(pl);
  toast("Playlist cover removed.");
}

function playlistArtwork(pl) {
  const custom = playlistCoverObjectUrls.get(pl.id);
  if (custom) return `<img src="${safeUrl(custom)}" alt="">`;
  const first = pl.tracks[0];
  if (first?.thumbnail) return `<img src="${safeUrl(first.thumbnail)}" alt="">`;
  return `<div class="playlist-fallback-art"><span>${escapeHTML((pl.name[0] || "F").toUpperCase())}</span></div>`;
}

function smallPlaylistArt(pl) {
  const custom = playlistCoverObjectUrls.get(pl.id);
  if (custom) return `<img src="${safeUrl(custom)}" alt="">`;
  const first = pl.tracks[0];
  if (first?.thumbnail) return `<img src="${safeUrl(first.thumbnail)}" alt="">`;
  return `<span class="fallback-art">${escapeHTML((pl.name[0] || "F").toUpperCase())}</span>`;
}

async function createPlaylist() {
  const name = $("#playlistNameInput")?.value.trim();
  if (!name) return toast("Give the playlist a name.");
  const file = $("#playlistCoverFile")?.files?.[0] || null;
  const playlist = { id: crypto.randomUUID(), name, tracks: [] };
  state.playlists.unshift(playlist);
  saveState();
  renderSidebar();
  renderPlaylists();
  renderLibrary("liked");
  $("#playlistNameInput").value = "";
  if ($("#playlistCoverFile")) $("#playlistCoverFile").value = "";
  if ($("#playlistCoverFileName")) $("#playlistCoverFileName").textContent = "Default: first track cover";
  $("#playlistDialog").close();
  if (file) await setPlaylistCover(playlist.id, file);
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
    syncPlayerModes();
    syncProgress();
  } else {
    syncPlayerModes();
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
    const progress = duration ? (current / duration) * 100 : 0;
    $("#currentTime").textContent = formatTime(current);
    $("#duration").textContent = formatTime(duration);
    $("#progressBar").value = progress;
    $("#fullPlayerCurrentTime") && ($("#fullPlayerCurrentTime").textContent = formatTime(current));
    $("#fullPlayerDuration") && ($("#fullPlayerDuration").textContent = formatTime(duration));
    $("#fullPlayerProgress") && ($("#fullPlayerProgress").value = progress);
    if (state.yt.getPlayerState?.() === 1) {
      progressTimer = requestAnimationFrame(tick);
    } else {
      progressTimer = 0;
    }
  };
  progressTimer = requestAnimationFrame(tick);
}


function syncPlayerModes() {
  $("#shuffleBtn")?.classList.toggle("active", state.shuffled);
  $("#repeatBtn")?.classList.toggle("active", state.repeated);
  $("#fullPlayerShuffle")?.classList.toggle("active", state.shuffled);
  $("#fullPlayerRepeat")?.classList.toggle("active", state.repeated);
  const playing = state.yt?.getPlayerState?.() === 1;
  const label = playing ? "Ⅱ" : "▶";
  $("#playBtn") && ($("#playBtn").textContent = label);
  $("#fullPlayerPlay") && ($("#fullPlayerPlay").textContent = label);
}

function setExpandedPlayer(open) {
  if (open && !state.current) {
    toast("Choose a track first.");
    return;
  }
  document.body.classList.toggle("player-expanded", !!open);
  const full = $("#fullPlayer");
  if (full) full.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    updatePlayerUI();
    syncProgress();
  }
}

function updatePlayerUI() {
  const track = state.current;
  const liked = !!track && state.liked.some(x => x.id === track.id);
  $("#nowTitle").textContent = track?.title || "Nothing playing";
  $("#nowArtist").textContent = track?.artist || "Choose a track to begin";
  $("#likeCurrent").classList.toggle("active", liked);
  $("#likeCurrent").textContent = liked ? "♥" : "♡";
  $("#nowArt").innerHTML = track?.thumbnail
    ? `<img src="${safeUrl(track.thumbnail)}" alt="">`
    : "<span>♪</span>";

  const fullArt = $("#fullPlayerArt");
  const fullBg = $("#fullPlayerBg");
  if (fullArt) {
    fullArt.src = track?.thumbnail ? safeUrl(track.thumbnail) : "";
    fullArt.alt = track?.title ? `${track.title} — ${track.artist || "YouTube"}` : "";
  }
  if (fullBg) {
    fullBg.style.backgroundImage = track?.thumbnail ? `url("${safeUrl(track.thumbnail)}")` : "none";
  }
  $("#fullPlayerTitle") && ($("#fullPlayerTitle").textContent = track?.title || "Nothing playing");
  $("#miniVideoTitle") && ($("#miniVideoTitle").textContent = track?.title || "b1api / YouTube");
  $("#fullPlayerArtist") && ($("#fullPlayerArtist").textContent = track?.artist || "Choose a track to begin");
  $("#fullPlayerLike") && ($("#fullPlayerLike").classList.toggle("active", liked), $("#fullPlayerLike").textContent = liked ? "♥" : "♡");
  syncPlayerModes();
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
  const hasCustomCover = playlistCoverObjectUrls.has(pl.id);
  $("#playlistView").dataset.playlistId = pl.id;

  $("#playlistHero").innerHTML = `
    <div class="playlist-page-hero">
      <div class="playlist-page-art-wrap">
        <div class="playlist-page-art">${art}</div>
        <div class="playlist-cover-actions">
          <label class="file-button playlist-edit-cover" for="playlistEditCoverFile"> ${hasCustomCover ? "Change cover" : "Add cover"} </label>
          <input id="playlistEditCoverFile" type="file" accept="image/*" hidden />
          ${hasCustomCover ? '<button type="button" class="ghost-button playlist-remove-cover">Remove cover</button>' : ''}
        </div>
      </div>
      <div class="playlist-page-copy">
        <span class="eyebrow">PLAYLIST</span>
        <h2>${escapeHTML(pl.name)}</h2>
        <p>${pl.tracks.length} ${pl.tracks.length === 1 ? "track" : "tracks"} · stored only in this browser</p>
        <div class="playlist-controls">
          <button class="primary-button" id="playPlaylist">▶ Play all</button>
          <button class="ghost-button" id="openPlaylistSettingsPage">⚙ Settings</button>
          <button class="ghost-button" id="deletePlaylist">Delete</button>
        </div>
      </div>
    </div>
  `;

  $("#playlistEditCoverFile")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (file) await setPlaylistCover(pl.id, file);
  });
  $(".playlist-remove-cover")?.addEventListener("click", () => clearPlaylistCover(pl.id));
  $("#openPlaylistSettingsPage")?.addEventListener("click", () => openPlaylistSettings(pl.id));

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
      const track = map.get(btn.dataset.playTrack);
      setQueue(pl.tracks, pl.tracks.findIndex(x => x.id === track.id));
      playTrack(track);
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

  $("#playPlaylist")?.addEventListener("click", () => {
    if (!pl.tracks.length) return toast("This playlist is empty.");
    setQueue(pl.tracks, 0);
    playTrack(pl.tracks[0]);
  });
  $("#deletePlaylist")?.addEventListener("click", async () => {
    if (state.playlists.length <= 1) return toast("Keep at least one playlist.");
    await clearPlaylistCover(pl.id);
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
  if (!el) return;
  clearTimeout(window.__toastTimer);
  el.classList.remove("show");
  el.innerHTML = "";
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = "✓";
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = String(message);
  const bar = document.createElement("span");
  bar.className = "toast-progress";
  el.append(icon, text, bar);
  requestAnimationFrame(() => el.classList.add("show"));
  window.__toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2000);
}

function safeUrl(url) {
  try {
    const u = new URL(url, location.href);
    if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "blob:") return u.href;
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

  // Playlist stage owns its own controls.
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
    if (event.key === "Escape") {
      if (document.body.classList.contains("player-expanded")) {
        setExpandedPlayer(false);
        return;
      }
      closeFirstRun(false);
      $(".sidebar")?.classList.remove("open");
    }
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