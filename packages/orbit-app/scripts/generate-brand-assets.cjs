#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

let sharp;
try {
    sharp = require('sharp');
} catch (error) {
    const systemNode = '/usr/local/bin/node';
    if (process.execPath !== systemNode && existsSync(systemNode)) {
        const result = spawnSync(systemNode, [__filename, ...process.argv.slice(2)], { stdio: 'inherit' });
        process.exit(result.status ?? 1);
    }
    throw error;
}

const ROOT = path.resolve(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'sources/assets/images');
const BRAND_DIR = path.join(ROOT, 'sources/assets/brand');
const IOS_APP_ICON = path.join(ROOT, 'ios/Orbitdev/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png');
const ANDROID_RES = path.join(ROOT, 'android/app/src/main/res');

const palette = {
    ink: '#0B0F14',
    ink2: '#111821',
    cream: '#F7F2E8',
    mutedCream: '#DDE6D8',
    green: '#63E37A',
    cyan: '#55C8FF',
};

function appIconSvg() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="178" y1="84" x2="856" y2="946" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.ink2}"/>
      <stop offset="0.58" stop-color="${palette.ink}"/>
      <stop offset="1" stop-color="#06080C"/>
    </linearGradient>
    <radialGradient id="halo" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(594 398) rotate(129) scale(528 506)">
      <stop offset="0" stop-color="${palette.green}" stop-opacity="0.42"/>
      <stop offset="0.42" stop-color="${palette.cyan}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${palette.ink}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="260" y1="260" x2="786" y2="788" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF9EE"/>
      <stop offset="1" stop-color="#DDE6D8"/>
    </linearGradient>
    <linearGradient id="arc" x1="290" y1="762" x2="796" y2="270" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.cyan}"/>
      <stop offset="1" stop-color="${palette.green}"/>
    </linearGradient>
    <filter id="shadow" x="128" y="128" width="768" height="768" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="28" stdDeviation="32" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="572" cy="430" r="430" fill="url(#halo)"/>
  <path d="M198 512C198 338 338 198 512 198C686 198 826 338 826 512" fill="none" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="26" stroke-linecap="round"/>
  <g filter="url(#shadow)">
    <circle cx="512" cy="512" r="280" fill="none" stroke="url(#ring)" stroke-width="92"/>
    <path d="M304 700C221 601 219 446 302 344C403 218 587 198 712 300C816 385 847 529 795 645" fill="none" stroke="url(#arc)" stroke-width="44" stroke-linecap="round"/>
    <rect x="253" y="596" width="118" height="178" rx="38" fill="${palette.ink}" stroke="${palette.cream}" stroke-width="28"/>
    <rect x="672" y="254" width="156" height="114" rx="34" fill="${palette.cream}"/>
    <rect x="704" y="286" width="92" height="50" rx="16" fill="${palette.ink}"/>
    <path d="M414 382L552 512L414 642" fill="none" stroke="${palette.cream}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="580" y="615" width="156" height="66" rx="33" fill="${palette.green}"/>
    <circle cx="748" cy="312" r="26" fill="${palette.green}" stroke="${palette.ink}" stroke-width="12"/>
    <circle cx="313" cy="716" r="16" fill="${palette.green}"/>
  </g>
</svg>
`;
}

function glyphSvg({ color = palette.cream, accent = palette.green, background = 'transparent', pad = 0 } = {}) {
    const rect = background === 'transparent'
        ? ''
        : `<rect width="1024" height="1024" fill="${background}"/>`;
    const transform = pad > 0
        ? `transform="translate(${pad} ${pad}) scale(${(1024 - pad * 2) / 1024})"`
        : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${rect}
  <g ${transform}>
    <circle cx="512" cy="512" r="280" fill="none" stroke="${color}" stroke-width="92"/>
    <path d="M304 700C221 601 219 446 302 344C403 218 587 198 712 300C816 385 847 529 795 645" fill="none" stroke="${accent}" stroke-width="48" stroke-linecap="round"/>
    <rect x="253" y="596" width="118" height="178" rx="38" fill="${palette.ink}" stroke="${color}" stroke-width="28"/>
    <rect x="672" y="254" width="156" height="114" rx="34" fill="${color}"/>
    <rect x="704" y="286" width="92" height="50" rx="16" fill="${palette.ink}"/>
    <path d="M414 382L552 512L414 642" fill="none" stroke="${color}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="580" y="615" width="156" height="66" rx="33" fill="${accent}"/>
    <circle cx="748" cy="312" r="26" fill="${accent}" stroke="${palette.ink}" stroke-width="12"/>
  </g>
</svg>
`;
}

function splashSvg({ dark }) {
    const color = dark ? palette.cream : palette.ink;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${dark ? palette.ink : '#F5F5F5'}"/>
  <g transform="translate(224 224) scale(0.5625)">
    <circle cx="512" cy="512" r="280" fill="none" stroke="${color}" stroke-width="92"/>
    <path d="M304 700C221 601 219 446 302 344C403 218 587 198 712 300C816 385 847 529 795 645" fill="none" stroke="${palette.green}" stroke-width="48" stroke-linecap="round"/>
    <rect x="253" y="596" width="118" height="178" rx="38" fill="${dark ? palette.ink : '#F5F5F5'}" stroke="${color}" stroke-width="28"/>
    <rect x="672" y="254" width="156" height="114" rx="34" fill="${color}"/>
    <rect x="704" y="286" width="92" height="50" rx="16" fill="${dark ? palette.ink : '#F5F5F5'}"/>
    <path d="M414 382L552 512L414 642" fill="none" stroke="${color}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="580" y="615" width="156" height="66" rx="33" fill="${palette.green}"/>
    <circle cx="748" cy="312" r="26" fill="${palette.green}" stroke="${dark ? palette.ink : '#F5F5F5'}" stroke-width="12"/>
  </g>
</svg>
`;
}

async function renderPng(svg, filePath, size) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await sharp(Buffer.from(svg))
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toFile(filePath);
}

async function renderWebp(svg, filePath, size) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await sharp(Buffer.from(svg))
        .resize(size, size)
        .webp({ quality: 100, lossless: true })
        .toFile(filePath);
}

async function main() {
    const appIcon = appIconSvg();
    const adaptiveGlyph = glyphSvg({ color: palette.cream, accent: palette.green, pad: 178 });
    const monochromeGlyph = glyphSvg({ color: '#FFFFFF', accent: '#FFFFFF', pad: 178 });
    const blackGlyph = glyphSvg({ color: palette.ink, accent: palette.ink, pad: 80 });
    const whiteGlyph = glyphSvg({ color: '#FFFFFF', accent: '#FFFFFF', pad: 80 });

    await fs.mkdir(BRAND_DIR, { recursive: true });
    await fs.writeFile(path.join(BRAND_DIR, 'orbit-icon.svg'), appIcon);

    await renderPng(appIcon, path.join(IMAGE_DIR, 'icon.png'), 1024);
    await renderPng(appIcon, path.join(ROOT, 'logo.png'), 1024);
    await renderPng(appIcon, IOS_APP_ICON, 1024);
    await renderPng(appIcon, path.join(IMAGE_DIR, 'favicon.png'), 1024);
    await renderPng(appIcon, path.join(IMAGE_DIR, 'favicon-active.png'), 1024);
    await renderPng(adaptiveGlyph, path.join(IMAGE_DIR, 'icon-adaptive.png'), 1024);
    await renderPng(monochromeGlyph, path.join(IMAGE_DIR, 'icon-monochrome.png'), 1024);
    await renderPng(monochromeGlyph, path.join(IMAGE_DIR, 'icon-notification.png'), 512);
    await renderPng(blackGlyph, path.join(IMAGE_DIR, 'logo-black.png'), 1024);
    await renderPng(whiteGlyph, path.join(IMAGE_DIR, 'logo-white.png'), 1024);
    await renderPng(glyphSvg({ color: palette.ink, accent: palette.green, background: '#F5F5F5', pad: 160 }), path.join(IMAGE_DIR, 'splash-android-light.png'), 1024);
    await renderPng(glyphSvg({ color: palette.cream, accent: palette.green, background: palette.ink, pad: 160 }), path.join(IMAGE_DIR, 'splash-android-dark.png'), 1024);

    const androidLauncherSizes = [
        ['mipmap-mdpi', 48, 108],
        ['mipmap-hdpi', 72, 162],
        ['mipmap-xhdpi', 96, 216],
        ['mipmap-xxhdpi', 144, 324],
        ['mipmap-xxxhdpi', 192, 432],
    ];
    for (const [bucket, legacySize, adaptiveSize] of androidLauncherSizes) {
        await renderWebp(appIcon, path.join(ANDROID_RES, bucket, 'ic_launcher.webp'), legacySize);
        await renderWebp(appIcon, path.join(ANDROID_RES, bucket, 'ic_launcher_round.webp'), legacySize);
        await renderWebp(adaptiveGlyph, path.join(ANDROID_RES, bucket, 'ic_launcher_foreground.webp'), adaptiveSize);
        await renderWebp(monochromeGlyph, path.join(ANDROID_RES, bucket, 'ic_launcher_monochrome.webp'), adaptiveSize);
    }

    const splashSizes = [
        ['mdpi', 288],
        ['hdpi', 432],
        ['xhdpi', 576],
        ['xxhdpi', 864],
        ['xxxhdpi', 1152],
    ];
    for (const [bucket, size] of splashSizes) {
        await renderPng(splashSvg({ dark: false }), path.join(ANDROID_RES, `drawable-${bucket}`, 'splashscreen_logo.png'), size);
        await renderPng(splashSvg({ dark: true }), path.join(ANDROID_RES, `drawable-night-${bucket}`, 'splashscreen_logo.png'), size);
    }

}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
