import { Innertube } from 'youtubei.js';

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si'
];
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com'
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
    'x-content-type-options': 'nosniff'
  }
});

async function getJson(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalize(data) {
  if (!data || typeof data !== 'object') return null;
  const description = typeof data.description === 'string' ? data.description : '';
  const channel = data.author || data.uploader || data.author_name || '';
  const views = data.viewCount ?? data.views ?? data.view_count ?? null;
  const published = data.published ?? data.uploaded ?? data.uploadedDate ?? null;
  let date = 0;
  if (typeof published === 'number') date = published < 1e12 ? published * 1000 : published;
  else if (published) date = Date.parse(published) || 0;
  if (!description.trim() && !channel && !views && !date) return null;
  return { channel, views, date, description, hasDescription: !!description.trim() };
}

async function fromYouTube(id) {
  const yt = await Innertube.create({ generate_session_locally: true });
  const info = await yt.getBasicInfo(id);
  const basic = info.basic_info || {};
  return normalize({
    description: basic.short_description || basic.description || '',
    author: basic.author || basic.owner?.name || '',
    view_count: basic.view_count,
    published: basic.start_timestamp
  });
}

async function fromPiped(base, id) {
  const data = await getJson(base + '/streams/' + encodeURIComponent(id));
  return normalize(data);
}

async function fromInvidious(base, id) {
  const data = await getJson(base + '/api/v1/videos/' + encodeURIComponent(id));
  return normalize(data);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return json({ ok: false, error: 'GET requests only.' }, 405);
    const id = (url.searchParams.get('id') || '').trim();
    if (!/^[\\w-]{11}$/.test(id)) return json({ ok: false, error: 'A valid 11-character YouTube video ID is required.' }, 400);

    const tasks = [
      fromYouTube(id).catch(() => null),
      ...PIPED.map(base => fromPiped(base, id).catch(() => null)),
      ...INVIDIOUS.map(base => fromInvidious(base, id).catch(() => null))
    ];
    const results = await Promise.all(tasks);
    const best = results.find(x => x && x.hasDescription) || results.find(Boolean);
    if (!best) return json({ ok: false, error: 'Could not retrieve video details from YouTube or the public metadata mirrors.' }, 503);
    return json({ ok: true, info: best });
  }
};
