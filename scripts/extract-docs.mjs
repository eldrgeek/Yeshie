#!/usr/bin/env node
/**
 * Bead 5: Crawl docs.yeshid.com and extract all articles to JSON.
 * Usage: node scripts/extract-docs.mjs
 *
 * Strategy: The site is a Pylon-powered SPA, but serves SSR HTML to Googlebot.
 * We use the sitemap to discover article URLs, then fetch each with a Googlebot
 * user-agent to get the server-rendered HTML with full article content.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://docs.yeshid.com';
const SITEMAP_URL = `${BASE}/sitemap.xml`;
const OUTPUT = resolve(__dirname, 'docs-kb.json');

// Googlebot UA triggers SSR rendering from Pylon
const UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)';
const CONCURRENCY = 5;

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function getArticleUrls() {
  const xml = await fetchPage(SITEMAP_URL);
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = [];
  $('url > loc').each((_, el) => {
    const loc = $(el).text().trim();
    if (loc.includes('/articles/')) urls.push(loc);
  });
  return urls;
}

function extractArticle(html, url) {
  const $ = cheerio.load(html);

  // Title from og:title (cleanest) or <title> or <h1>
  const title = ($('meta[property="og:title"]').attr('content') || '')
    .replace(/&amp;/g, '&')
    || $('title').text().trim()
    || $('main h1').first().text().trim()
    || '';

  // ID from URL: /articles/{id}-{slug}
  const match = url.match(/\/articles\/(\d+)-/);
  const id = match ? match[1] : url.split('/').pop() || '';

  // Collection from breadcrumb nav (skip "All Collections")
  const breadcrumbs = [];
  $('nav ol li a').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text !== 'All Collections') breadcrumbs.push(text);
  });
  const collection = breadcrumbs[0] || '';

  // Last updated from the paragraph in <main>
  let lastUpdated = '';
  $('main p').each((_, el) => {
    const text = $(el).text();
    if (text.includes('Last updated:')) {
      lastUpdated = text.replace('Last updated:', '').trim();
    }
  });

  // Content extraction from <main>
  const main = $('main');
  if (!main.length) return null;

  // Clone main for content extraction (don't mutate original for related articles)
  const contentMain = main.clone();

  // Remove the first h1 (title, already captured)
  contentMain.find('h1').first().remove();
  // Remove "Last updated" paragraph
  contentMain.find('p').filter((_, el) => $(el).text().includes('Last updated:')).remove();
  // Remove images (not useful in text KB)
  contentMain.find('img').remove();

  let content = contentMain.text()
    .replace(/Powered by Pylon/gi, '')
    .replace(/How helpful was this article\??/gi, '')
    // Remove all emoji (not useful in text KB)
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Related articles from <aside> (titles only — URLs derivable from sitemap)
  const relatedArticles = [];
  $('aside nav ul li a').each((_, el) => {
    const linkTitle = $(el).text().trim();
    if (linkTitle) relatedArticles.push(linkTitle);
  });

  const article = { id, title, collection, url, lastUpdated, content };
  if (relatedArticles.length > 0) {
    article.relatedArticles = relatedArticles;
  }
  return article;
}

async function runBatch(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log('Fetching sitemap...');
  const urls = await getArticleUrls();
  console.log(`Found ${urls.length} article URLs in sitemap`);

  console.log('Fetching articles...');
  const articles = await runBatch(urls, async (url) => {
    try {
      const html = await fetchPage(url);
      const article = extractArticle(html, url);
      process.stdout.write('.');
      return article;
    } catch (err) {
      console.error(`\nError fetching ${url}: ${err.message}`);
      return null;
    }
  }, CONCURRENCY);
  console.log('');

  // Filter nulls and deduplicate by ID
  const seen = new Set();
  const deduped = [];
  for (const a of articles) {
    if (a && a.content.length >= 50 && !seen.has(a.id)) {
      seen.add(a.id);
      deduped.push(a);
    }
  }

  const output = {
    extractedAt: new Date().toISOString(),
    articleCount: deduped.length,
    articles: deduped
  };

  const json = JSON.stringify(output, null, 2);
  writeFileSync(OUTPUT, json);

  const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
  const wordCount = deduped.reduce((sum, a) => sum + a.content.split(/\s+/).length, 0);
  const tokenEst = Math.round(wordCount * 1.3);

  console.log(`Extracted ${deduped.length} articles (${tokenEst.toLocaleString()} tokens est.) → scripts/docs-kb.json`);
  console.log(`File size: ${sizeKB}KB`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
