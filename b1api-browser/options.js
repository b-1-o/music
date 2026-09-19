async function getRules() {
  const data = await chrome.storage.local.get("siteRules");
  return data.siteRules || {};
}

function label(pattern) {
  return pattern
    .replace(/^https?:\/\//, "")
    .replace(/\/\*$/, "");
}

async function render() {
  const host = document.getElementById("rules");
  const rules = await getRules();
  host.innerHTML = "";

  const entries = Object.entries(rules);

  if (!entries.length) {
    host.innerHTML = '<div class="empty">No custom site rules.</div>';
    return;
  }

  for (const [pattern, settings] of entries) {
    const row = document.createElement("article");
    row.className = "rule";

    const left = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = label(pattern);

    const detail = document.createElement("small");
    detail.textContent = Object.entries(settings)
      .map(([key, value]) => key + ": " + value)
      .join(" · ");

    left.append(title, detail);

    const button = document.createElement("button");
    button.textContent = "Remove site";
    button.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({
        type: "removePattern",
        pattern
      });
      await render();
    });

    row.append(left, button);
    host.appendChild(row);
  }
}

document.getElementById("resetAll").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clearAll" });
  await render();
});

document.getElementById("openSite").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://b-1-o.github.io/music/" });
});

render();
