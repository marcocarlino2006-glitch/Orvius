const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });
  
  // Click the hamburger menu button
  await page.click('.shell-menu-toggle');
  
  // Wait for menu animation
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Take screenshot
  await page.screenshot({ path: '/agent/docs/orvius-header-mobile-menu.webp' });
  
  await browser.close();
  console.log('Screenshot saved to /agent/docs/orvius-header-mobile-menu.webp');
})();
