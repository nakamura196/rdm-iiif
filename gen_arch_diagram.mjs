import { chromium } from 'playwright';
import path from 'path';

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body { margin: 0; padding: 20px; background: white; font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif; }
.diagram { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.box { border: 2px solid #333; border-radius: 6px; padding: 12px 20px; text-align: center; background: #f8f9fa; }
.box-group { border: 2px solid #2196F3; border-radius: 8px; padding: 16px; background: #e3f2fd; }
.box-inner { border: 1px solid #1976D2; border-radius: 4px; padding: 10px; background: white; margin-top: 8px; text-align: left; font-size: 14px; }
.row { display: flex; gap: 20px; justify-content: center; align-items: flex-start; }
.arrow { font-size: 24px; color: #666; text-align: center; }
.label { font-weight: bold; font-size: 15px; }
.sublabel { font-size: 13px; color: #555; margin-top: 4px; }
.service-box { border: 2px solid #4CAF50; border-radius: 6px; padding: 12px 16px; background: #e8f5e9; min-width: 160px; text-align: center; }
.storage-box { border: 2px solid #FF9800; border-radius: 6px; padding: 12px 20px; background: #fff3e0; text-align: center; min-width: 400px; }
h3 { margin: 4px 0; font-size: 15px; }
.small { font-size: 12px; color: #666; }
</style>
</head><body>
<div class="diagram">
  <div class="box" style="min-width:300px;">
    <div class="label">ユーザー（ブラウザ）</div>
  </div>
  <div class="arrow">▼</div>
  <div class="box-group" style="min-width:500px;">
    <div class="label" style="text-align:center;">Nextcloud (Port 8080)</div>
    <div class="box-inner">
      <div style="font-weight:bold; margin-bottom:6px;">iiifserver アプリ</div>
      <div>・IIIF Manifest API</div>
      <div>・IIIF Search API</div>
      <div>・Mirador Viewer</div>
      <div>・ファイルイベントリスナー</div>
    </div>
  </div>
  <div class="row" style="gap:8px;">
    <div class="arrow">▼</div>
    <div style="width:140px;"></div>
    <div class="arrow">▼</div>
    <div style="width:140px;"></div>
    <div class="arrow">▼</div>
  </div>
  <div class="row">
    <div class="service-box">
      <h3>Cantaloupe</h3>
      <div class="small">Port 8182</div>
      <div class="sublabel">IIIF Image API 3.0</div>
    </div>
    <div class="service-box">
      <h3>Elasticsearch</h3>
      <div class="small">Port 9200</div>
      <div class="sublabel">全文検索インデックス</div>
    </div>
    <div class="service-box">
      <h3>OCR Worker</h3>
      <div class="small">Port 5000</div>
      <div class="sublabel">NDL古典籍OCR Lite</div>
    </div>
  </div>
  <div class="row" style="gap:8px;">
    <div class="arrow">▼</div>
    <div style="width:300px;"></div>
    <div class="arrow">▼</div>
  </div>
  <div class="storage-box">
    <h3>Amazon S3 (Object Storage)</h3>
    <div class="sublabel">画像ファイル保存</div>
  </div>
</div>
</body></html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 600 } });
  await page.setContent(html);
  await page.waitForTimeout(500);

  const diagram = page.locator('.diagram');
  await diagram.screenshot({ path: path.resolve('docs/images/00_architecture.png') });

  await browser.close();
  console.log('Done: docs/images/00_architecture.png');
}

main().catch(console.error);
