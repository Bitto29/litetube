import { Innertube } from 'youtubei.js';

const PIPED_FALLBACK = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi-libre.kavin.rocks',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.ducks.party',
  'https://piped-api.codespace.cz',
  'https://pipedapi.orangenet.cc'
];

const INVIDIOUS_FALLBACK = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.tiekoetter.com'
];

const QKEY = {
  2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720',
  480: 'large', 360: 'medium', 240: 'small', 144: 'tiny'
};

let innertubePromise = null;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function normalizeBase(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch {
    return null;
  }
}

async function fetchText(url, timeoutMs = 1800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'text/plain, text/markdown;q=0.9, */*;q=0.5' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 2600) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function waitFor(ms) {
  return new Promise(resolve => setTimeout(() => resolve(null), ms));
}

function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({ generate_session_locally: true })
      .catch(error => {
        innertubePromise = null;
        throw error;
      });
  }
  return innertubePromise;
}

function heightFromFormat(format) {
  return Number(format.height) ||
    parseInt(format.quality_label || format.qualityLabel || format.quality || '', 10) || 0;
}

async function queryYouTubeDirect(id) {
  const diagnostics = [];
  let yt;
  try {
    yt = await getInnertube();
  } catch (error) {
    return {
      streams: [],
      reason: 'youtubei.js initialization failed: ' + String(error && error.message || error).slice(0, 90)
    };
  }

  const clients = [undefined, 'TV', 'ANDROID'];
  for (const client of clients) {
    try {
      const options = client ? { client } : undefined;
      const info = await yt.getBasicInfo(id, options);
      const playback = info.playability_status || {};
      const status = playback.status || 'unknown';
      const sourceFormats = info.streaming_data
        ? (info.streaming_data.formats || []).concat(info.streaming_data.adaptive_formats || [])
        : [];
      const streams = [];

      for (const format of sourceFormats) {
        const mime = String(format.mime_type || format.mimeType || '');
        if (!/^video\//i.test(mime)) continue;
        if (format.has_video === false || format.has_audio === false || format.video_only === true) continue;

        const h = heightFromFormat(format);
        const key = QKEY[h];
        if (!h || !key) continue;

        let url = '';
        try {
          url = await format.decipher(yt.session.player);
        } catch {
          url = format.url || '';
        }
        if (!url && format.url) url = format.url;
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:') continue;
          url = parsed.href;
        } catch { continue; }

        streams.push({ h, key, type: mime, url });
      }

      const unique = Array.from(new Map(streams.map(stream => [stream.h + ':' + stream.url, stream])).values())
        .sort((a, b) => b.h - a.h)
        .slice(0, 8);

      if (unique.length) {
        return {
          provider: 'YouTube',
          title: info.basic_info && info.basic_info.title || '',
          streams: unique
        };
      }

      const reason = status !== 'OK'
        ? 'YouTube player status: ' + status + (playback.reason ? ' (' + String(playback.reason).slice(0, 80) + ')' : '')
        : 'YouTube returned no progressive audio+video formats';
      diagnostics.push({ provider: 'YouTube' + (client ? '/' + client : '/default'), host: 'youtube.com', reason });
    } catch (error) {
      diagnostics.push({
        provider: 'YouTube' + (client ? '/' + client : '/default'),
        host: 'youtube.com',
        reason: String(error && error.message || error).slice(0, 100)
      });
    }
  }

  return { streams: [], diagnostics, reason: diagnostics.length ? diagnostics[0].reason : 'YouTube extraction returned no usable streams' };
}

async function getPipedBases() {
  let discovered = [];
  try {
    const md = await fetchText(
      'https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md',
      1800
    );
    for (const line of md.split(/\r?\n/)) {
      const match = line.match(/\|\s*(https:\/\/[^|\s]+)\s*\|/i);
      if (!match) continue;
      const base = normalizeBase(match[1]);
      if (base) discovered.push(base);
    }
  } catch { /* use fallback candidates */ }
  return Array.from(new Set(discovered.concat(PIPED_FALLBACK.map(normalizeBase).filter(Boolean)))).slice(0, 8);
}

async function getInvidiousBases() {
  let discovered = [];
  try {
    const list = await fetchJson('https://api.invidious.io/instances.json?sort_by=type,health', 1800);
    if (Array.isArray(list)) {
      discovered = list.map(entry => {
        const meta = entry && entry[1];
        return meta && meta.type === 'https' && meta.api === true ? normalizeBase(meta.uri) : null;
      }).filter(Boolean);
    }
  } catch { /* use fallback candidates */ }
  return Array.from(new Set(discovered.concat(INVIDIOUS_FALLBACK.map(normalizeBase).filter(Boolean)))).slice(0, 8);
}

function pipedStreams(data, base) {
  if (!Array.isArray(data.videoStreams)) return [];
  return data.videoStreams.map(s => {
    const h = parseInt(s.quality, 10) || parseInt(s.height, 10) || parseInt(s.qualityLabel, 10) || 0;
    let url = '';
    try { url = new URL(s.url || '', base).href; } catch {}
    const key = QKEY[h];
    return { h, key, type: s.mimeType || '', url, videoOnly: s.videoOnly === true };
  }).filter(s => s.h && s.key && s.url.startsWith('https://') && !s.videoOnly);
}

function invStreams(data, base) {
  if (!Array.isArray(data.formatStreams)) return [];
  return data.formatStreams.map(s => {
    const h = parseInt(s.qualityLabel, 10) || parseInt(s.resolution, 10) || 0;
    let url = '';
    try { url = new URL(s.url || '', base).href; } catch {}
    return { h, key: QKEY[h], type: s.type || '', url };
  }).filter(s => s.h && s.key && s.url.startsWith('https://'));
}

async function queryPiped(base, id) {
  try {
    const data = await fetchJson(base + '/streams/' + encodeURIComponent(id), 2300);
    const streams = pipedStreams(data, base);
    if (!streams.length) return { provider: 'Piped', host: new URL(base).hostname, reason: 'no muxed streams' };
    streams.sort((a, b) => b.h - a.h);
    return { provider: 'Piped', base, title: data.title || '', streams: streams.slice(0, 8) };
  } catch (error) {
    return {
      provider: 'Piped',
      host: new URL(base).hostname,
      reason: error && error.name === 'AbortError' ? 'timeout' : String(error && error.message || 'request failed').slice(0, 80)
    };
  }
}

async function queryInvidious(base, id) {
  try {
    const data = await fetchJson(base + '/api/v1/videos/' + encodeURIComponent(id) + '?local=true', 2300);
    const streams = invStreams(data, base);
    if (!streams.length) return { provider: 'Invidious', host: new URL(base).hostname, reason: 'no muxed streams' };
    streams.sort((a, b) => b.h - a.h);
    return { provider: 'Invidious', base, title: data.title || '', streams: streams.slice(0, 8) };
  } catch (error) {
    return {
      provider: 'Invidious',
      host: new URL(base).hostname,
      reason: error && error.name === 'AbortError' ? 'timeout' : String(error && error.message || 'request failed').slice(0, 80)
    };
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return json({ ok: false, error: 'GET requests only.' }, 405);

    const id = (url.searchParams.get('id') || '').trim();
    if (!/^[\w-]{11}$/.test(id)) {
      return json({ ok: false, error: 'A valid 11-character YouTube video ID is required.' }, 400);
    }

    const directPromise = queryYouTubeDirect(id);
    const direct = await Promise.race([directPromise, waitFor(4800)]);
    const youtubeDiagnostics = direct && direct.diagnostics
      ? direct.diagnostics
      : direct && direct.reason
        ? [{ provider: 'YouTube', host: 'youtube.com', reason: direct.reason }]
        : [];

    if (direct && direct.streams && direct.streams.length) {
      return json({ ok: true, candidates: [direct], diagnostics: [] });
    }

    try {
      const [pipedBases, invidiousBases] = await Promise.all([getPipedBases(), getInvidiousBases()]);
      const checks = await Promise.all([
        ...pipedBases.map(base => queryPiped(base, id)),
        ...invidiousBases.map(base => queryInvidious(base, id))
      ]);

      const piped = checks.filter(x => x.provider === 'Piped' && Array.isArray(x.streams)).slice(0, 2);
      const invidious = checks.filter(x => x.provider === 'Invidious' && Array.isArray(x.streams)).slice(0, 2);
      const candidates = [];
      for (let i = 0; i < Math.max(piped.length, invidious.length); i++) {
        if (piped[i]) candidates.push(piped[i]);
        if (invidious[i]) candidates.push(invidious[i]);
      }

      const diagnostics = youtubeDiagnostics.concat(
        checks.filter(x => !Array.isArray(x.streams))
          .map(x => ({ provider: x.provider, host: x.host, reason: x.reason }))
      ).slice(0, 18);

      if (!candidates.length) {
        console.error('[LiteTube Fast API] No source returned usable streams', diagnostics);
        return json({
          ok: false,
          error: 'No playable stream data was returned by YouTube or the public provider mirrors.',
          diagnostics
        }, 503);
      }

      return json({ ok: true, candidates, diagnostics });
    } catch (error) {
      return json({
        ok: false,
        error: 'The server-side stream lookup failed. Please retry shortly.',
        detail: String(error && error.message || 'unknown error').slice(0, 120),
        diagnostics: youtubeDiagnostics
      }, 502);
    }
  }
};
