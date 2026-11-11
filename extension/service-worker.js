// Route the requested speed directly to the YouTube embed frame. Targeting
// frameId avoids sending the command to unrelated frames in the same tab.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'LITETUBE_SET_RATE') return;
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) {
    sendResponse({ ok: false, reason: 'No originating browser tab.' });
    return;
  }

  const rate = Math.min(4, Math.max(0.25, Number(message.rate) || 1));
  const frameMessage = {
    type: 'LITETUBE_APPLY_RATE_IN_FRAME',
    requestId: message.requestId,
    rate
  };

  chrome.webNavigation.getAllFrames({ tabId }, frames => {
    const navError = chrome.runtime.lastError;
    if (navError) {
      sendResponse({ ok: false, reason: 'Could not inspect the YouTube player frame.' });
      return;
    }

    const targets = (frames || []).filter(frame => {
      try { return new URL(frame.url).hostname === 'www.youtube-nocookie.com'; }
      catch { return false; }
    });

    if (!targets.length) {
      sendResponse({ ok: false, reason: 'YouTube embed frame not found. Start a video and try again.' });
      return;
    }

    let pending = targets.length;
    let replied = false;
    let lastReason = 'The YouTube frame did not respond.';

    targets.forEach(frame => {
      chrome.tabs.sendMessage(tabId, frameMessage, { frameId: frame.frameId }, response => {
        const error = chrome.runtime.lastError;
        if (!replied && response && response.ok) {
          replied = true;
          sendResponse({ ...response, frameId: frame.frameId });
          return;
        }

        if (error) lastReason = 'The LiteTube frame helper did not load. Reload the extension and LiteTube.';
        else if (response && response.reason) lastReason = response.reason;

        pending -= 1;
        if (!replied && pending === 0) sendResponse({ ok: false, reason: lastReason });
      });
    });
  });

  return true;
});
