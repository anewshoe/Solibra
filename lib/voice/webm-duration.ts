/** Finalize MediaRecorder's streaming WebM header without modifying audio blocks.
 * Matroska Info.Duration is a float in TimestampScale ticks (default 1 ms).
 * Only the minimal, unindexed MediaRecorder layout is patched; other files pass through.
 */
type Element = { id:number; start:number; sizeStart:number; data:number; end:number; unknown:boolean; sizeWidth:number };
function element(bytes:Uint8Array,start:number):Element {
  function vint(offset:number,id=false) {
    const first=bytes[offset];if(!first)throw Error('Invalid EBML');
    let width=1;while(width<=8&&!(first&(1<<(8-width))))width++;
    if(width>8||offset+width>bytes.length||(id&&width>4))throw Error('Invalid EBML');
    let value=id?first:first&((1<<(8-width))-1);let unknown=!id&&value===((1<<(8-width))-1);
    for(let i=1;i<width;i++){value=value*256+bytes[offset+i];unknown=unknown&&bytes[offset+i]===255;}
    if(!unknown&&!Number.isSafeInteger(value))throw Error('Oversized EBML');
    return {width,value,unknown};
  }
  const id=vint(start,true),sizeStart=start+id.width,size=vint(sizeStart),data=sizeStart+size.width;
  const end=size.unknown?bytes.length:data+size.value;if(end>bytes.length)throw Error('Incomplete EBML');
  return {id:id.value,start,sizeStart,data,end,unknown:size.unknown,sizeWidth:size.width};
}
function sizeBytes(size:number,width:number) {
  if(size>=2**(7*width)-1)throw Error('EBML size overflow');
  const out=new Uint8Array(width);for(let i=width-1;i>=0;i--){out[i]=size%256;size=Math.floor(size/256);}out[0]|=1<<(8-width);return out;
}
export async function finalizeWebmDuration(blob:Blob,durationMs:number):Promise<Blob> {
  if(!blob.type.toLowerCase().includes('webm')||!Number.isFinite(durationMs)||durationMs<=0)return blob;
  try {
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let segment:Element|undefined;
    for(let p=0;p<bytes.length;){const e=element(bytes,p);if(e.id===0x18538067){segment=e;break;}p=e.end;}
    if(!segment)return blob;
    let info:Element|undefined;
    for(let p=segment.data;p<segment.end;){const e=element(bytes,p);if(e.id===0x1549a966){info=e;break;}p=e.end;}
    if(!info||info.unknown)return blob;
    // Inserting bytes changes index offsets. Never patch an indexed/non-recorder file.
    for(let p=segment.data;p<segment.end;){const e=element(bytes,p);if(e.id===0x1549a966||e.id===0x1654ae6b){p=e.end;continue;}if(e.id===0x1f43b675)break;if(e.id===0x114d9b74||e.id===0x1c53bb6b)return blob;p=e.end;}
    let scale=1_000_000;let duration:Element|undefined;
    for(let p=info.data;p<info.end;){const e=element(bytes,p);if(e.id===0x2ad7b1){scale=0;for(let i=e.data;i<e.end;i++)scale=scale*256+bytes[i];}if(e.id===0x4489)duration=e;p=e.end;}
    if(!scale)return blob;
    if(duration) {
      const length=duration.end-duration.data;if(length!==4&&length!==8)return blob;
      const view=new DataView(bytes.buffer);if(length===8)view.setFloat64(duration.data,durationMs*1_000_000/scale);else view.setFloat32(duration.data,durationMs*1_000_000/scale);
      return new Blob([bytes],{type:blob.type});
    }
    const added=new Uint8Array(11);added.set([0x44,0x89,0x88]);new DataView(added.buffer).setFloat64(3,durationMs*1_000_000/scale);
    const infoSize=sizeBytes(info.end-info.data+added.length,info.sizeWidth);
    if(!segment.unknown)bytes.set(sizeBytes(segment.end-segment.data+added.length,segment.sizeWidth),segment.sizeStart);
    bytes.set(infoSize,info.sizeStart);
    return new Blob([bytes.slice(0,info.end),added,bytes.slice(info.end)],{type:blob.type});
  }catch {return blob;}
}
