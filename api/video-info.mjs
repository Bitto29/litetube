import { Innertube } from 'youtubei.js';

const FALLBACK_PIPED = [
  'https://pipedapi.kavin.rocks','https://pipedapi.leptons.xyz','https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de','https://api.piped.yt','https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee','https://pipedapi.drgns.space','https://pipedapi.owo.si'
];
const FALLBACK_INV = [
  'https://inv.nadeko.net','https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com','https://invidious.tiekoetter.com'
];
const json = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});

async function fetchText(url, timeout=3800, headers={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; LiteTube/1.0)','accept':'text/html,application/json;q=0.9,*/*;q=0.8',...headers}});
    if(!response.ok) throw new Error('HTTP '+response.status);
    return await response.text();
  } finally { clearTimeout(timer); }
}
async function fetchJson(url, timeout=5000) {
  const raw=await fetchText(url,timeout,{accept:'application/json'});
  return JSON.parse(raw);
}
function decodeJsonString(value) {
  try { return JSON.parse('"'+value+'"'); } catch { return value; }
}
function normalize(data) {
  if(!data || typeof data!=='object') return null;
  const rawDescription=typeof data.description==='string'?data.description:'';
  const description=/^enjoy the videos and music you love,? upload original content,? and share it all with friends, family, and the world on youtube\.?$/i.test(rawDescription.trim()) ? '' : rawDescription;
  const channel=data.author||data.uploader||data.author_name||'';
  const views=data.viewCount??data.views??data.view_count??null;
  const published=data.published??data.uploaded??data.uploadedDate??data.publishedAt??null;
  let date=0;
  if(typeof published==='number') date=published<1e12?published*1000:published;
  else if(published) date=Date.parse(published)||0;
  if(!description.trim()&&!channel&&!views&&!date) return null;
  return {channel,views,date,description,hasDescription:!!description.trim()};
}
async function fromYouTubePage(id) {
  const html=await fetchText('https://www.youtube.com/watch?v='+encodeURIComponent(id)+'&hl=en',4500);
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
async function fromYouTubei(id) {
  const work=(async()=>{const yt=await Innertube.create({generate_session_locally:true});return await yt.getBasicInfo(id);})();
  const info=await Promise.race([work,new Promise((_,reject)=>setTimeout(()=>reject(new Error('YouTube player metadata timed out')),4500))]);
  const b=info.basic_info||{};
  return normalize({description:b.short_description||b.description||'',author:b.author||b.owner?.name||'',view_count:b.view_count,published:b.start_timestamp});
}
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

export default {
  async fetch(request) {
    const url=new URL(request.url);
    if(request.method!=='GET') return json({ok:false,error:'GET requests only.'},405);
    const id=(url.searchParams.get('id')||'').trim();
    if(!/^[A-Za-z0-9_-]{11}$/.test(id)) return json({ok:false,error:'A valid 11-character YouTube video ID is required.'},400);

    const sources=[];
    const tasks=[
      ['YouTube page',()=>fromYouTubePage(id)],
      ['YouTube player',()=>fromYouTubei(id)]
    ];
    const instances=await discoverInstances();
    instances.inv.forEach((base)=>tasks.push(['Invidious '+new URL(base).hostname,()=>fromInvidious(base,id)]));
    instances.piped.forEach((base)=>tasks.push(['Piped '+new URL(base).hostname,()=>fromPiped(base,id)]));
    const settled=await Promise.all(tasks.map(async ([name,fn])=>{
      try { const info=await fn(); if(info&&info.hasDescription) return {name,info}; sources.push(name+': no description in response'); return null; }
      catch(error) { sources.push(name+': '+String(error&&error.message||error).slice(0,120)); return null; }
    }));
    const best=settled.find(Boolean);
    if(!best) return json({ok:false,error:'No provider returned a video description. '+sources.slice(0,8).join(' | '),checked:tasks.length},503);
    return json({ok:true,source:best.name,info:best.info,checked:tasks.length});
  }
};
