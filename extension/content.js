(() => {
  'use strict';

  const isTopFrame = window.top === window;
  const isLiteTube = location.hostname === 'litetube29.vercel.app';

  // Only the top LiteTube document relays the page's requested speed to the
  // extension worker. The web page cannot access chrome.runtime itself.
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

  // Only operate inside YouTube embed frames; don't alter arbitrary videos on
  // other sites. HTMLMediaElement.playbackRate is the real media playback rate.
  if (isTopFrame || location.hostname !== 'www.youtube-nocookie.com') return;

  let desiredRate = null;
  let observer = null;
  let interval = null;
  const tracked = new WeakSet();

  function setVideoRate(video) {
    if (!video || desiredRate == null) return;
    try {
      if (Math.abs(video.playbackRate - desiredRate) > 0.015) video.playbackRate = desiredRate;
      if (Math.abs(video.defaultPlaybackRate - desiredRate) > 0.015) video.defaultPlaybackRate = desiredRate;
    } catch {}
  }

  function scanVideos() {
    document.querySelectorAll('video').forEach(video => {
      if (!tracked.has(video)) {
        tracked.add(video);
        video.addEventListener('ratechange', () => {
          if (desiredRate == null || Math.abs(video.playbackRate - desiredRate) <= 0.015) return;
          setTimeout(() => setVideoRate(video), 0);
        });
        video.addEventListener('loadedmetadata', () => setVideoRate(video));
        video.addEventListener('playing', () => setVideoRate(video));
      }
      setVideoRate(video);
    });
  }

  function setDesiredRate(rate) {
    desiredRate = Math.min(4, Math.max(0.25, Number(rate) || 1));
    scanVideos();
    if (!observer && document.documentElement) {
      observer = new MutationObserver(scanVideos);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (!interval) interval = setInterval(scanVideos, 500);
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
