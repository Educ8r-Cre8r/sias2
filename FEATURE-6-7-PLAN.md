# Feature 6: Image Reordering & Featured Collections + Feature 7: Health Checks

## Context
The SIAS gallery currently renders images in insertion order with no admin control over display sequence. The featured collection is hardcoded to filter by the keyword "pollination". These features add drag-and-drop reorder control, multiple named featured collections, and automated health monitoring.
## Implementation Order

1. **Feature 7: Health Checks** (simpler, self-contained) — Complexity 5/10
2. **Feature 6: Image Reordering & Collections** (more files, touches main site) — Complexity 4/10

---

## Feature 7: Dashboard Health Checks

**Goal:** Automated health checks that run periodically, store results in Firestore, and display in the admin Overview tab. Dashboard-only (no email alerts).

### Health Checks

| # | Check | What it does | Status logic |
|---|-------|-------------|--------------|
| 1 | **Metadata Integrity** | Validates `gallery-metadata.json`: valid JSON, all images have required fields (`id`, `filename`, `category`, `title`), no duplicate IDs | pass/fail |
| 2 | **Storage Spot-Check** | HEAD-requests 10 random images' source files in Firebase Storage to confirm they exist | pass if all exist, warn if any missing |
| 3 | **Queue Health** | Checks for stuck items (processing >15 min) and unretried failures | pass/warn/fail |
| 4 | **Firestore Consistency** | Verifies `ratings` and `views` docs exist for all image IDs in metadata | pass/warn |
| 5 | **Content Completeness** | Checks each image has its base content JSON (`content/{category}/{nameNoExt}.json`) in the repo | pass/warn |

### Firestore Data Model

**Collection: `healthChecks/{autoId}`**
```json
{
  "timestamp": serverTimestamp,
  "checks": [
    { "name": "Metadata Integrity", "status": "pass", "message": "All 158 images valid", "details": [] },
    { "name": "Queue Health", "status": "warn", "message": "1 stuck item", "details": ["image_xyz.jpg: 45min"] }
  ],
  "overallStatus": "pass" | "warn" | "fail",
  "duration": 2340
}
```

### Cloud Functions — `functions/index.js`

**`runHealthChecks`** (scheduled, every 6 hours via `pubsub.schedule`):
- Runs all 5 checks sequentially, writes results to `healthChecks`
- Cleans up docs older than 30 days
- Pattern: reuse existing `verifyAdmin` for callable, scheduled runs without auth

**`adminRunHealthCheck`** (callable, admin-only):
- Same logic, triggered on-demand from dashboard
- Returns results directly AND writes to Firestore

### Admin Dashboard

**New file: `admin-v2/js/health-checks.js`**
- `loadHealthStatus()` — fetches latest `healthChecks` doc (ordered by timestamp desc, limit 1)
- `renderHealthPanel(result)` — renders in Overview tab, replacing/augmenting current `#system-health-content`:
  - Overall status dot (green/yellow/red) + "Last checked: X ago"
  - Each check as a row: status icon + name + message
  - Expandable details for checks with issues
  - "Run Now" button → calls `adminRunHealthCheck`, shows spinner, re-renders on completion
- `renderHealthHistory()` — last 5 results as mini status dots (click to expand)

**`admin-v2/index.html`**:
- Add `<script src="js/health-checks.js"></script>`
- Add "Run Health Check" button in system health card header

**`admin-v2/js/app.js`**:
- In `initDashboard()`: call `loadHealthStatus()` if function exists

**`admin-v2/css/admin-dashboard.css`**:
- `.health-check-item` — flex row: 12px status dot + name + message
- `.health-status-pass` (green), `.health-status-warn` (amber), `.health-status-fail` (red)
- `.health-details` — collapsible details list, muted text

**`firestore.rules`**:
```
match /healthChecks/{checkId} {
  allow read: if request.auth != null
    && request.auth.token.email == 'mr.alexdjones@gmail.com';
  allow write: if false;
}
```

### Verification
- Deploy Cloud Functions → verify `runHealthChecks` appears in Firebase Console scheduled functions
- Open admin dashboard → click "Run Now" → verify all 5 checks run and results display
- Manually break something (e.g. delete a Storage file) → run check → verify it detects the issue as a warning
- Verify old check results are cleaned up after 30 days

---

## Feature 6: Image Reordering & Featured Collections

**Goal:** Drag-and-drop reorder control for gallery display order + multiple named featured collections replacing the hardcoded "pollination" keyword filter.

### Data Model Changes — `gallery-metadata.json`

New top-level fields added alongside existing `images` array:

```json
{
  "imageOrder": [1, 2, 3, ...],
  "featuredCollections": [
    {
      "id": "pollination",
      "name": "Pollination",
      "emoji": "💡",
      "imageIds": [42, 87, 103, 15],
      "active": true
    }
  ],
  "images": [...]
}
```

- **`imageOrder`**: Array of image IDs defining display sequence. If missing/empty, falls back to array order (backward compatible). Includes ALL image IDs.
- **`featuredCollections`**: Array of collection objects. Only one can have `active: true` at a time — that one shows on the main site. Admins can create/edit/delete collections and switch which is active.
- **Migration on first deploy**: Seed `imageOrder` with current ID order, seed `featuredCollections` with one entry containing images that have the "pollination" keyword.

### Cloud Functions — `functions/index.js`

**`adminSaveImageOrder`** (callable, memory 1GB, timeout 120s):
- Input: `{ imageOrder: number[] }`
- Validates: all IDs present, no duplicates, length matches image count, admin auth
- Clones repo → reads `gallery-metadata.json` → sets `imageOrder` field → commits "Update image display order" → pushes
- Returns: `{ success: true }`

**`adminSaveFeaturedCollections`** (callable, memory 1GB, timeout 120s):
- Input: `{ collections: [{ id, name, emoji, imageIds, active }] }`
- Validates: at most one `active: true`, all `imageIds` exist in metadata, admin auth
- Clones repo → reads `gallery-metadata.json` → sets `featuredCollections` field → commits "Update featured collections" → pushes
- Returns: `{ success: true }`

### Admin Dashboard — Reorder UI

**New file: `admin-v2/js/reorder-manager.js`**

- **`openReorderModal()`** — opens full-screen modal
  - Loads SortableJS from CDN (lazy-load on first open): `https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js`
  - Renders compact image cards in a CSS grid: small thumbnail (60px) + title + category badge + drag handle icon
  - SortableJS `Sortable.create()` on the grid container with `animation: 150`, `handle: '.drag-handle'`
  - Category filter pills at top (All / Life Science / Earth & Space / Physical Science) to filter view — but drag-drop still affects global order
  - "Reset to Original Order" button — sorts by ascending `id` field
  - "Save Order" button — extracts ID array from DOM order, calls `adminSaveImageOrder`
  - After save: updates `metadataManager` locally with new `imageOrder`, shows success toast, closes modal

**`admin-v2/index.html`**:
- Add SortableJS CDN: `<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js" defer></script>`
- Add `<script src="js/reorder-manager.js"></script>`
- Add `<script src="js/collection-manager.js"></script>`
- Reorder modal markup:
  ```html
  <div id="reorder-modal" class="modal-overlay" style="display:none">
    <div class="modal-content modal-fullscreen">
      <div class="modal-header">
        <h2>Reorder Images</h2>
        <div><!-- filter pills + Reset + Save + Close buttons --></div>
      </div>
      <div id="reorder-grid" class="reorder-grid"></div>
    </div>
  </div>
  ```
- Collections modal markup (similar structure, described below)
- Add "Reorder Images" and "Featured Collections" buttons to Images tab toolbar (next to existing filter/search controls)

### Admin Dashboard — Collections Manager

**New file: `admin-v2/js/collection-manager.js`**

- **`openCollectionsModal()`** — opens modal showing all collections
  - Collection list: each row = emoji + name + image count badge + "Active" toggle + "Edit" + "Delete" buttons
  - "New Collection" button at top
- **`editCollection(collectionId)`** — inline or sub-modal form:
  - Text input: Name (e.g., "Pollination")
  - Text input: Emoji (single character, e.g., "💡")
  - Image picker grid: all images as small checkboxable thumbnails with search filter
  - Selected images highlighted with checkmark overlay
  - "Save" saves locally to a working array
- **`setActiveCollection(collectionId)`** — toggles `active` flag (deactivates others)
- **`deleteCollection(collectionId)`** — removes from working array (with confirmation)
- **`saveAllCollections()`** — calls `adminSaveFeaturedCollections` with the full working array
  - After save: updates `metadataManager` locally, shows success toast

**Collections modal markup in `admin-v2/index.html`**:
```html
<div id="collections-modal" class="modal-overlay" style="display:none">
  <div class="modal-content modal-large">
    <div class="modal-header">
      <h2>Featured Collections</h2>
      <div><!-- New Collection + Save + Close buttons --></div>
    </div>
    <div id="collections-list"></div>
    <div id="collection-editor" style="display:none">
      <!-- name, emoji inputs + image picker grid -->
    </div>
  </div>
</div>
```

### Main Site Changes — `script.js`

**Sorting by `imageOrder`** (in `renderGallery()`, after filtering):
```js
if (state.galleryData.imageOrder && state.galleryData.imageOrder.length > 0) {
    const orderMap = {};
    state.galleryData.imageOrder.forEach((id, idx) => { orderMap[id] = idx; });
    filteredImages.sort((a, b) => (orderMap[a.id] ?? 9999) - (orderMap[b.id] ?? 9999));
}
```

**Dynamic featured collections** (replacing hardcoded "pollination"):
- `toggleFeaturedFilter()`: Find active collection from `state.galleryData.featuredCollections`, build a Set of `imageIds`, filter by set membership instead of keyword
- `updateFeaturedBadge()`: Count from active collection's `imageIds` array instead of keyword match
- On gallery load, dynamically set featured button label + emoji:
  ```js
  const active = (state.galleryData.featuredCollections || []).find(c => c.active);
  if (active) {
      document.querySelector('.featured-label').textContent = `Featured Collection - ${active.name}`;
      document.querySelector('.featured-icon-emoji').textContent = active.emoji;
      // show button
  } else {
      // hide featured button entirely
  }
  ```
- URL state: simplify from `featured=pollination` to `featured=true`

**`index.html`** (main site): No HTML changes needed — button text/emoji updated dynamically.

### CSS Changes — `admin-v2/css/admin-dashboard.css`

```css
/* Reorder */
.reorder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 16px; overflow-y: auto; }
.reorder-card { display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 6px; cursor: grab; }
.reorder-card.sortable-ghost { opacity: 0.4; background: var(--primary-light); }
.reorder-card img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; }
.drag-handle { color: var(--text-muted); cursor: grab; }
.modal-fullscreen { width: 95vw; height: 90vh; max-width: none; display: flex; flex-direction: column; }

/* Collections */
.collection-row { display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border-light); }
.collection-image-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 6px; max-height: 300px; overflow-y: auto; }
.collection-image-picker .picker-item { position: relative; cursor: pointer; border: 2px solid transparent; border-radius: 4px; }
.collection-image-picker .picker-item.selected { border-color: var(--primary); }
```

### Migration Strategy

On first implementation, I'll manually seed the initial data:
1. Read current `gallery-metadata.json`, extract `images.map(img => img.id)` → set as `imageOrder`
2. Find all images with keyword "pollination" → create initial `featuredCollections` entry with those IDs
3. Commit this as part of the deployment

### Verification
- Open admin Images tab → click "Reorder Images" → verify drag-and-drop works
- Drag images to new positions → click "Save Order" → reload main site → verify new order
- Click "Reset to Original" → save → verify images return to ID-ascending order
- Open "Featured Collections" → verify "Pollination" collection exists with correct images
- Create a new collection "Insects" → pick 5 images → set as active → save
- Reload main site → verify featured button now says "Featured Collection - Insects" with correct emoji
- Click featured filter → verify only selected images show
- Deactivate all collections → reload main site → verify featured button is hidden

---

## Summary of All File Changes

| File | Feature | Action |
|------|---------|--------|
| `functions/index.js` | 6, 7 | 4 new Cloud Functions (2 callable + 1 scheduled + 1 callable) |
| `firestore.rules` | 7 | New `healthChecks` collection rule |
| `gallery-metadata.json` | 6 | New `imageOrder` + `featuredCollections` fields |
| `script.js` | 6 | Sort by order, dynamic featured collections |
| `admin-v2/index.html` | 6, 7 | Modals, buttons, script tags |
| `admin-v2/css/admin-dashboard.css` | 6, 7 | Reorder grid, collection picker, health check styles |
| `admin-v2/js/reorder-manager.js` | 6 | **New file** — drag-and-drop reorder |
| `admin-v2/js/collection-manager.js` | 6 | **New file** — featured collections |
| `admin-v2/js/health-checks.js` | 7 | **New file** — health check display |
| `admin-v2/js/app.js` | 7 | Call `loadHealthStatus()` on init |
