import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PayloadSchema } from '../../src/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function loadPayload(name: string) {
  const path = resolve(root, `sites/yeshid/tasks/${name}.payload.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('Payload schema validation', () => {
  const payloads = [
    '00-login',
    '01-user-add',
    '02-user-delete',
    '03-user-modify',
    '04-site-explore',
    '05-integration-setup',
  ];

  for (const name of payloads) {
    it(`validates ${name}.payload.json`, () => {
      const payload = loadPayload(name);
      expect(() => PayloadSchema.parse(payload)).not.toThrow();
    });
  }

  it('rejects payload missing required _meta field', () => {
    const bad = { runId: 'x', mode: 'exploratory', site: 'x', params: {}, chain: [] };
    expect(() => PayloadSchema.parse(bad)).toThrow();
  });
});
