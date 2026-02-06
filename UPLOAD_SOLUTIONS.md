# Batch Upload Solutions

## Problem

When uploading multiple images to Firebase Storage simultaneously, they all fail and go to the "failed" folder.

**Root Cause**: Multiple Cloud Functions try to push to GitHub at the same time, causing git conflicts.

## Solution 1: Upload Script with 5-Second Delays ✅ (Quick Fix)

Use the provided script to upload images one-at-a-time with 5-second delays.

### Usage

```bash
cd admin/tools

# Upload single image
node upload-to-firebase.js --category life-science butterfly.jpg

# Upload multiple images
node upload-to-firebase.js --category earth-space-science sunrise.jpg sunset.jpg clouds.jpg

# Upload all JPGs in a folder
node upload-to-firebase.js --category physical-science ~/Desktop/science-photos/*.jpg
```

### Setup (One-time)

1. Download your Firebase service account key:
   - Go to https://console.firebase.google.com/project/sias-8178a/settings/serviceaccounts/adminsdk
   - Click "Generate new private key"
   - Save as `firebase-service-account.json` in project root

2. Install dependencies:
   ```bash
   cd admin/tools
   npm install
   ```

3. Test it:
   ```bash
   node upload-to-firebase.js --category life-science test.jpg
   ```

### How It Works

```
Your computer → Upload image 1 → Firebase Storage → Cloud Function processes
     ↓
   Wait 5 seconds
     ↓
Your computer → Upload image 2 → Firebase Storage → Cloud Function processes
     ↓
   Wait 5 seconds
     ↓
   ... continues one-at-a-time
```

**Pros**:
- ✅ Easy to use (just run the script)
- ✅ No Firebase config needed
- ✅ Works immediately

**Cons**:
- ❌ Requires running a script (not drag-and-drop)
- ❌ Manual 5-second delays (slower for large batches)

---

## Solution 2: Cloud Tasks Queue System 🚀 (Robust, Long-term)

Set up a Cloud Tasks queue to process images automatically, one-at-a-time, even if uploaded simultaneously.

### Setup

Follow the detailed guide in `CLOUD_TASKS_SETUP.md`:

```bash
# 1. Enable Cloud Tasks
gcloud services enable cloudtasks.googleapis.com

# 2. Create queue
gcloud tasks queues create image-processing-queue \
  --location=us-central1 \
  --max-dispatches-per-second=0.2 \
  --max-concurrent-dispatches=1

# 3. Install dependencies
cd functions
npm install @google-cloud/tasks

# 4. Deploy new functions
firebase deploy --only functions
```

Full instructions: [CLOUD_TASKS_SETUP.md](./CLOUD_TASKS_SETUP.md)

### How It Works

```
Upload all images at once (drag & drop)
          ↓
    Firebase Storage
          ↓
   Quick trigger adds to queue
          ↓
    Cloud Tasks Queue
   (processes 1 at a time)
          ↓
  Image 1 → Process → GitHub
  Image 2 → Process → GitHub (5s later)
  Image 3 → Process → GitHub (5s later)
```

**Pros**:
- ✅ Upload multiple images via drag-and-drop
- ✅ Automatic queueing (no manual delays)
- ✅ Automatic retries on failure
- ✅ Configurable processing speed
- ✅ Free (within Firebase limits)

**Cons**:
- ❌ Requires one-time setup (~20 minutes)
- ❌ More complex (but worth it long-term)

---

## Comparison

| Feature | Solution 1: Script | Solution 2: Cloud Tasks |
|---------|-------------------|------------------------|
| **Ease of use** | Run script each time | Drag & drop uploads |
| **Setup time** | 5 minutes | 20 minutes |
| **Reliability** | Manual delays | Automatic queue |
| **Retries** | None | Automatic |
| **Speed** | Fixed 5s delay | Configurable |
| **Cost** | Free | Free |

## Recommendation

**For today**: Use **Solution 1** (upload script) to upload your batch of images.

**For long-term**: Set up **Solution 2** (Cloud Tasks) this weekend for automatic, reliable processing.

---

## Bonus: How to Check Failed Images

If images are in the "failed" folder, check Firebase Storage:

1. Go to https://console.firebase.google.com/project/sias-8178a/storage
2. Navigate to `failed/` folder
3. Download images
4. Re-upload using Solution 1 (upload script)

Or check via CLI:
```bash
gsutil ls gs://sias-8178a.firebasestorage.app/failed/
```

---

## Need Help?

- **Upload script issues**: Check `admin/tools/upload-to-firebase.js` logs
- **Cloud Tasks issues**: See `CLOUD_TASKS_SETUP.md` troubleshooting section
- **Function logs**: `firebase functions:log`
