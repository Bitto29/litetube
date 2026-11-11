(() => {
  'use strict';

  const isTopFrame = window.top === window;
  const LITETUBE_HOSTS = new Set([
    'litetube-xi.vercel.app',
    'litetube29.vercel.app',
    'litetube-bitto29s-projects.vercel.app',
    'litetube-git-main-bitto29s-projects.vercel.app',
    'litetube29-bitto29s-projects.vercel.app',
    'litetube29-git-main-bitto29s-projects.vercel.app'
  ]);
  const isLiteTube = isTopFrame && LITETUBE_HOSTS.has(location.hostname);

  // The LiteTube page only relays speed changes. It never polls the player.
  if (isTopFrame && isLiteTube) {
    window.addEventListener('message', event => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data;
      if (!data || data.source !== 'litetube-app' || data.type !== 'SET_RATE') return;
      const rate = Math.min(4, Math.max(0.25, Number(data.rate) || 1));

      chrome.runtime.sendMessage({
        type: 'LITETUBE_SET_RATE',
        requestId: String(data.requestId || ''),
        rate,
        required: !!data.required
      }, response => {
        const runtimeError = chrome.runtime.lastError;
        window.postMessage({
          source: 'litetube-speed-bridge',
          type: 'RATE_RESULT',
          requestId: String(data.requestId || ''),
          rate,
          required: !!data.required,
          ok: !runtimeError && !!(response && response.ok),
          reason: runtimeError ? runtimeError.message : (response && response.reason) || ''
        }, location.origin);
      });
    });
    return;
  }

  // Only operate inside YouTube embed frames.
  if (isTopFrame || location.hostname !== 'www.youtube-nocookie.com') return;

  let desiredRate = null;
  let observer = null;
  const tracked = new WeakSet();

  function setVideoRate(video) {
    if (!video || desiredRate == null) return;
    try {
      if (Math.abs(video.playbackRate - desiredRate) > 0.015) video.playbackRate = desiredRate;
      if (Math.abs(video.defaultPlaybackRate - desiredRate) > 0.015) video.defaultPlaybackRate = desiredRate;
    } catch {}
  }

  function trackVideo(video) {
    if (!(video instanceof HTMLVideoElement) || tracked.has(video)) return;
    tracked.add(video);
    video.addEventListener('ratechange', () => {
      if (desiredRate == null || Math.abs(video.playbackRate - desiredRate) <= 0.015) return;
      setVideoRate(video);
    });
    // Apply the requested rate when YouTube prepares or starts a new stream.
    ['loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach(type => {
      video.addEventListener(type, () => setVideoRate(video), { passive: true });
    });
    setVideoRate(video);
  }

  function scanAdded(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches && node.matches('video')) trackVideo(node);
    if (node.querySelectorAll) node.querySelectorAll('video').forEach(trackVideo);
  }

  function setDesiredRate(rate) {
    desiredRate = Math.min(4, Math.max(0.25, Number(rate) || 1));
    // One initial scan, then only inspect newly inserted DOM nodes. No
    // permanent polling loop and no repeated whole-document query.
    document.querySelectorAll('video').forEach(trackVideo);
    if (!observer && document.documentElement) {
      observer = new MutationObserver(records => {
        for (const record of records) {
          record.addedNodes.forEach(scanAdded);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    return true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'LITETUBE_APPLY_RATE_IN_FRAME') return;
    setDesiredRate(message.rate);
    sendResponse({
      ok: true,
      rate: desiredRate,
      frame: location.hostname,
      foundVideo: !!document.querySelector('video')
    });
  });
})();
