#!/usr/bin/env node
/**
 * set-cors.js — Apply CORS config to the Firebase Storage bucket.
 * Alternative to `gsutil cors set cors.json gs://bucket`
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BUCKET_NAME = 'sias-8178a.firebasestorage.app';

const serviceKeyPath = join(__dirname, 'serviceAccountKey.json');
initializeApp({
  credential: cert(JSON.parse(readFileSync(serviceKeyPath, 'utf-8'))),
  storageBucket: BUCKET_NAME,
});

const bucket = getStorage().bucket();
const cors = JSON.parse(readFileSync(join(ROOT, 'cors.json'), 'utf-8'));

await bucket.setCorsConfiguration(cors);
console.log('CORS configuration applied:', JSON.stringify(cors, null, 2));
