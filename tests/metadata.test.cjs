const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function pngInfo(bytes) {
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  return { width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),colorType:bytes[25] };
}
test('public sharing metadata uses the official canonical origin and image without private data',()=>{
 const source=ts.createSourceFile('layout.tsx',fs.readFileSync(path.join(root,'app/layout.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declarations=source.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]);
 const expression=declarations.find(d=>d.name.getText(source)==='metadata').initializer.getText(source);
 const metadata=new Function(`return (${expression})`)();
 assert.equal(metadata.metadataBase.href,'https://www.solibra.club/');
 const title='Solibra — Every memory has more than one voice.';
 const description='A private, multilingual library for preserving memories, sharing stories, and connecting generations.';
 assert.equal(metadata.openGraph.type,'website');assert.equal(metadata.openGraph.siteName,'Solibra');assert.equal(metadata.openGraph.url,'https://www.solibra.club');
 for(const entry of [metadata.openGraph,metadata.twitter]){assert.equal(entry.title,title);assert.equal(entry.description,description);assert.equal(new URL(entry.images[0].url,metadata.metadataBase).href,'https://www.solibra.club/solibra/solibra-social-preview.png');assert.ok(entry.images[0].alt.includes('waving'));}
 assert.equal(metadata.twitter.card,'summary_large_image');assert.equal(metadata.openGraph.images[0].width,1200);assert.equal(metadata.openGraph.images[0].height,630);assert.equal(metadata.icons,undefined);
 assert.deepEqual(pngInfo(fs.readFileSync(path.join(root,'public/solibra/solibra-social-preview.png'))),{width:1200,height:630,colorType:2});
});
test('official favicon contains 16, 32 and 48 pixel PNGs; modern and Apple icons have valid dimensions',()=>{
 const ico=fs.readFileSync(path.join(root,'app/favicon.ico'));assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
 [16,32,48].forEach((size,index)=>{const offset=6+index*16;assert.equal(ico[offset],size);assert.equal(ico[offset+1],size);const length=ico.readUInt32LE(offset+8),start=ico.readUInt32LE(offset+12);assert.ok(start+length<=ico.length);assert.deepEqual(pngInfo(ico.subarray(start,start+length)),{width:size,height:size,colorType:6});});
 assert.deepEqual(pngInfo(fs.readFileSync(path.join(root,'app/icon.png'))),{width:512,height:512,colorType:6});
 const apple=pngInfo(fs.readFileSync(path.join(root,'app/apple-icon.png')));assert.equal(apple.width,180);assert.equal(apple.height,180);
});
