# ⚡ SIAS Admin - Quick Reference Card

## 🚀 Fast Start

```bash
# 1. Install (first time only)
cd admin && npm install

# 2. Open admin interface
open index.html

# 3. Process uploads
npm run process
```

---

## 📁 Important Paths

| Location | Path |
|----------|------|
| **Admin Dashboard** | `admin/index.html` |
| **Upload Pending** | `admin/uploads/pending/` |
| **Images** | `images/{category}/` |
| **Content** | `content/{category}/` |
| **Metadata** | `gallery-metadata.json` |

---

## 📸 Upload Methods

### Method 1: Browser (Recommended)
```bash
open admin/index.html
→ Drag photos → Fill details → Save to pending → npm run process
```

### Method 2: CLI Helper
```bash
node admin/tools/create-upload-metadata.js
→ Follow prompts → Copy files → npm run process
```

### Method 3: Manual
```bash
→ Create metadata.json → Copy files to pending/ → npm run process
```

---

## ⚙️ Commands

| Command | Description |
|---------|-------------|
| `npm run process` | Process all pending uploads |
| `npm run push` | Manually push to GitHub |
| `npm test` | Test run (no git operations) |

---

## 📝 Metadata File Format

```json
{
  "timestamp": "2026-02-01T12:00:00.000Z",
  "photos": [
    {
      "filename": "photo.jpg",
      "title": "Photo Title",
      "category": "life-science",
      "hasMarkdown": true,
      "markdownFilename": "content.md"
    }
  ]
}
```

**Save as:** `upload-metadata-{timestamp}.json`

---

## 🎨 Categories

| Icon | Category | Examples |
|------|----------|----------|
| 🌱 | `life-science` | Plants, animals, ecosystems |
| 🌍 | `earth-science` | Rocks, weather, space |
| 🧪 | `physical-science` | Matter, energy, forces |

---

## 🔄 Processing Workflow

```
Upload
  ↓
Pending Folder
  ↓
npm run process
  ↓
┌─────────────────────────────┐
│ 1. Optimize images          │
│ 2. Move to images/{cat}/    │
│ 3. Convert MD → JSON        │
│ 4. Save to content/{cat}/   │
│ 5. Update metadata.json     │
│ 6. Git commit               │
│ 7. Push to GitHub           │
└─────────────────────────────┘
  ↓
Done! ✅
```

---

## ✅ Checklist

**Before Processing:**
- [ ] Photos saved to `admin/uploads/pending/`
- [ ] Metadata JSON created
- [ ] Markdown files saved (if any)
- [ ] Titles are descriptive
- [ ] Categories are correct

**After Processing:**
- [ ] Check images in `images/{category}/`
- [ ] Verify JSON in `content/{category}/`
- [ ] Confirm `gallery-metadata.json` updated
- [ ] Verify git commit created
- [ ] Check GitHub for pushed changes

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| No images found | Check `admin/uploads/pending/` |
| Module not found | Run `npm install` |
| Git push failed | Run `git pull` then retry |
| Image won't optimize | Check file format (use JPG) |

---

## 🔧 Configuration

**Edit:** `admin/config.json`

```json
{
  "imageSettings": {
    "maxWidth": 2000,      ← Max image width
    "quality": 90           ← JPEG quality (1-100)
  },
  "git": {
    "autoCommit": true,    ← Auto create commits
    "autoPush": true        ← Auto push to GitHub
  }
}
```

---

## 📊 File Extensions

| Type | Supported |
|------|-----------|
| **Images** | `.jpg`, `.jpeg`, `.png`, `.webp` |
| **Markdown** | `.md`, `.markdown` |
| **Metadata** | `.json` |

---

## 💡 Pro Tips

1. **Batch uploads** - Upload multiple photos at once
2. **Descriptive titles** - Use clear, specific names
3. **Check pending** - Verify files before processing
4. **Review commits** - Check git log after processing
5. **Backup processed** - Files archived in `uploads/processed/`

---

## 📞 Help

| Resource | Location |
|----------|----------|
| **Full Guide** | `admin/README.md` |
| **Setup Guide** | `admin/SETUP.md` |
| **Usage Examples** | `admin/USAGE-GUIDE.md` |

---

## ⌨️ One-Liners

```bash
# Quick upload workflow
open admin/index.html && echo "Upload photos, then run: npm run process"

# Check what's pending
ls -l admin/uploads/pending/

# View recent commits
git log --oneline -5

# Check gallery stats
cat gallery-metadata.json | grep totalImages

# Clear processed files
rm admin/uploads/processed/*
```

---

**Keep this card handy for quick reference! 📋**

Last updated: February 2026
