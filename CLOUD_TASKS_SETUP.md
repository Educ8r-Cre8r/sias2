# Cloud Tasks Queue Setup Guide

This guide shows you how to set up Cloud Tasks to prevent batch upload failures.

## Why Use Cloud Tasks?

When you upload multiple images simultaneously:
- ❌ **Without queue**: All process at once → git conflicts, rate limits, failures
- ✅ **With queue**: Process one-at-a-time → no conflicts, reliable, automatic retries

## Setup Steps

### 1. Enable Cloud Tasks API

```bash
gcloud services enable cloudtasks.googleapis.com
```

Or enable via Firebase Console:
1. Go to https://console.cloud.google.com/apis/library/cloudtasks.googleapis.com
2. Click "Enable"

### 2. Create the Queue

```bash
gcloud tasks queues create image-processing-queue \
  --location=us-central1 \
  --max-dispatches-per-second=0.2 \
  --max-concurrent-dispatches=1
```

This creates a queue that processes **1 image at a time** with a maximum of **0.2 dispatches per second** (one every 5 seconds).

**Important**: Change `--location` if your Firebase project is in a different region.

### 3. Update Cloud Functions Dependencies

```bash
cd functions
npm install @google-cloud/tasks
```

### 4. Deploy the New Functions

**Option A: Replace existing function (recommended)**

Rename your current index.js as backup:
```bash
cd functions
mv index.js index-old.js
mv index-with-queue.js index.js
```

Then deploy:
```bash
firebase deploy --only functions
```

**Option B: Deploy alongside (test first)**

Edit `functions/index.js` and add at the top:
```javascript
const queueFunctions = require('./index-with-queue');
exports.onFileUploaded = queueFunctions.onFileUploaded;
exports.processImageTask = queueFunctions.processImageTask;
```

Then deploy:
```bash
firebase deploy --only functions:onFileUploaded,functions:processImageTask
```

### 5. Update Function Permissions

Grant the Cloud Functions service account permission to create tasks:

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe sias-8178a --format="value(projectNumber)")

# Grant permission
gcloud projects add-iam-policy-binding sias-8178a \
  --member="serviceAccount:${PROJECT_NUMBER}@appspot.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"
```

### 6. Test with Batch Upload

Upload 3-5 images at once and watch the logs:

```bash
firebase functions:log --only processImageTask
```

You should see images processed one-at-a-time, ~5 seconds apart.

## How It Works

### Architecture

```
User uploads image → Firebase Storage
                           ↓
                    onFileUploaded (fast trigger)
                           ↓
                    Creates Cloud Task
                           ↓
                    Cloud Tasks Queue
                    (1 at a time, 5s delay)
                           ↓
                    processImageTask
                    (actual processing)
```

### Benefits

1. **No Git Conflicts** - Only one function pushes to GitHub at a time
2. **No Rate Limiting** - 5-second delays prevent API throttling
3. **Automatic Retries** - Failed tasks retry automatically
4. **Better Monitoring** - Separate logs for queueing vs. processing
5. **Scalable** - Can adjust queue rate without changing code

## Configuration Options

### Adjust Processing Speed

Make queue faster (process every 3 seconds):
```bash
gcloud tasks queues update image-processing-queue \
  --location=us-central1 \
  --max-dispatches-per-second=0.33
```

Make queue slower (process every 10 seconds):
```bash
gcloud tasks queues update image-processing-queue \
  --location=us-central1 \
  --max-dispatches-per-second=0.1
```

### Enable Retry on Failure

```bash
gcloud tasks queues update image-processing-queue \
  --location=us-central1 \
  --max-attempts=3 \
  --min-backoff=10s
```

This retries failed tasks up to 3 times with 10-second delays.

## Monitoring

### View Queue Status

```bash
gcloud tasks queues describe image-processing-queue --location=us-central1
```

### View Pending Tasks

```bash
gcloud tasks list --queue=image-processing-queue --location=us-central1
```

### View Function Logs

```bash
# Upload trigger logs
firebase functions:log --only onFileUploaded

# Processing logs
firebase functions:log --only processImageTask
```

## Troubleshooting

### "Queue not found"

Make sure you created the queue:
```bash
gcloud tasks queues list --location=us-central1
```

If not listed, create it (see step 2).

### "Permission denied" when creating tasks

Grant the enqueuer role (see step 5).

### Tasks stuck in queue

Check function logs for errors:
```bash
firebase functions:log --only processImageTask
```

### Want to go back to old system?

```bash
cd functions
mv index.js index-with-queue.js
mv index-old.js index.js
firebase deploy --only functions
```

## Cost

Cloud Tasks pricing:
- **First 1 million operations/month: FREE**
- After that: $0.40 per million operations

For 100 images/month: **$0.00** (well within free tier)

## Summary

✅ **Before setup**: Upload batch → all fail, moved to failed folder
✅ **After setup**: Upload batch → queued → processed one-by-one → success!

Your images will now process reliably, even when uploading multiple at once.
