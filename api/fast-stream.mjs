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

async function fetchText(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'text/plain, text/markdown;q=0.9, */*;q=0.5', 'user-agent': 'LiteTube-FastMode/1.0' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 3800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'LiteTube-FastMode/1.0' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getPipedBases() {
  let discovered = [];
  try {
    // This is the official, maintained Piped public-instance table.
    const md = await fetchText(
      'https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md',
      2500
    );
    for (const line of md.split(/\r?\n/)) {
      const match = line.match(/\|\s*(https:\/\/[^|\s]+)\s*\|/i);
      if (!match) continue;
      const base = normalizeBase(match[1]);
      if (base) discovered.push(base);
    }
  } catch { /* fallback URLs below */ }
  return Array.from(new Set(discovered.concat(PIPED_FALLBACK.map(normalizeBase).filter(Boolean)))).slice(0, 12);
}

async function getInvidiousBases() {
  let discovered = [];
  try {
    const list = await fetchJson('https://api.invidious.io/instances.json?sort_by=type,health', 2500);
    if (Array.isArray(list)) {
      discovered = list.map(entry => {
        const meta = entry && entry[1];
        return meta && meta.type === 'https' && meta.api === true ? normalizeBase(meta.uri) : null;
      }).filter(Boolean);
    }
  } catch { /* fallback URLs below */ }
  return Array.from(new Set(discovered.concat(INVIDIOUS_FALLBACK.map(normalizeBase).filter(Boolean)))).slice(0, 12);
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
    const data = await fetchJson(base + '/streams/' + encodeURIComponent(id), 3800);
    const streams = pipedStreams(data, base);
    if (!streams.length) return { provider: 'Piped', host: new URL(base).hostname, reason: 'no muxed streams' };
    streams.sort((a, b) => b.h - a.h);
    return { provider: 'Piped', base, title: data.title || '', streams: streams.slice(0, 8) };
  } catch (e) {
    return {
      provider: 'Piped',
      host: new URL(base).hostname,
      reason: e && e.name === 'AbortError' ? 'timeout' : String(e && e.message || 'request failed').slice(0, 80)
    };
  }
}

async function queryInvidious(base, id) {
  try {
    const data = await fetchJson(base + '/api/v1/videos/' + encodeURIComponent(id) + '?local=true', 3800);
    const streams = invStreams(data, base);
    if (!streams.length) return { provider: 'Invidious', host: new URL(base).hostname, reason: 'no muxed streams' };
    streams.sort((a, b) => b.h - a.h);
    return { provider: 'Invidious', base, title: data.title || '', streams: streams.slice(0, 8) };
  } catch (e) {
    return {
      provider: 'Invidious',
      host: new URL(base).hostname,
      reason: e && e.name === 'AbortError' ? 'timeout' : String(e && e.message || 'request failed').slice(0, 80)
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

      const diagnostics = checks.filter(x => !Array.isArray(x.streams))
        .map(x => ({ provider: x.provider, host: x.host, reason: x.reason }))
        .slice(0, 12);

      if (!candidates.length) {
        return json({
          ok: false,
          error: 'LiteTube could not retrieve stream data from the public providers. Their servers may be down or blocking Vercel.',
          diagnostics
        }, 503);
      }

      return json({ ok: true, candidates, diagnostics });
    } catch (e) {
      return json({
        ok: false,
        error: 'The server-side stream lookup failed. Please retry shortly.',
        detail: String(e && e.message || 'unknown error').slice(0, 120)
      }, 502);
    }
  }
};
