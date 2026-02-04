# Science In A Snapshot - Automated Image Processing Guide

## ✨ What This Does

You now have **fully automated image processing**! Simply upload an image to Firebase Storage, and the system will:

1. ✅ Validate file size (must be under 2MB)
2. ✅ Check for duplicates
3. ✅ Generate educational content for all 6 grade levels (K-5)
4. ✅ Update `gallery-metadata.json`
5. ✅ Commit and push to GitHub
6. ✅ Log results with cost summary

**No manual work required!** 🎉

---

## 📤 How to Upload Images

### Step 1: Go to Firebase Console
Visit: https://console.firebase.google.com/project/sias-8178a/storage

### Step 2: Navigate to the Upload Folder
Click into the appropriate category folder:
- `uploads/life-science/` - for organisms, plants, animals, ecosystems
- `uploads/earth-space-science/` - for geology, weather, rocks, fossils
- `uploads/physical-science/` - for forces, energy, matter, experiments

### Step 3: Upload Your Image
- Click "Upload file"
- Select your image (JPEG, PNG, GIF)
- **Must be under 2MB** (the system will reject larger files)

### Step 4: Wait (30-60 seconds)
The Cloud Function processes automatically!

---

## 📊 Monitoring Progress

### Option 1: Firebase Console Logs (Recommended)
1. Go to: https://console.firebase.google.com/project/sias-8178a/functions/logs
2. You'll see real-time logs showing:
   - ✅ File detected
   - ✅ Content generation progress
   - ✅ Success message with cost
   - ❌ Any errors

### Option 2: Command Line
```bash
cd /path/to/sias2
npx firebase functions:log
```

---

## 💰 Cost Information

**Per Image:**
- Content generation: ~$0.03-0.05 per image
- All 6 grade levels included in that price
- Firebase infrastructure: FREE (under free tier limits)

**Monthly Estimate:**
- 20 images/month = ~$0.80-1.00
- 50 images/month = ~$2.00-2.50

---

## 🔍 What Happens Behind the Scenes

When you upload `my-image.jpg` to `uploads/life-science/`:

1. **Detection** (instant)
   - Cloud Function triggers automatically
   - Downloads image to temp storage

2. **Validation** (1-2 seconds)
   - Checks file size (< 2MB)
   - Checks for duplicates
   - If duplicate, moves to `duplicates/` folder and stops

3. **Repository Setup** (5-10 seconds)
   - Clones your GitHub repo
   - Copies image to `images/life-science/my-image.jpg`
   - Updates `gallery-metadata.json` with new entry

4. **Content Generation** (20-30 seconds)
   - Generates content for Kindergarten
   - Generates content for First Grade
   - Generates content for Second Grade
   - Generates content for Third Grade
   - Generates content for Fourth Grade
   - Generates content for Fifth Grade
   - 1 second delay between each to avoid rate limits

5. **GitHub Commit** (3-5 seconds)
   - Commits all changes
   - Pushes to main branch
   - Includes cost in commit message

6. **Cleanup** (instant)
   - Moves processed file to `processed/` folder in Storage
   - Deletes temp files
   - Logs success with total cost

**Total time: 30-60 seconds** ⏱️

---

## 🚨 Error Handling

### If Processing Fails

The system automatically moves failed files to `failed/` folder in Firebase Storage with a timestamp.

**Check the logs to see what went wrong:**
```bash
npx firebase functions:log
```

**Common issues:**
- **File too large**: Must be under 2MB
- **Invalid file type**: Must be JPEG, PNG, or GIF
- **Duplicate detected**: Image already exists with that filename
- **API error**: Anthropic API might be down (rare)

### If You See an Error in Logs

1. Check the `failed/` folder in Firebase Storage
2. Read the error message in the logs
3. Fix the issue (resize image, rename file, etc.)
4. Re-upload to the appropriate `uploads/` folder

---

## 📁 Folder Structure in Firebase Storage

```
sias-8178a.firebasestorage.app/
├── uploads/                    ← Upload here!
│   ├── life-science/
│   ├── earth-space-science/
│   └── physical-science/
├── processed/                  ← Successfully processed files
│   ├── life-science/
│   ├── earth-space-science/
│   └── physical-science/
├── duplicates/                 ← Duplicate files moved here
│   └── ...
└── failed/                     ← Failed processing (check logs)
    └── ...
```

---

## 🛠️ Maintenance

### Update API Keys

If you need to update your Anthropic or GitHub tokens:

1. Edit the `.env` file:
```bash
cd /path/to/sias2/functions
nano .env
```

2. Update the keys:
```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

3. Redeploy:
```bash
cd ..
npx firebase deploy --only functions
```

### Check Function Status

```bash
cd /path/to/sias2
npx firebase functions:list
```

Should show:
```
Function: processImage
Status: ACTIVE
Trigger: google.storage.object.finalize
Memory: 1024 MB
Timeout: 540 seconds
```

---

## 📝 Tips & Best Practices

### File Naming
- Use descriptive names: `box-turtle.jpg`, `sunset.jpg`
- Avoid special characters (use hyphens, not spaces)
- The system auto-generates titles from filenames

### Image Quality
- Keep files under 2MB (use compression if needed)
- 1024x768 or higher resolution recommended
- JPEG is best for photos, PNG for diagrams

### Batch Uploads
- You can upload multiple files at once
- Each will be processed independently
- Processing happens in parallel (no wait between uploads)

### Checking Results
- Wait 1-2 minutes after upload
- Pull latest from GitHub: `git pull`
- Check `gallery-metadata.json` for new entry
- Check `content/[category]/[filename]-*.json` files

---

## 🆘 Troubleshooting

### "Memory limit exceeded"
This shouldn't happen anymore (we set 1GB), but if it does:
```bash
# Already configured, but if you need to increase further:
# Edit functions/index.js line 48:
memory: '2GB',  # Change from 1GB to 2GB
```

### "Authentication failed"
Your GitHub token might have expired. Create a new one:
1. Go to: https://github.com/settings/tokens
2. Generate new token (classic)
3. Check "repo" scope
4. Update `functions/.env` with new token
5. Redeploy: `npx firebase deploy --only functions`

### "Model not found"
Update to the latest Claude model in `functions/index.js`:
```javascript
model: 'claude-sonnet-4-20250514',  // Line 280
```

---

## 🎓 What You Learned

You built a **serverless automation pipeline** using:
- **Firebase Cloud Functions** - backend automation
- **Firebase Storage** - file hosting with triggers
- **Anthropic API** - AI content generation
- **GitHub API** - automated git commits
- **Node.js** - server-side JavaScript

**This architecture is production-ready and scales automatically!**

---

## 📞 Quick Reference

**Firebase Console**: https://console.firebase.google.com/project/sias-8178a/overview
**Storage Browser**: https://console.firebase.google.com/project/sias-8178a/storage
**Function Logs**: https://console.firebase.google.com/project/sias-8178a/functions/logs
**GitHub Repo**: https://github.com/Educ8r-Cre8r/sias2

**Cost per image**: $0.03-0.05
**Processing time**: 30-60 seconds
**Max file size**: 2MB

---

## 🚀 Future Enhancements (Optional)

Ideas for later:
- Add email notifications when processing completes
- Build a simple web UI for uploading (instead of Firebase Console)
- Add image compression automatically if over 2MB
- Generate multiple image sizes (thumbnails, etc.)
- Add webhook to Slack/Discord for notifications
- Batch process multiple images with progress tracking

**But for now, you're all set!** Just upload and let the automation handle the rest. 🎉
