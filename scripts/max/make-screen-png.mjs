/** 屏幕 UI 纹理 → web/draw/screen-ui.png（供页面 photo 模式贴到屏幕活动区） */
import { writeFileSync } from 'node:fs';
import { makeScreenTexture } from '../../dist/src/model/macbook/screen-ui.js';
import { encodePngRGB } from '../../dist/src/render/image.js';
const t = makeScreenTexture(1.0);
writeFileSync('web/draw/screen-ui.png', encodePngRGB(t.w, t.h, t.data));
console.log('screen-ui.png', t.w + 'x' + t.h);
