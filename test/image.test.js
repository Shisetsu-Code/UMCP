import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderImage, imageToViewport, normalizedToViewport } from '../src/images.js';

test('resizing and clipping retain exact CSS coordinate transform', async () => {
  const png = await sharp({create:{width:800,height:400,channels:3,background:'#204060'}}).png().toBuffer();
  const result = await renderImage(png,{format:'jpeg',quality:35,maxWidth:400,region:{x:100,y:50,width:800,height:400}});
  assert.equal(result.width,400); assert.equal(result.height,200);
  assert.equal(result.mimeType,'image/jpeg');
  assert.deepEqual(imageToViewport({x:200,y:100},result.transform),{x:500,y:250});
  assert.throws(()=>imageToViewport({x:401,y:100},result.transform),/outside/i);
});

test('WebP/PNG and overlay produce decodable files and enforce bounds', async () => {
  const png=await sharp({create:{width:640,height:360,channels:3,background:'#102030'}}).png().toBuffer();
  for(const format of ['webp','png']){
    const result=await renderImage(png,{format,maxWidth:320,quality:30,region:{x:0,y:0,width:640,height:360},controls:[{id:'safe<&',x:100,y:100,width:100,height:40}],overlay:true});
    const meta=await sharp(result.buffer).metadata(); assert.equal(meta.format,format); assert.equal(meta.width,320);
  }
  assert.throws(()=>normalizedToViewport({x:-0.1,y:0.3},{width:1280,height:720}),/0.*1/);
  assert.deepEqual(normalizedToViewport({x:0.5,y:0.5},{width:1280,height:720}),{x:640,y:360});
});
