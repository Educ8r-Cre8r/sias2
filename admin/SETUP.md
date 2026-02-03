# 🚀 SIAS Admin - Setup Guide

## Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js** (version 16 or higher)
- ✅ **npm** (comes with Node.js)
- ✅ **Git** configured with GitHub access
- ✅ **Web browser** (Chrome, Firefox, Safari, or Edge)

---

## Step-by-Step Installation

### 1. Check Node.js Installation

```bash
node --version
npm --version
```

If not installed, download from: https://nodejs.org/

### 2. Navigate to Admin Directory

```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias/admin"
```

### 3. Install Dependencies

```bash
npm install
```

This will install:
- `sharp` - Fast image processing
- `marked` - Markdown parser
- `simple-git` - Git automation
- `chalk` - Terminal colors

**Expected output:**
```
added 87 packages in 15s
```

### 4. Verify Installation

```bash
npm run test
```

Should show:
```
✓ Configuration loaded
⚠ No images found in pending folder
```

This is normal - you haven't uploaded anything yet!

---

## First Time Setup

### Configure Git (if not already done)

```bash
# Set your name and email
git config --global user.name "Alex Jones"
git config --global user.email "your.email@example.com"

# Verify configuration
git config --list
```

### Test Git Access

```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias"
git status
```

Should show your current branch and status.

---

## Quick Test

Let's do a test upload to make sure everything works!

### 1. Create Test Files

```bash
cd admin/uploads/pending

# Create a test metadata file
cat > test-upload.json << 'EOF'
{
  "timestamp": "2026-02-01T12:00:00.000Z",
  "photos": [
    {
      "filename": "test-image.jpg",
      "title": "Test Upload",
      "category": "life-science",
      "hasMarkdown": false
    }
  ]
}
EOF
```

### 2. Add a Test Image

Copy any JPEG image to the pending folder and rename it to `test-image.jpg`:

```bash
cp /path/to/any/photo.jpg test-image.jpg
```

### 3. Run Processor

```bash
cd ../..  # Back to admin directory
npm run process
```

You should see:
```
========================================
  SIAS Admin - Upload Processor
========================================

📂 Scanning pending uploads...
✓ Found 1 image(s) to process

📸 Processing: test-image.jpg
  Optimizing image...
  ✓ Image optimized (saved XX%)
  Creating empty content file...
  ✓ Empty content created

📝 Updating gallery metadata...
✓ Gallery metadata updated

🔄 Committing to git...
📥 Pulling latest changes...
✓ Pull successful
📋 Staging files...
✓ Files staged
💾 Creating commit...
✓ Commit created: abc123
🚀 Pushing to GitHub...
✓ Pushed to origin/main

========================================
  Processing Complete!
========================================

✓ Successfully processed: 1 image(s)
```

### 4. Verify Results

Check that:
- ✅ Image appears in `images/life-science/`
- ✅ JSON file created in `content/life-science/`
- ✅ `gallery-metadata.json` updated with new entry
- ✅ Changes committed to git
- ✅ Changes pushed to GitHub

---

## Using the Admin Interface

### 1. Open the Dashboard

```bash
open index.html
```

Or double-click `index.html` in Finder.

### 2. Upload Photos

- Drag photos onto the dropzone
- Fill in title and category
- Optionally add markdown files
- Click "Process & Publish"

### 3. Save Files

The interface will guide you to save files to the pending folder.

### 4. Run Processor

```bash
npm run process
```

---

## Folder Permissions

Ensure you have write access to all directories:

```bash
# From the sias directory
chmod -R u+w images/ content/ admin/uploads/
```

---

## Common Issues & Solutions

### Issue: "Cannot find module 'sharp'"

**Solution:**
```bash
npm install
```

### Issue: "Permission denied"

**Solution:**
```bash
chmod +x admin/tools/process-uploads.js
```

### Issue: "Git push failed"

**Solution:**
Check git credentials:
```bash
git config --list | grep user
ssh -T git@github.com  # Test SSH connection
```

### Issue: "Image optimization failed"

**Solution:**
Sharp might need rebuilding:
```bash
npm rebuild sharp
```

---

## Updating the System

To get the latest updates:

```bash
cd admin
npm update
```

---

## Uninstalling

To remove the admin system:

```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias"
rm -rf admin/
```

⚠️ **Warning:** This will delete all admin files and pending uploads!

---

## Next Steps

1. ✅ Complete this setup guide
2. ✅ Test with a sample upload
3. ✅ Read the full README.md
4. ✅ Start uploading your science photos!

---

## Need Help?

- 📖 Read the full [README.md](README.md)
- 🐛 Check error messages carefully
- 🔍 Review console logs
- ✅ Verify file paths

---

**Setup complete! You're ready to manage your photo gallery! 🎉**
