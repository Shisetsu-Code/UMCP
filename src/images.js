import sharp from 'sharp';

const PRESETS={low:{format:'jpeg',quality:35,maxWidth:768},balanced:{format:'jpeg',quality:60,maxWidth:1280},high:{format:'png',maxWidth:2560}};
const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

/** Compress an already clipped screenshot without changing its coordinate frame. */
export async function renderImage(input, options={}){
  const config={...PRESETS[options.preset??'balanced'],...options};
  const format=config.format??'jpeg';
  if(!['jpeg','png','webp'].includes(format)) throw new Error('format must be jpeg, png or webp');
  const quality=config.quality??60;
  if(!Number.isInteger(quality)||quality<1||quality>100) throw new Error('quality must be 1..100');
  const maxWidth=config.maxWidth??1280;
  if(!Number.isInteger(maxWidth)||maxWidth<64||maxWidth>4096) throw new Error('maxWidth must be 64..4096');
  const metadata=await sharp(input).metadata();
  const width=Math.min(metadata.width,maxWidth);
  const height=Math.max(1,Math.round(metadata.height*width/metadata.width));
  const region=config.region??{x:0,y:0,width:metadata.width,height:metadata.height};
  let pipeline=sharp(input).resize(width,height,{fit:'fill'});
  if(config.overlay&&config.controls?.length){
    const sx=width/region.width,sy=height/region.height;
    const shapes=config.controls.slice(0,200).map((c,i)=>{
      const x=(c.x-region.x)*sx,y=(c.y-region.y)*sy,w=c.width*sx,h=c.height*sy;
      if(x+w<0||y+h<0||x>width||y>height)return '';
      const label=escapeXml(`${i+1} · ${c.id} · ${Math.round(c.x+c.width/2)},${Math.round(c.y+c.height/2)}`);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#00ffb3" stroke-width="2"/><rect x="${Math.max(0,x)}" y="${Math.max(0,y-16)}" width="${Math.min(290,width-Math.max(0,x))}" height="16" fill="#071c25" fill-opacity="0.9"/><text x="${Math.max(0,x)+3}" y="${Math.max(13,y-3)}" fill="#fff" font-family="sans-serif" font-size="11">${label}</text>`;
    }).join('');
    pipeline=pipeline.composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`)}]);
  }
  if(format==='png')pipeline=pipeline.png({compressionLevel:9});
  if(format==='jpeg')pipeline=pipeline.jpeg({quality,mozjpeg:true});
  if(format==='webp')pipeline=pipeline.webp({quality});
  const buffer=await pipeline.toBuffer();
  return {buffer,format,mimeType:`image/${format}`,width,height,bytes:buffer.length,quality:format==='png'?null:quality,transform:{region,imageWidth:width,imageHeight:height,cssPerPixelX:region.width/width,cssPerPixelY:region.height/height}};
}

export function imageToViewport(point,transform){
  const {x,y}=point;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=transform.imageWidth||y>=transform.imageHeight)throw new Error('Image coordinates outside screenshot bounds');
  return {x:transform.region.x+x*transform.cssPerPixelX,y:transform.region.y+y*transform.cssPerPixelY};
}

export function normalizedToViewport({x,y},viewport){
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw new Error('Normalized coordinates must be between 0 and 1');
  return {x:Math.min(viewport.width-0.01,x*viewport.width),y:Math.min(viewport.height-0.01,y*viewport.height)};
}
