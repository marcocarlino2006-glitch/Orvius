import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('/opt/cursor/artifacts', { recursive: true });

const browser = await chromium.launch({ headless: true });

const iphone = devices['iPhone 13'];
const mobile = await browser.newContext({ ...iphone });
const mpage = await mobile.newPage();
await mpage.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await mpage.waitForTimeout(1500);
await mpage.screenshot({ path: '/opt/cursor/artifacts/cursor-bar-mobile-hero.png', fullPage: false });
await mpage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await mpage.waitForTimeout(500);
await mpage.screenshot({ path: '/opt/cursor/artifacts/cursor-bar-mobile-footer.png', fullPage: false });
await mpage.screenshot({ path: '/opt/cursor/artifacts/cursor-bar-mobile-full.png', fullPage: true });
await mobile.close();

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dpage = await desktop.newPage();
await dpage.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await dpage.waitForTimeout(1500);
await dpage.screenshot({ path: '/opt/cursor/artifacts/cursor-bar-desktop-hero.png', fullPage: false });
await dpage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await dpage.waitForTimeout(500);
await dpage.screenshot({ path: '/opt/cursor/artifacts/cursor-bar-desktop-footer.png', fullPage: false });
await desktop.close();

await browser.close();
console.log('shots ok');
