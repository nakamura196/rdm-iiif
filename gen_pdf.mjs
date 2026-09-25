import { chromium } from 'playwright';
import { marked } from 'marked';
import hljs from 'highlight.js';
import fs from 'fs';
import path from 'path';

// Configure marked with highlight.js
const renderer = new marked.Renderer();
const origCode = renderer.code;
renderer.code = function({ text, lang }) {
  let highlighted;
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(text, { language: lang }).value;
  } else {
    highlighted = hljs.highlightAuto(text).value;
  }
  return `<pre><code class="hljs language-${lang || ''}">${highlighted}</code></pre>`;
};
marked.setOptions({ renderer });

const md = fs.readFileSync('BLOG.md', 'utf-8');
const htmlBody = marked.parse(md);

// Convert images to inline base64
const absImages = htmlBody.replace(/src="docs\/images\/([^"]+)"/g, (match, filename) => {
  const imgPath = path.resolve('docs/images', filename);
  if (fs.existsSync(imgPath)) {
    const data = fs.readFileSync(imgPath);
    const ext = path.extname(filename).slice(1);
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return `src="data:${mime};base64,${data.toString('base64')}"`;
  }
  return match;
});

const fullHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
/* highlight.js github theme */
.hljs{color:#24292e;background:#f6f8fa}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{color:#24292e;font-style:italic}.hljs-strong{color:#24292e;font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}
</style>
<style>
@page {
  size: A4;
  margin: 25mm 20mm 25mm 20mm;
}

body {
  font-family: 'Hiragino Mincho ProN', 'Noto Serif JP', 'Yu Mincho', serif;
  font-size: 10.5pt;
  line-height: 1.8;
  color: #1a1a1a;
  max-width: 100%;
}

h1 {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  font-size: 22pt;
  font-weight: 700;
  border-bottom: 3px solid #2c3e50;
  padding-bottom: 8px;
  margin-top: 0;
  margin-bottom: 20px;
  page-break-after: avoid;
}

h2 {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  font-size: 16pt;
  font-weight: 700;
  color: #2c3e50;
  border-bottom: 1.5px solid #bdc3c7;
  padding-bottom: 5px;
  margin-top: 24px;
  margin-bottom: 12px;
}

h3 {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  font-size: 13pt;
  font-weight: 600;
  color: #34495e;
  margin-top: 24px;
  margin-bottom: 10px;
  page-break-after: avoid;
}

h4 {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  font-size: 11pt;
  font-weight: 600;
  color: #34495e;
  margin-top: 18px;
  margin-bottom: 8px;
  page-break-after: avoid;
}

p {
  margin: 8px 0;
}

/* Code blocks */
pre {
  background: #f6f8fa;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  padding: 14px 16px;
  font-size: 8.5pt;
  line-height: 1.45;
  overflow-x: hidden;
  page-break-inside: auto;
  margin: 10px 0;
}

pre code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  background: none;
  padding: 0;
  border: none;
  font-size: 8.5pt;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  background: #f0f2f4;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9pt;
}

/* Tables */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 10pt;
  page-break-inside: avoid;
}

th {
  background: #f0f3f5;
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid #d1d9e0;
}

td {
  padding: 7px 12px;
  border: 1px solid #d1d9e0;
}

tr:nth-child(even) {
  background: #f9fafb;
}

/* Images */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 10px auto;
  border: 1px solid #d1d9e0;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}

/* Image captions (em after img) */
p > em:only-child {
  display: block;
  text-align: center;
  font-size: 9pt;
  color: #666;
  margin-top: -8px;
  margin-bottom: 14px;
}

/* Horizontal rules */
hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 28px 0;
}

/* Lists */
ul, ol {
  margin: 8px 0;
  padding-left: 24px;
}

li {
  margin: 4px 0;
}

/* Strong */
strong {
  font-weight: 700;
}

/* Links */
a {
  color: #2980b9;
  text-decoration: none;
}

/* Blockquotes */
blockquote {
  border-left: 4px solid #3498db;
  margin: 12px 0;
  padding: 8px 16px;
  background: #f0f7fd;
  color: #444;
}

/* Page break control */
h3, h4 {
  page-break-after: avoid;
}

table {
  page-break-inside: avoid;
}

/* Avoid orphans/widows */
p {
  orphans: 2;
  widows: 2;
}
</style>
</head>
<body>
${absImages}
</body>
</html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setContent(fullHtml, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.pdf({
    path: 'BLOG.pdf',
    format: 'A4',
    margin: { top: '25mm', bottom: '25mm', left: '20mm', right: '20mm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="font-size:9pt; color:#999; text-align:center; width:100%;"><span class="pageNumber"></span></div>',
  });

  await browser.close();

  const stat = fs.statSync('BLOG.pdf');
  console.log(`Done: BLOG.pdf (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
}

main().catch(console.error);
