import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://localhost:5173');
await page.getByRole('heading', { name: 'Your events', exact: true }).waitFor();
console.log(await page.evaluate(() => ['.skip-link', '.sidebar', '.mobile-menu', '.app-shell'].map(selector => {
  const element = document.querySelector(selector);
  const style = getComputedStyle(element);
  return { selector, display: style.display, position: style.position, top: style.top, gridColumn: style.gridColumn, rect: element.getBoundingClientRect().toJSON(), focused: element === document.activeElement };
})));
await browser.close();
