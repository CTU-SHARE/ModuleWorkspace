import { readFile } from 'node:fs/promises';
import { env } from './config.js';
const metadata = JSON.parse(await readFile(env.METADATA_FILE, 'utf8'));
const r = await fetch(env.HASURA_URL + '/v1/metadata', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': env.HASURA_ADMIN_SECRET },
  body: JSON.stringify({
    type: 'replace_metadata',
    args: { allow_inconsistent_metadata: false, metadata },
  }),
});
if (!r.ok) throw Error(await r.text());
console.log('Hasura metadata applied');
