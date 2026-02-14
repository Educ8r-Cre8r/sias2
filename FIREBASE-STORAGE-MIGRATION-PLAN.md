# Migrate Binary Files (Images + PDFs) to Firebase Storage

## Context

The GitHub repo is **1.2 GB** (699 MB in `.git` alone) because all images and PDFs are tracked in git. Every new image adds ~20 binary files. At the target of hundreds of images, the repo would exceed GitHub's 5 GB hard limit and Cloud Function clones would become unworkable. Firebase Storage is the right home for binary assets — it's essentially free at this scale, serves through Google's CDN, and integrates natively with the existing Cloud Functions.

**Complexity: 6/10** — each change is simple, but there are ~12 files to touch across 5 phases.

**What moves:** Images (133 MB, 684 files) + PDFs (241 MB, 1185+ files) + 5E PDFs (growing)
**What stays:** gallery-metadata.json, content JSONs, hotspot JSONs, app code, Cloud Functions

---

## Approach: Feature-Flagged URL Resolver

`gallery-metadata.json` keeps storing relative paths (`images/life-science/bee.jpg`). A new `resolveAssetUrl()` function in the client converts these to Firebase Storage public URLs when enabled. This means:
- No mass-rewrite of metadata
- Instant rollback by flipping the flag to `false`
- Files stay on Hosting as fallback until we're confident

---

## Phase 1: Infrastructure (flag OFF — no files move yet)

**Risk: Low.** The flag stays OFF so nothing changes for users. Safe to deploy.

### 1A. `script.js` — Add resolver function (~line 19)

```js
const STORAGE_BUCKET = 'sias-8178a.firebasestorage.app';
const STORAGE_ENABLED = false; // flip after migration

function resolveAssetUrl(relativePath) {
  if (!relativePath) return '';
  if (STORAGE_ENABLED && (
    relativePath.startsWith('images/') ||
    relativePath.startsWith('pdfs/') ||
    relativePath.startsWith('5e_lessons/')
  )) {
    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(relativePath)}?alt=media`;
  }
  return relativePath;
}
```

### 1B. `script.js` — Wrap all binary asset references with `resolveAssetUrl()`

| Location | ~Line | Current | Wrapped |
|----------|-------|---------|---------|
| Gallery card background | 604 | `image.placeholderPath \|\| image.imagePath` | `resolveAssetUrl(image.placeholderPath \|\| image.imagePath)` |
| WebP source srcset | 612 | `image.webpPath` | `resolveAssetUrl(image.webpPath)` |
| Thumbnail img src | 614 | `image.thumbPath \|\| image.imagePath` | `resolveAssetUrl(image.thumbPath \|\| image.imagePath)` |
| Onerror fallback | 620 | `image.imagePath` | `resolveAssetUrl(image.imagePath)` |
| Modal open (full image) | 658 | `image.imagePath` | `resolveAssetUrl(image.imagePath)` |
| Modal thumbnail | 1064 | `image.imagePath` | `resolveAssetUrl(image.imagePath)` |
| Recommendation thumbs | 945 | `img.thumbPath \|\| img.imagePath` | `resolveAssetUrl(img.thumbPath \|\| img.imagePath)` |
| Lesson PDF download | 1174 | `pdfPath` | `resolveAssetUrl(pdfPath)` |
| EDP PDF download | 1191 | `edpPath` | `resolveAssetUrl(edpPath)` |
| 5E PDF download | 1209 | `fiveEPath` | `resolveAssetUrl(fiveEPath)` |

### 1C. `admin-v2/js/app.js` — Add same resolver for admin dashboard

Same `resolveAssetUrl()` function. Update image src references in:
- `admin-v2/js/image-detail.js` (lines 70-71)
- `admin-v2/js/hotspot-editor.js` (lines 85, 87)
- `admin-v2/js/delete-manager.js` (line 31)
- `admin-v2/js/search-filter.js` (line 26)

The admin resolver needs `../` prefix fallback for hosting mode since admin-v2 is in a subdirectory.

### 1D. `storage.rules` — Add public read for gallery assets

Add these rules inside `match /b/{bucket}/o`:
```
// Public read for gallery assets served from Storage
match /images/{allPaths=**} { allow read; }
match /pdfs/{allPaths=**} { allow read; }
match /5e_lessons/{allPaths=**} { allow read; }
```
Keep existing auth-gated rules for `/uploads/`, `/processed/`, `/failed/`.

### 1E. `sw.js` — Route Storage URLs to cache strategies

Add **before** existing routing logic (before line ~97):
```js
// Firebase Storage assets → same cache strategy as local files
if (request.url.includes('firebasestorage.googleapis.com') && request.url.includes('sias-8178a')) {
  if (request.url.includes(encodeURIComponent('images/'))) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }
  if (request.url.includes(encodeURIComponent('pdfs/')) ||
      request.url.includes(encodeURIComponent('5e_lessons/'))) {
    event.respondWith(cacheFirst(request, PDF_CACHE));
    return;
  }
}
```
Also bump `CACHE_VERSION` from `'v3'` to `'v4'` to force cache refresh.

### 1F. `firebase.json` — Add hosting redirects for old bookmarked URLs

Add `"redirects"` array before `"rewrites"` in the hosting config:
```json
"redirects": [
  { "source": "/images/**", "destination": "https://firebasestorage.googleapis.com/v0/b/sias-8178a.firebasestorage.app/o/images%2F:splat?alt=media", "type": 302 },
  { "source": "/pdfs/**", "destination": "https://firebasestorage.googleapis.com/v0/b/sias-8178a.firebasestorage.app/o/pdfs%2F:splat?alt=media", "type": 302 },
  { "source": "/5e_lessons/**", "destination": "https://firebasestorage.googleapis.com/v0/b/sias-8178a.firebasestorage.app/o/5e_lessons%2F:splat?alt=media", "type": 302 }
]
```
⚠️ **Note:** Filenames with spaces (e.g., `deer camouflage.jpg`) may not URL-encode properly through Firebase Hosting redirects. Test before enabling. If needed, use a lightweight Cloud Function redirect instead.

**Phase 1 redirects should be DEFERRED** — only activate them in Phase 5 when files are removed from Hosting. While files still exist on Hosting, the redirects would intercept them unnecessarily.

---

## Phase 2: Upload Existing Files to Storage

**Risk: Low.** Uploading to Storage doesn't affect the live site. Run from your local computer.

### 2A. Create `tools/migrate-to-storage.js`

Node.js script that:
1. Reads `gallery-metadata.json`
2. For each of the 158 images, uploads:
   - 4 image variants (original, thumb, webp, placeholder) → `images/{category}/...`
   - 6 grade-level lesson PDFs → `pdfs/{category}/{nameNoExt}-{grade}.pdf`
   - 1 EDP PDF → `pdfs/{category}/{nameNoExt}-edp.pdf`
   - 6 5E lesson PDFs (if they exist) → `5e_lessons/{category}/{nameNoExt}-{grade}.pdf`
3. Sets metadata on each upload:
   - `contentType`: appropriate MIME type (image/jpeg, image/webp, application/pdf)
   - `cacheControl`: `'public, max-age=31536000'` (1 year — filenames don't change)
4. Skips files that already exist in Storage (idempotent re-runs)
5. Logs progress and any failures

### 2B. Run migration from your local machine

```bash
cd /Users/alexjones/Documents/sias2/sias2
node tools/migrate-to-storage.js
```
Uses Firebase Admin SDK with your local credentials. ~374 MB upload, takes ~10-20 min.

### 2C. CORS configuration

Create `cors.json` in project root:
```json
[{
  "origin": ["https://sias-8178a.web.app", "https://sias-8178a.firebaseapp.com", "http://localhost:5000"],
  "method": ["GET"],
  "maxAgeSeconds": 86400
}]
```
Apply: `gsutil cors set cors.json gs://sias-8178a.firebasestorage.app`

### 2D. Verify

- Spot-check several Storage URLs in browser (images load, PDFs download)
- Run `adminAuditStorage` from admin dashboard (it already checks these path prefixes)

---

## Phase 3: Flip the Flag

**Risk: Medium.** This changes what users see. But rollback is instant (set flag to `false`).

### 3A. Set `STORAGE_ENABLED = true`

In `script.js` and `admin-v2/js/app.js`.

### 3B. Deploy and monitor

```bash
firebase deploy --only hosting
```

- Check that all gallery images load correctly
- Check that PDF downloads work (lesson guides, EDP, 5E)
- Check admin dashboard image display
- Check service worker caching (DevTools → Application → Cache Storage)
- Test on mobile

If anything breaks, set `STORAGE_ENABLED = false` and redeploy. Files still exist on Hosting as fallback.

---

## Phase 4: Refactor Cloud Functions to Write Binaries to Storage

**Risk: High.** Most complex phase — changes how the entire pipeline works. Test thoroughly.

### 4A. `processImageFromQueue` (functions/index.js, ~line 411)

**Current flow:** Generate image variants + PDFs → write all files to cloned repo → git commit + push
**New flow:** Generate image variants + PDFs → **upload binaries to Storage via Admin SDK** → clone repo (sparse checkout, JSON-only) → write only JSON files (content, hotspots, metadata) to repo → git commit + push

Key change: Instead of `fs.copyFileSync(thumb, path.join(repoDir, thumbPath))`, do:
```js
await bucket.upload(thumbLocalPath, {
  destination: `images/${category}/thumbs/${filename}`,
  metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' }
});
```

The sparse checkout becomes even simpler — only need `gallery-metadata.json`, `content/{category}/`, `hotspots/{category}/`, and `ngss-index.json`.

### 4B. `process5EFromQueue` (functions/index.js, ~line 740)

Same pattern: generate 5E PDFs in `/tmp` → upload to Storage → commit only 5E content JSONs and metadata to git.

### 4C. `adminDeleteImage` (functions/index.js, ~line 2027)

Add Storage deletion for each binary file:
```js
const bucket = admin.storage().bucket();
for (const storagePath of binaryFilePaths) {
  try { await bucket.file(storagePath).delete(); } catch (e) { /* may not exist */ }
}
```
Keep git deletion for JSON files.

### 4D. `adminEditContent` (functions/index.js, ~line 2462)

When regenerating a PDF after content edit, upload the new PDF to Storage instead of committing to git:
```js
await bucket.file(`pdfs/${category}/${nameNoExt}-${suffix}.pdf`).save(pdfBuffer, {
  metadata: { contentType: 'application/pdf', cacheControl: 'public, max-age=31536000' }
});
```

### 4E. `adminReprocessImage` (functions/index.js, ~line 2288)

Download source image from Storage (`bucket.file(image.imagePath).download()`) instead of Hosting URL.

---

## Phase 5: Git Cleanup

**Risk: High (irreversible).** Only do this after confirming everything works from Storage.

### 5A. Add to `.gitignore`

```
# Binary assets now served from Firebase Storage
images/
pdfs/
5e_lessons/
```

### 5B. Remove from git tracking

```bash
git rm -r --cached images/ pdfs/ 5e_lessons/
git commit -m "Remove binary files from git tracking (now served from Firebase Storage)"
git push origin main
```

This removes the files from the working tree's git index but **doesn't delete them from disk**. The repo's current commit will no longer include them.

### 5C. Enable hosting redirects

Now activate the redirect rules from Phase 1F in `firebase.json` so any old bookmarked URLs redirect to Storage.

### 5D. (Optional) Purge git history

To shrink `.git/` from 699 MB:
```bash
pip install git-filter-repo
git filter-repo --path images/ --path pdfs/ --path 5e_lessons/ --invert-paths
git push --force-with-lease origin main
```
⚠️ This **rewrites all commit history**. All collaborators must re-clone. The Cloud Functions' git clones are ephemeral so they're unaffected.

---

## Files Modified (Complete Summary)

| File | Phase | Change |
|------|-------|--------|
| `script.js` | 1 | Add `resolveAssetUrl()`, wrap ~10 binary URL references |
| `admin-v2/js/app.js` | 1 | Add admin `resolveAssetUrl()` |
| `admin-v2/js/image-detail.js` | 1 | Use resolver for image src |
| `admin-v2/js/hotspot-editor.js` | 1 | Use resolver for editor image |
| `admin-v2/js/delete-manager.js` | 1 | Use resolver for thumbnail |
| `admin-v2/js/search-filter.js` | 1 | Use resolver for search thumbs |
| `storage.rules` | 1 | Add public read for `images/`, `pdfs/`, `5e_lessons/` |
| `sw.js` | 1 | Add Storage URL routing, bump cache version to v4 |
| `firebase.json` | 1+5 | Prepare redirect rules (activate in Phase 5) |
| `tools/migrate-to-storage.js` | 2 | **New file** — migration upload script |
| `cors.json` | 2 | **New file** — CORS config for Storage bucket |
| `functions/index.js` | 4 | Refactor 5 functions to upload binaries to Storage |
| `.gitignore` | 5 | Exclude `images/`, `pdfs/`, `5e_lessons/` |

---

## Verification Checklist

- [ ] **Phase 1 (flag OFF):** Deploy → site works identically (all paths still resolve to Hosting)
- [ ] **Phase 2:** Run migration script → files accessible at Storage URLs in browser
- [ ] **Phase 2:** CORS configured → no cross-origin errors in DevTools console
- [ ] **Phase 3 (flag ON):** All gallery images load, all PDFs download, admin dashboard works
- [ ] **Phase 3:** Service worker caches Storage URLs correctly (check DevTools → Application)
- [ ] **Phase 3:** Mobile tested — images and PDFs work
- [ ] **Phase 4:** Upload a new test image → image/PDFs land in Storage, JSONs land in git
- [ ] **Phase 4:** Delete a test image → files removed from both Storage and git
- [ ] **Phase 5:** After git cleanup → `du -sh .git` shows < 50 MB, repo total < 150 MB

---

## Recommended Session Breakdown

| Session | Phases | Time Estimate |
|---------|--------|---------------|
| Session 1 | Phase 1 (infrastructure) | ~30 min |
| Session 2 | Phase 2 (upload files) + Phase 3 (flip flag) | ~45 min |
| Session 3 | Phase 4 (refactor Cloud Functions) | ~60-90 min |
| Session 4 | Phase 5 (git cleanup) | ~15 min |
