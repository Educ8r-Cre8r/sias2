# Troubleshooting Guide

## Image Display Issues

### Some images not showing in Manage Photos

**Fixed in latest update!** The system now properly handles:
- Filenames with spaces (e.g., "deer camouflage.jpeg", "Deceased Deer.jpg")
- Special characters in filenames
- Proper URL encoding/decoding

**To apply the fix:**
1. Stop the server if running (Ctrl+C)
2. Pull latest changes: `git pull`
3. Restart the server: `npm run serve`
4. Refresh your browser

### Image shows placeholder instead of photo

If you see a gray placeholder, the image file might be missing or the path is incorrect.

**Check:**
```bash
# Verify the image exists
ls -la images/life-science/
ls -la images/earth-space-science/
ls -la images/physical-science/
```

## Markdown Upload Issues

### Markdown file not being processed

The system now includes better logging to help diagnose markdown upload issues.

**To test markdown upload:**
1. Drag and drop an image
2. Enter title and category
3. Click "Choose File" under Markdown section
4. Select a .md or .markdown file
5. Click "Upload All Photos"

**Check the console output:**
The server terminal will show:
```
📸 Processing: Your Photo Title
  Optimizing image...
  ✓ Image optimized (saved X%)
  Converting markdown to JSON...
  Markdown file: your-file.md
  ✓ Markdown converted
```

If markdown conversion fails, you'll see:
```
  ⚠ Markdown conversion failed: [error message]
  Creating empty content instead
```

### Common markdown issues

1. **File not selected**: Console shows "No markdown file provided"
   - Solution: Make sure to click "Choose File" and select a markdown file

2. **Wrong file type**: Console shows conversion error
   - Solution: Only .md and .markdown files are supported

3. **File too large**: Upload fails
   - Solution: Files must be under 50MB

## Server Issues

### Cannot connect to server

Error: "Cannot connect to server. Make sure to run: npm run serve"

**Solutions:**
```bash
# 1. Make sure you're in the admin directory
cd admin

# 2. Start the server
npm run serve

# 3. Open browser to http://localhost:3333
```

### Port 3333 already in use

Error: "EADDRINUSE: address already in use :::3333"

**Solutions:**
```bash
# Option 1: Find and kill the process
lsof -ti:3333 | xargs kill

# Option 2: Use a different terminal to stop the previous server
# Press Ctrl+C in the terminal where npm run serve is running
```

### Git push fails

Error during git operations

**Solutions:**
```bash
# 1. Check git status
git status

# 2. Manually commit if needed
git add .
git commit -m "Manual commit"
git push

# 3. Pull remote changes if behind
git pull
git push
```

## Upload Issues

### Upload succeeds but photos don't appear

**Check:**
1. Refresh the Manage Photos tab
2. Check the correct category filter
3. Look at server console for errors

### Upload fails with "Processing error"

**Check server console for specific error message:**
```bash
# Common issues:
- Image optimization failed: Image file may be corrupted
- Git operation failed: Check git configuration
- Metadata update failed: Check file permissions
```

## File Permission Issues

### Cannot write files

Error: "EACCES: permission denied"

**Solution:**
```bash
# Check permissions
ls -la ../images/
ls -la ../content/

# Fix if needed (be careful with this command)
chmod -R u+w ../images/ ../content/
```

## General Debugging

### Enable verbose logging

The server already logs detailed information. To see more:

1. Watch the server console output
2. Check browser console (F12) for JavaScript errors
3. Review git commit messages for what was actually saved

### Test individual components

```bash
# Test image optimization
node tools/image-optimizer.js

# Test markdown conversion
node tools/markdown-to-json.js

# List all photos
npm run list

# Delete a specific photo
npm run delete
```

## Getting Help

If issues persist:

1. Check the server console output for detailed error messages
2. Check browser console (F12 → Console tab) for JavaScript errors
3. Verify all files are in the correct locations
4. Make sure all npm dependencies are installed: `npm install`
5. Try restarting the server

## Recent Fixes (Latest Update)

✅ Fixed image serving for filenames with spaces
✅ Fixed URL encoding for special characters
✅ Improved markdown file upload handling
✅ Added better error logging
✅ Fixed broken image thumbnails in manage view

**Last Updated:** 2026-02-01
