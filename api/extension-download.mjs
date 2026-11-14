const ROOT='https://raw.githubusercontent.com/Bitto29/litetube/main/extension/';
const FILES=['manifest.json','content.js','service-worker.js','README.md'];
const encoder=new TextEncoder();
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){
    crc^=byte;
    for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function u16(v){return new Uint8Array([v&255,(v>>>8)&255]);}
function u32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]);}
function join(parts){
  const size=parts.reduce((n,p)=>n+p.length,0), out=new Uint8Array(size);
  let at=0; for(const p of parts){out.set(p,at);at+=p.length;} return out;
}
function zip(files){
  const local=[],central=[]; let offset=0;
  const time=0,date=((2026-1980)<<9)|(11<<5)|14;
  for(const file of files){
    const name=encoder.encode(file.name), data=file.data, crc=crc32(data);
    const lh=join([u32(0x04034b50),u16(20),u16(0),u16(0),u16(time),u16(date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name]);
    local.push(lh,data);
    const ch=join([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(time),u16(date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    central.push(ch); offset+=lh.length+data.length;
  }
  const centralBytes=join(central), localBytes=join(local);
  const end=join([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBytes.length),u32(localBytes.length),u16(0)]);
  return join([localBytes,centralBytes,end]);
}
export default {
  async fetch(request){
    if(request.method!=='GET') return new Response('GET requests only',{status:405});
    try{
      const files=await Promise.all(FILES.map(async name=>{
        const response=await fetch(ROOT+name,{headers:{'user-agent':'LiteTube-Extension-Builder'}});
        if(!response.ok) throw new Error('Could not fetch '+name+' (HTTP '+response.status+')');
        return {name:'LiteTube-Speed-Bridge/'+name,data:new Uint8Array(await response.arrayBuffer())};
      }));
      const body=zip(files);
      return new Response(body,{headers:{
        'content-type':'application/zip',
        'content-disposition':'attachment; filename="LiteTube-Speed-Bridge.zip"',
        'content-length':String(body.length),
        'cache-control':'public, max-age=300'
      }});
    }catch(error){
      return new Response('Extension package could not be prepared: '+String(error.message||error),{status:502,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
    }
  }
};
