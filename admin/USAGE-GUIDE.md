# 📖 SIAS Admin - Complete Usage Guide

## Table of Contents

1. [Basic Workflow](#basic-workflow)
2. [Using the Admin Interface](#using-the-admin-interface)
3. [Manual Upload Method](#manual-upload-method)
4. [Processing Photos](#processing-photos)
5. [Advanced Features](#advanced-features)
6. [Examples](#examples)

---

## Basic Workflow

The admin system follows this simple process:

```
📸 Upload Photos → 📝 Add Details → 💾 Save to Pending → ⚙️ Process → ✅ Published!
```

### Three Ways to Upload

1. **Browser Interface** (Easiest) - Drag & drop with visual feedback
2. **Command Line Helper** - Interactive prompts
3. **Manual** - Direct file copying

---

## Using the Admin Interface

### Step 1: Open the Dashboard

```bash
# From the admin directory
open index.html

# Or from anywhere
open "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias/admin/index.html"
```

### Step 2: Upload Photos

**Option A: Drag & Drop**
1. Drag one or more photos onto the upload zone
2. Photos will appear in the preview grid

**Option B: Click to Browse**
1. Click "Add Photos" button
2. Select photos from your computer
3. Photos will appear in the preview grid

### Step 3: Fill in Details

For each photo:

**Required Fields:**
- **Title**: Descriptive name
  - Good: "Monarch Butterfly on Milkweed"
  - Bad: "IMG_1234"

- **Category**: Select from dropdown
  - 🌱 Life Science
  - 🌍 Earth Science
  - 🧪 Physical Science

**Optional Fields:**
- **Markdown File**: Educational content
  - Click "Choose .md file..."
  - Select your markdown file
  - File name will turn green when selected

### Step 4: Save Files to Pending Folder

The interface creates a metadata file, but you need to manually save:

1. **Open Finder** and navigate to:
   ```
   /Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias/admin/uploads/pending/
   ```

2. **Save your photo files** to this folder

3. **Save markdown files** (if any) to the same folder

4. **Save the metadata JSON** (the interface will prompt you)

### Step 5: Process

```bash
cd admin
npm run process
```

Watch the magic happen! 🎉

---

## Manual Upload Method

### Using the Command Line Helper

```bash
cd admin
node tools/create-upload-metadata.js
```

Follow the interactive prompts:

```
========================================
  Upload Metadata Creator
========================================

--- Photo 1 ---
Filename (e.g., butterfly.jpg): monarch-butterfly.jpg
Title: Monarch Butterfly Migration
Categories:
  1. life-science
  2. earth-science
  3. physical-science
Select category (1-3): 1
Has markdown file? (y/n): y
Markdown filename (e.g., content.md): monarch-butterfly.md

Add another photo? (y/n): y

--- Photo 2 ---
...
```

### Direct File Method

1. **Create metadata file manually:**

```json
{
  "timestamp": "2026-02-01T12:00:00.000Z",
  "photos": [
    {
      "filename": "monarch-butterfly.jpg",
      "title": "Monarch Butterfly Migration",
      "category": "life-science",
      "hasMarkdown": true,
      "markdownFilename": "monarch-butterfly.md"
    },
    {
      "filename": "rock-cycle.jpg",
      "title": "Rock Cycle Diagram",
      "category": "earth-science",
      "hasMarkdown": false
    }
  ]
}
```

Save as: `upload-metadata-{timestamp}.json`

2. **Copy files to pending:**

```bash
cp /path/to/monarch-butterfly.jpg admin/uploads/pending/
cp /path/to/monarch-butterfly.md admin/uploads/pending/
cp /path/to/rock-cycle.jpg admin/uploads/pending/
cp /path/to/metadata.json admin/uploads/pending/
```

3. **Process:**

```bash
npm run process
```

---

## Processing Photos

### Standard Processing

```bash
npm run process
```

**What happens:**
1. ✅ Scans `admin/uploads/pending/` for files
2. ✅ Optimizes images (resize + compress)
3. ✅ Moves images to `images/{category}/`
4. ✅ Converts markdown to JSON
5. ✅ Saves JSON to `content/{category}/`
6. ✅ Updates `gallery-metadata.json`
7. ✅ Creates git commit
8. ✅ Pushes to GitHub

### Expected Output

```
========================================
  SIAS Admin - Upload Processor
========================================

📂 Scanning pending uploads...
✓ Found 2 image(s) to process

📸 Processing: monarch-butterfly.jpg
  Optimizing image...
  ✓ Image optimized (saved 45.23%)
  Converting markdown to JSON...
  ✓ Markdown converted

📸 Processing: rock-cycle.jpg
  Optimizing image...
  ✓ Image optimized (saved 32.15%)
  Creating empty content file...
  ✓ Empty content created

📝 Updating gallery metadata...
✓ Gallery metadata updated (75 total images)

🔄 Committing to git...
📥 Pulling latest changes...
✓ Pull successful
📋 Staging files...
✓ Files staged
💾 Creating commit...
✓ Commit created: abc1234
🚀 Pushing to GitHub...
✓ Pushed to origin/main

✓ Moved 4 file(s) to processed folder

========================================
  Processing Complete!
========================================

✓ Successfully processed: 2 image(s)

Category breakdown:
  life-science: 1
  earth-science: 1
```

---

## Advanced Features

### Custom Git Commit Messages

Edit `config.json`:

```json
{
  "git": {
    "autoCommit": true,
    "autoPush": true,
    "commitMessageTemplate": "Add {count} science photos via admin"
  }
}
```

### Disable Auto-Push

If you want to review changes before pushing:

```json
{
  "git": {
    "autoCommit": true,
    "autoPush": false
  }
}
```

Then manually push:
```bash
git push origin main
```

### Adjust Image Quality

For smaller file sizes:

```json
{
  "imageSettings": {
    "maxWidth": 1600,
    "maxHeight": 1600,
    "quality": 85
  }
}
```

### Change Output Format

For WebP images:

```json
{
  "imageSettings": {
    "format": "webp",
    "quality": 90
  }
}
```

---

## Examples

### Example 1: Single Photo with Markdown

**Files:**
- `bee-pollination.jpg` (photo)
- `bee-pollination.md` (educational content)

**Metadata:**
```json
{
  "timestamp": "2026-02-01T14:30:00.000Z",
  "photos": [
    {
      "filename": "bee-pollination.jpg",
      "title": "Bee Pollination in Action",
      "category": "life-science",
      "hasMarkdown": true,
      "markdownFilename": "bee-pollination.md"
    }
  ]
}
```

**Markdown Content (bee-pollination.md):**
```markdown
# Bee Pollination

## Description
This photograph captures a honeybee collecting nectar from a flower while simultaneously transferring pollen.

## Science Standards
- 3rd Grade Life Science
- LS1.B: Growth and Development of Organisms
- LS2.A: Interdependent Relationships in Ecosystems

## Discussion Questions
1. What is the bee doing in this photograph?
2. Why is pollination important for plants?
3. What would happen if bees didn't visit flowers?

## Activities
- Create a diagram showing the pollination process
- Research different types of pollinators
- Design a bee-friendly garden
```

**Process:**
```bash
# Copy files
cp bee-pollination.jpg admin/uploads/pending/
cp bee-pollination.md admin/uploads/pending/
cp metadata.json admin/uploads/pending/

# Run processor
npm run process
```

**Result:**
- Image saved to: `images/life-science/bee-pollination.jpg`
- Content saved to: `content/life-science/bee-pollination.json`
- Metadata updated with new entry
- Committed and pushed to GitHub

### Example 2: Batch Upload (Multiple Photos)

**Files:**
- `volcano.jpg`
- `tornado.jpg`
- `earthquake-crack.jpg`

**Metadata:**
```json
{
  "timestamp": "2026-02-01T15:00:00.000Z",
  "photos": [
    {
      "filename": "volcano.jpg",
      "title": "Volcanic Eruption",
      "category": "earth-science",
      "hasMarkdown": false
    },
    {
      "filename": "tornado.jpg",
      "title": "Tornado Formation",
      "category": "earth-science",
      "hasMarkdown": false
    },
    {
      "filename": "earthquake-crack.jpg",
      "title": "Earthquake Ground Fracture",
      "category": "earth-science",
      "hasMarkdown": false
    }
  ]
}
```

**Process:**
```bash
# Copy all files at once
cp volcano.jpg tornado.jpg earthquake-crack.jpg admin/uploads/pending/
cp metadata.json admin/uploads/pending/

# Process
npm run process
```

### Example 3: Using the Browser Interface

1. **Open admin interface:**
   ```bash
   open admin/index.html
   ```

2. **Drag these files onto the dropzone:**
   - rainbow.jpg
   - crystal.jpg
   - magnet.jpg

3. **Fill in details:**

   **Photo 1: rainbow.jpg**
   - Title: "Rainbow After Storm"
   - Category: Earth Science
   - Markdown: (none)

   **Photo 2: crystal.jpg**
   - Title: "Salt Crystal Formation"
   - Category: Physical Science
   - Markdown: crystal-formation.md

   **Photo 3: magnet.jpg**
   - Title: "Magnetic Field Lines"
   - Category: Physical Science
   - Markdown: (none)

4. **Click "Process & Publish"**

5. **Save files to pending folder** as instructed

6. **Run processor:**
   ```bash
   npm run process
   ```

---

## Tips & Best Practices

### Naming Conventions

**Good Filenames:**
- `monarch-butterfly.jpg`
- `rock-cycle-diagram.jpg`
- `water-cycle.jpg`

**Avoid:**
- `IMG_1234.jpg`
- `photo.jpg`
- `untitled.jpg`

### Title Guidelines

**Good Titles:**
- "Monarch Butterfly on Milkweed"
- "Rock Cycle Diagram"
- "Condensation on Window"

**Characteristics:**
- Descriptive
- Capitalized properly
- Specific

### Category Selection

**Life Science:**
- Living organisms
- Plants and animals
- Ecosystems
- Growth and development

**Earth Science:**
- Rocks and minerals
- Weather and climate
- Space and astronomy
- Natural phenomena

**Physical Science:**
- Matter and energy
- Forces and motion
- Chemistry
- Physics

### Markdown Content

Include these sections:
1. **Description** - What the photo shows
2. **Science Standards** - Grade level and standards
3. **Discussion Questions** - Thought-provoking questions
4. **Activities** - Hands-on learning ideas
5. **Vocabulary** - Key terms

---

## Troubleshooting Common Issues

### No Images Found

**Problem:** "No images found in pending folder"

**Solution:**
- Check you're saving to the correct folder
- Verify file extensions (.jpg, .jpeg, .png, .webp)

### Image Optimization Failed

**Problem:** "Failed to optimize image"

**Solution:**
- Check if image is corrupted
- Try opening in Preview/Photos app
- Convert to standard JPEG format

### Git Push Failed

**Problem:** "Git operation failed"

**Solution:**
```bash
# Check git status
git status

# Pull latest changes
git pull origin main

# Try again
npm run process
```

---

## Next Steps

1. ✅ Upload your first photo
2. ✅ Add educational content
3. ✅ Process and publish
4. ✅ View on the gallery website
5. ✅ Repeat!

---

**Happy uploading! Your science photos are making a difference! 🔬📸**
