// Toolbar icon: switch to the PDF Smith tab if one is open, otherwise open one.
// runtime.getContexts finds the extension's own pages without the "tabs"
// permission (tabs.query({ url }) silently matches nothing without it).
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("tool.html");
  let open = [];
  try {
    open = await chrome.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [url] });
  } catch (e) {
    console.warn("getContexts failed", e);
  }
  const existing = open.find((c) => c.tabId >= 0);
  if (existing) {
    await chrome.tabs.update(existing.tabId, { active: true });
    if (existing.windowId >= 0) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
