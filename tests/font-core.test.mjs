import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
test('Round27 source corpus stays inside the verified core cmap union',async()=>{
 const fixture=JSON.parse(await readFile(new URL('tests/fixtures/font-core-codepoints.json',root),'utf8')),codes=new Set(fixture.codepoints);
 for(const font of fixture.fonts)assert.equal(createHash('sha256').update(await readFile(new URL('src/fonts/'+font.file,root))).digest('hex'),font.sha256,'Verified cmap manifest matches the actual font binary');
 for(const file of ['index.html',...(await readdir(new URL('src/',root))).filter(x=>/\.(js|css)$/.test(x)).map(x=>'src/'+x)]){
  const source=(await readFile(new URL(file,root),'utf8')).replace(/unicode-range:[^;}]+;?/g,'');
  for(const c of source)assert(codes.has(c.codePointAt(0)),`${file}: regenerate font subsets for U+${c.codePointAt(0).toString(16)}`);
 }
 // Newline is control syntax, not a rendered glyph. All other source glyphs
 // are present in at least one core; Pixel's four math omissions use Text.
 for(const cp of codes)if(cp!==10)assert(fixture.fonts.some(x=>!x.missing.includes(cp)));
});
test('Round27 originals and license notices remain intact; preload only cores',async()=>{
 for(const [file,expected] of [
  ['SourceHanSansCN-VF.otf.woff2','7087698d52240614659957608d8c4ad446759aee3208409dc9f566412e7af8f4'],
  ['fusion-pixel-12px-proportional-zh_hans.otf.woff2','de421b3da7b20e045f0712ee838f30c225f4610b348efb37e2b31baa98860cbf'],
 ]){
  assert.equal(createHash('sha256').update(await readFile(new URL('src/fonts/'+file,root))).digest('hex'),expected);
 }
 for(const file of ['source-han-sans-OFL.txt','fusion-pixel-OFL.txt'])assert.match(await readFile(new URL('src/fonts/'+file,root),'utf8'),/SIL OPEN FONT LICENSE/);
 const html=await readFile(new URL('index.html',root),'utf8');
 const preloads=[...html.matchAll(/<link[^>]+rel="preload"[^>]+>/g)].map(x=>x[0]);
 assert.equal(preloads.filter(x=>x.includes('as="font"')).length,2);
 assert(preloads.every(x=>!x.includes('SourceHanSansCN')&&!x.includes('fusion-pixel-12px')));
 for(const file of ['abyss-pixel-core.woff2','abyss-text-core.woff2']){
  const bytes=await readFile(new URL('src/fonts/'+file,root));assert.equal(bytes.toString('ascii',0,4),'wOF2');assert(bytes.length<400000);
 }
});
test('Round27 all literal core references retain immediate Full fallback and face aliases',async()=>{
 let refs=0,faces=0;
 for(const file of (await readdir(new URL('src/',root))).filter(x=>x.endsWith('.css'))){
  let css=await readFile(new URL('src/'+file,root),'utf8');
  css=css.replace(/@font-face\s*\{([^}]*)\}/g,(_,body)=>{
   faces++;assert.match(body,/font-family:'Abyss (?:Text|Pixel)(?: Full)?';/);
   if(body.includes(" Full'"))assert.match(body,/unicode-range:U\+/);
   return'';
  });
  for(const match of css.matchAll(/(['"])Abyss (Text|Pixel)\1/g)){
   refs++;assert.equal(css.slice(match.index+match[0].length).match(/^\s*,\s*(['"])(.*?)\1/)?.[2],`Abyss ${match[2]} Full`,`${file}:${match.index}`);
  }
 }
 assert.equal(faces,4);assert(refs>=109);
 const dice=await readFile(new URL('src/dice-renderer.js',root),'utf8');assert(dice.includes('96px "Abyss Pixel"'));
});
