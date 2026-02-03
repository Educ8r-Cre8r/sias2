# Upload Debug Guide

## Current Issues

Based on your screenshot, you have:
- ✅ 3 photos ready to upload (Ornamental Grass, Slime Mold, Deciduous Trees)
- ✅ 3 markdown files available (deciduous_trees.md, slime_mold.md, ornamental_grass.md)
- ❌ "Upload & Publish to GitHub" button not working
- ❌ Markdown files not being attached

## Step-by-Step Debugging

### 1. Test the System

First, run the diagnostic test:

```bash
cd admin
node tools/test-upload.js
```

This will check:
- Config file is valid
- All directories exist
- Markdown converter works
- Server is running

### 2. Check Server Status

Make sure the server is running:

```bash
# Check if server is running
lsof -ti:3333

# If not running, start it:
npm run serve
```

You should see:
```
✓ SIAS Admin Server Running!
📱 Open in browser: http://localhost:3333
```

### 3. Check Browser Console

Open the browser console (F12 or Cmd+Option+I), then try uploading:

1. Open http://localhost:3333
2. Add your 3 photos
3. Fill in titles and categories
4. Click markdown file inputs and select the .md files
5. Click "Upload & Publish to GitHub"

**Watch the console for these messages:**

```javascript
Upload button clicked!
Photos to upload: 3
Validating photo: [title] Category: [category] Markdown: [filename.md or undefined]
Validation passed, starting upload...
Sending request to: http://localhost:3333/api/upload
Response status: 200
Server response: {...}
```

### 4. Common Issues & Solutions

#### Issue: Button does nothing

**Check:**
- Is the button disabled? Look for `disabled` attribute
- Are all required fields filled?
  - Every photo must have a title
  - Every photo must have a category selected

**Console shows:**
- "Please enter a title for all photos" → Fill in missing titles
- "Please select a category for all photos" → Select categories from dropdown

#### Issue: Markdown files not attaching

**From your screenshot, the file picker shows folders instead of the Downloads folder content.**

**Solution:**
1. After clicking "Choose File" for Markdown
2. Navigate to your Downloads folder
3. You should see:
   - `deciduous_trees.md`
   - `slime_mold.md`
   - `ornamental_grass.md`
4. Click on one of these files
5. Click "Open"

The file input should show the filename after selection.

#### Issue: Upload fails with error

**Console shows specific error message:**

1. **"Cannot connect to server"**
   ```bash
   # Restart server
   cd admin
   npm run serve
   ```

2. **"Upload failed: [error]"**
   - Check server terminal for detailed error
   - Common causes:
     - Image file corrupted
     - No disk space
     - Permission denied
     - Git error

3. **"Failed to optimize image"**
   - Image might be corrupted
   - Try with a different image first
   - Check if sharp is installed: `npm ls sharp`

### 5. Test with Single Photo First

To isolate the issue, try uploading just ONE photo without markdown:

1. Clear all current photos
2. Add just ONE photo
3. Enter title: "Test Photo"
4. Select category: "Life Science"
5. DO NOT add markdown yet
6. Click "Upload & Publish to GitHub"

**If this works:**
- Server is running correctly
- Image processing works
- Git auto-commit works
- Problem is likely with markdown upload

**If this fails:**
- Check server console for errors
- Check browser console for errors
- Run the test script: `node tools/test-upload.js`

### 6. Test Markdown Separately

After successful single photo upload, test markdown:

1. Add one photo
2. Fill in required fields
3. Click "Choose File" under Markdown
4. Select one of your .md files
5. Verify the filename appears in the input
6. Upload

**Watch server console:**
```
📸 Processing: [Your Title]
  Optimizing image...
  ✓ Image optimized
  Converting markdown to JSON...
  Markdown file: deciduous_trees.md
  ✓ Markdown converted
```

### 7. Server Console Messages

The server now provides detailed logging. When you upload, you should see:

```
🚀 Processing upload request...
Files received: [ 'photo_0', 'markdown_0' ]

📸 Processing: Deciduous Trees
  Optimizing image...
  ✓ Image optimized (saved 15%)
  Converting markdown to JSON...
  Markdown file: deciduous_trees.md
  ✓ Markdown converted

📝 Updating gallery metadata...
✓ Gallery metadata updated (73 total images)

🔄 Committing to git...
✓ Changes committed and pushed to GitHub
```

### 8. Quick Fixes

**Reset everything and try again:**

```bash
# 1. Stop the server (Ctrl+C)

# 2. Pull latest code
git pull

# 3. Restart server
npm run serve

# 4. Hard refresh browser
# Mac: Cmd+Shift+R
# Windows/Linux: Ctrl+Shift+R

# 5. Clear browser cache if needed
# Browser Settings → Clear Browsing Data → Cached Images
```

### 9. Manual Verification

Check if files are actually being processed:

```bash
# Check if images are being added
ls -la images/life-science/

# Check if content JSON files are created
ls -la content/life-science/

# Check gallery metadata
cat gallery-metadata.json | grep "totalImages"

# Check git history
git log --oneline -5
```

### 10. Common Mistakes

❌ **Server not running** → No error, button just doesn't respond
   ✅ Solution: Run `npm run serve`

❌ **Wrong directory** → Server can't find files
   ✅ Solution: Make sure you're in the `admin` folder

❌ **Title has special characters** → May cause validation issues
   ✅ Solution: Use simple titles first, test special characters later

❌ **Image file too large** → Upload times out
   ✅ Solution: Resize image before upload (max 50MB)

❌ **Markdown file wrong format** → Conversion fails silently
   ✅ Solution: Ensure file has .md or .markdown extension

## Getting More Help

If you still have issues:

1. **Share these details:**
   - Browser console output (F12 → Console tab)
   - Server console output (terminal where npm run serve is running)
   - Output of: `node tools/test-upload.js`

2. **Try the test script:**
   ```bash
   cd admin
   node tools/test-upload.js
   ```

3. **Check file permissions:**
   ```bash
   ls -la admin/uploads/pending/
   ```

## Success Indicators

When everything works correctly, you'll see:

✅ **Browser:**
- Progress bar moves from 0% to 100%
- "Success!" message appears
- New photo count shown

✅ **Server Console:**
- All steps marked with ✓
- "Changes committed and pushed to GitHub"

✅ **GitHub:**
- New commit appears in repository
- Images added to images/ folder
- JSON files added to content/ folder
- gallery-metadata.json updated

✅ **Manage Photos Tab:**
- New photos appear in grid
- Thumbnails load correctly
- Can view and delete photos
