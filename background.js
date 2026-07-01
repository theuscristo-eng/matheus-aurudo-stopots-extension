const STOPOTS_URL_RE = /^https:\/\/([^/]+\.)?stopots\.com(\.br)?\//i;
const SHOW_PANEL_MESSAGE = { type: "MATHEUS_AURUDO_SHOW_PANEL" };
const ALLOWED_FALLBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response || null);
    });
  });
}

function injectFile(tabId, details) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({ target: { tabId }, ...details }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function injectCss(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.insertCSS({ target: { tabId }, files: ["styles.css"] }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function ensurePanelScripts(tabId) {
  await injectCss(tabId);
  await injectFile(tabId, { files: ["page-bridge.js"], world: "MAIN" });
  await injectFile(tabId, { files: ["data.js"] });
  await injectFile(tabId, { files: ["content.js"] });
}

async function showPanel(tab) {
  if (!tab?.id || !STOPOTS_URL_RE.test(tab.url || "")) return;

  const existing = await sendTabMessage(tab.id, SHOW_PANEL_MESSAGE);
  if (existing?.ok) return;

  await ensurePanelScripts(tab.id);
  await sendTabMessage(tab.id, SHOW_PANEL_MESSAGE);
}

chrome.action.onClicked.addListener((tab) => {
  showPanel(tab);
});

function isAllowedFallbackUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && ALLOWED_FALLBACK_HOSTS.has(url.hostname);
  } catch (_) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "MATHEUS_AURUDO_FETCH_FALLBACK") return false;

  (async () => {
    if (!isAllowedFallbackUrl(message.endpoint)) {
      sendResponse({ answers: [] });
      return;
    }

    const url = new URL(message.endpoint);
    url.searchParams.set("category", String(message.category || ""));
    url.searchParams.set("label", String(message.label || ""));
    url.searchParams.set("letter", String(message.letter || ""));

    try {
      const response = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) {
        sendResponse({ answers: [] });
        return;
      }

      const data = await response.json();
      const answers = Array.isArray(data.answers)
        ? data.answers
        : data.answer
          ? [data.answer]
          : [];
      sendResponse({ answers: answers.map((item) => String(item || "")).filter(Boolean).slice(0, 5) });
    } catch (_) {
      sendResponse({ answers: [] });
    }
  })();

  return true;
});
