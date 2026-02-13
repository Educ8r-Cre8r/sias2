# SIAS2 Scalability Audit — 170 to 500+ Images

**Date:** 2025-02-13
**Current state:** 171 images, 221 KB metadata, 710 MB .git
**Target state:** 500+ images

---

## RED — Will break or become unusable at 500+ images

### 1. Cloud Functions: Full git clone in 10 functions (no sparse checkout)
Only `process5EFromQueue` uses sparse checkout. The other 10 functions that clone the repo (`processImageFromQueue`, `adminDeleteImage`, `adminEditContent`, `adminUpdateHotspots`, `adminSaveImageOrder`, `adminSaveFeaturedCollections`, `adminUpdateImageMetadata`, plus 3 version-history functions) download the **entire working tree** every time — even when they only need `gallery-metadata.json` and maybe one content file. At 500+ images with ~16 JSON files each, that's 8,000+ files cloned. The 3 version-history functions use `--depth 50`, which is even worse. Clone times will approach or exceed function timeouts.

**Files:** `functions/index.js` — lines 529, 2408, 2799, 2894, 3542, 3918, 4003, 3290, 3351, 3411

### 2. Cloud Functions: Git push conflicts with no retry
Most functions that push to git have **no conflict retry logic**. If an admin edits content while `process5EFromQueue` is pushing, the second push fails silently. Only `adminDeleteImage` has retry logic. As usage grows, these collisions become more frequent.

**Files:** `functions/index.js` — all git push call sites except `adminDeleteImage` (lines 2494-2502)

### 3. Admin: Images grid renders ALL images with no pagination
`search-filter.js` builds the entire grid in one shot — 500+ DOM cards with thumbnails all loading simultaneously. The public-facing site has "Load More" pagination, but the admin dashboard doesn't.

**Files:** `admin-v2/js/search-filter.js` — lines 24-53

### 4. Admin: All tabs rendered eagerly on init
`app.js` renders the images grid, cost table, content audit, AND overview all on page load, even though you only see one tab. That's 4 full passes over 500+ images building hidden DOM trees.

**Files:** `admin-v2/js/app.js` — lines 37-40

### 5. Admin: Reorder modal with SortableJS
SortableJS degrades noticeably above ~200-300 items. At 500+ draggable cards, the drag-and-drop will be laggy or unusable.

**Files:** `admin-v2/js/reorder-manager.js` — lines 92-107

### 6. Admin: Collection image picker renders all thumbnails
The featured collections picker loads ALL images as thumbnail cards in a modal. Same problem as the images grid — 500+ thumbnails loading at once.

**Files:** `admin-v2/js/collection-manager.js` — lines 117-146

### 7. Admin: Bulk operations are purely sequential
Each bulk reprocess/delete calls a Cloud Function and waits for it to finish before moving to the next. At 30 seconds per image, 500 images = 4+ hours with the browser tab open.

**Files:** `admin-v2/js/bulk-operations.js` — lines 158-196

---

## YELLOW — Will slow down noticeably

### 8. Frontend: No search debounce
The gallery search fires `renderGallery()` on every keystroke — typing "butterfly" triggers 9 full DOM wipe-and-rebuild cycles. The admin search has the same issue.

**Files:** `script.js` — lines 137, 750-767; `admin-v2/js/search-filter.js` — line 119

### 9. Frontend: Full DOM wipe on every filter/search
`renderGallery()` does `innerHTML = ''` and rebuilds from scratch every time a filter changes. If a user has loaded 200+ cards via "Load More", they all get destroyed and rebuilt.

**Files:** `script.js` — line 478, lines 419-521

### 10. Frontend: Legacy stats fallback is a time bomb
`ratings.js` has a `legacyLoadAllStats()` path that fires individual Firestore reads for every image if the aggregation document is missing. At 500 images = 1,000 sequential Firestore reads. The site would hang for ~100 seconds.

**Files:** `ratings.js` — lines 532-540

### 11. Service Worker: Unbounded PDF cache
PDFs are cached with `cacheFirst` and no eviction. Each image has up to 8 PDFs at 200-400 KB each. Heavy teacher usage across hundreds of images could push the cache to 500 MB+, triggering browser-level cache eviction of your entire origin.

**Files:** `sw.js` — line 11, lines 103-107, lines 152-168

### 12. Service Worker: Unbounded image cache
Same problem — no max size or LRU eviction on the image cache. At 500+ images with 3 variants each, ~150 MB of cache.

**Files:** `sw.js` — line 10, lines 98-107, lines 152-168

### 13. Admin: Firestore collections read 3+ times per session
The `views` and `ratings` collections are read in full by `loadOverviewEngagement()`, `loadAnalytics()`, and the activity feed — same data, no shared cache.

**Files:** `admin-v2/js/app.js` — lines 217-220; `admin-v2/js/analytics.js` — lines 20-22

### 14. Admin: Cost table and content audit accordion pre-render all hidden rows
Even though only 24 rows are visible, all 476+ hidden rows are fully rendered in the DOM inside the accordion.

**Files:** `admin-v2/js/processing-table.js` — lines 132-163; `admin-v2/js/content-audit.js` — lines 136-175

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

If fixing before growing significantly:

1. **Add sparse checkout to all Cloud Functions** — biggest bang for buck, prevents timeout failures
2. **Add git push retry/rebase logic** to all functions that push — prevents silent data loss
3. **Add pagination to admin images grid** — easy win, mirrors what the public site already has
4. **Lazy-render tabs** — only build a tab's DOM when the user clicks on it
5. **Add search debounce** (both public + admin) — trivial fix, big UX improvement
6. **Add cache eviction to service worker** — cap image cache at ~200 entries, PDF cache at ~100

Items 1-2 are critical infrastructure. Items 3-6 are straightforward UI fixes. None require major architectural changes — they're all incremental improvements to existing patterns.
