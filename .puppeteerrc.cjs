/**
 * Only local screenshot and audit scripts drive a browser. Builds and CI
 * never do, so they skip the ~170 MB Chromium download on every install.
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  skipDownload: Boolean(process.env.VERCEL || process.env.CI),
};
