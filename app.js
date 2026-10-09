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
  save: $('btnSave'), savedList: $('savedList'), savedEmpty: $('savedEmpty'), savedCount: $('savedCount')
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
const SPEEDS = [0.25, 0.5, 0.75, 0.85, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
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
    events: { onReady, onStateChange: onState, onError, onPlaybackQualityChange: onQuality }
  };
  if (info.id) opts.videoId = info.id;
  else { playerVars.listType = 'playlist'; playerVars.list = info.list; }

  player = new YT.Player('ytMount', opts);
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
}

function onNewVideoIfAny() {
  const data = player.getVideoData ? player.getVideoData() : null;
  if (!data || data.video_id === lastVid) return;
  lastVid = data.video_id;
  player.setPlaybackRate(rate);
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

function setSpeed(r) {
  rate = r;
  store.set('rate', r);
  els.speed.value = String(r);
  if (!ready) return;
  player.setPlaybackRate(r);
  // YouTube may clamp embedded playback (usually to 2x). Check what it really applied.
  setTimeout(() => {
    if (!ready || rate !== r) return;
    const got = player.getPlaybackRate();
    if (got && got !== r) {
      rate = got;
      store.set('rate', got);
      els.speed.value = String(got);
      toast('YouTube limits embedded video to ' + got + 'x');
    }
  }, 500);
}
function stepSpeed(dir) {
  const i = SPEEDS.indexOf(rate);
  const n = Math.min(SPEEDS.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir));
  setSpeed(SPEEDS[n]);
  toast('Speed ' + SPEEDS[n] + 'x');
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
 *  Wire up controls
 * ------------------------------------------------------------------ */
/* ---------- Saved links (kept in this browser's localStorage) ---------- */
let saved = store.get('saved', []);

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
  saved.unshift({
    k,
    id: current.id,
    list: current.list,
    title: current.id ? base : 'Playlist: ' + base,
    t: t > 5 ? t : 0,          // remember where you were, unless it is the very start
    at: Date.now()
  });
  persistSaved();
  toast('Saved');
}

function renderLibrary() {
  els.savedList.textContent = '';
  els.savedCount.textContent = saved.length ? '(' + saved.length + ')' : '';
  els.savedEmpty.hidden = saved.length > 0;

  const frag = document.createDocumentFragment();
  saved.forEach(item => {
    const li = document.createElement('li');
    li.dataset.k = item.k;

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'saved-play';
    play.title = 'Play';

    const title = document.createElement('span');
    title.className = 'saved-title';
    title.textContent = item.title;

    const meta = document.createElement('span');
    meta.className = 'saved-meta';
    meta.textContent = item.t ? 'from ' + fmt(item.t) : '';

    play.append(title, meta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'saved-del';
    del.title = 'Remove';
    del.setAttribute('aria-label', 'Remove ' + item.title);
    del.textContent = '\u00d7';

    li.append(play, del);
    frag.appendChild(li);
  });
  els.savedList.appendChild(frag);
}

function playSaved(item) {
  const url = item.id
    ? 'https://youtu.be/' + item.id + (item.t ? '?t=' + item.t : '')
    : 'https://www.youtube.com/playlist?list=' + item.list;
  els.input.value = url;
  window.scrollTo(0, 0);
  play(url);
}

els.save.addEventListener('click', toggleSave);
els.savedList.addEventListener('click', e => {
  const li = e.target.closest('li');
  if (!li) return;
  const item = saved.find(s => s.k === li.dataset.k);
  if (!item) return;
  if (e.target.closest('.saved-del')) {
    saved = saved.filter(s => s.k !== item.k);
    persistSaved();
  } else if (e.target.closest('.saved-play')) {
    playSaved(item);
  }
});
// Keep other open tabs in sync
window.addEventListener('storage', e => {
  if (e.key === 'lt_saved') { saved = store.get('saved', []); renderLibrary(); syncSave(); }
});

els.form.addEventListener('submit', e => { e.preventDefault(); play(els.input.value); });
els.input.addEventListener('paste', () => setTimeout(() => play(els.input.value), 0));

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

  SPEEDS.forEach(s => {
    const o = document.createElement('option');
    o.value = String(s);
    o.textContent = s + 'x';
    els.speed.appendChild(o);
  });
  els.speed.value = String(rate);
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
