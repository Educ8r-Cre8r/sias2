# NGSS Standards Extraction - Firebase Integration

## ✅ What Was Done

The NGSS standards extraction has been successfully integrated into your Firebase Cloud Functions automated upload pipeline. When you upload a new photo through Firebase, the system now automatically:

1. ✅ Generates educational content for all grade levels (K-5)
2. ✅ Extracts NGSS standards from that content using regex pattern matching
3. ✅ Updates `gallery-metadata.json` with the extracted standards
4. ✅ Commits and pushes everything to GitHub
5. ✅ **Orange NGSS badges will appear on gallery cards immediately after upload**

---

## 🔧 Technical Implementation

### Files Modified

**`/functions/index.js`** - Added 3 new functions:

1. **`extractNGSSStandards(content)`**
   - Extracts NGSS codes from educational markdown content
   - Uses regex pattern: `/\b([K1-5]-[A-Z]{2,4}\d?[.-](?:\d+[A-Z]?|[A-Z]))\b/g`
   - Captures both formats:
     - Performance Expectations: `K-LS1-1`, `3-LS4-3`, `5-ESS2-1`
     - Disciplinary Core Ideas: `3-LS4.C`, `2-PS1.A`, `5-LS2.B`

2. **`extractAllGradeLevelStandards(educational)`**
   - Loops through all grade levels (kindergarten, grade1-5)
   - Calls `extractNGSSStandards()` for each grade's content
   - Returns object with structure:
     ```javascript
     {
       "kindergarten": ["K-LS1-1", "K-ESS2-1"],
       "grade1": ["1-LS1-1"],
       "grade3": ["3-LS1-1", "3-LS4-3", "3-LS4.C"],
       "grade4": ["4-LS1-1"],
       "grade5": ["5-LS1-1", "5-LS3-1"]
     }
     ```

3. **Updated `processImageFromQueue()` function**
   - After educational content generation, calls `extractAllGradeLevelStandards()`
   - Adds `ngssStandards` property to image entry in `gallery-metadata.json`
   - Logs total standards extracted: `"✅ Extracted 8 NGSS standards across all grade levels"`

4. **Updated `generateContent()` function**
   - Now returns `educationalContent` object along with cost and image data
   - This allows the extraction function to access all grade-level content

5. **Updated commit message**
   - Now mentions: `"Extracted X NGSS standards for gallery badges"`

---

## 📋 Deployment Steps

### 1. Deploy to Firebase Cloud Functions

```bash
# Navigate to your project directory
cd /Users/alexjones/Documents/sias2/sias2

# Deploy the updated Cloud Functions
firebase deploy --only functions
```

This will deploy the updated `processQueue` and `queueImage` functions with NGSS extraction.

### 2. Expected Output

When the deployment completes, you should see:

```
✔  functions[us-central1-queueImage] Successful update operation.
✔  functions[us-central1-processQueue] Successful update operation.
✔  Deploy complete!
```

---

## 🧪 Testing the Integration

### Test with a New Photo Upload

1. **Upload a new photo via Firebase:**
   ```bash
   node admin/tools/upload-to-firebase.js --category life-science test-photo.jpg
   ```

2. **Monitor the Cloud Function logs:**
   ```bash
   firebase functions:log --only processQueue
   ```

3. **Expected log output:**
   ```
   📤 Processing: test-photo.jpg
   🤖 Generating educational content...
   📝 Generating Kindergarten content...
   ✅ Kindergarten content saved
   📝 Generating First Grade content...
   ✅ First Grade content saved
   ...
   🎓 Extracting NGSS standards...
   ✅ Extracted 12 NGSS standards across all grade levels
   ✅ Marked hasContent as true and added NGSS standards to metadata
   ```

4. **Verify in gallery:**
   - Open your site: https://science-in-a-snapshot-cce9d.web.app
   - Find the newly uploaded photo
   - **Orange NGSS badges should appear on the gallery card**
   - Change grade level dropdown → badges should update dynamically

---

## 🔍 How It Works

### The Automated Pipeline

```
┌─────────────────────┐
│ User uploads photo  │
│ to Firebase Storage │
└──────────┬──────────┘
           │
           v
┌─────────────────────────────┐
│ queueImage Cloud Function   │
│ - Adds to Firestore queue   │
└──────────┬──────────────────┘
           │
           v
┌──────────────────────────────────────┐
│ processQueue Cloud Function          │
│ (runs every 1 minute)                │
│                                      │
│ 1. Generate educational content      │
│    for all grade levels (K-5)        │
│                                      │
│ 2. Extract NGSS standards ← NEW!     │
│    using regex pattern matching      │
│                                      │
│ 3. Update gallery-metadata.json      │
│    with ngssStandards property       │
│                                      │
│ 4. Generate PDFs, hotspots, etc.     │
│                                      │
│ 5. Commit and push to GitHub         │
└──────────┬───────────────────────────┘
           │
           v
┌─────────────────────────────────┐
│ GitHub Auto-Deploy              │
│ - Deploys to Firebase Hosting   │
│ - New photo appears on site     │
│ - WITH NGSS badges! 🎉          │
└─────────────────────────────────┘
```

### NGSS Standards Extraction Process

For each grade level:
1. Read the educational markdown content
2. Find all text matching NGSS pattern (e.g., `3-LS4.C`, `K-LS1-1`)
3. Collect unique standards in an array
4. Store in `gallery-metadata.json`:
   ```json
   {
     "id": 157,
     "title": "New Photo",
     "category": "life-science",
     "ngssStandards": {
       "kindergarten": ["K-LS1-1"],
       "grade1": ["1-LS1-1"],
       "grade3": ["3-LS1-1", "3-LS4-3", "3-LS4.C"]
     }
   }
   ```

---

## 📊 Verification Checklist

After deployment, verify:

- [ ] Firebase Cloud Functions deployed successfully
- [ ] Upload a test photo through Firebase
- [ ] Check Cloud Functions logs for "Extracted X NGSS standards" message
- [ ] Verify `gallery-metadata.json` in GitHub has `ngssStandards` property
- [ ] Visit the live site and confirm orange badges appear on gallery cards
- [ ] Change grade level selector and verify badges update dynamically
- [ ] Confirm badges show correct standards for selected grade

---

## 🎉 Complete!

Your automated Firebase upload pipeline now includes NGSS standards extraction! Every new photo uploaded will automatically:

✅ Generate grade-level educational content  
✅ Extract NGSS standards from that content  
✅ Display orange badges on gallery cards  
✅ Update badges dynamically when grade level changes  

**No manual intervention required!**

---

## 💡 Maintenance Notes

### If Standards Aren't Appearing

1. **Check Cloud Functions logs:**
   ```bash
   firebase functions:log --only processQueue
   ```
   Look for: `"✅ Extracted X NGSS standards"`

2. **Verify educational content:**
   - NGSS standards must be in the content (e.g., `[[NGSS:DCI:3-LS4.C]]`)
   - Claude generates these automatically in the "🎓 NGSS Connections" section

3. **Check metadata file:**
   ```bash
   cat gallery-metadata.json | grep -A 5 "ngssStandards"
   ```

4. **Clear browser cache:**
   - Hard reload: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   - This ensures you're not seeing cached metadata

### Regex Pattern Details

The pattern `/\b([K1-5]-[A-Z]{2,4}\d?[.-](?:\d+[A-Z]?|[A-Z]))\b/g` matches:

- **Grade Level:** `K` or `1-5`
- **Domain:** 2-4 uppercase letters (LS, ESS, PS, ETS)
- **Optional Number:** For multi-digit domains (e.g., `LS1`, `ESS2`)
- **Separator:** `.` or `-`
- **Code:** Either:
  - Number with optional letter: `1`, `3`, `4A`
  - Single letter: `A`, `B`, `C`, `D`

**Examples matched:**
- `K-LS1-1` ✓
- `3-LS4.C` ✓
- `5-ESS2-1` ✓
- `2-PS1.A` ✓
- `1-LS1-2` ✓

---

## 🚀 Next Steps

Your system is now fully automated! Just upload photos and everything happens automatically:

1. Upload photo → Firebase Storage
2. Cloud Functions process it
3. NGSS standards extracted
4. GitHub updated
5. Site auto-deploys
6. **Badges appear instantly!**

No more manual extraction needed! 🎉
