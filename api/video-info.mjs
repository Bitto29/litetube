import { Innertube } from 'youtubei.js';

/*
 * Description lookup for LiteTube.
 *
 * BEST FIX: set an environment variable YOUTUBE_API_KEY in Vercel
 * (Project -> Settings -> Environment Variables) and redeploy.
 * With a key, the official YouTube Data API answers in ~300 ms and never gets
 * blocked. Without a key, the code below falls back to scraping/mirrors,
 * which YouTube and the public servers block very often from server IPs.
 */

const FALLBACK_PIPED = [
  'https://pipedapi.kavin.rocks','https://pipedapi.leptons.xyz','https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de','https://api.piped.yt','https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee','https://pipedapi.drgns.space','https://pipedapi.owo.si'
];
const FALLBACK_INV = [
  'https://inv.nadeko.net','https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com','https://invidious.tiekoetter.com'
];
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const json = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});

async function fetchText(url, timeout=3800, headers={}, init={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const {headers:initHeaders,...rest}=init;
    const response=await fetch(url,{signal:controller.signal,...rest,headers:{'user-agent':BROWSER_UA,'accept':'text/html,application/json;q=0.9,*/*;q=0.8',...headers,...(initHeaders||{})}});
    if(!response.ok) throw new Error('HTTP '+response.status);
    return await response.text();
  } finally { clearTimeout(timer); }
}
async function fetchJson(url, timeout=5000, init={}) {
  const raw=await fetchText(url,timeout,{accept:'application/json'},init);
  return JSON.parse(raw);
}
function decodeJsonString(value) {
  try { return JSON.parse('"'+value+'"'); } catch { return value; }
}
const GENERIC = /^enjoy the videos and music you love,? upload original content,? and share it all with friends, family, and the world on youtube\.?$/i;

function normalize(data) {
  if(!data || typeof data!=='object') return null;
  const rawDescription=typeof data.description==='string'?data.description:'';
  const description=GENERIC.test(rawDescription.trim()) ? '' : rawDescription;
  const channel=data.author||data.uploader||data.author_name||'';
  const views=data.viewCount??data.views??data.view_count??null;
  const published=data.published??data.uploaded??data.uploadedDate??data.publishedAt??null;
  let date=0;
  if(typeof published==='number') date=published<1e12?published*1000:published;
  else if(published) date=Date.parse(published)||0;
  if(!description.trim()&&!channel&&!views&&!date) return null;
  return {channel,views,date,description,hasDescription:!!description.trim()};
}

/* 1) Official YouTube Data API (needs YOUTUBE_API_KEY env var) */
async function fromDataApi(id, key) {
  const u=new URL('https://www.googleapis.com/youtube/v3/videos');
  u.searchParams.set('part','snippet,statistics');
  u.searchParams.set('id',id);
  u.searchParams.set('key',key);
  const data=await fetchJson(u.href,5000);
  const item=data.items&&data.items[0];
  if(!item) throw new Error('video not found');
  return normalize({
    description:item.snippet.description||'',
    author:item.snippet.channelTitle,
    view_count:item.statistics&&item.statistics.viewCount?Number(item.statistics.viewCount):null,
    published:item.snippet.publishedAt
  });
}

/* 2) YouTube watch page (consent cookie added so EU/consent pages do not hide the data) */
async function fromYouTubePage(id) {
  const html=await fetchText('https://www.youtube.com/watch?v='+encodeURIComponent(id)+'&hl=en',4500,{
    cookie:'CONSENT=YES+cb; SOCS=CAI',
    'accept-language':'en-US,en;q=0.9'
  });
  const match=html.match(/"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/);
  let description=match?decodeJsonString(match[1]):'';
  if(!description) {
    const meta=html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    if(meta) description=meta[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  }
  const author=(html.match(/"author"\s*:\s*"((?:\\.|[^"\\])*)"/)||[])[1];
  const views=(html.match(/"viewCount"\s*:\s*"?(\d+)/)||[])[1];
  return normalize({description,author:author?decodeJsonString(author):'',view_count:views?Number(views):null});
}

/* 3) Direct InnerTube call as the Android app (works from some server IPs) */
async function fromInnerTubeAndroid(id) {
  const data=await fetchJson('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',4500,{
    method:'POST',
    headers:{'content-type':'application/json','user-agent':'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'},
    body:JSON.stringify({
      videoId:id,
      context:{client:{clientName:'ANDROID',clientVersion:'19.09.37',androidSdkVersion:30,hl:'en',gl:'US'}}
    })
  });
  const d=data.videoDetails||{};
  return normalize({description:d.shortDescription||'',author:d.author||'',view_count:d.viewCount?Number(d.viewCount):null});
}

/* 4) youtubei.js library */
async function fromYouTubei(id) {
  const work=(async()=>{const yt=await Innertube.create({generate_session_locally:true});return await yt.getBasicInfo(id);})();
  const info=await Promise.race([work,new Promise((_,reject)=>setTimeout(()=>reject(new Error('YouTube player metadata timed out')),4500))]);
  const b=info.basic_info||{};
  return normalize({description:b.short_description||b.description||'',author:b.author||b.owner?.name||'',view_count:b.view_count,published:b.start_timestamp});
}

/* 5) Public mirrors (often dead or busy) */
async function fromPiped(base,id) {
  return normalize(await fetchJson(base.replace(/\/$/,'')+'/streams/'+encodeURIComponent(id)));
}
async function fromInvidious(base,id) {
  return normalize(await fetchJson(base.replace(/\/$/,'')+'/api/v1/videos/'+encodeURIComponent(id)));
}
async function discoverInstances() {
  const [inv,piped]=await Promise.allSettled([
    fetchJson('https://api.invidious.io/instances.json?sort_by=health',1800),
    fetchJson('https://piped-instances.kavin.rocks/',1800)
  ]);
  const invList=[];
  if(inv.status==='fulfilled'&&Array.isArray(inv.value)) {
    for(const entry of inv.value) {
      const meta=entry&&entry[1];
      if(meta&&meta.type==='https'&&meta.api===true) {
        try { const u=new URL(meta.uri); if(u.protocol==='https:') invList.push(u.origin); } catch {}
      }
    }
  }
  const pipedList=[];
  if(piped.status==='fulfilled'&&Array.isArray(piped.value)) {
    for(const item of piped.value) {
      const raw=typeof item==='string'?item:(item&& (item.api_url||item.apiUrl||item.url));
      if(!raw) continue;
      try { const u=new URL(raw); if(u.protocol==='https:') pipedList.push(u.origin); } catch {}
    }
  }
  return {
    inv:[...new Set([...invList,...FALLBACK_INV])].slice(0,8),
    piped:[...new Set([...pipedList,...FALLBACK_PIPED])].slice(0,8)
  };
}

/* Resolve with the FIRST task that returns a description; collect errors from the rest. */
function firstWithDescription(tasks, errors) {
  return new Promise((resolve)=>{
    let pending=tasks.length;
    if(!pending) return resolve(null);
    tasks.forEach(async ([name,fn])=>{
      try {
        const info=await fn();
        if(info&&info.hasDescription) return resolve({name,info});
        errors.push(name+': no description in response');
      } catch(error) {
        errors.push(name+': '+String(error&&error.message||error).slice(0,120));
      }
      if(--pending===0) resolve(null);
    });
  });
}

export default {
  async fetch(request) {
    const url=new URL(request.url);
    if(request.method!=='GET') return json({ok:false,error:'GET requests only.'},405);
    const id=(url.searchParams.get('id')||'').trim();
    if(!/^[A-Za-z0-9_-]{11}$/.test(id)) return json({ok:false,error:'A valid 11-character YouTube video ID is required.'},400);

    const errors=[];
    const apiKey=(typeof process!=='undefined'&&process.env&&process.env.YOUTUBE_API_KEY||'').trim();

    // Official API first: fast and reliable.
    if(apiKey) {
      try {
        const info=await fromDataApi(id,apiKey);
        if(info&&info.hasDescription) return json({ok:true,source:'YouTube Data API',info,checked:1});
        errors.push('YouTube Data API: no description in response');
      } catch(error) { errors.push('YouTube Data API: '+String(error&&error.message||error).slice(0,120)); }
    } else {
      errors.push('YOUTUBE_API_KEY is not set on the server');
    }

    // Fallbacks, all in parallel; first good answer wins.
    const tasks=[
      ['YouTube page',()=>fromYouTubePage(id)],
      ['YouTube Android API',()=>fromInnerTubeAndroid(id)],
      ['YouTube player',()=>fromYouTubei(id)]
    ];
    const instances=await discoverInstances();
    instances.inv.forEach((base)=>tasks.push(['Invidious '+new URL(base).hostname,()=>fromInvidious(base,id)]));
    instances.piped.forEach((base)=>tasks.push(['Piped '+new URL(base).hostname,()=>fromPiped(base,id)]));

    const hardStop=new Promise((resolve)=>setTimeout(()=>resolve('timeout'),8000));
    const best=await Promise.race([firstWithDescription(tasks,errors),hardStop]);
    if(!best||best==='timeout') return json({ok:false,error:'No provider returned a video description. '+errors.slice(0,8).join(' | '),checked:tasks.length},503);
    return json({ok:true,source:best.name,info:best.info,checked:tasks.length});
  }
};
