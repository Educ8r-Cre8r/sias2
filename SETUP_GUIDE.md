# 🚀 Science In A Snapshot - Setup Guide

Welcome! This guide will walk you through the initial setup of your Science In A Snapshot website.

## ✅ Prerequisites Check

Before you begin, ensure you have:

- [x] Node.js installed (version 18+)
- [x] All project files in the `/sias/` folder
- [x] Node.js dependencies installed (`npm install` was run in `/tools/`)
- [ ] Anthropic API key (get one at https://console.anthropic.com/)

## 📝 Step-by-Step Setup

### Step 1: Get Your Anthropic API Key

1. Visit https://console.anthropic.com/
2. Sign up for an account (free credits available)
3. Go to "API Keys" section
4. Click "Create Key"
5. Copy your API key (starts with `sk-ant-...`)

**Cost Estimate**: Categorizing and generating content for 72 images will cost approximately $7-10.

### Step 2: Set Up Your API Key

Choose ONE of these methods:

**Method A: Environment Variable (Recommended)**
```bash
# Add to your ~/.bash_profile or ~/.zshrc
export ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Then reload your shell
source ~/.bash_profile  # or source ~/.zshrc
```

**Method B: .env File**
```bash
cd tools
echo 'ANTHROPIC_API_KEY=sk-ant-your-key-here' > .env
```

**Verify it's set:**
```bash
echo $ANTHROPIC_API_KEY
# Should display your key
```

### Step 3: Categorize Your Images

Your 72 images in `/images/` need to be organized into categories.

```bash
cd tools

# This will use AI to categorize each image
node categorize-images.js
```

**What happens:**
- AI analyzes each image's content and filename
- Categorizes into: Life Science, Earth & Space Science, or Physical Science
- Saves results to `categorization-results.json`
- Takes ~10-15 minutes (rate limited to prevent API throttling)

**Sample output:**
```
[1/72] Processing: bee.jpeg
   ✅ Category: life-science (high confidence)
   📝 Shows pollination, an organism interaction

[2/72] Processing: rock.jpeg
   ✅ Category: earth-space-science (high confidence)
   📝 Geological specimen
...
```

### Step 4: Review Categorizations (Optional but Recommended)

Open `tools/categorization-results.json` and verify the AI categorized correctly:

```json
[
  {
    "filename": "bee.jpeg",
    "category": "life-science",
    "confidence": "high",
    "justification": "Image shows pollination..."
  }
]
```

If you need to change any categorizations, edit the `category` field directly.

### Step 5: Organize Images into Folders

```bash
# Still in /tools/ directory
node organize-images.js
```

**What happens:**
- Moves images from `/images/` to `/images/life-science/`, `/images/earth-space-science/`, `/images/physical-science/`
- Creates `gallery-metadata.json` (powers the gallery)
- Takes ~1 minute

**Sample output:**
```
[1/72] bee.jpeg → life-science/
   ✅ Moved successfully

[2/72] rock.jpeg → earth-space-science/
   ✅ Moved successfully
...

💾 Updated gallery-metadata.json
```

### Step 6: Generate Educational Content

Now the big step - generate Third Grade lesson content for each image:

```bash
# Generate content for all 72 images
node generate-content.js --all

# OR do one category at a time to save on costs:
node generate-content.js --category life-science
node generate-content.js --category earth-space-science
node generate-content.js --category physical-science

# OR test with a single image first:
node generate-content.js --image bee.jpeg
```

**What happens:**
- AI analyzes each image
- Generates Third Grade educational content with:
  - Photo description
  - Scientific phenomena explanation
  - Core concepts
  - Pedagogical teaching tips
  - UDL strategies
  - NGSS connections
  - Discussion questions
  - Vocabulary
  - External resources
- Saves JSON files to `/content/{category}/`
- Takes ~1-2 hours for all 72 images (rate limited)

**Sample output:**
```
[1/72] Generating: bee.jpeg
   ✅ Content saved to content/life-science/bee.json

   ⏳ Waiting 1000ms before next request...

[2/72] Generating: monarch-butterfly.jpeg
   ✅ Content saved to content/life-science/monarch-butterfly.json
...
```

**💡 Pro Tip**: Run this overnight or during lunch. You can stop and resume anytime - it won't regenerate existing content.

### Step 7: Test Your Website

```bash
# Go to the main sias folder
cd ..

# Start a local web server (Python 3)
python3 -m http.server 8000

# Open your browser to:
# http://localhost:8000
```

**What to test:**
- ✅ Hero page loads with parallax image
- ✅ Gallery displays all images
- ✅ Category filters work
- ✅ Search functionality works
- ✅ Clicking notebook icon opens modal
- ✅ Educational content displays correctly
- ✅ NGSS links are clickable
- ✅ Pedagogical tips have blue background
- ✅ UDL strategies have green background
- ✅ Copyright year is 2026

### Step 8: Review and Edit Content (Optional)

AI-generated content should be reviewed before classroom use:

1. Open any JSON file in `/content/{category}/`
2. Review the `content` field (markdown format)
3. Edit for accuracy, tone, or local relevance
4. Save and refresh the browser

### Step 9: Deploy Your Website

Choose one deployment option:

**Option A: Netlify (Easiest, Recommended)**
1. Push to GitHub
2. Connect Netlify to your repo
3. Deploy (automatic)
4. Get free HTTPS domain

**Option B: GitHub Pages**
1. Push to GitHub
2. Settings → Pages → Enable
3. Visit `yourusername.github.io/sias`

**Option C: Vercel**
1. Import GitHub repo
2. Auto-deploys on commit

## 🎉 You're Done!

Your Science In A Snapshot website is now ready to share with students and fellow educators!

## 📊 Expected Timeline

| Task | Time | Cost |
|------|------|------|
| Get API key | 5 minutes | Free |
| Categorize images | 10-15 minutes | ~$1 |
| Organize images | 1 minute | Free |
| Generate content | 1-2 hours | ~$6-9 |
| Review & edit | 30-60 minutes | Free |
| Deploy | 10 minutes | Free |
| **TOTAL** | **~2-3 hours** | **~$7-10** |

## 🆘 Common Issues

### "ANTHROPIC_API_KEY not set"
**Solution**: Make sure you've exported the environment variable or created the .env file

### "Failed to load gallery data"
**Solution**: Run `organize-images.js` to create `gallery-metadata.json`

### "Content not available" in modal
**Solution**: Run `generate-content.js` to create JSON content files

### Images show "Image not found"
**Solution**: Check that images are in `/images/{category}/` folders

### API rate limit errors
**Solution**: The scripts already include 1-second delays. If you still hit limits, increase `RATE_LIMIT_DELAY` in `tools/config.js`

## 🔄 Adding New Photos Later

Once set up, adding new photos is easy:

```bash
# 1. Place new image in category folder
cp new-photo.jpg images/life-science/

# 2. Generate content for it
cd tools
node generate-content.js --image new-photo.jpg

# 3. Update gallery metadata
node organize-images.js

# 4. Refresh website - done!
```

## 📚 Next Steps

- [ ] Review all educational content for accuracy
- [ ] Customize colors in `style.css` to match your brand
- [ ] Add your own hero image (replace `IMG_5343.jpg`)
- [ ] Share with fellow science teachers
- [ ] Collect feedback from students
- [ ] Add more photos as you collect them

## 💬 Need Help?

- Check the `README.md` for detailed documentation
- Review code comments in `tools/*.js` files
- Check the troubleshooting section in README

---

**Happy teaching! 📸🔬**

*Created with ❤️ for science educators*
