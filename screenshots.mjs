import { chromium } from 'playwright';
import path from 'path';

const NEXTCLOUD_URL = 'http://localhost:8080';
const MIRADOR_URL = 'http://localhost:3030';
const CANTALOUPE_URL = 'http://localhost:8182';
const OUTPUT_DIR = path.resolve('docs/images');

const USER = 'admin';
const PASS = 'admin';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  // 1. Nextcloud ログイン
  console.log('1. Nextcloud login page...');
  await page.goto(`${NEXTCLOUD_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '01_nextcloud_login.png') });

  // ログイン
  console.log('   Logging in...');
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForURL('**/apps/**', { timeout: 30000 });
  await page.waitForLoadState('networkidle');

  // 2. Nextcloud ファイル一覧
  console.log('2. Nextcloud files page...');
  await page.goto(`${NEXTCLOUD_URL}/apps/files/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '02_nextcloud_files.png') });

  // 3. フォルダの右クリックメニュー
  console.log('3. Folder context menu...');
  const folderRow = page.locator('tr[data-cy-files-list-row-name="test"]').first();
  if (await folderRow.count() > 0) {
    await folderRow.click({ button: 'right' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03_context_menu.png') });
    await page.keyboard.press('Escape');
  }

  // 4. フォルダ内の画像一覧
  console.log('4. Folder contents...');
  await page.goto(`${NEXTCLOUD_URL}/apps/files/?dir=/test`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '04_folder_contents.png') });

  // 5. Mirador ビューワ
  console.log('5. Mirador viewer...');
  await page.goto(`${MIRADOR_URL}/view?folder=test`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(8000); // Miradorの読み込みを十分待つ
  await page.screenshot({ path: path.join(OUTPUT_DIR, '05_mirador_viewer.png') });

  // 6. Miradorで検索パネルを操作
  console.log('6. Mirador search...');
  // サイドバーの検索アイコンを探す（Miradorのアイコンボタン）
  const searchBtn = page.locator('button[aria-label*="earch"], button[aria-label*="検索"], button:has(svg[data-testid="SearchIcon"])').first();
  if (await searchBtn.count() > 0) {
    await searchBtn.click();
    await page.waitForTimeout(1000);
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('dashboard');
      await searchInput.press('Enter');
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '06_mirador_search.png') });
  } else {
    // 検索ボタンが見つからない場合、Miradorのサイドパネルを試す
    // 左サイドバーのアイコンをクリック
    const sideButtons = page.locator('nav button, aside button').all();
    console.log('   Trying sidebar buttons...');
    await page.screenshot({ path: path.join(OUTPUT_DIR, '06_mirador_search.png') });
  }

  // 7. IIIF Manifest JSON
  console.log('7. IIIF Manifest JSON...');
  await page.goto(`${MIRADOR_URL}/api/iiif/test/manifest.json`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '07_manifest_json.png') });

  // 8. Cantaloupe
  console.log('8. Cantaloupe page...');
  await page.goto(`${CANTALOUPE_URL}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '08_cantaloupe.png') });

  // 9. OCR Worker
  console.log('9. OCR Worker health...');
  await page.goto('http://localhost:5050/health');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '09_ocr_worker_health.png') });

  // 10. Nextcloud アプリ設定画面
  console.log('10. Nextcloud apps settings...');
  await page.goto(`${NEXTCLOUD_URL}/login`);
  await page.waitForLoadState('networkidle');
  const userField = page.locator('input[name="user"]');
  if (await userField.count() > 0) {
    await page.fill('input[name="user"]', USER);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForURL('**/apps/**', { timeout: 30000 });
  }
  await page.goto(`${NEXTCLOUD_URL}/settings/apps/installed`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '10_nextcloud_apps.png') });

  await browser.close();
  console.log('\nDone! Screenshots saved to docs/images/');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
