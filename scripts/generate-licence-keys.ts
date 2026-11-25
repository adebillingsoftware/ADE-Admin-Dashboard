import 'dotenv/config';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateBase64 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString('base64');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

fs.writeFileSync('.licence-public-key.pem', publicPem, { encoding: 'utf8', mode: 0o644 });

console.log('Ed25519 licence key pair generated.');
console.log('Public key written to .licence-public-key.pem — embed this in ArthiRetail.');
console.log('Add the following line to .env (server-only) and to Vercel environment variables:');
console.log(`LICENCE_SIGNING_PRIVATE_KEY=${privateBase64}`);
console.log('Never commit the private key or add it to any VITE_ variable.');
