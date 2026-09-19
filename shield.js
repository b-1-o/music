(() => {
  "use strict";

  const STORAGE = {
    enabled: "b1api_shield_enabled",
    network: "b1api_shield_network_rules",
    cosmetic: "b1api_shield_cosmetic_rules"
  };

  const DEFAULT_NETWORK = [
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "google-analytics.com",
    "googletagmanager.com",
    "connect.facebook.net",
    "facebook.net",
    "clarity.ms",
    "hotjar.com",
    "segment.io",
    "mixpanel.com",
    "fullstory.com",
    "amplitude.com"
  ];

  const state = {
    enabled: localStorage.getItem(STORAGE.enabled) !== "0",
    networkRules: loadList(STORAGE.network, DEFAULT_NETWORK),
    cosmeticRules: loadList(STORAGE.cosmetic, []),
    blockedRequests: 0,
    hiddenElements: 0,
    recent: [],
    hidden: new Map()
  };

  function loadList(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(value) ? value.filter(Boolean) : [...fallback];
    } catch {
      return [...fallback];
    }
  }

  function save() {
    localStorage.setItem(STORAGE.enabled, state.enabled ? "1" : "0");
    localStorage.setItem(STORAGE.network, JSON.stringify(state.networkRules));
    localStorage.setItem(STORAGE.cosmetic, JSON.stringify(state.cosmeticRules));
  }

  function normalizeHost(value) {
    return value
      .trim()
      .replace(/^\|\|/, "")
      .replace(/\^.*$/, "")
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .toLowerCase();
  }

  function parseNetworkRules(text) {
    return [...new Set(
      String(text || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("!"))
        .map(normalizeHost)
        .filter(host => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host))
    )];
  }

  function parseCosmeticRules(text) {
    return [...new Set(
      String(text || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("!"))
        .map(line => {
          if (line.includes("##")) return line.slice(line.indexOf("##") + 2).trim();
          return line;
        })
        .filter(Boolean)
    )];
  }

  function shouldBlock(url) {
    if (!state.enabled) return false;
    let host = "";
    try {
      host = new URL(url, location.href).hostname.toLowerCase();
    } catch {
      return false;
    }
    if (!host || host === location.hostname || host.endsWith("." + location.hostname)) return false;
    return state.networkRules.some(rule => host === rule || host.endsWith("." + rule));
  }

  function noteBlocked(url, type) {
    state.blockedRequests += 1;
    state.recent.unshift({ url: String(url), type, at: new Date().toLocaleTimeString() });
    state.recent = state.recent.slice(0, 30);
    updateUI();
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = typeof input === "string" ? input : input?.url;
    if (url && shouldBlock(url)) {
      noteBlocked(url, "fetch");
      throw new DOMException("Blocked by b1api Shield", "AbortError");
    }
    return nativeFetch(input, init);
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__b1ShieldURL = url;
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this.__b1ShieldURL && shouldBlock(this.__b1ShieldURL)) {
      noteBlocked(this.__b1ShieldURL, "xhr");
      try { this.abort(); } catch {}
      return;
    }
    return nativeSend.call(this, body);
  };

  if (navigator.sendBeacon) {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      if (shouldBlock(url)) {
        noteBlocked(url, "beacon");
        return false;
      }
      return nativeBeacon(url, data);
    };
  }

  function applyCosmetic() {
    if (!state.enabled) return;
    for (const selector of state.cosmeticRules) {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (!state.hidden.has(el)) {
            state.hidden.set(el, el.getAttribute("style") || "");
            el.style.setProperty("display", "none", "important");
            state.hiddenElements += 1;
          }
        });
      } catch {}
    }
    updateUI();
  }

  function restoreCosmetic() {
    for (const [el, style] of state.hidden) {
      if (el && el.isConnected) {
        if (style) el.setAttribute("style", style);
        else el.removeAttribute("style");
      }
    }
    state.hidden.clear();
    state.hiddenElements = 0;
    updateUI();
  }

  const observer = new MutationObserver(() => {
    if (state.enabled && state.cosmeticRules.length) applyCosmetic();
  });

  function buildPanel() {
    const host = document.querySelector("#settingsDialog .appearance-grid");
    if (!host || document.querySelector("#privacyShieldSection")) return;

    const section = document.createElement("section");
    section.className = "appearance-section appearance-section-wide shield-section";
    section.id = "privacyShieldSection";
    section.innerHTML = `
      <div class="appearance-section-head">
        <span>06</span>
        <div><b>PRIVACY SHIELD</b><small>uBlock-inspired local filtering for this site</small></div>
      </div>
      <div class="shield-status-row">
        <label class="switch-field">
          <input id="shieldEnabled" type="checkbox">
          <span class="switch-ui"></span>
          <span>Enable shield</span>
        </label>
        <div class="shield-counter" id="shieldCounter">0 blocked · 0 hidden</div>
      </div>
      <div class="setting-block">
        <label>Network host rules</label>
        <textarea id="shieldNetworkRules" class="shield-textarea" spellcheck="false" placeholder="doubleclick.net\ngoogletagmanager.com"></textarea>
        <small>One hostname per line. These rules affect requests made by b1api itself; third-party iframe traffic is outside the page's control.</small>
      </div>
      <div class="setting-block">
        <label>Cosmetic selectors</label>
        <textarea id="shieldCosmeticRules" class="shield-textarea" spellcheck="false" placeholder=".ad\n.sponsor\n[data-ad]"></textarea>
        <small>One CSS selector per line. Matching elements are hidden locally.</small>
      </div>
      <div class="shield-actions">
        <button class="ghost-button" id="shieldResetRules" type="button">Reset rules</button>
        <button class="ghost-button" id="shieldClearLog" type="button">Clear stats</button>
        <details class="shield-log">
          <summary>Request log</summary>
          <pre id="shieldLog">No blocked requests.</pre>
        </details>
      </div>
    `;

    host.appendChild(section);

    const enabled = document.querySelector("#shieldEnabled");
    const network = document.querySelector("#shieldNetworkRules");
    const cosmetic = document.querySelector("#shieldCosmeticRules");

    enabled.checked = state.enabled;
    network.value = state.networkRules.join("\n");
    cosmetic.value = state.cosmeticRules.join("\n");

    enabled.addEventListener("change", () => {
      state.enabled = enabled.checked;
      save();
      if (state.enabled) applyCosmetic();
      else restoreCosmetic();
      updateUI();
    });

    network.addEventListener("change", () => {
      state.networkRules = parseNetworkRules(network.value);
      network.value = state.networkRules.join("\n");
      save();
      updateUI();
    });

    cosmetic.addEventListener("change", () => {
      restoreCosmetic();
      state.cosmeticRules = parseCosmeticRules(cosmetic.value);
      cosmetic.value = state.cosmeticRules.join("\n");
      save();
      applyCosmetic();
    });

    document.querySelector("#shieldResetRules")?.addEventListener("click", () => {
      state.networkRules = [...DEFAULT_NETWORK];
      state.cosmeticRules = [];
      network.value = state.networkRules.join("\n");
      cosmetic.value = "";
      restoreCosmetic();
      save();
      updateUI();
    });

    document.querySelector("#shieldClearLog")?.addEventListener("click", () => {
      state.blockedRequests = 0;
      state.hiddenElements = 0;
      state.recent = [];
      updateUI();
    });

    updateUI();
  }

  function updateUI() {
    const counter = document.querySelector("#shieldCounter");
    const log = document.querySelector("#shieldLog");
    if (counter) counter.textContent = `${state.blockedRequests} blocked · ${state.hiddenElements} hidden`;
    if (log) {
      log.textContent = state.recent.length
        ? state.recent.map(item => `[${item.at}] ${item.type}  ${item.url}`).join("\n")
        : "No blocked requests.";
    }
  }

  function start() {
    buildPanel();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    applyCosmetic();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.B1API_SHIELD = {
    getState: () => ({
      enabled: state.enabled,
      blockedRequests: state.blockedRequests,
      hiddenElements: state.hiddenElements
    })
  };
})();