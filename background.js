const STOPOTS_URL_RE = /^https:\/\/([^/]+\.)?stopots\.com(\.br)?\//i;
const SHOW_PANEL_MESSAGE = { type: "MATHEUS_AURUDO_SHOW_PANEL" };

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
