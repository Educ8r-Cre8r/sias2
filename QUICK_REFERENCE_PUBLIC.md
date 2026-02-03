# Science In A Snapshot - Quick Reference

## 🚀 Quick Commands

### Start Local Server
```bash
python3 -m http.server 8080
```
Then open: **http://localhost:8080**

### Check for New Photos
```bash
node check-new-photos.js
```

### Generate Content for New Photos
```bash
# For all new photos
node generate-educational-content.js

# For specific category
node generate-educational-content.js --category=life-science

# For specific photo
node generate-educational-content.js --photo=photo.json --category=life-science

# Dry run (no API calls)
node generate-educational-content.js --dry-run
```

### Restart Server
```bash
lsof -ti:8080 | xargs kill
python3 -m http.server 8080
```

## 📊 Project Stats

- ✅ **80 photos** with K-5 content
- ✅ **480 content pieces** (80 × 6 grades)
- ✅ **~$0.80-$1.60** total cost
- ✅ **~$0.01 per photo** for future additions

## 🔑 API Configuration

Create a `.env` file in the project root:
```
ANTHROPIC_API_KEY=your_api_key_here
```

Get your API key from: https://console.anthropic.com/

**The `.env` file is protected by `.gitignore` and will not be committed to GitHub.**

## 📁 Key Files

- `index.html` - Main site
- `style.css` - Styling with pulsing animation
- `script.js` - Grade level logic
- `generate-educational-content.js` - Content generator
- `check-new-photos.js` - Photo checker
- `.env` - API key (protected by .gitignore)

## 🎓 Grade Levels

- **K** - Very simple, observation-focused
- **1st** - Basic concepts, hands-on
- **2nd** - Compare/contrast, patterns
- **3rd** - Balanced (default level)
- **4th** - Advanced vocabulary, analysis
- **5th** - Scientific terminology, research

## ✨ Features

- Grade selector dropdown with pulsing animation
- Automatic content updates when grade changes
- NGSS-aligned content for all grades
- Responsive design (mobile-friendly)
- 80 photos across 3 science categories

## 📚 Documentation

- `PROJECT_SUMMARY_PUBLIC.md` - Complete overview
- `NEW_PHOTO_WORKFLOW.md` - How to add photos
- `EDUCATIONAL_CONTENT_GENERATOR.md` - Generator docs
- `GRADE_LEVEL_FEATURE_SUMMARY.md` - Feature details

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install @anthropic-ai/sdk dotenv
   ```

2. **Create `.env` file:**
   ```bash
   echo "ANTHROPIC_API_KEY=your_key_here" > .env
   ```

3. **Start the server:**
   ```bash
   python3 -m http.server 8080
   ```

4. **Open in browser:**
   ```
   http://localhost:8080
   ```

## Adding New Photos

1. Add image to `images/<category>/`
2. Create JSON file in `content/<category>/`
3. Run: `node generate-educational-content.js`
4. Refresh browser to see new photo

That's it! 🎉
