# SIAS Admin Interface

**Science In A Snapshot - Photo Gallery Admin System**

A streamlined admin interface for managing photo uploads, metadata, and educational content for the Science In A Snapshot gallery website.

---

## 🎯 Overview

This admin system allows you to:
- ✅ Upload photos via drag-and-drop interface
- ✅ Automatically categorize into Life Science, Earth Science, or Physical Science
- ✅ Add titles and educational content (markdown files)
- ✅ Auto-optimize images (resize to max 2000px)
- ✅ Convert markdown to JSON format
- ✅ Update gallery metadata automatically
- ✅ Commit and push changes to GitHub automatically

---

## 📁 Directory Structure

```
admin/
├── index.html              # Admin dashboard (open in browser)
├── css/
│   └── admin-styles.css    # Modern styling
├── js/
│   └── admin.js            # Frontend logic
├── tools/
│   ├── process-uploads.js  # Main processor (run this!)
│   ├── image-optimizer.js  # Image optimization
│   ├── markdown-to-json.js # MD → JSON conversion
│   ├── update-metadata.js  # Metadata management
│   └── git-auto-commit.js  # Git automation
├── uploads/
│   ├── pending/            # Stage files here
│   └── processed/          # Archive of processed files
├── config.json             # Configuration settings
├── package.json            # Node.js dependencies
└── README.md               # This file
```

---

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias/admin"
npm install
```

This will install:
- `sharp` - Image optimization
- `marked` - Markdown processing
- `simple-git` - Git automation
- `chalk` - Colored console output

### Step 2: Open Admin Interface

```bash
# Open the admin dashboard in your browser
open index.html
```

Or navigate to:
```
/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias/admin/index.html
```

### Step 3: Upload Photos

1. **Drag and drop** photos onto the upload zone (or click "Add Photos")
2. For each photo:
   - Select **category** (Life Science, Earth Science, or Physical Science)
   - Enter a **title** (required)
   - Optionally upload a **markdown file** (.md) with educational content
3. Click **"Process & Publish to GitHub"**
4. Save the files manually to the pending folder (see instructions below)

### Step 4: Process Uploads

After saving files to the pending folder, run the processor:

```bash
npm run process
```

This will:
- ✅ Optimize images (resize to max 2000px, compress)
- ✅ Move images to `/images/{category}/`
- ✅ Convert markdown files to JSON format
- ✅ Save JSON to `/content/{category}/`
- ✅ Update `gallery-metadata.json`
- ✅ Create git commit
- ✅ Push to GitHub automatically

---

## 📸 Detailed Workflow

### Method 1: Using the Admin Interface (Recommended)

1. **Open Admin Dashboard**
   ```bash
   open admin/index.html
   ```

2. **Upload Photos**
   - Drag photos onto the dropzone
   - Fill in details for each photo:
     - **Title**: Descriptive name (e.g., "Monarch Butterfly")
     - **Category**: Choose from dropdown
     - **Markdown**: Optional educational content file

3. **Save Metadata**
   - The interface will create a metadata JSON file
   - Save this file to `admin/uploads/pending/`

4. **Save Photos Manually**
   - Save each photo to `admin/uploads/pending/`
   - Save any markdown files to the same folder

5. **Run Processor**
   ```bash
   npm run process
   ```

### Method 2: Manual Upload (Without Interface)

1. **Copy files directly to pending folder:**
   ```bash
   cp /path/to/photo.jpg admin/uploads/pending/
   cp /path/to/content.md admin/uploads/pending/
   ```

2. **Create metadata file** (upload-metadata-{timestamp}.json):
   ```json
   {
     "timestamp": "2026-02-01T12:00:00.000Z",
     "photos": [
       {
         "filename": "photo.jpg",
         "title": "Amazing Photo",
         "category": "life-science",
         "hasMarkdown": true,
         "markdownFilename": "content.md"
       }
     ]
   }
   ```

3. **Run processor:**
   ```bash
   npm run process
   ```

---

## ⚙️ Configuration

Edit `config.json` to customize settings:

```json
{
  "projectRoot": "/path/to/sias",
  "categories": [
    "life-science",
    "earth-science",
    "physical-science"
  ],
  "imageSettings": {
    "maxWidth": 2000,
    "maxHeight": 2000,
    "quality": 90,
    "format": "jpeg"
  },
  "git": {
    "autoCommit": true,
    "autoPush": true
  }
}
```

### Image Settings

- **maxWidth/maxHeight**: Maximum dimensions (default: 2000px)
- **quality**: JPEG quality 1-100 (default: 90)
- **format**: Output format (jpeg, png, webp)

### Git Settings

- **autoCommit**: Automatically create commits (true/false)
- **autoPush**: Automatically push to GitHub (true/false)

---

## 📝 File Formats

### Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)

### Markdown Files

Educational content should be in markdown format (.md):

```markdown
# Topic Title

## Description
This photo shows...

## Educational Standards
- 3rd Grade Life Science
- Observing living organisms

## Discussion Questions
1. What do you notice about...?
2. How does this relate to...?
```

The markdown will be converted to JSON:

```json
{
  "content": "# Topic Title\n\n## Description\nThis photo shows..."
}
```

---

## 🔧 npm Scripts

### `npm run process`

Process all pending uploads:
```bash
npm run process
```

### `npm run push`

Manually trigger git push:
```bash
npm run push
```

### `npm test`

Test run (dry run without git operations):
```bash
npm test
```

---

## 📊 Gallery Metadata

The system maintains `gallery-metadata.json` with this structure:

```json
{
  "lastUpdated": "2026-02-01T12:00:00.000Z",
  "totalImages": 73,
  "images": [
    {
      "id": 73,
      "filename": "butterfly.jpg",
      "category": "life-science",
      "imagePath": "images/life-science/butterfly.jpg",
      "contentFile": "content/life-science/butterfly.json",
      "title": "Monarch Butterfly",
      "hasContent": true
    }
  ]
}
```

This file is automatically updated when you process uploads.

---

## 🐛 Troubleshooting

### "No images found in pending folder"

**Solution:** Make sure you've saved files to the correct location:
```
/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias/admin/uploads/pending/
```

### "Failed to optimize image"

**Possible causes:**
- Corrupted image file
- Unsupported format
- Insufficient disk space

**Solution:** Check the error message and verify the image file

### "Git operation failed"

**Possible causes:**
- Not in a git repository
- Uncommitted changes conflict
- Network issues (for push)

**Solution:**
1. Verify you're in a git repo: `git status`
2. Check git configuration
3. Ensure you have push permissions

### "Module not found"

**Solution:** Install dependencies:
```bash
npm install
```

---

## 🔐 Security Notes

- This admin interface runs **locally only** (no server)
- No authentication needed (local file access)
- Git credentials should be configured via SSH or credential manager
- Never commit sensitive data to the repository

---

## 🎨 Categories

### Life Science (🌱)
Living organisms, plants, animals, ecosystems

### Earth Science (🌍)
Geology, weather, space, natural phenomena

### Physical Science (🧪)
Physics, chemistry, matter, energy

---

## 📚 Additional Resources

### Project Structure
```
sias/
├── admin/                  # Admin interface (this folder)
├── images/
│   ├── life-science/
│   ├── earth-science/
│   └── physical-science/
├── content/
│   ├── life-science/
│   ├── earth-science/
│   └── physical-science/
├── gallery-metadata.json   # Auto-updated
└── index.html              # Main gallery site
```

### Workflow Summary

```
Upload Photos (browser)
    → Save to pending/ folder
    → npm run process
    → Images optimized & moved
    → Markdown → JSON
    → Metadata updated
    → Git commit & push
    → Done! ✅
```

---

## 💡 Tips

1. **Batch Upload**: You can upload multiple photos at once
2. **Title Consistency**: Use consistent naming (capitalize properly)
3. **Categories**: Double-check category selection before processing
4. **Markdown**: Use clear headers and formatting in educational content
5. **Git Messages**: Commits include category breakdown automatically
6. **Backup**: Processed files are archived in `uploads/processed/`

---

## 🆘 Support

For issues or questions:
1. Check this README first
2. Review error messages carefully
3. Check the console output for detailed logs
4. Verify file paths and permissions

---

## 📄 License

© 2026 Alex Jones, M.Ed. All rights reserved.

---

## 🚀 Version History

**v1.0.0** (February 2026)
- Initial release
- Drag-and-drop interface
- Auto image optimization
- Markdown to JSON conversion
- Automatic git integration
- GitHub push automation

---

**Happy uploading! 📸**
