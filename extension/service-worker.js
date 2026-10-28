chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'LITETUBE_SET_RATE') return;
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) {
    sendResponse({ ok: false, reason: 'No originating browser tab.' });
    return;
  }

  const rate = Math.min(4, Math.max(0.25, Number(message.rate) || 1));
  chrome.tabs.sendMessage(tabId, {
    type: 'LITETUBE_APPLY_RATE_IN_FRAME',
    requestId: message.requestId,
    rate
  }, response => {
    const error = chrome.runtime.lastError;
    if (error) {
      sendResponse({ ok: false, reason: 'YouTube frame bridge not found. Is the extension enabled and is the page refreshed?' });
      return;
    }
    sendResponse(response || { ok: false, reason: 'The YouTube frame did not respond.' });
  });
  return true;
});
