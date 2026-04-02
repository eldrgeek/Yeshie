import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kbPath = resolve(__dirname, '../../scripts/docs-kb.json');
const kb = JSON.parse(readFileSync(kbPath, 'utf-8'));

describe('Docs KB extraction', () => {
  it('TEST 1: Schema validation', () => {
    // Top-level fields
    expect(kb.extractedAt).toBeDefined();
    expect(new Date(kb.extractedAt).toISOString()).toBe(kb.extractedAt);
    expect(typeof kb.articleCount).toBe('number');
    expect(kb.articleCount).toBeGreaterThan(0);
    expect(Array.isArray(kb.articles)).toBe(true);

    // Each article has required fields
    for (const article of kb.articles) {
      expect(typeof article.id).toBe('string');
      expect(typeof article.title).toBe('string');
      expect(article.title.length).toBeGreaterThan(0);
      expect(typeof article.collection).toBe('string');
      expect(typeof article.url).toBe('string');
      expect(article.url.startsWith('https://')).toBe(true);
      expect(typeof article.content).toBe('string');
      expect(article.content.length).toBeGreaterThan(50);
    }
  });

  it('TEST 2: Known articles present', () => {
    const titles = kb.articles.map((a: { title: string }) => a.title);

    expect(titles.some((t: string) => t.includes('Zoom') && t.includes('Connect'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Script') || t.includes('Code Backed'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Access Request') || t.includes('Submitting'))).toBe(true);
  });

  it('TEST 3: Content quality', () => {
    for (const article of kb.articles) {
      expect(article.content).not.toMatch(/Powered by Pylon/i);
      expect(article.content).not.toMatch(/How helpful was this article/i);
      // No emoji rating characters
      expect(article.content).not.toMatch(/[😀😐😞👍👎]/);
      expect(article.content.length).toBeGreaterThan(100);
    }
  });

  it('TEST 4: No duplicates', () => {
    const ids = kb.articles.map((a: { id: string }) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    expect(kb.articleCount).toBe(kb.articles.length);
  });
});
