// Runs inside the page. check() alone also accepts nonexistent families.
export async function coreFontProof() {
 const result={faces:[],loads:[],resources:performance.getEntriesByType('resource').filter(x=>/core\.woff2/.test(x.name)).map(x=>({url:x.name,transferSize:x.transferSize,duration:x.duration})),glyphs:[]};
 for(const family of ['Abyss Pixel','Abyss Text']){
  const faces=[...document.fonts].filter(f=>f.family.replaceAll('"','').replaceAll("'",'')===family);
  let loaded=[],error=null;
  try{loaded=await document.fonts.load(`400 96px "${family}"`,'123456');}catch(e){error=String(e);}
  result.faces.push(...faces.map(f=>({family:f.family,status:f.status,weight:f.weight})));
  result.loads.push({family,count:loaded.length,error});
  if(!faces.length||!loaded.length||faces.some(f=>f.status!=='loaded')||error)continue;
  const file=family==='Abyss Pixel'?'abyss-pixel-core.woff2':'abyss-text-core.woff2';
  const alias=family+' Verification';
  const reference=await new FontFace(alias,`url("${new URL('src/fonts/'+file,location.href)}")`,{weight:'400'}).load();
  document.fonts.add(reference);
  try{
   const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=256;const ctx=canvas.getContext('2d');ctx.textAlign='center';ctx.textBaseline='middle';
   const widths=font=>{ctx.font=`400 190px ${font==='monospace'?font:JSON.stringify(font)}`;return [...'123456'].flatMap(c=>{const m=ctx.measureText(c);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];});};
   const actual=widths(family),expected=widths(alias),fallback=widths('monospace');
   result.glyphs.push({family,actual,expected,fallback,referenceStatus:reference.status,resource:new URL('src/fonts/'+file,location.href).href,
    matches:actual.every((x,i)=>x===expected[i]),distinctFromFallback:actual.some((x,i)=>x!==fallback[i])});
  }finally{document.fonts.delete(reference);}
 }
 result.ok=result.loads.length===2&&result.loads.every(x=>x.count>0&&!x.error)&&result.faces.every(x=>x.status==='loaded')&&result.glyphs.length===2&&result.glyphs.every(x=>x.matches&&x.distinctFromFallback);
 return result;
}
