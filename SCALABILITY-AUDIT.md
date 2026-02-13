# SIAS2 Scalability Audit — 170 to 500+ Images

**Date:** 2025-02-13
**Current state:** 171 images, 221 KB metadata, 710 MB .git
**Target state:** 500+ images
**Last updated:** 2026-02-13

---

## RED — Will break or become unusable at 500+ images

### 1. ✅ FIXED — Cloud Functions: Full git clone in 10 functions (no sparse checkout)
Only `process5EFromQueue` used sparse checkout. The other 10 functions downloaded the **entire working tree** every time.

**Fix:** Extracted `sparseClone()` helper with `--filter=blob:none --sparse` and converted all 11 functions. Each function now only downloads the specific files it needs (e.g., `adminSaveImageOrder` only gets `gallery-metadata.json`).

**Files:** `functions/index.js` — `sparseClone()` helper + all clone sites

### 2. ✅ FIXED — Cloud Functions: Git push conflicts with no retry
Most functions that push to git had **no conflict retry logic**. Only `adminDeleteImage` had retry logic.

**Fix:** Extracted `pushWithRetry(repoGit, maxRetries = 2)` helper with fetch + rebase on conflict. Replaced all 9 bare `repoGit.push()` calls.

**Files:** `functions/index.js` — `pushWithRetry()` helper + all push sites

### 3. ✅ FIXED — Admin: Images grid renders ALL images with no pagination
`search-filter.js` built the entire grid in one shot — 500+ DOM cards with thumbnails all loading simultaneously.

**Fix:** Added `ADMIN_IMAGES_PER_PAGE = 48` with "Load More" button. Pagination resets on search, filter, or sort changes.

**Files:** `admin-v2/js/search-filter.js` — `loadMoreAdminImages()` + pagination state

### 4. ✅ FIXED — Admin: All tabs rendered eagerly on init
`app.js` rendered the images grid, cost table, content audit, AND overview all on page load.

**Fix:** Only Overview tab renders on load. Images, Costs, and Content Audit tabs lazy-render on first visit via `tabRendered` flags in `switchTab()`.

**Files:** `admin-v2/js/app.js` — `tabRendered` object + lazy checks in `switchTab()`

### 5. Admin: Reorder modal with SortableJS
SortableJS degrades noticeably above ~200-300 items. At 500+ draggable cards, the drag-and-drop will be laggy or unusable.

**Files:** `admin-v2/js/reorder-manager.js` — lines 92-107

### 6. Admin: Collection image picker renders all thumbnails
The featured collections picker loads ALL images as thumbnail cards in a modal. Same problem as the images grid — 500+ thumbnails loading at once.

**Files:** `admin-v2/js/collection-manager.js` — lines 117-146

### 7. ✅ FIXED — Admin: Bulk operations are purely sequential
Each bulk reprocess/delete calls a Cloud Function and waits for it to finish before moving to the next. At 30 seconds per image, 500 images = 4+ hours with the browser tab open.

**Fix:** Replaced sequential for-loop with batched concurrent processing using `Promise.allSettled()`. Processes 3 operations concurrently (`BULK_BATCH_SIZE = 3`). Progress updates after each batch instead of each individual operation.

**Files:** `admin-v2/js/bulk-operations.js` — `executeBulkOperation()`, `BULK_BATCH_SIZE`

---

## YELLOW — Will slow down noticeably

### 8. ✅ FIXED — Frontend: No search debounce
The gallery search fired `renderGallery()` on every keystroke — typing "butterfly" triggered 9 full DOM wipe-and-rebuild cycles. The admin search had the same issue.

**Fix:** Added `debounce()` utility to both `script.js` and `admin-v2/js/search-filter.js` with 250ms delay.

**Files:** `script.js`, `admin-v2/js/search-filter.js`

### 9. ✅ FIXED — Frontend: Full DOM wipe on every filter/search
`renderGallery()` does `innerHTML = ''` and rebuilds from scratch every time a filter changes. If a user has loaded 200+ cards via "Load More", they all get destroyed and rebuilt.

**Fix:** Replaced full innerHTML wipe with DOM reconciliation. Added `galleryItemCache` Map to cache created gallery items by image ID. On filter/search changes, removes non-matching cards, reuses cached cards, and only creates new nodes for images not already cached. Uses DocumentFragment for batch insertions.

**Files:** `script.js` — `galleryItemCache`, `renderGallery()` reconciliation logic

### 10. ✅ FIXED — Frontend: Legacy stats fallback is a time bomb
`ratings.js` has a `legacyLoadAllStats()` path that fires individual Firestore reads for every image if the aggregation document is missing. At 500 images = 1,000 sequential Firestore reads. The site would hang for ~100 seconds.

**Fix:** Replaced sequential per-image reads with 2 batch collection reads using `Promise.all()` on `db.collection('views').get()` and `db.collection('ratings').get()`. Builds viewsMap/ratingsMap from snapshots, then loops through images.

**Files:** `ratings.js` — `legacyLoadAllStats()` batch read pattern

### 11. ✅ FIXED — Service Worker: Unbounded PDF cache
PDFs were cached with `cacheFirst` and no eviction.

**Fix:** Added `CACHE_LIMITS` (PDF_CACHE: 150 entries) and `evictIfNeeded()` helper that trims oldest entries. Cache version bumped to v5.

**Files:** `sw.js` — `CACHE_LIMITS`, `evictIfNeeded()`

### 12. ✅ FIXED — Service Worker: Unbounded image cache
Same problem — no max size or LRU eviction on the image cache.

**Fix:** Added IMAGE_CACHE limit of 300 entries, using the same `evictIfNeeded()` helper.

**Files:** `sw.js` — `CACHE_LIMITS`, `evictIfNeeded()`

### 13. ✅ FIXED — Admin: Firestore collections read 3+ times per session
The `views` and `ratings` collections are read in full by `loadOverviewEngagement()`, `loadAnalytics()`, and the activity feed — same data, no shared cache.

**Fix:** Added `firestoreCache` object and `getCachedCollection()` helper in `app.js` with 5-minute TTL. Both `loadOverviewEngagement()` and `loadAnalytics()` now use the shared cache, reducing 4 collection reads to 2 per session.

**Files:** `admin-v2/js/app.js` — `firestoreCache`, `getCachedCollection()`; `admin-v2/js/analytics.js`

### 14. ✅ FIXED — Admin: Cost table and content audit accordion pre-render all hidden rows
Even though only 24 rows are visible, all 476+ hidden rows are fully rendered in the DOM inside the accordion.

**Fix:** Deferred accordion rendering — hidden data stored in module-level arrays (`deferredCostRows`, `deferredAuditItems`). Accordion body renders empty initially; rows render on first expand via `expandCostAccordion()` / `expandAuditAccordion()`.

**Files:** `admin-v2/js/processing-table.js` — `deferredCostRows`, `expandCostAccordion()`; `admin-v2/js/content-audit.js` — `deferredAuditItems`, `expandAuditAccordion()`

---

## GREEN — Fine at 500, worth noting for 1,000+

### 15. `gallery-metadata.json` file size
Currently 221 KB, projected ~650 KB at 500 images. Gzipped it's manageable (~80-120 KB), but every page load downloads the entire file with no delta/incremental updates.

**Files:** `script.js` — lines 222-233; `sw.js` — lines 111-114

### 16. In-memory content cache grows unbounded
`state.loadedContent` in `script.js` caches every educational content JSON opened during a session with no eviction. Unlikely to be a real problem unless someone opens hundreds of modals.

**Files:** `script.js` — line 11, lines 1291-1320

### 17. Brute-force filtering
Category/keyword filtering chains 5 `.filter()` calls over the full array. Even at 500 images with keyword arrays, this is sub-millisecond in modern JS.

**Files:** `script.js` — lines 429-471

### 18. `buildNgssIndex` reads one content file per image
Sequential file reads in Cloud Functions. At 500 images adds ~10-15 seconds but stays within timeout.

**Files:** `functions/index.js` — lines 221-311

---

## Recommended Priority Order

### ✅ Round 1 — All 6 priority items implemented (2026-02-13)

1. ~~**Add sparse checkout to all Cloud Functions**~~ — ✅ `sparseClone()` helper, 11 functions converted
2. ~~**Add git push retry/rebase logic**~~ — ✅ `pushWithRetry()` helper, 9 push sites converted
3. ~~**Add pagination to admin images grid**~~ — ✅ 48 per page with "Load More"
4. ~~**Lazy-render tabs**~~ — ✅ Only Overview renders on load
5. ~~**Add search debounce**~~ — ✅ 250ms debounce on public + admin
6. ~~**Add cache eviction to service worker**~~ — ✅ 300 image / 150 PDF entry limits

### ✅ Round 2 — 5 additional items implemented (2026-02-13)

7. ~~**Fix legacy stats fallback**~~ — ✅ Batch collection reads instead of per-image sequential
8. ~~**Concurrent bulk operations**~~ — ✅ `Promise.allSettled()` batches of 3
9. ~~**Shared Firestore cache**~~ — ✅ `getCachedCollection()` with 5-min TTL
10. ~~**Deferred accordion rendering**~~ — ✅ Lazy render on first accordion expand
11. ~~**DOM reconciliation for gallery**~~ — ✅ `galleryItemCache` + reconcile instead of wipe

### Remaining items (not yet addressed)

The following issues from this audit are still open and should be revisited as the image count grows:

- **#5 — SortableJS reorder modal** — may need virtualization at 300+ images
- **#6 — Collection image picker** — renders all thumbnails in modal
- **#15-18** — Green-tier items, fine until 1,000+ images
