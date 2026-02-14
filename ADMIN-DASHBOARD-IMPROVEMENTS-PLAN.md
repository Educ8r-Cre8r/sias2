# Admin Dashboard Improvements — Features 1, 2, 3, 5

## Context
The SIAS admin dashboard (`/admin-v2/`) is feature-rich but has gaps in bulk workflow efficiency, content safety nets, analytics depth, and comment moderation automation. These 4 features address the highest-value improvements identified during a full codebase review. (Feature 4 / GA4 skipped for now.)

## Implementation Order
Ordered by dependency chain and value delivery (quick wins first):

1. **Feature 5: Comment Spam Strategy** (Complexity 3) — self-contained, reduces manual work
2. **Feature 1: Bulk Operations Enhancement** (Complexity 4) — improves existing workflows
3. **Feature 3: Time-Series Analytics** (Complexity 5) — schema change, forward-looking data
4. **Feature 2: Content Version History** (Complexity 6) — new Cloud Functions with git ops

---

## Feature 5: Comment Spam Strategy

**Goal:** Auto-approve trusted users, flag suspicious comments, reduce manual moderation.

### Firestore changes
- New collection: `trustedUsers/{userId}` — fields: `userId`, `displayName`, `trustedAt`, `approvedCommentCount`, `addedBy` ('auto' | 'admin')
- New comment fields: `autoApproveReason` (string), `flagReason` (string), `rejectReason` (string)
- New comment status values: `'flagged'` and `'rejected'` (alongside existing `'pending'` and `'approved'`)

### Files to modify

**`functions/index.js`** — Modify `onCommentCreated` trigger:
- Add helper `evaluateComment(comment)` returning `{ action, reason }`:
  - **Profanity check** → `reject` (auto-reject, never shown). Uses a built-in word list array in the Cloud Function. Checks against word boundaries to avoid false positives (e.g. "class" won't match "ass"). Sets `status: 'rejected'`, `rejectReason` field. No email sent for rejected comments.
  - Check `trustedUsers/{userId}` doc exists → `auto-approve`
  - Check URL patterns (`https?://`, `www.`, `bit.ly`, etc.) → `flag`
  - Check repetitive text (same text submitted 3+ times) → `flag`
  - Check all-caps, <5 chars → `flag`
  - Server-side re-validate length ≤500
  - Default → `pending` (existing behavior)
- Auto-trust promotion: if user has ≥3 approved comments, add to `trustedUsers` automatically
- If flagged, send email with `[FLAGGED]` subject prefix

**`admin-v2/js/comment-moderation.js`**:
- In `loadComments()`: also fetch `trustedUsers` collection to build a Set of trusted user IDs
- In `renderCommentsList()`: add green "Trusted" badge next to trusted usernames
- Add "Trust User" button next to Approve button
- New function `trustUser(userId, displayName)` → writes to `trustedUsers/{userId}`
- Update filter logic to handle `'flagged'` and `'rejected'` statuses

**`admin-v2/index.html`**:
- Add `<button class="pill" data-filter="flagged">Flagged</button>` and `<button class="pill" data-filter="rejected">Rejected</button>` to `#comment-filter-pills`

**`firestore.rules`**:
- Add `trustedUsers` collection: admin read/write only

### Verification
- Submit comment from new user → goes to `pending`
- Approve 3 comments from same user → user auto-added to `trustedUsers`
- Submit comment from trusted user → auto-approved, `autoApproveReason` set
- Submit comment with profanity → auto-rejected, no email sent, `rejectReason` set
- Submit comment with URL in text → status = `flagged`, admin email says `[FLAGGED]`
- Admin clicks "Trust User" → user appears in `trustedUsers`, future comments auto-approved
- "Flagged" and "Rejected" filter pills work in admin comments tab

---

## Feature 1: Bulk Operations Enhancement

**Goal:** Add progress UI, cancel capability, confirmation modals, and filter-based bulk actions.

### Files to create
- `admin-v2/js/bulk-operations.js` — centralized bulk operation logic

### Files to modify

**`admin-v2/js/bulk-operations.js`** (new):
- State: `bulkOpState = { active, type, imageIds[], completed, failed, cancelled }`
- `showBulkConfirmModal(type, imageIds)` — renders confirmation with count, action type, image list preview
- `executeBulkOperation(type, imageIds)` — loops calling appropriate Cloud Function, updates progress bar, checks cancelled flag before each iteration
- `cancelBulkOperation()` — sets `cancelled = true`
- `renderBulkProgress()` — reuses existing `.upload-progress-track` / `.upload-progress-bar` CSS classes
- `handleBulkFilterAction(action)` — dispatches category-based bulk actions
- `bulkReprocessByCategory(category)` — gets IDs from `metadataManager`, calls `showBulkConfirmModal`

**`admin-v2/index.html`**:
- Add bulk operation modal after existing delete modal (~line 583):
  ```
  #bulk-op-modal with #bulk-op-modal-title, #bulk-op-modal-body
  ```
- Update bulk bar (~line 291) to add "More Actions..." dropdown select with option:
  - "Reprocess Current Category"
- Add `<script src="js/bulk-operations.js"></script>`

**`admin-v2/js/reprocess-manager.js`**:
- `bulkReprocess()` → now calls `showBulkConfirmModal('reprocess', getSelectedImageIds())` instead of browser `confirm()`
- Single `reprocessImage()` → replace browser `confirm()` with proper confirmation modal

**`admin-v2/js/delete-manager.js`**:
- `bulkDelete()` → now calls `showBulkConfirmModal('delete', getSelectedImageIds())` instead of browser `confirm()`
- Note: single image delete already uses proper `#delete-modal` — no change needed

**Rule: All destructive/irreversible actions must use a styled confirmation modal, never browser `confirm()`.**

**`admin-v2/css/admin-dashboard.css`**:
- `.bulk-progress-section`, `.bulk-op-summary`, `.bulk-op-image-list` (max-height scroll)

### No Cloud Function changes
- Sequential client-side calls to existing `adminReprocessImage` / `adminDeleteImage` are adequate for 158 images
- A server-side batch function is not needed at this scale

### Verification
- Select 3 images → click "Re-process Selected" → modal shows with count and image names
- Start operation → progress bar updates after each image completes
- Cancel mid-operation → remaining items skipped, summary shows partial results
- Filter to "Life Science" → "More Actions" → "Reprocess Current Category" → modal shows all life-science image count
- Bulk delete with progress works identically

---

## Feature 3: Time-Series Analytics

**Goal:** Record timestamped view events, aggregate daily stats, display trend charts.

### Firestore changes
- New collection: `viewEvents/{autoId}` — fields: `photoId` (string), `timestamp`, `userId` (nullable), `sessionId` (string)
- New collection: `dailyStats/{YYYY-MM-DD}` — fields: `date`, `totalViews`, `uniqueUsers`, `perImage` (map), `newRatings`, `newComments`

### Files to modify

**`ratings.js`** (main site):
- In `recordPhotoView()` (~line 17): after existing view count increment, also write to `viewEvents`:
  ```js
  db.collection('viewEvents').add({
    photoId: String(photoId),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    userId: getCurrentUserId() || null,
    sessionId: getOrCreateSessionId()  // sessionStorage-based
  })
  ```
- Add helper `getOrCreateSessionId()` using `sessionStorage`

**`functions/index.js`**:
- New scheduled function `aggregateTimeSeries` (every 24 hours):
  - Reads yesterday's `viewEvents`, counts per-image views, unique users
  - Reads yesterday's `userRatings` (by timestamp), counts new ratings
  - Reads yesterday's `comments` (by timestamp), counts new comments
  - Writes aggregated doc to `dailyStats/{YYYY-MM-DD}`
- New callable function `adminGetTimeSeries(data: { period: 'week'|'month'|'3months' })`:
  - Reads `dailyStats` docs for the requested period, returns array

**`admin-v2/index.html`**:
- Add Chart.js CDN script tag
- Add "Engagement Trends" card in `#tab-analytics` before "Most Viewed" table:
  - Period pills: 7 Days / 30 Days / 90 Days
  - `<canvas id="trend-chart">` for Chart.js line chart
  - Note about when tracking started (can't backfill)

**`admin-v2/js/analytics.js`**:
- New function `loadTimeSeries(period)`:
  - Calls `adminGetTimeSeries` Cloud Function
  - Renders Chart.js line chart with views, ratings, comments as separate lines
  - Updates period pill active states

**`admin-v2/js/app.js`**:
- In `loadOverviewEngagement()`: fetch last 7 days of `dailyStats`, render mini SVG sparklines in the Total Views and Total Ratings stat cards

**`admin-v2/css/admin-dashboard.css`**:
- `.sparkline` styles (80×24px inline SVG)

**`firestore.rules`**:
- `viewEvents`: authenticated write, admin read only
- `dailyStats`: admin read, Cloud Functions write

### Important notes
- Historical views cannot be backfilled — UI should display a note about tracking start date
- Consider a TTL cleanup for `viewEvents` (delete >90 days old) via scheduled function to manage collection size
- `viewEvents` write is fire-and-forget (don't `await` it to avoid slowing down the user experience)

### Verification
- Visit gallery image on main site → verify `viewEvents` doc created in Firestore
- Manually trigger `aggregateTimeSeries` (Firebase shell or emulator) → verify `dailyStats` doc created
- Open admin Analytics tab → verify trend chart renders with period switching
- Overview tab → verify sparklines appear in stat cards

---

## Feature 2: Content Version History / Rollback

**Goal:** Let admins browse content edit history and restore previous versions.

### New Cloud Functions in `functions/index.js`

**`adminGetContentHistory`** (memory: 1GB, timeout: 120s):
- Input: `{ imageId, gradeLevel }`
- Clones repo with `--depth 50`, runs `git.log({ file: contentRelPath, maxCount: 20 })`
- Returns: `{ versions: [{ hash, date, message, author }], filename }`

**`adminGetContentVersion`** (memory: 1GB, timeout: 120s):
- Input: `{ imageId, gradeLevel, commitHash }`
- Clones repo, runs `git.show(['{hash}:{path}'])`
- Returns: `{ content, metadata }` (parsed JSON)

**`adminRestoreContentVersion`** (memory: 1GB, timeout: 540s):
- Input: `{ imageId, gradeLevel, commitHash }`
- Clones repo, reads old version via `git.show()`, backs up current version (same pattern as `adminEditContent`), writes restored content, regenerates PDF (downloads image from Storage), uploads PDF to Storage, commits + pushes
- Returns: `{ success: true, restoredFrom: commitHash }`

### Files to modify

**`admin-v2/js/content-editor.js`**:
- Add "Version History" button to content editor header
- New function `showVersionHistory()`:
  - Calls `adminGetContentHistory` with current imageId + grade
  - Renders version list in a modal (date, commit message, author per version)
  - Each version has "Preview" and "Restore" buttons
- New function `previewVersion(commitHash)`:
  - Calls `adminGetContentVersion` to get old content text
  - Shows current vs. old content side by side (simple section-level comparison, no diff library needed)
- New function `confirmRestore(commitHash, date)`:
  - Confirmation modal with restore details
  - Calls `adminRestoreContentVersion`
  - On success, reloads current grade tab to show restored content

**`admin-v2/index.html`**:
- Add version history modal:
  ```
  #version-history-modal with .modal-large, #version-history-body
  ```

**`admin-v2/css/admin-dashboard.css`**:
- `.version-list`, `.version-item` (flex row with date/message/actions)
- `.version-meta`, `.version-hash` (monospace, muted)
- `.diff-added` / `.diff-removed` backgrounds for preview

### Verification
- Edit content for an image, save
- Click "Version History" in content editor → verify edit appears as most recent version
- Click "Preview" on older version → verify current vs. old content displayed
- Click "Restore" → confirm → verify content reverts, new git commit made
- Verify PDF is regenerated for restored content
- Verify the restored version now appears as the latest in history

---

## Summary of All File Changes

| File | Features | Action |
|------|----------|--------|
| `ratings.js` | 3 | Add `viewEvents` writes |
| `functions/index.js` | 2, 3, 5 | 4 new Cloud Functions + modify `onCommentCreated` |
| `firestore.rules` | 3, 5 | New collection rules |
| `admin-v2/index.html` | 1, 2, 3, 5 | Modals, chart containers, pills, script tags |
| `admin-v2/css/admin-dashboard.css` | 1, 2, 3 | Progress, version, sparkline styles |
| `admin-v2/js/bulk-operations.js` | 1 | **New file** — bulk op logic |
| `admin-v2/js/reprocess-manager.js` | 1 | Replace `confirm()` with modal |
| `admin-v2/js/delete-manager.js` | 1 | Replace `confirm()` with modal |
| `admin-v2/js/comment-moderation.js` | 5 | Trusted users, flagged filter |
| `admin-v2/js/content-editor.js` | 2 | Version history UI |
| `admin-v2/js/analytics.js` | 3 | Trend charts |
| `admin-v2/js/app.js` | 3 | Overview sparklines |
