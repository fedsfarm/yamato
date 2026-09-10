// Run with Deno (or Node) before packaging either extension.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import './site-modules.js';

const domains = [...new Set(readFileSync('public/misc/block.txt', 'utf8')
  .split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(Boolean)
  .map(domain => new URL('https://' + domain).hostname.replace(/^www\./, '')))];
const rules = [];
// One rule per group keeps the large domain list below static rule quotas.
for (let i = 0; i < domains.length; i += 1000) {
  rules.push(...globalThis.yamatoJC.rules({
      requestDomains: domains.slice(i, i + 1000),
      resourceTypes: ['image', 'media', 'sub_frame', 'object'],
    }, 1, rules.length + 1));
}
// Keep each ruleset below the Firefox add-on validator's 5 MB text limit.
const groups = [[]];
let bytes = 2;
for (const rule of rules) {
  const size = new TextEncoder().encode(JSON.stringify(rule)).length + 1;
  if (bytes + size > 4 * 1024 * 1024) { groups.push([]); bytes = 2; }
  groups.at(-1).push(rule);
  bytes += size;
}
for (const directory of process.argv.slice(2)) {
  const manifestPath = join(directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.declarative_net_request.rule_resources = groups.map((group, index) => {
    const path = `media-rules-${index + 1}.json`;
    writeFileSync(join(directory, path), JSON.stringify(group));
    return { id: `blocked_media_${index + 1}`, enabled: true, path };
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
