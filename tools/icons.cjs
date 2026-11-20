// Generate PNG app icons from the original geometric brand mark, with no external tools.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../web/icons');fs.mkdirSync(root,{recursive:true});
const crc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const t=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),8+data.length);return out;};
function icon(size,maskable){const rows=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=x/size*40,py=y/size*40,scale=maskable?.78:1,xx=(px-20)/scale+20,yy=(py-20)/scale+20;
  let col=[36,66,194];
  if(yy>=8&&yy<=23&&xx>=8&&xx<=32){const edge=19.5-(yy-8)/15*2.5;if(xx<=edge || xx>=edge+2)col=[255,255,255];}
  if(yy>=26.5&&yy<=32&&xx>=8&&xx<=32)col=[246,195,67];
  const i=y*(size*4+1)+1+x*4;rows[i]=col[0];rows[i+1]=col[1];rows[i+2]=col[2];rows[i+3]=255;
}const ih=Buffer.alloc(13);ih.writeUInt32BE(size);ih.writeUInt32BE(size,4);ih[8]=8;ih[9]=6;
fs.writeFileSync(path.join(root,`${maskable?'maskable':'icon'}-${size}.png`),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));}
icon(192,false);icon(512,false);icon(512,true);
