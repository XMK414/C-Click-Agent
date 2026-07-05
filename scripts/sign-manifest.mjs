// scripts/sign-manifest.mjs
//
// Signs a ToS manifest with ed25519 (current best practice for compact signed
// manifests). The PRIVATE key never lives in the repo:
//   - dev/test: run with no key -> generates a keypair into .keys/ (gitignored),
//     signs the fixture, and prints the public key to paste into tos-manifest.ts
//   - production: MANIFEST_PRIVATE_KEY_PATH=/secure/key node scripts/sign-manifest.mjs <manifest.json>
//     (Kyle runs this on the endpoint infra with the real key; only the public
//      key + signed manifest + signature are ever published.)
//
// Usage:
//   node scripts/sign-manifest.mjs                       # sign the default fixture
//   node scripts/sign-manifest.mjs path/to/manifest.json # sign a specific file

import { generateKeyPairSync, sign as edSign, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const manifestPath = resolve(repoRoot, process.argv[2] ?? 'gateway/policy/fixtures/tos-manifest.json');
const keysDir = resolve(repoRoot, '.keys');
const privKeyPath = process.env.MANIFEST_PRIVATE_KEY_PATH ?? resolve(keysDir, 'manifest-test.key');

function loadOrCreatePrivateKey() {
  if (existsSync(privKeyPath)) {
    return createPrivateKey(readFileSync(privKeyPath));
  }
  // Generate a TEST-ONLY keypair. Never used in production.
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  if (!existsSync(keysDir)) mkdirSync(keysDir, { recursive: true });
  writeFileSync(privKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  writeFileSync(resolve(keysDir, 'manifest-test.pub'), publicKey.export({ type: 'spki', format: 'pem' }));
  return privateKey;
}

const privateKey = loadOrCreatePrivateKey();
const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();

const bytes = readFileSync(manifestPath); // sign the EXACT file bytes — no canonicalization ambiguity
const signature = edSign(null, bytes, privateKey).toString('base64');
writeFileSync(manifestPath + '.sig', signature + '\n');

console.log('Signed:', manifestPath);
console.log('Signature file:', manifestPath + '.sig');
console.log('\n--- Pinned public key (paste into gateway/policy/tos-manifest.ts) ---');
console.log(publicKeyPem);
