
const TYPES = ["javascript","popups","notifications","camera","microphone","location","cookies","images","sound"];
const STORE = "siteRules";

function patternFor(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.origin + "/*";
  } catch { return null; }
}

async function getRules() {
  const data = await chrome.storage.local.get(STORE);
  return data[STORE] || {};
}

async function setRules(rules) {
  await chrome.storage.local.set({ [STORE]: rules });
}

async function reconcile() {
  const rules = await getRules();
  for (const type of TYPES) {
    try { await chrome.contentSettings[type].clear({scope:"regular"}); } catch {}
  }
  for (const pattern of Object.keys(rules)) {
    for (const type of TYPES) {
      const setting = rules[pattern] && rules[pattern][type];
      if (!setting || !chrome.contentSettings[type]) continue;
      try {
        await chrome.contentSettings[type].set({
          primaryPattern: pattern,
          setting,
          scope: "regular"
        });
      } catch {}
    }
  }
}

chrome.runtime.onInstalled.addListener(reconcile);
chrome.runtime.onStartup.addListener(reconcile);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "setSiteSetting") {
      const pattern = patternFor(message.url);
      if (!pattern || !TYPES.includes(message.settingType)) {
        sendResponse({ok:false,error:"Unsupported site or setting."});
        return;
      }

      const rules = await getRules();
      rules[pattern] ||= {};

      if (message.value === "default") {
        delete rules[pattern][message.settingType];
        if (!Object.keys(rules[pattern]).length) delete rules[pattern];
      } else {
        rules[pattern][message.settingType] = message.value;
      }

      await setRules(rules);
      await reconcile();
      sendResponse({ok:true});
      return;
    }

    if (message?.type === "removePattern") {
      const rules = await getRules();
      delete rules[message.pattern];
      await setRules(rules);
      await reconcile();
      sendResponse({ok:true});
      return;
    }

    if (message?.type === "clearAll") {
      await chrome.storage.local.remove(STORE);
      await reconcile();
      sendResponse({ok:true});
      return;
    }

    sendResponse({ok:false,error:"Unknown action."});
  })().catch(error => sendResponse({ok:false,error:String(error)}));

  return true;
});
