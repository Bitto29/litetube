(() => {
'use strict';

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
const $ = id => document.getElementById(id);
const els = {
  form: $('urlForm'), input: $('urlInput'), empty: $('empty'), stage: $('stage'),
  player: $('player'), shield: $('shield'), msg: $('msg'), pipBack: $('pipBack'),
  seek: $('seek'), play: $('btnPlay'), prev: $('btnPrev'), next: $('btnNext'),
  mute: $('btnMute'), vol: $('vol'), time: $('time'), speed: $('speed'),
  quality: $('quality'), loop: $('btnLoop'), pip: $('btnPip'),
  theater: $('btnTheater'), full: $('btnFull'), title: $('title'),
  toast: $('toast'), badge: $('badge'), fileWarn: $('fileWarn'),
  save: $('btnSave'), fast: $('btnFast'), savedList: $('savedList'), savedEmpty: $('savedEmpty'), savedCount: $('savedCount')
};

const store = {
  get(k, d) { try { const v = localStorage.getItem('lt_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lt_' + k, JSON.stringify(v)); } catch {} }
};

const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z',
  mute: 'M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  full: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  exitFull: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
  loop: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  pip: 'M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z',
  theater: 'M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z'
};
const setIcon = (btn, name) => btn.firstElementChild.firstElementChild.setAttribute('d', ICONS[name]);

const fmt = s => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};

let toastT;
function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { els.toast.hidden = true; }, 2800);
}

/* ------------------------------------------------------------------ *
 *  URL parsing
 * ------------------------------------------------------------------ */
function parseTime(s) {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return +s;
  const m = String(s).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

function parseYouTube(input) {
  input = (input || '').trim();
  if (!input) return null;
  if (/^[\w-]{11}$/.test(input)) return { id: input, list: null, start: 0 };

  let u;
  try { u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input); } catch { return null; }

  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  const list = u.searchParams.get('list');
  let id = null;

  if (host === 'youtu.be') {
    id = u.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) id = m[1];
    }
  } else {
    return null;
  }

  if (id && !/^[\w-]{11}$/.test(id)) id = null;
  if (!id && !list) return null;

  const hashT = (u.hash.match(/t=([^&]+)/) || [])[1];
  const start = parseTime(u.searchParams.get('t') || u.searchParams.get('start') || hashT);
  return { id, list: id ? null : list, start };   // a video id wins over a playlist id
}

/* ------------------------------------------------------------------ *
 *  YouTube IFrame API (loaded only when you press Play)
 * ------------------------------------------------------------------ */
let apiPromise = null;
function loadAPI() {
  if (window.YT && YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('Could not load the YouTube player. Check your connection.')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/* ------------------------------------------------------------------ *
 *  State
 * ------------------------------------------------------------------ */
const SPEEDS = [0.25, 0.5, 0.75, 0.85, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4];
let speedList = SPEEDS;      // longer in fast mode
const QL = { hd2160: '2160p', hd1440: '1440p', hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p' };
const DEFAULT_LEVELS = ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];

let player = null, ready = false, pending = null;
let state = -1, tick = null, dragging = false;
let current = null;          // parsed input
let lastVid = null;
let rate = store.get('rate', 1);
let volume = store.get('vol', 100);
let muted = store.get('muted', false);
let prefQuality = store.get('quality', 'medium');   // start low: easier on weak PCs
let loop = store.get('loop', false);

const isPlaylist = () => !!(current && !current.id && current.list);

/* ------------------------------------------------------------------ *
 *  Resume playback: remember where you stopped, per video
 * ------------------------------------------------------------------ */
const MAX_POS = 200;          // keep at most this many videos
const MIN_RESUME = 5;         // don't bother under 5 seconds
const END_MARGIN = 10;        // finished if within 10 seconds of the end
let positions = store.get('pos', {});
let saveTimer = null, lastPipSave = 0;

function writePos(id, t, dur) {
  if (!id || !isFinite(t)) return;
  t = Math.floor(t); dur = Math.floor(dur || 0);
  const finished = dur > 0 && (t >= dur - END_MARGIN || t / dur > 0.97);
  if (t < MIN_RESUME || finished) {
    if (positions[id]) { delete positions[id]; store.set('pos', positions); }
    return;
  }
  positions[id] = { t, d: dur, at: Date.now() };
  const keys = Object.keys(positions);
  if (keys.length > MAX_POS) {
    keys.sort((a, b) => positions[a].at - positions[b].at)
        .slice(0, keys.length - MAX_POS)
        .forEach(k => delete positions[k]);
  }
  store.set('pos', positions);
}

function savePos() {
  if (!ready || pipWin || !player.getVideoData) return;
  if (state !== 1 && state !== 2) return;          // only while playing or paused
  const data = player.getVideoData();
  if (!data || !data.video_id || data.isLive) return;
  writePos(data.video_id, player.getCurrentTime(), player.getDuration());
}

function startSaveTimer() { if (!saveTimer) saveTimer = setInterval(savePos, 5000); }
function stopSaveTimer() { clearInterval(saveTimer); saveTimer = null; }

function resumePoint(info) {
  if (!info.id || info.start) return 0;            // playlists and explicit ?t= links win
  const p = positions[info.id];
  return p && p.t >= MIN_RESUME ? p.t : 0;
}

/* ------------------------------------------------------------------ *
 *  Load / play a link
 * ------------------------------------------------------------------ */
async function play(raw) {
  const info = parseYouTube(raw);
  if (!info) { toast('That does not look like a YouTube link.'); return; }

  endPip(false);
  current = info;
  syncSave();
  store.set('url', raw.trim());
  syncAddressBar(info);

  els.empty.hidden = true;
  els.stage.hidden = false;
  hideMsg();
  els.prev.hidden = els.next.hidden = !isPlaylist();

  try { await loadAPI(); } catch (e) { showMsg(e.message); return; }

  savePos();                                       // keep the position of the video we are leaving
  const resumeAt = resumePoint(info);
  const startInfo = resumeAt ? Object.assign({}, info, { start: resumeAt }) : info;
  if (resumeAt) toast('Resuming from ' + fmt(resumeAt));

  if (player) {
    if (!ready) { pending = startInfo; return; }
    loadInto(startInfo);
    return;
  }

  const playerVars = {
    autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1,
    playsinline: 1, iv_load_policy: 3, enablejsapi: 1, origin: location.origin,
    start: startInfo.start
  };
  const opts = {
    host: 'https://www.youtube-nocookie.com',
    width: '100%', height: '100%', playerVars,
    events: {
      onReady,
      onStateChange: e => { if (!fastOn) onState(e); },
      onError: e => { if (!fastOn) onError(e); },
      onPlaybackQualityChange: e => { if (!fastOn) onQuality(e); }
    }
  };
  if (info.id) opts.videoId = info.id;
  else { playerVars.listType = 'playlist'; playerVars.list = info.list; }

  player = ytPlayer = new YT.Player('ytMount', opts);
}

function loadInto(info) {
  if (info.id) player.loadVideoById({ videoId: info.id, startSeconds: info.start });
  else player.loadPlaylist({ list: info.list, listType: 'playlist' });
}

function syncAddressBar(info) {
  try {
    const u = new URL(location.href);
    u.search = '';
    if (info.id) u.searchParams.set('v', info.id);
    else u.searchParams.set('list', info.list);
    if (info.start) u.searchParams.set('t', info.start);
    history.replaceState(null, '', u);
  } catch {}
}

/* ------------------------------------------------------------------ *
 *  Player events
 * ------------------------------------------------------------------ */
function onReady() {
  ready = true;
  player.setVolume(volume);
  if (muted) player.mute();
  syncVolUI();
  buildQuality(DEFAULT_LEVELS);
  if (pending) { loadInto(pending); pending = null; }
}

function onState(e) {
  state = e.data;
  const cl = els.player.classList;
  cl.toggle('playing', state === 1);
  cl.toggle('buffering', state === 3);
  setIcon(els.play, state === 1 ? 'pause' : 'play');

  if (state === 1) {
    startTick();
    startSaveTimer();
    onNewVideoIfAny();
    wake();
  } else {
    stopTick();
    updateProgress(true);
    cl.add('show-ui');
    if (state === 2) savePos();
    if (state !== 3) stopSaveTimer();              // keep the timer through buffering
  }

  if (state === 0 && player.getVideoData) {        // finished: forget it
    const d = player.getVideoData();
    if (d && d.video_id && positions[d.video_id]) { delete positions[d.video_id]; store.set('pos', positions); }
  }

  if (state === 0 && loop && current && current.id) {
    player.seekTo(0, true);
    player.playVideo();
  }
  else if (state === 0 && queue) playNext();
}

function onNewVideoIfAny() {
  const data = player.getVideoData ? player.getVideoData() : null;
  if (!data || data.video_id === lastVid) return;
  lastVid = data.video_id;
  onVideoChanged();
  applyPlaybackRate(rate);
  applyQuality();
  const levels = player.getAvailableQualityLevels && player.getAvailableQualityLevels();
  buildQuality(levels && levels.length ? levels : DEFAULT_LEVELS);
  els.title.textContent = data.title || '';
  if (data.title) document.title = data.title + ' - LiteTube';
  if (isPlaylist()) player.setLoop(loop);
}

function onQuality(e) {
  els.badge.textContent = QL[e.data] ? 'Playing at ' + QL[e.data] : '';
}

const ERR = {
  2: 'This link has an invalid video ID.',
  5: 'The player hit an error. Try again.',
  100: 'This video was not found or is private.',
  101: 'The owner of this video does not allow playback outside YouTube.',
  150: 'The owner of this video does not allow playback outside YouTube.',
  153: 'YouTube rejected the request (no referrer). Open this site over https, not from a file.'
};
function onError(e) {
  const vid = (player.getVideoData && player.getVideoData().video_id) || (current && current.id) || '';
  showMsg(ERR[e.data] || ('Playback error ' + e.data + '.'), vid);
}

function showMsg(text, vid) {
  els.msg.textContent = '';
  const p = document.createElement('div');
  p.textContent = text;
  els.msg.appendChild(p);
  if (vid) {
    const a = document.createElement('a');
    a.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(vid);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open on YouTube';
    els.msg.appendChild(a);
  }
  els.msg.hidden = false;
}
const hideMsg = () => { els.msg.hidden = true; };

/* ------------------------------------------------------------------ *
 *  Progress UI (updates only while playing and the tab is visible)
 * ------------------------------------------------------------------ */
let lastP = -1, lastB = -1, lastTxt = '';
function updateProgress(force) {
  if (!ready || !player.getDuration) return;
  const dur = player.getDuration() || 0;
  const cur = player.getCurrentTime() || 0;

  if (!dragging) {
    const p = dur ? cur / dur * 100 : 0;
    if (force || Math.abs(p - lastP) > 0.05) {
      els.seek.value = dur ? cur / dur * 1000 : 0;
      els.seek.style.setProperty('--p', p.toFixed(2) + '%');
      lastP = p;
    }
  }
  const b = (player.getVideoLoadedFraction() || 0) * 100;
  if (force || Math.abs(b - lastB) > 0.3) {
    els.seek.style.setProperty('--b', b.toFixed(1) + '%');
    lastB = b;
  }
  const shown = dragging ? els.seek.value / 1000 * dur : cur;
  const txt = fmt(shown) + ' / ' + fmt(dur);
  if (txt !== lastTxt) { els.time.textContent = txt; lastTxt = txt; }
}
function startTick() { if (!tick && !document.hidden) tick = setInterval(updateProgress, 250); }
function stopTick() { clearInterval(tick); tick = null; }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopTick(); savePos(); }
  else if (state === 1) { startTick(); updateProgress(true); }
});

window.addEventListener('pagehide', savePos);
window.addEventListener('beforeunload', savePos);

/* ------------------------------------------------------------------ *
 *  Actions
 * ------------------------------------------------------------------ */
function toggle() {
  if (!ready) return;
  (state === 1 || state === 3) ? player.pauseVideo() : player.playVideo();
}

function seekTo(sec) {
  if (!ready) return;
  const dur = player.getDuration() || 0;
  player.seekTo(Math.min(Math.max(0, sec), dur || sec), true);
  updateProgress(true);
}
const seekBy = d => ready && seekTo(player.getCurrentTime() + d);

function setVolume(v) {
  if (!ready) return;
  volume = Math.min(100, Math.max(0, Math.round(v)));
  player.setVolume(volume);
  if (volume > 0 && player.isMuted()) player.unMute();
  muted = volume === 0 ? true : false;
  if (volume === 0) player.mute();
  store.set('vol', volume);
  store.set('muted', muted);
  syncVolUI();
}
function toggleMute() {
  if (!ready) return;
  if (player.isMuted() || volume === 0) {
    if (volume === 0) volume = 50;
    player.unMute(); player.setVolume(volume); muted = false;
  } else {
    player.mute(); muted = true;
  }
  store.set('vol', volume);
  store.set('muted', muted);
  syncVolUI();
}
function syncVolUI() {
  const m = ready ? (player.isMuted() || player.getVolume() === 0) : muted;
  setIcon(els.mute, m ? 'mute' : 'vol');
  els.vol.value = m ? 0 : volume;
}

function applyPlaybackRate(speed) {
  if (!ready || !player || !player.setPlaybackRate) return;
  try { player.setPlaybackRate(speed); }
  catch { toast('This YouTube player does not accept that playback speed.'); return; }

  if (speed > 2) {
    const requested = speed;
    setTimeout(() => {
      if (!ready || !player || rate !== requested || fastOn) return;
      let actual = 0;
      try { actual = player.getPlaybackRate ? Number(player.getPlaybackRate()) : 0; } catch {}
      if (actual && actual + 0.01 < requested) {
        toast('YouTube limited this embed to ' + actual + 'x. This player does not allow ' + requested + 'x.');
        rate = actual;
        store.set('rate', rate);
        els.speed.value = String(rate);
        els.fast.classList.remove('active');
      }
    }, 900);
  }
}

function setSpeed(r) {
  r = Math.min(4, Math.max(0.25, Number(r) || 1));
  rate = r;
  store.set('rate', r);
  els.speed.value = String(r);
  if (!ready) return;
  applyPlaybackRate(r);
}
function stepSpeed(dir) {
  const i = speedList.indexOf(rate);
  const n = Math.min(speedList.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir));
  setSpeed(speedList[n]);
  toast('Speed ' + speedList[n] + 'x');
}

function buildQuality(levels) {
  const list = levels.filter(l => QL[l]);
  els.quality.textContent = '';
  const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; els.quality.appendChild(o); };
  add('auto', 'Auto');
  list.forEach(l => add(l, QL[l]));
  els.quality.value = list.includes(prefQuality) ? prefQuality : 'auto';
}
function applyQuality() {
  // Best effort: YouTube treats this as a hint and may ignore it.
  try { player.setPlaybackQuality(prefQuality === 'auto' ? 'default' : prefQuality); } catch {}
}

function toggleLoop() {
  loop = !loop;
  store.set('loop', loop);
  els.loop.classList.toggle('active', loop);
  if (ready && isPlaylist()) player.setLoop(loop);
  toast(loop ? 'Loop on' : 'Loop off');
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (els.player.requestFullscreen) els.player.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
document.addEventListener('fullscreenchange', () => {
  setIcon(els.full, document.fullscreenElement ? 'exitFull' : 'full');
});

function toggleTheater() {
  const on = document.body.classList.toggle('theater');
  els.theater.classList.toggle('active', on);
}

/* ------------------------------------------------------------------ *
 *  Auto-hide controls
 * ------------------------------------------------------------------ */
let hideT;
function wake() {
  els.player.classList.add('show-ui');
  clearTimeout(hideT);
  if (state === 1) hideT = setTimeout(() => els.player.classList.remove('show-ui'), 2500);
}
['mousemove', 'touchstart'].forEach(ev => els.player.addEventListener(ev, wake, { passive: true }));
els.player.addEventListener('mouseleave', () => { if (state === 1) els.player.classList.remove('show-ui'); });

/* ------------------------------------------------------------------ *
 *  Floating window: Document Picture-in-Picture (Chrome / Edge 116+)
 *  Fallback elsewhere: an in-page mini player
 * ------------------------------------------------------------------ */
const hasDocPip = 'documentPictureInPicture' in window;
let pipWin = null, pipFrame = null, pipTime = 0, pipPlaying = false, pipVid = null;

async function togglePip() {
  if (pipWin) { endPip(true); return; }
  if (fastOn && fastV) {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await fastV.requestPictureInPicture();
    } catch { toast('Floating window is not available here.'); }
    return;
  }
  if (!ready || !player.getVideoData) return;

  if (!hasDocPip) {
    const on = els.player.classList.toggle('mini');
    els.pip.classList.toggle('active', on);
    return;
  }

  const vid = player.getVideoData().video_id;
  if (!vid) return;

  savePos();
  pipVid = vid;
  pipTime = player.getCurrentTime() || 0;
  pipPlaying = state === 1;

  const qs = new URLSearchParams({
    id: vid, t: String(Math.floor(pipTime)), r: String(rate),
    v: String(volume), m: muted ? '1' : '0', ap: pipPlaying ? '1' : '0'
  });

  // Must be called straight from the click handler (user gesture).
  let w;
  try { w = await documentPictureInPicture.requestWindow({ width: 480, height: 270 }); }
  catch (err) { toast('Could not open the floating window: ' + err.message); return; }

  pipWin = w;
  player.pauseVideo();

  const d = w.document;
  d.documentElement.style.cssText = 'height:100%;background:#000';
  d.body.style.cssText = 'margin:0;height:100%;background:#000;overflow:hidden';

  pipFrame = d.createElement('iframe');
  pipFrame.src = new URL('pip.html?' + qs, location.href).href;
  pipFrame.allow = 'autoplay; fullscreen; picture-in-picture';
  pipFrame.setAttribute('allowfullscreen', '');
  pipFrame.style.cssText = 'border:0;width:100%;height:100%;display:block';
  d.body.appendChild(pipFrame);

  w.addEventListener('message', onPipMessage);
  w.addEventListener('pagehide', onPipHide);

  document.body.classList.add('in-pip');
  els.pip.classList.add('active');
}

function onPipMessage(e) {
  if (!pipFrame || e.source !== pipFrame.contentWindow) return;
  const d = e.data;
  if (!d || d.type !== 'lt-pip') return;
  pipTime = d.t;
  pipPlaying = d.playing;
  if (pipVid && Date.now() - lastPipSave > 5000) {
    lastPipSave = Date.now();
    writePos(pipVid, pipTime, ready && player.getDuration ? player.getDuration() : 0);
  }
  if (d.rate && d.rate !== rate) { rate = d.rate; store.set('rate', rate); els.speed.value = String(rate); }
}
const onPipHide = () => endPip(true);

function endPip(restore) {
  if (els.player.classList.contains('mini')) {
    els.player.classList.remove('mini');
    els.pip.classList.remove('active');
  }
  if (!pipWin) return;
  const w = pipWin;
  pipWin = null; pipFrame = null;
  w.removeEventListener('message', onPipMessage);
  w.removeEventListener('pagehide', onPipHide);
  try { w.close(); } catch {}
  document.body.classList.remove('in-pip');
  els.pip.classList.remove('active');

  if (pipVid) writePos(pipVid, pipTime, ready && player.getDuration ? player.getDuration() : 0);
  pipVid = null;

  if (restore && ready) {
    player.seekTo(pipTime, true);
    pipPlaying ? player.playVideo() : player.pauseVideo();
  }
}

/* ------------------------------------------------------------------ *
 *  Description and comments (only fetched when you press the button)
 *  Works with no account: public Invidious servers. A YouTube API key is optional.
 * ------------------------------------------------------------------ */
const API_KEY = '';   // optional: paste a key here, or enter it in the page (kept in this browser)
const getKey = () => API_KEY || store.get('apikey', '');

const D = { btn: $('btnDesc'), box: $('descBox'), status: $('descStatus'), body: $('descBody') };
const C = { btn: $('btnCom'), box: $('comBox'), status: $('comStatus'), head: $('comHead'),
            sort: $('comSort'), list: $('comList'), more: $('comMore') };

const API_ERR = {
  commentsDisabled: 'Comments are turned off for this video.',
  quotaExceeded: 'The daily YouTube API quota is used up. Try again tomorrow.',
  videoNotFound: 'Video not found.',
  keyInvalid: 'The API key is invalid.',
  ipRefererBlocked: 'This API key does not allow requests from this website.',
  accessNotConfigured: 'YouTube Data API v3 is not enabled for this key.',
  forbidden: 'YouTube refused this request.'
};

async function yt(path, params) {
  const qs = new URLSearchParams(Object.assign({ key: getKey() }, params));
  let res;
  try { res = await fetch('https://www.googleapis.com/youtube/v3/' + path + '?' + qs); }
  catch { throw new Error('Could not reach YouTube. Check your connection.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    const reason = (e.errors && e.errors[0] && e.errors[0].reason) || '';
    const err = new Error(API_ERR[reason] || e.message || ('YouTube API error ' + res.status));
    err.badKey = /keyInvalid|ipRefererBlocked|accessNotConfigured/.test(reason) || /API key/i.test(e.message || '');
    throw err;
  }
  return data;
}

const curVid = () => {
  const d = ready && player.getVideoData ? player.getVideoData() : null;
  return (d && d.video_id) || null;
};

function chipBtn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function keyForm(el, retry) {
  el.textContent = '';
  const p = document.createElement('p');
  p.textContent = 'Optional: paste a free YouTube Data API key for more reliable loading. It is stored only in this browser.';
  const row = document.createElement('div');
  row.className = 'key-row';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'AIza...'; inp.spellcheck = false;
  inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'YouTube API key');
  const ok = chipBtn('Save key', () => {
    const v = inp.value.trim();
    if (!v) return;
    store.set('apikey', v);
    el.textContent = '';
    retry();
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
  row.append(inp, ok);
  const help = document.createElement('a');
  help.href = 'https://developers.google.com/youtube/v3/getting-started';
  help.target = '_blank'; help.rel = 'noopener';
  help.textContent = 'How to get a key';
  el.append(p, row, help);
}

function fail(el, err, retry) {
  el.textContent = '';
  const p = document.createElement('p');
  p.textContent = err.message;
  el.appendChild(p);
  if (err.badKey) el.appendChild(chipBtn('Change API key', () => keyForm(el, retry)));
  else if (err.canKey) el.appendChild(chipBtn('Use a YouTube API key instead', () => keyForm(el, retry)));
}

const tsToSec = s => s.split(':').reduce((a, n) => a * 60 + (+n), 0);

// Plain text -> DOM, with clickable links and timestamps (no innerHTML).
function richText(text, parent) {
  const re = /(https?:\/\/[^\s<]+)|(\b\d{1,2}:\d{2}(?::\d{2})?\b)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    if (m[1]) {
      let url = m[1], tail = '';
      const t = url.match(/[.,;:!?)\]'"]+$/);
      if (t) { tail = t[0]; url = url.slice(0, -tail.length); }
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
      a.textContent = url;
      parent.append(a);
      if (tail) parent.append(tail);
    } else {
      const a = document.createElement('a');
      a.href = '#'; a.className = 'ts'; a.dataset.t = tsToSec(m[2]); a.textContent = m[2];
      parent.append(a);
    }
    last = re.lastIndex;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, v] of units) {
    if (s >= v) { const k = Math.floor(s / v); return k + ' ' + name + (k > 1 ? 's' : '') + ' ago'; }
  }
  return 'just now';
}

// Click a timestamp in a description or comment to jump there.
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a.ts');
  if (!a) return;
  e.preventDefault();
  if (!ready) return;
  seekTo(+a.dataset.t);
  if (state !== 1) player.playVideo();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- Data sources ----------
 * 1) YouTube Data API, only if you saved a key (most reliable)
 * 2) Public Invidious servers, no key needed (best effort: servers are often busy)
 * Both return the same shape, so the UI code below does not care which one ran. */
async function infoGoogle(id) {
  const r = await yt('videos', { part: 'snippet,statistics', id });
  const it = r.items && r.items[0];
  if (!it) throw new Error(API_ERR.videoNotFound);
  return {
    channel: it.snippet.channelTitle,
    views: it.statistics && it.statistics.viewCount,
    date: it.snippet.publishedAt ? new Date(it.snippet.publishedAt).getTime() : 0,
    description: it.snippet.description || ''
  };
}

async function commentsGoogle(id, sort, token) {
  const p = { part: 'snippet', videoId: id, maxResults: 20, order: sort, textFormat: 'plainText' };
  if (token) p.pageToken = token;
  const r = await yt('commentThreads', p);
  return {
    items: (r.items || []).map(t => {
      const c = t.snippet.topLevelComment.snippet;
      return { author: c.authorDisplayName, text: c.textDisplay || '', likes: c.likeCount || 0,
               age: ago(c.publishedAt), replies: t.snippet.totalReplyCount || 0 };
    }),
    next: r.nextPageToken || null
  };
}

// Prefer the current public-instance directory, but keep trusted fallbacks for
// cases where the directory itself is blocked or temporarily unavailable.
const FALLBACK_INV = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com'
];
const INV_CACHE_MS = 5 * 60 * 1000;
let invList = null, invListAt = 0, invListPromise = null, invGood = null;
let invFastGood = null;
const invFastFailed = new Map();

function fetchT(url, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
}

function normalizeInvBase(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return null; }
}

async function invInstances(forceRefresh = false) {
  if (!forceRefresh && invList && Date.now() - invListAt < INV_CACHE_MS) return invList;
  if (invListPromise) return invListPromise;

  invListPromise = (async () => {
    const discovered = [];
    try {
      const r = await fetchT('https://api.invidious.io/instances.json?sort_by=type,health', 6000);
      if (!r.ok) throw new Error('Instance directory returned HTTP ' + r.status);
      const j = await r.json();
      if (Array.isArray(j)) {
        j.forEach(entry => {
          const meta = entry && entry[1];
          if (!meta || meta.type !== 'https' || meta.api !== true || meta.cors !== true) return;
          const base = normalizeInvBase(meta.uri);
          if (base) discovered.push(base);
        });
      }
    } catch { /* The vetted fallback list still lets LiteTube attempt discovery. */ }

    invList = Array.from(new Set(discovered.concat(FALLBACK_INV.map(normalizeInvBase).filter(Boolean))));
    invListAt = Date.now();
    return invList;
  })();

  try { return await invListPromise; }
  finally { invListPromise = null; }
}

async function inv(path) {
  const list = await invInstances();
  const order = invGood ? [invGood].concat(list.filter(u => u !== invGood)) : list;
  for (const base of order.slice(0, 8)) {
    try {
      const r = await fetchT(base + '/api/v1/' + path, 7500);
      const data = await r.json().catch(() => null);
      if (r.ok && data && !data.error) { invGood = base; return data; }
      if (data && /comment/i.test(data.error || '') && /disabled/i.test(data.error || '')) {
        throw Object.assign(new Error(API_ERR.commentsDisabled), { final: true });
      }
    } catch (e) { if (e.final) throw e; }
  }
  invGood = null;
  throw Object.assign(new Error('The free public servers did not answer (they are often busy or blocked). Try again in a moment.'), { canKey: true });
}

async function infoInv(id) {
  const d = await inv('videos/' + encodeURIComponent(id) + '?fields=title,description,author,viewCount,published');
  return { channel: d.author, views: d.viewCount, date: d.published ? d.published * 1000 : 0, description: d.description || '' };
}

async function commentsInv(id, sort, token) {
  const q = '?sort_by=' + (sort === 'time' ? 'new' : 'top') + (token ? '&continuation=' + encodeURIComponent(token) : '');
  const d = await inv('comments/' + encodeURIComponent(id) + q);
  return {
    items: (d.comments || []).map(c => ({
      author: c.author, text: c.content || '', likes: c.likeCount || 0,
      age: c.published ? ago(new Date(c.published * 1000).toISOString()) : (c.publishedText || ''),
      replies: (c.replies && c.replies.replyCount) || 0
    })),
    next: d.continuation || null
  };
}

const getInfo = id => getKey() ? infoGoogle(id) : infoInv(id);
const getComments = (id, sort, tok) => getKey() ? commentsGoogle(id, sort, tok) : commentsInv(id, sort, tok);

/* ---------- Description ---------- */
const infoCache = {};
let dReq = 0;

async function loadDesc() {
  const my = ++dReq;
  const id = curVid();
  D.body.textContent = '';
  if (!id) { D.status.textContent = 'Press Play on a video first.'; return; }

  const cacheKey = (getKey() ? 'g:' : 'i:') + id;
  let it = infoCache[cacheKey];
  if (!it) {
    D.status.textContent = 'Loading description...';
    try {
      it = await getInfo(id);
      infoCache[cacheKey] = it;
    } catch (e) { if (my === dReq) fail(D.status, e, loadDesc); return; }
  }
  if (my !== dReq) return;

  D.status.textContent = '';
  const meta = document.createElement('div');
  meta.className = 'd-meta';
  meta.textContent = [
    it.channel,
    it.views ? Number(it.views).toLocaleString() + ' views' : '',
    it.date ? new Date(it.date).toLocaleDateString() : ''
  ].filter(Boolean).join(' \u00b7 ');

  const text = it.description || 'No description.';
  const box = document.createElement('div');
  box.className = 'd-text';
  richText(text, box);
  D.body.append(meta, box);

  if (text.length > 300) {
    box.classList.add('clamp');
    const more = chipBtn('Show more', () => {
      const open = box.classList.toggle('clamp');
      more.textContent = open ? 'Show more' : 'Show less';
    });
    D.body.appendChild(more);
  }
}

/* ---------- Comments ---------- */
let cTok = null, cReq = 0;

async function loadComments(reset) {
  const my = ++cReq;
  const id = curVid();
  if (reset) {
    C.list.textContent = '';
    cTok = null;
    C.more.hidden = true;
    C.head.hidden = true;
  }
  if (!id) { C.status.textContent = 'Press Play on a video first.'; return; }

  C.status.textContent = 'Loading comments...';
  C.more.disabled = true;
  try {
    const r = await getComments(id, C.sort.value, cTok);
    if (my !== cReq) return;

    const frag = document.createDocumentFragment();
    r.items.forEach(c => {
      const li = document.createElement('li');

      const head = document.createElement('div');
      head.className = 'c-head';
      const who = document.createElement('b');
      who.textContent = c.author;
      const when = document.createElement('span');
      when.textContent = c.age;
      head.append(who, when);

      const body = document.createElement('div');
      body.className = 'c-text';
      richText(c.text, body);
      li.append(head, body);

      const bits = [];
      if (c.likes) bits.push('\u2665 ' + c.likes.toLocaleString());
      if (c.replies) bits.push(c.replies + (c.replies > 1 ? ' replies' : ' reply'));
      if (bits.length) {
        const foot = document.createElement('div');
        foot.className = 'c-foot';
        foot.textContent = bits.join(' \u00b7 ');
        li.appendChild(foot);
      }
      frag.appendChild(li);
    });
    C.list.appendChild(frag);

    cTok = r.next;
    C.more.hidden = !cTok;
    C.head.hidden = false;
    C.status.textContent = C.list.children.length ? '' : 'No comments yet.';
  } catch (e) {
    if (my === cReq) fail(C.status, e, () => loadComments(true));
  } finally {
    if (my === cReq) C.more.disabled = false;
  }
}

function togglePanel(P, load) {
  const on = P.box.hidden;
  P.box.hidden = !on;
  P.btn.classList.toggle('active', on);
  P.btn.setAttribute('aria-expanded', String(on));
  if (on) load();
}
D.btn.addEventListener('click', () => togglePanel(D, loadDesc));
C.btn.addEventListener('click', () => togglePanel(C, () => loadComments(true)));
C.more.addEventListener('click', () => loadComments(false));
C.sort.addEventListener('change', () => loadComments(true));

// When the video changes, refresh only the panels you have open.
function onVideoChanged() {
  if (!D.box.hidden) loadDesc();
  if (!C.box.hidden) loadComments(true);
}

/* ------------------------------------------------------------------ *
 *  Fast mode: plays through a plain <video> from a public Invidious server,
 *  so speeds above YouTube's embed limit work. Off by default.
 * ------------------------------------------------------------------ */
const FAST_SPEEDS = SPEEDS;
const QKEY = { 2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium', 240: 'small', 144: 'tiny' };
let ytPlayer = null, fastOn = false, fastBusy = false, fastV = null;
let fastStreams = [], fastCur = null, fastMeta = { id: null, title: '' };

function buildSpeeds() {
  els.speed.textContent = '';
  speedList.forEach(sp => {
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = sp + 'x';
    els.speed.appendChild(o);
  });
  els.speed.value = String(rate);
}

function pickStream(list, pref) {
  const sorted = list.slice().sort((a, b) => a.h - b.h);
  if (pref === 'auto') return sorted[sorted.length - 1];
  const want = parseInt(QL[pref], 10) || 360;
  let best = null;
  sorted.forEach(x => { if (x.h <= want) best = x; });
  return best || sorted[0];
}

function loadSrc(v, url, timeoutMs = 7500) {
  return new Promise(resolve => {
    let done = false;
    const end = ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeEventListener('loadedmetadata', good);
      v.removeEventListener('error', bad);
      resolve(ok);
    };
    const good = () => end(true), bad = () => end(false);
    const timer = setTimeout(() => end(false), timeoutMs);
    v.addEventListener('loadedmetadata', good);
    v.addEventListener('error', bad);
    v.src = url;
    v.load();
  });
}

// Piped is an independent stream resolver. Its instance directory is dynamic,
// because public instances can become unavailable or move without notice.
const PIPED_FALLBACK = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi-libre.kavin.rocks',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.ducks.party',
  'https://piped-api.codespace.cz',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services',
  'https://pipedapi.orangenet.cc'
];
const PIPED_DIRECTORY = 'https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md';
const PIPED_CACHE_MS = 10 * 60 * 1000;
const FAST_FAIL_TTL = 3 * 60 * 1000;
let pipedList = null, pipedListAt = 0, pipedListPromise = null;
let pipedFastGood = null;
const pipedFastFailed = new Map();

function normalizeApiBase(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return null; }
}

async function pipedInstances(forceRefresh = false) {
  if (!forceRefresh && pipedList && Date.now() - pipedListAt < PIPED_CACHE_MS) return pipedList;
  if (pipedListPromise) return pipedListPromise;

  pipedListPromise = (async () => {
    const discovered = [];
    try {
      const r = await fetchT(PIPED_DIRECTORY, 5000);
      if (!r.ok) throw new Error('Piped directory returned HTTP ' + r.status);
      const markdown = await r.text();
      const matches = markdown.matchAll(/^\s*\|\s*[^|\n]+\|\s*(https:\/\/[^|\s]+)\s*\|/gim);
      for (const match of matches) {
        const base = normalizeApiBase(match[1]);
        if (base) discovered.push(base);
      }
    } catch { /* use the documented fallback candidates below */ }

    pipedList = Array.from(new Set(discovered.concat(PIPED_FALLBACK.map(normalizeApiBase).filter(Boolean))));
    pipedListAt = Date.now();
    return pipedList;
  })();

  try { return await pipedListPromise; }
  finally { pipedListPromise = null; }
}

// Load stream metadata through LiteTube's same-origin Vercel Function.
// The endpoint tries YouTube's own player data first, then public API mirrors.
async function fastOpen(id, v) {
  const apiUrl = new URL('/api/fast-stream', location.origin);
  apiUrl.searchParams.set('id', id);

  let response, payload;
  try {
    response = await fetchT(apiUrl.href, 11000);
    payload = await response.json().catch(() => null);
  } catch (e) {
    throw new Error('LiteTube stream lookup failed. Refresh the page and try again.');
  }

  if (!response.ok || !payload || !payload.ok) {
    const reason = payload && payload.error;
    const diagnostics = payload && Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
    console.error('[LiteTube] Fast stream lookup failed', {
      status: response && response.status,
      detail: payload && payload.detail,
      diagnostics
    });
    const shortDetails = diagnostics.slice(0, 3).map(d => {
      const source = [d.provider, d.host].filter(Boolean).join(' ');
      return source + ': ' + (d.reason || 'unavailable');
    }).join(' · ');
    throw new Error((reason || ('Fast-mode API returned HTTP ' + (response && response.status || 'error') + '.')) +
      (shortDetails ? ' Details: ' + shortDetails : ' Open the browser console for diagnostics.'));
  }

  const diagnostics = [];
  for (const source of (payload.candidates || []).slice(0, 5)) {
    const streams = (source.streams || []).map(s => ({
      h: Number(s.h) || 0,
      key: s.key || QKEY[Number(s.h)] || '',
      type: s.type || '',
      url: s.url || ''
    })).filter(s => s.h && s.key && s.url && /^https:\/\//i.test(s.url) &&
      (!s.type || v.canPlayType(s.type)));

    if (!streams.length) {
      diagnostics.push(source.provider + ': no browser-compatible streams');
      continue;
    }

    const picked = pickStream(streams, prefQuality);
    const lower = streams.filter(s => s.url !== picked.url && s.h < picked.h).sort((a, b) => b.h - a.h);
    const alternate = streams.filter(s => s.url !== picked.url && s.h > picked.h).sort((a, b) => a.h - b.h);
    const attempts = [picked].concat(lower, alternate).filter((s, i, all) =>
      all.findIndex(x => x.url === s.url) === i
    ).slice(0, 3);

    for (const stream of attempts) {
      if (await loadSrc(v, stream.url, 5500)) {
        if (source.provider === 'Invidious' && source.base) invGood = source.base;
        return {
          title: source.title || '',
          streams,
          cur: stream,
          provider: source.provider || 'Direct stream'
        };
      }
    }
    diagnostics.push(source.provider + ': returned URLs did not play');
  }

  console.warn('[LiteTube] Stream candidates were returned but none could play', diagnostics);
  throw new Error('Stream URLs were found, but this browser could not play them. Try a lower quality.');
}

function makeFastVideo() {
  const v = document.createElement('video');
  v.id = 'fastVideo';
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  els.player.insertBefore(v, els.shield);
  return v;
}

function fastQuality(key) {
  if (!fastOn || !fastV || key === 'default') return;
  const want = fastStreams.find(x => x.key === key);
  if (!want || want === fastCur) return;
  const v = fastV, t = v.currentTime, was = !v.paused;
  fastCur = want;
  v.addEventListener('loadedmetadata', () => {
    v.currentTime = t;
    v.playbackRate = rate;
    if (was) v.play().catch(() => {});
  }, { once: true });
  v.src = want.url;
  els.badge.textContent = 'Fast mode ' + want.h + 'p';
}

// Looks like the YouTube player to the rest of the app.
function makeAdapter(v) {
  return {
    getDuration: () => v.duration || 0,
    getCurrentTime: () => v.currentTime || 0,
    getVideoLoadedFraction: () => {
      const b = v.buffered, d = v.duration;
      return d && b.length ? b.end(b.length - 1) / d : 0;
    },
    getVideoData: () => ({ video_id: fastMeta.id, title: fastMeta.title, isLive: false }),
    seekTo: sec => { try { v.currentTime = sec; } catch {} },
    playVideo: () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); },
    pauseVideo: () => v.pause(),
    setVolume: n => { v.volume = Math.min(1, Math.max(0, n / 100)); },
    getVolume: () => Math.round(v.volume * 100),
    mute: () => { v.muted = true; },
    unMute: () => { v.muted = false; },
    isMuted: () => v.muted,
    setPlaybackRate: r => { v.playbackRate = r; },
    getPlaybackRate: () => v.playbackRate,
    setPlaybackQuality: fastQuality,
    getAvailableQualityLevels: () => fastStreams.map(x => x.key),
    setLoop: () => {},
    previousVideo: () => {},
    nextVideo: () => {},
    loadVideoById: o => fastLoadVideo(o.videoId, o.startSeconds || 0),
    loadPlaylist: o => { exitFast('none'); ytPlayer.loadPlaylist(o); }
  };
}

function fastApply(res, id) {
  fastMeta = { id, title: res.title };
  fastStreams = res.streams;
  fastCur = res.cur;
  buildQuality(fastStreams.map(x => x.key));
  els.quality.value = fastCur.key;
  els.badge.textContent = 'Fast mode ' + fastCur.h + 'p' + (res.provider ? ' · ' + res.provider : '');
  els.title.textContent = res.title;
  if (res.title) document.title = res.title + ' - LiteTube';
  lastVid = id;
}

async function enterFast() {
  if (fastOn || fastBusy) return;
  if (!ready || !ytPlayer || !ytPlayer.getVideoData) { toast('Play a video first.'); return; }
  const id = ytPlayer.getVideoData().video_id;
  if (!id) { toast('Play a video first.'); return; }

  endPip(false);
  fastBusy = true;
  els.fast.classList.add('active');
  toast('Fast mode: checking direct-stream providers...');
  const v = makeFastVideo();
  let res;
  try { res = await fastOpen(id, v); }
  catch (e) {
    v.remove();
    fastBusy = false;
    els.fast.classList.remove('active');
    toast(e.message);
    return;
  }

  // Pick up exactly where the normal player is now.
  const t = ytPlayer.getCurrentTime() || 0;
  const ps = ytPlayer.getPlayerState();
  const playing = ps === 1 || ps === 3;
  fastOn = true;
  fastBusy = false;
  fastV = v;
  ytPlayer.pauseVideo();
  player = makeAdapter(v);
  els.player.classList.add('fast');
  hideMsg();

  speedList = FAST_SPEEDS;
  buildSpeeds();
  fastApply(res, id);

  v.currentTime = t;
  v.volume = Math.min(1, Math.max(0, volume / 100));
  v.muted = muted;
  v.playbackRate = rate;
  v.addEventListener('playing', () => onState({ data: 1 }));
  v.addEventListener('pause', () => { if (!v.ended) onState({ data: 2 }); });
  v.addEventListener('waiting', () => onState({ data: 3 }));
  v.addEventListener('ended', () => onState({ data: 0 }));
  v.addEventListener('error', () => {
    if (fastV === v) showMsg('Fast mode lost the video. Press Fast to go back to the normal player.');
  });
  if (playing) v.play().catch(() => {}); else onState({ data: 2 });
  toast('Fast mode on. Speeds up to 4x.');
}

// A new video was asked for while fast mode is on.
async function fastLoadVideo(id, startAt) {
  if (!fastOn || !fastV) return;
  const v = fastV;
  fastBusy = true;
  v.pause();
  try {
    const res = await fastOpen(id, v);
    if (fastV !== v) return;
    fastApply(res, id);
    if (startAt) v.currentTime = startAt;
    v.playbackRate = rate;
    v.play().catch(() => {});
    onVideoChanged();
  } catch (e) {
    toast('Fast mode could not load this one. Using the normal player.');
    exitFast({ id, start: startAt });
  } finally {
    fastBusy = false;
  }
}

// next: undefined = hand the current video back to YouTube's player,
//       'none' = just tear down, {id,start} = load that video in YouTube's player.
function exitFast(next) {
  if (!fastOn) return;
  const v = fastV;
  const t = v.currentTime || 0;
  const playing = !v.paused && !v.ended;
  const id = fastMeta.id;
  fastOn = false;
  fastBusy = false;
  fastV = null;
  try { if (document.pictureInPictureElement === v) document.exitPictureInPicture(); } catch {}
  v.pause();
  v.removeAttribute('src');
  v.load();
  v.remove();

  player = ytPlayer;
  els.player.classList.remove('fast');
  els.fast.classList.remove('active');
  hideMsg();
  els.badge.textContent = '';

  speedList = SPEEDS;
  buildSpeeds();
  buildQuality(DEFAULT_LEVELS);
  if (next === 'none') return;

  ytPlayer.setVolume(volume);
  if (muted) ytPlayer.mute(); else ytPlayer.unMute();
  lastVid = null;                       // let the normal player re-apply speed and quality
  const o = next ? { videoId: next.id, startSeconds: next.start || 0 } : { videoId: id, startSeconds: t };
  if (next || playing) ytPlayer.loadVideoById(o); else ytPlayer.cueVideoById(o);
}

function toggleFast() {
  if (!ready || !player) { toast('Play a video first.'); return; }
  if (rate > 2) {
    setSpeed(2);
    els.fast.classList.remove('active');
    toast('Playback speed set to 2x');
  } else {
    setSpeed(3);
    els.fast.classList.add('active');
    toast('Requesting 3x playback from YouTube…');
  }
}
els.fast.addEventListener('click', toggleFast);

/* ------------------------------------------------------------------ *
 *  Wire up controls
 * ------------------------------------------------------------------ */
/* ---------- Saved links with folders (kept in this browser's localStorage) ---------- */
const tabsEl = $('tabs'), folderTools = $('folderTools'), saveSel = $('saveFolder');

let saved = store.get('saved', []);
let folders = store.get('folders', []);
let view = store.get('view', 'all');       // 'all' | 'none' | a folder id
let saveTo = store.get('saveTo', '');      // folder that new saves go into ('' = none)
let queue = null;                          // { f } while a folder plays in order

const folderOf = it => it.f || null;
const hasFolder = id => folders.some(f => f.id === id);

function normalize() {
  saved.forEach(s => { if (s.f && !hasFolder(s.f)) s.f = null; });
  if (view !== 'all' && view !== 'none' && !hasFolder(view)) view = 'all';
  if (saveTo && !hasFolder(saveTo)) saveTo = '';
}
normalize();

function currentKey() {
  if (!current) return null;
  return current.id ? current.id : 'list:' + current.list;
}

function syncSave() {
  const on = saved.some(s => s.k === currentKey());
  els.save.textContent = on ? 'Saved' : 'Save';
  els.save.classList.toggle('active', on);
}

function persistSaved() {
  store.set('saved', saved);
  renderLibrary();
  syncSave();
}
function persistFolders() {
  store.set('folders', folders);
  store.set('view', view);
  store.set('saveTo', saveTo);
  renderLibrary();
}

function toggleSave() {
  const k = currentKey();
  if (!k) { toast('Play a video first.'); return; }

  const i = saved.findIndex(s => s.k === k);
  if (i >= 0) {
    saved.splice(i, 1);
    persistSaved();
    toast('Removed from saved links');
    return;
  }

  const data = (ready && player.getVideoData) ? player.getVideoData() : {};
  const t = ready ? Math.floor(player.getCurrentTime() || 0) : 0;
  const base = data.title || (current.id ? current.id : 'Playlist');
  const item = {
    k,
    id: current.id,
    list: current.list,
    title: current.id ? base : 'Playlist: ' + base,
    t: t > 5 ? t : 0,          // remember where you were, unless it is the very start
    f: saveTo || null,
    at: Date.now()
  };
  // Folders keep the order you saved in (new ones go last); unsorted shows newest first.
  if (item.f) saved.push(item); else saved.unshift(item);
  persistSaved();
  toast(item.f ? 'Saved to ' + folders.find(f => f.id === item.f).name : 'Saved');
}

/* ----- tabs + "save into" menu ----- */
function renderTabs() {
  const counts = { none: 0 };
  folders.forEach(f => { counts[f.id] = 0; });
  saved.forEach(s => { counts[s.f || 'none']++; });

  const frag = document.createDocumentFragment();
  const add = (v, label, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip tab' + (v === view ? ' active' : '');
    b.dataset.v = v;
    b.textContent = n == null ? label : label + ' (' + n + ')';
    frag.appendChild(b);
  };
  add('all', 'All', saved.length);
  add('none', 'Unsorted', counts.none);
  folders.forEach(f => add(f.id, f.name, counts[f.id]));
  add('+', '+ New folder');
  tabsEl.textContent = '';
  tabsEl.appendChild(frag);

  saveSel.textContent = '';
  const o = (v, t) => { const e = document.createElement('option'); e.value = v; e.textContent = t; saveSel.appendChild(e); };
  o('', 'No folder');
  folders.forEach(f => o(f.id, f.name));
  saveSel.value = saveTo;
}

/* ----- the list (only the open tab is drawn, so it stays light) ----- */
function renderLibrary() {
  renderTabs();
  const items = saved.filter(s => view === 'all' || (view === 'none' ? !s.f : s.f === view));
  const ordered = view !== 'all';

  els.savedCount.textContent = saved.length ? '(' + saved.length + ')' : '';
  els.savedEmpty.textContent = saved.length
    ? 'Nothing in this tab yet.'
    : 'Nothing saved yet. Press Save under a video and it will appear here.';
  els.savedEmpty.hidden = items.length > 0;
  folderTools.hidden = !hasFolder(view);
  els.savedList.textContent = '';

  const mk = (cls, text, label) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = text;
    b.title = label; b.setAttribute('aria-label', label);
    return b;
  };

  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.dataset.k = item.k;

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'saved-play';
    play.title = 'Play';

    if (ordered) {
      const n = document.createElement('span');
      n.className = 'saved-n';
      n.textContent = i + 1;
      play.appendChild(n);
    }

    const title = document.createElement('span');
    title.className = 'saved-title';
    title.textContent = item.title;

    const meta = document.createElement('span');
    meta.className = 'saved-meta';
    const bits = [];
    if (!ordered && item.f) bits.push(folders.find(f => f.id === item.f).name);
    if (item.t) bits.push('from ' + fmt(item.t));
    meta.textContent = bits.join(' \u00b7 ');

    play.append(title, meta);
    li.appendChild(play);

    if (ordered) {
      const up = mk('saved-btn saved-up', '\u25b2', 'Move up');
      const dn = mk('saved-btn saved-down', '\u25bc', 'Move down');
      up.disabled = i === 0;
      dn.disabled = i === items.length - 1;
      li.append(up, dn);
    }
    li.append(
      mk('saved-btn saved-move', 'Move', 'Move to a folder'),
      mk('saved-btn saved-del', '\u00d7', 'Remove')
    );
    frag.appendChild(li);
  });
  els.savedList.appendChild(frag);
}

function playSaved(item, fromQueue) {
  // Prefer the position you really reached over the one stored when you saved it.
  const withT = item.id && item.t && !fromQueue && !positions[item.id];
  const url = item.id
    ? 'https://youtu.be/' + item.id + (withT ? '?t=' + item.t : '')
    : 'https://www.youtube.com/playlist?list=' + item.list;
  els.input.value = url;
  window.scrollTo(0, 0);
  play(url);
}

// When a video in a folder ends, play the next one in number order.
function playNext() {
  if (!queue) return;
  const list = saved.filter(s => folderOf(s) === queue.f);
  const i = list.findIndex(s => s.k === currentKey());
  if (i < 0) { queue = null; return; }
  if (i === list.length - 1) { queue = null; toast('End of the folder'); return; }
  toast('Next: ' + list[i + 1].title);
  playSaved(list[i + 1], true);
}

function reorder(item, dir) {
  const i = saved.indexOf(item);
  let j = i + dir;
  while (j >= 0 && j < saved.length && folderOf(saved[j]) !== folderOf(item)) j += dir;
  if (j < 0 || j >= saved.length) return;
  saved[i] = saved[j];
  saved[j] = item;
  persistSaved();
}

function moveTo(item, f) {
  item.f = f || null;
  saved.splice(saved.indexOf(item), 1);
  if (item.f) saved.push(item); else saved.unshift(item);   // same rule as saving
  persistSaved();
}

// One shared "move to folder" menu, only put in the page while it is open.
const moveSel = document.createElement('select');
moveSel.className = 'move-sel';
moveSel.setAttribute('aria-label', 'Move to folder');
function openMove(li, item) {
  moveSel.textContent = '';
  const o = (v, t) => { const e = document.createElement('option'); e.value = v; e.textContent = t; moveSel.appendChild(e); };
  o('', 'No folder');
  folders.forEach(f => o(f.id, f.name));
  moveSel.value = item.f || '';
  moveSel.dataset.k = item.k;
  li.appendChild(moveSel);
  moveSel.focus();
}
moveSel.addEventListener('change', () => {
  const item = saved.find(s => s.k === moveSel.dataset.k);
  moveSel.remove();
  if (item) moveTo(item, moveSel.value);
});
moveSel.addEventListener('blur', () => moveSel.remove());

/* ----- folder actions ----- */
function newFolder() {
  const name = (prompt('Folder name') || '').trim().slice(0, 40);
  if (!name) return;
  const f = { id: 'f' + Date.now().toString(36), name };
  folders.push(f);
  view = f.id;
  persistFolders();
}
function renameFolder() {
  const f = folders.find(x => x.id === view);
  if (!f) return;
  const name = (prompt('Folder name', f.name) || '').trim().slice(0, 40);
  if (!name) return;
  f.name = name;
  persistFolders();
}
function deleteFolder() {
  const f = folders.find(x => x.id === view);
  if (!f) return;
  if (!confirm('Delete the folder "' + f.name + '"? Its videos stay saved, under Unsorted.')) return;
  saved.forEach(s => { if (s.f === f.id) s.f = null; });
  folders = folders.filter(x => x.id !== f.id);
  if (saveTo === f.id) saveTo = '';
  view = 'none';
  store.set('saved', saved);
  persistFolders();
  syncSave();
}

els.save.addEventListener('click', toggleSave);
saveSel.addEventListener('change', () => { saveTo = saveSel.value; store.set('saveTo', saveTo); });
$('fRename').addEventListener('click', renameFolder);
$('fDelete').addEventListener('click', deleteFolder);

tabsEl.addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (!b) return;
  if (b.dataset.v === '+') { newFolder(); return; }
  view = b.dataset.v;
  store.set('view', view);
  renderLibrary();
});

els.savedList.addEventListener('click', e => {
  const li = e.target.closest('li');
  if (!li) return;
  const item = saved.find(s => s.k === li.dataset.k);
  if (!item) return;
  if (e.target.closest('.saved-del')) {
    saved = saved.filter(s => s.k !== item.k);
    persistSaved();
  } else if (e.target.closest('.saved-up')) {
    reorder(item, -1);
  } else if (e.target.closest('.saved-down')) {
    reorder(item, 1);
  } else if (e.target.closest('.saved-move')) {
    openMove(li, item);
  } else if (e.target.closest('.saved-play')) {
    queue = view !== 'all' ? { f: folderOf(item) } : null;   // inside a folder: keep going in order
    playSaved(item, false);
  }
});

// Keep other open tabs in sync
window.addEventListener('storage', e => {
  if (e.key === 'lt_saved' || e.key === 'lt_folders') {
    saved = store.get('saved', []);
    folders = store.get('folders', []);
    normalize();
    renderLibrary();
    syncSave();
  }
});

els.form.addEventListener('submit', e => { e.preventDefault(); queue = null; play(els.input.value); });
els.input.addEventListener('paste', () => setTimeout(() => { queue = null; play(els.input.value); }, 0));

els.play.addEventListener('click', toggle);
els.prev.addEventListener('click', () => ready && player.previousVideo());
els.next.addEventListener('click', () => ready && player.nextVideo());
els.mute.addEventListener('click', toggleMute);
els.vol.addEventListener('input', () => setVolume(+els.vol.value));
els.speed.addEventListener('change', () => setSpeed(+els.speed.value));
els.quality.addEventListener('change', () => {
  prefQuality = els.quality.value;
  store.set('quality', prefQuality);
  applyQuality();
  toast(prefQuality === 'auto' ? 'Quality: Auto' : 'Quality hint: ' + QL[prefQuality]);
});
els.loop.addEventListener('click', toggleLoop);
els.pip.addEventListener('click', togglePip);
els.pipBack.addEventListener('click', () => endPip(true));
els.theater.addEventListener('click', toggleTheater);
els.full.addEventListener('click', toggleFull);

// Seek bar
els.seek.addEventListener('input', () => {
  if (!ready) return;
  dragging = true;
  els.seek.style.setProperty('--p', (els.seek.value / 10) + '%');
  updateProgress();
});
els.seek.addEventListener('change', () => {
  if (!ready) return;
  const dur = player.getDuration() || 0;
  dragging = false;
  seekTo(els.seek.value / 1000 * dur);
});

// Click = play/pause, double click = fullscreen
let clickT = 0;
els.shield.addEventListener('click', () => {
  if (clickT) { clearTimeout(clickT); clickT = 0; toggleFull(); return; }
  clickT = setTimeout(() => { clickT = 0; toggle(); }, 250);
});

// Keyboard
document.addEventListener('keydown', e => {
  if (!ready || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type === 'text')) return;

  const k = e.key;
  let handled = true;
  switch (k) {
    case ' ':
      if (t.tagName === 'BUTTON') { handled = false; break; }
      toggle(); break;
    case 'k': case 'K': toggle(); break;
    case 'ArrowLeft': seekBy(-5); break;
    case 'ArrowRight': seekBy(5); break;
    case 'j': case 'J': seekBy(-10); break;
    case 'l': case 'L': seekBy(10); break;
    case 'ArrowUp': setVolume(volume + 5); break;
    case 'ArrowDown': setVolume(volume - 5); break;
    case 'm': case 'M': toggleMute(); break;
    case 'f': case 'F': toggleFull(); break;
    case 't': case 'T': toggleTheater(); break;
    case 'i': case 'I': togglePip(); break;
    case 'g': case 'G': toggleFast(); break;
    case 'r': case 'R': toggleLoop(); break;
    case 's': case 'S': toggleSave(); break;
    case '<': stepSpeed(-1); break;
    case '>': stepSpeed(1); break;
    case 'Home': seekTo(0); break;
    case 'End': seekTo((player.getDuration() || 0) - 1); break;
    default:
      if (/^[0-9]$/.test(k)) seekTo((player.getDuration() || 0) * (+k) / 10);
      else handled = false;
  }
  if (handled) { e.preventDefault(); wake(); }
});

/* ------------------------------------------------------------------ *
 *  Init
 * ------------------------------------------------------------------ */
(function init() {
  setIcon(els.play, 'play');
  setIcon(els.mute, 'vol');
  setIcon(els.full, 'full');
  setIcon(els.loop, 'loop');
  setIcon(els.pip, 'pip');
  setIcon(els.theater, 'theater');
  els.loop.classList.toggle('active', loop);
  els.vol.value = muted ? 0 : volume;
  renderLibrary();

  buildSpeeds();
  buildQuality(DEFAULT_LEVELS);

  if (location.protocol === 'file:') els.fileWarn.hidden = false;

  const q = new URLSearchParams(location.search);
  let initial = q.get('url');
  if (!initial && q.get('v')) initial = 'https://youtu.be/' + q.get('v') + (q.get('t') ? '?t=' + q.get('t') : '');
  if (!initial && q.get('list')) initial = 'https://www.youtube.com/playlist?list=' + q.get('list');

  if (initial) {
    els.input.value = initial;
    play(initial);
  } else {
    els.input.value = store.get('url', '');   // prefilled only; nothing loads until you press Play
  }
})();

})();
