# Browser Compatibility Audit — Science In A Snapshot

**Date:** February 13, 2026

---

## Overall Verdict

The site is in great shape for modern browsers. Most features degrade gracefully. IE11 is completely unsupported (and effectively dead). The target audience — educators on modern Chrome, Safari, or Firefox — will have zero issues.

---

## 🔴 One Real Issue: `dvh` Units With No Fallback

**File:** `style.css` (lines ~1121–1122, ~2138–2139)

Modals use `95dvh` and `100dvh` for height with no `vh` fallback before them. On **Safari < 15.4** or older Android browsers, the modal height won't compute and could collapse or behave unexpectedly.

**Browser Support:**
- Chrome 108+ ✓
- Firefox 101+ ✓
- Safari 15.4+ ✓
- Edge 108+ ✓
- Older browsers: ✗

**Fix:** Add a `vh` line before the `dvh` line — browsers that understand `dvh` will override it:

```css
height: 95vh;
height: 95dvh;
```

---

## 🟡 Minor CSS Observations (All Degrade Gracefully)

### `backdrop-filter: blur()`

**Files:** `style.css`, `admin-v2/css/admin-dashboard.css`

Used on the gallery header, modals, and some cards. Firefox only added full support at version 103 (mid-2022). Older Firefox shows a solid background instead of blur. The `-webkit-` prefix is correctly included.

**Browser Support:**
- Chrome 76+ ✓
- Firefox 103+ ✓
- Safari 9+ ✓
- Edge 76+ ✓

---

### `clamp()` for Fluid Typography

**File:** `style.css` (lines ~59–64)

All font size CSS variables use `clamp()`. Anything older than Chrome 79 / Safari 13.1 / Firefox 75 falls back to root default sizes. No real concern.

**Browser Support:**
- Chrome 79+ ✓
- Firefox 75+ ✓
- Safari 13.1+ ✓
- Edge 79+ ✓

---

### `aspect-ratio: 1`

**File:** `admin-v2/css/admin-dashboard.css` (line ~3304)

Used in the admin-v2 image picker. Safari < 15 doesn't support it, so picker thumbnails might not be perfectly square on older Safari. Minor visual issue only.

**Browser Support:**
- Chrome 89+ ✓
- Firefox 89+ ✓
- Safari 15+ ✓
- Edge 89+ ✓

---

### Flexbox `gap`

**Files:** `style.css`, `admin-v2/css/admin-dashboard.css` (used extensively)

Safari < 14.1 doesn't support `gap` on flexbox (though it works on grid). Items just lose their spacing — layouts remain functional.

**Browser Support:**
- Chrome 84+ ✓
- Firefox 63+ ✓
- Safari 14.1+ ✓
- Edge 84+ ✓

---

### `position: sticky`

**File:** `style.css` (lines ~415, 1916, 3872, 4355)

Used for the gallery header and a few other elements. Gracefully falls back to static positioning in unsupported browsers.

**Browser Support:**
- Chrome 56+ ✓
- Firefox 59+ ✓
- Safari 13+ ✓
- Edge 16+ ✓

---

### `-webkit-line-clamp`

**File:** `admin-v2/css/admin-dashboard.css` (line ~2570)

Used for truncating notification messages. Properly uses `-webkit-box` display. Full text just displays in unsupported browsers.

**Browser Support:**
- Chrome 2+ ✓
- Firefox 68+ ✓
- Safari 5.1+ ✓
- Edge 15+ ✓

---

### `object-fit`

**Files:** `style.css`, `tutorial-modal.css` (used in 8+ locations)

Used for image scaling throughout. Images may not scale optimally in IE11 but remain visible.

**Browser Support:**
- Chrome 32+ ✓
- Firefox 36+ ✓
- Safari 10+ ✓
- Edge 79+ ✓

---

### CSS `filter` (drop-shadow, blur)

**File:** `style.css` (lines ~340, 868, 1504, 4364)

Well-supported in all modern browsers. No vendor prefixes needed.

---

## 🟡 JavaScript Considerations

### `localStorage` / `sessionStorage` — No Try-Catch

**Files:** `script.js`, `ratings.js`, `admin-v2/js/deploy-status.js`, `admin-v2/js/notifications.js`

Used in several places (hero image tracking, session views, deploy caching, notifications) but none of the calls are wrapped in try-catch. In **private/incognito browsing** on some browsers, these can throw. Not a crash risk on most modern browsers, but it's a potential edge case.

---

### No Polyfills

The site uses `fetch()`, `async/await`, `IntersectionObserver`, and `Promise` throughout. All are well-supported in modern browsers but would break on IE11. Since the target audience is educators using modern devices, this is fine.

---

### Service Worker — Properly Feature-Detected

**Files:** `index.html`, `sw.js`

Correctly uses `if ('serviceWorker' in navigator)` — no issues.

---

## 🟢 Things Done Well

- **`-webkit-` prefixes** on `backdrop-filter`, `appearance`, `font-smoothing`, `user-select` — all correct
- **Excellent responsive breakpoints** — covers 400px through 1400px+
- **`prefers-reduced-motion`** and **`prefers-contrast: high`** media queries — great for accessibility
- **Print styles** included
- **`loading="lazy"`** on images — well-supported and properly used
- **CSS Grid with `auto-fit`/`auto-fill`** — graceful degradation in unsupported browsers
- **Transforms and transitions** — extensive use, all well-supported

---

## Browser Support Summary

| Feature | Safari 13 | Safari 15+ | Chrome 79+ | Firefox 75+ | Edge 79+ |
|---------|-----------|------------|------------|-------------|----------|
| dvh units | ✗ | ✓ (15.4+) | ✓ (108+) | ✓ (101+) | ✓ (108+) |
| clamp() | ✓ (13.1+) | ✓ | ✓ | ✓ | ✓ |
| backdrop-filter | ✓ | ✓ | ✓ | ✓ (103+) | ✓ |
| aspect-ratio | ✗ | ✓ | ✓ (89+) | ✓ (89+) | ✓ (89+) |
| Flexbox gap | ✗ | ✓ (14.1+) | ✓ (84+) | ✓ (63+) | ✓ (84+) |
| object-fit | ✓ | ✓ | ✓ | ✓ | ✓ |
| position: sticky | ✓ | ✓ | ✓ | ✓ | ✓ |
| IntersectionObserver | ✗ | ✓ | ✓ | ✓ | ✓ |
| fetch() | ✓ | ✓ | ✓ | ✓ | ✓ |
| async/await | ✓ | ✓ | ✓ | ✓ | ✓ |
| Service Workers | ✓ (11.1+) | ✓ | ✓ | ✓ | ✓ |
| CSS Grid | ✓ | ✓ | ✓ | ✓ | ✓ |
| localStorage | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Recommendations (Priority Order)

### High Priority
1. Add `vh` fallbacks before `dvh` values in modal CSS

### Medium Priority
2. Wrap `localStorage`/`sessionStorage` calls in try-catch for private browsing mode
3. Consider `@supports` fallback for `backdrop-filter` on older Firefox

### Low Priority
4. Add padding-bottom fallback for `aspect-ratio` in admin image picker
5. Document an official browser support policy (e.g., "Last 2 versions of Chrome, Firefox, Safari, Edge")
