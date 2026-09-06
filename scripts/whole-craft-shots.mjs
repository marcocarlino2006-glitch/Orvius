import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/opt/cursor/artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });

async function shot(path, url, opts = {}) {
  const ctx = await browser.newContext(opts.mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(900);
  if (opts.scrollBottom) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path, fullPage: !!opts.full });
  await ctx.close();
  console.log('ok', path);
}

await shot('/opt/cursor/artifacts/craft-pricing-desktop.png', 'http://localhost:3000/pricing');
await shot('/opt/cursor/artifacts/craft-pricing-mobile.png', 'http://localhost:3000/pricing', { mobile: true });
await shot('/opt/cursor/artifacts/craft-pilot-desktop.png', 'http://localhost:3000/pilot');
await shot('/opt/cursor/artifacts/craft-login-desktop.png', 'http://localhost:3000/login');
await shot('/opt/cursor/artifacts/craft-security-desktop.png', 'http://localhost:3000/security');
await shot('/opt/cursor/artifacts/craft-home-desktop.png', 'http://localhost:3000/');
// dashboard may redirect to login
await shot('/opt/cursor/artifacts/craft-dashboard-or-login.png', 'http://localhost:3000/dashboard');

await browser.close();
