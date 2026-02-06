# Automatic Deployment Setup (GitHub Actions)

## Problem

Currently, you have to manually run `firebase deploy --only hosting --project sias-8178a` every time you push to GitHub.

**This guide sets up automatic deployment** so your live site updates automatically when you push to GitHub.

---

## Setup Steps (15 minutes)

### Step 1: Generate Firebase Service Account Key

1. Go to Firebase Console:
   https://console.firebase.google.com/project/sias-8178a/settings/serviceaccounts/adminsdk

2. Click **"Generate new private key"**

3. Click **"Generate key"** in the confirmation dialog

4. Save the downloaded JSON file (keep it safe!)

### Step 2: Add Secret to GitHub

1. Go to your GitHub repository:
   https://github.com/mralexjones/sias2/settings/secrets/actions

2. Click **"New repository secret"**

3. Name: `FIREBASE_SERVICE_ACCOUNT`

4. Value: Copy and paste the **ENTIRE contents** of the JSON file you downloaded
   - Open the JSON file in a text editor
   - Select all (Cmd+A)
   - Copy (Cmd+C)
   - Paste into the "Secret" field

5. Click **"Add secret"**

### Step 3: Verify Workflow File

The workflow file has already been created at `.github/workflows/firebase-deploy.yml`

Check it's there:
```bash
cat .github/workflows/firebase-deploy.yml
```

You should see:
```yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches:
      - main
...
```

### Step 4: Test Automatic Deployment

1. Make a small change to your site:
   ```bash
   cd ~/Documents/sias2/sias2
   echo "<!-- Auto-deploy test -->" >> index.html
   ```

2. Commit and push:
   ```bash
   git add .
   git commit -m "Test auto-deploy"
   git push
   ```

3. Watch the deployment:
   https://github.com/mralexjones/sias2/actions

4. You should see:
   - ✅ Green checkmark = deployment successful
   - ❌ Red X = deployment failed (check logs)

5. Wait 1-2 minutes, then visit your site:
   https://sias-8178a.web.app/

   The change should be live!

---

## How It Works

```
You make changes locally
        ↓
   git add & commit
        ↓
    git push
        ↓
  GitHub receives push
        ↓
GitHub Actions triggers
        ↓
Firebase deployment runs
        ↓
Live site updates!
```

**Before**: Manual deploy every time
```bash
git push
firebase deploy --only hosting --project sias-8178a  # ← Manual step
```

**After**: Automatic on every push
```bash
git push  # ← That's it! Site updates automatically
```

---

## Troubleshooting

### "Deployment failed" in GitHub Actions

1. Go to https://github.com/mralexjones/sias2/actions
2. Click the failed workflow
3. Click the failed job
4. Read the error logs

Common issues:

**"Service account not found"**
- Make sure you added `FIREBASE_SERVICE_ACCOUNT` secret correctly
- Secret should contain the ENTIRE JSON file contents

**"Permission denied"**
- Your service account key might be expired
- Generate a new key (Step 1) and update the secret (Step 2)

**"Invalid project ID"**
- Check `.github/workflows/firebase-deploy.yml`
- Make sure `projectId: sias-8178a` is correct

### How to check if auto-deploy is working

```bash
# Make a test change
echo "<!-- Test $(date) -->" >> index.html

# Commit and push
git add .
git commit -m "Auto-deploy test"
git push

# Watch GitHub Actions
# https://github.com/mralexjones/sias2/actions

# Wait 1-2 minutes, then check your site
open https://sias-8178a.web.app/
```

### Want to disable auto-deploy temporarily?

Rename the workflow file:
```bash
mv .github/workflows/firebase-deploy.yml .github/workflows/firebase-deploy.yml.disabled
git add .
git commit -m "Disable auto-deploy"
git push
```

Re-enable:
```bash
mv .github/workflows/firebase-deploy.yml.disabled .github/workflows/firebase-deploy.yml
git add .
git commit -m "Re-enable auto-deploy"
git push
```

---

## What Gets Deployed

Only **hosting** (your website files) gets auto-deployed.

**Cloud Functions are NOT auto-deployed** (for safety).

To deploy functions, still run manually:
```bash
firebase deploy --only functions
```

---

## Benefits

✅ **No more manual deploys** - Push to GitHub and site updates automatically
✅ **Faster workflow** - Save 2-3 minutes every deployment
✅ **Never forget to deploy** - Changes always go live
✅ **Deployment history** - See all deployments in GitHub Actions
✅ **Rollback easily** - Revert a commit and it auto-deploys the previous version

---

## Next Steps

After setup, your workflow becomes:

```bash
# 1. Make changes locally
code index.html

# 2. Test locally (optional)
open index.html

# 3. Commit and push
git add .
git commit -m "Update homepage"
git push

# 4. Wait 1-2 minutes

# 5. Visit live site - changes are live!
open https://sias-8178a.web.app/
```

That's it! No more `firebase deploy` needed.
