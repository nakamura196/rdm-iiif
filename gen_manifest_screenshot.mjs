import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Fetch manifest JSON and display it pretty-printed
  const res = await (await fetch('http://localhost:3030/api/iiif/aaa/manifest.json')).json();
  const prettyJson = JSON.stringify(res, null, 2);

  await page.setContent(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body { margin: 0; padding: 20px; background: #f5f5f5; font-family: Menlo, monospace; font-size: 13px; }
pre { background: white; padding: 16px; border-radius: 6px; border: 1px solid #ddd; overflow: hidden; line-height: 1.4; }
</style></head><body>
<pre>${prettyJson.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body></html>`);

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('docs/images/08_manifest_json.png'), fullPage: false });

  await browser.close();
  console.log('Done: docs/images/08_manifest_json.png');
}

main().catch(console.error);
