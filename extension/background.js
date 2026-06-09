chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("tool.html");
  const existing = await chrome.tabs.query({ url });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
});
