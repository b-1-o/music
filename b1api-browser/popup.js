const ITEMS = [
  ["javascript","JavaScript","Run page JavaScript."],
  ["popups","Popups","Allow or block pop-up windows."],
  ["cookies","Cookies","Allow or block site cookies."],
  ["notifications","Notifications","Notification permission behavior."],
  ["camera","Camera","Camera access behavior."],
  ["microphone","Microphone","Microphone access behavior."],
  ["location","Location","Location access behavior."],
  ["images","Images","Show or block images."],
  ["sound","Sound","Allow or block page audio."]
];

let tab = null;
let rules = {};

function patternFor(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.origin + "/*";
  } catch {
    return null;
  }
}

async function loadRules() {
  const data = await chrome.storage.local.get("siteRules");
  rules = data.siteRules || {};
}

function currentRule(type) {
  const p = patternFor(tab?.url || "");
  return p && rules[p] && rules[p][type] ? rules[p][type] : "default";
}

function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unavailable";
  }
}

async function setRule(type, value) {
  if (!tab?.url) return;
  await chrome.runtime.sendMessage({
    type: "setSiteSetting",
    settingType: type,
    value,
    url: tab.url
  });
  await loadRules();
}

async function render() {
  const unsupported = !patternFor(tab?.url || "");
  document.getElementById("unsupported").classList.toggle("hidden", !unsupported);

  const host = document.getElementById("controls");
  host.innerHTML = "";
  if (unsupported) return;

  for (const item of ITEMS) {
    const row = document.createElement("label");
    row.className = "control";

    const copy = document.createElement("div");
    copy.className = "copy";

    const b = document.createElement("b");
    b.textContent = item[1];

    const s = document.createElement("span");
    s.textContent = item[2];

    copy.append(b, s);

    const select = document.createElement("select");
    [["default", "Default"], ["allow", "Allow"], ["block", "Block"]].forEach(pair => {
      const option = document.createElement("option");
      option.value = pair[0];
      option.textContent = pair[1];
      select.appendChild(option);
    });

    select.value = currentRule(item[0]);
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await setRule(item[0], select.value);
      } finally {
        select.disabled = false;
      }
    });

    row.append(copy, select);
    host.appendChild(row);
  }
}

async function init() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0] || null;

    document.getElementById("name").textContent = tab?.url ? siteName(tab.url) : "Unavailable";
    document.getElementById("url").textContent = tab?.url || "No active page";

    document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

    document.getElementById("reload").addEventListener("click", () => {
      if (tab?.id) chrome.tabs.reload(tab.id);
    });

    document.getElementById("reset").addEventListener("click", async () => {
      if (!tab?.url) return;
      const pattern = patternFor(tab.url);
      if (!pattern) return;
      await chrome.runtime.sendMessage({ type: "removePattern", pattern });
      await loadRules();
      await render();
    });

    await loadRules();
    await render();
  } catch (error) {
    document.getElementById("name").textContent = "Extension error";
    document.getElementById("url").textContent = String(error);
  }
}

init();
