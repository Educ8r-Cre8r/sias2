# Science In A Snapshot - Quick Reference

## 📍 Project Location
```
/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias2/sias2
```

## 🚀 Quick Commands

### Start Local Server
```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias2/sias2"
python3 -m http.server 8080
```
Then open: **http://localhost:8080**

### Check for New Photos
```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias2/sias2"
node check-new-photos.js
```

### Generate Content for New Photos
```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias2/sias2"

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
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias2/sias2"
lsof -ti:8080 | xargs kill
python3 -m http.server 8080
```

## 📊 Project Stats

- ✅ **80 photos** with K-5 content
- ✅ **480 content pieces** (80 × 6 grades)
- ✅ **~$0.80-$1.60** total cost
- ✅ **~$0.01 per photo** for future additions

## 🔑 API Configuration

Your API key is in `.env`:
```
ANTHROPIC_API_KEY=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
```

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

- `PROJECT_SUMMARY.md` - Complete overview
- `NEW_PHOTO_WORKFLOW.md` - How to add photos
- `EDUCATIONAL_CONTENT_GENERATOR.md` - Generator docs
- `GRADE_LEVEL_FEATURE_SUMMARY.md` - Feature details
