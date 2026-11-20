import { createHash } from 'node:crypto';
export function createGitHubFixture() {
  const files=new Map(),calls=[];let privateRepo=true,deny=0;
  function put(path,bytes){const buffer=Buffer.from(bytes),sha=createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');files.set(path,{bytes:buffer,sha});return sha;}
  const reply=(body,status=200,headers={})=>new Response(typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body),{status,headers});
  async function fetcher(input,options={}){
    const url=new URL(input),prefix='/repos/hadisaranjam/qabchin-private-data';calls.push({url:url.href,method:options.method||'GET'});
    if(url.origin!=='https://api.github.com'||!url.pathname.startsWith(prefix))return reply({},404);
    if(deny)return reply({},deny);
    if(url.pathname===prefix)return reply({private:privateRepo,default_branch:'main',archived:false,permissions:{push:true}});
    const p=decodeURIComponent(url.pathname.slice((prefix+'/contents/').length));
    if(options.method==='PUT'){
      const body=JSON.parse(options.body),old=files.get(p);
      if((old?.sha||null)!==(body.sha||null))return reply({},409);
      const sha=put(p,Buffer.from(body.content,'base64'));return reply({content:{sha}},201);
    }
    const file=files.get(p);
    if(file){if(options.headers?.Accept==='application/vnd.github.raw+json')return reply(file.bytes);return reply({type:'file',name:p.split('/').at(-1),sha:file.sha,size:file.bytes.length,content:file.bytes.toString('base64')});}
    const entries=[...files].filter(([name])=>name.startsWith(p+'/')&&!name.slice(p.length+1).includes('/')).map(([name,f])=>({name:name.split('/').at(-1),sha:f.sha,type:'file',path:name}));
    return entries.length?reply(entries):reply({},404);
  }
  return {fetcher,files,calls,put,setPrivate(v){privateRepo=v;},setDenied(v){deny=v;}};
}
export const tinyImage='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
export function sampleDoc(name='داستان آزمایشی'){
  return {app:'comic-page-studio',version:10,appVersion:27,name,activePage:0,pages:[{id:'page-one',preset:'vaziri',panels:[{id:'panel-one',x:0,y:0,w:100,h:100,shape:'rect',image:{assetId:'image-one',name:'sample.png',width:1,height:1,fit:'cover',zoom:100}}]}],assets:{'image-one':tinyImage}};
}
