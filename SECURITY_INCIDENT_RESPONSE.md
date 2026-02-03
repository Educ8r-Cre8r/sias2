# 🚨 Security Incident Response - Firebase API Key Exposure

## What Happened

On February 3, 2026, GitHub detected an exposed Firebase API key in `firebase-config.js` (commit 7093134d).

## Actions Taken

### ✅ Immediate Response (Completed)

1. **Added firebase-config.js to .gitignore** - File will no longer be tracked
2. **Created firebase-config.example.js** - Safe template for others
3. **Removed file from current commit** - Stopped tracking the file
4. **Pushed fix to GitHub** - Security fix is live

### ⚠️ CRITICAL: Actions YOU Must Take NOW

## 1. Rotate Your Firebase API Key (URGENT)

Your old API key is still in git history and needs to be invalidated:

1. **Go to Firebase Console:**
   https://console.firebase.google.com/project/science-in-a-snapshot-cce9d/settings/general

2. **Under "Your apps" section:**
   - Find your Web app
   - Click the settings gear icon
   - Delete the app OR regenerate credentials

3. **Create a new web app:**
   - Click "Add app" → Web
   - Register new app
   - Copy the NEW config

4. **Update your local firebase-config.js:**
   ```bash
   cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias2/sias2"
   # Edit firebase-config.js with NEW credentials
   ```

## 2. Clean Git History (Optional but Recommended)

The old key is still in git history. To remove it completely:

### Option A: Use BFG Repo-Cleaner (Easiest)

```bash
# Install BFG (if not installed)
brew install bfg

# Clone a fresh copy
cd ~/Desktop
git clone --mirror https://github.com/Educ8r-Cre8r/sias2.git

# Remove the file from ALL commits
cd sias2.git
bfg --delete-files firebase-config.js

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (WARNING: This rewrites history)
git push --force
```

### Option B: Use git filter-branch

```bash
cd "/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias2/sias2"

git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch firebase-config.js" \
  --prune-empty --tag-name-filter cat -- --all

git push origin --force --all
```

## 3. Update Firebase Security Rules

While your API key is being rotated, tighten your Firestore security rules:

Go to: https://console.firebase.google.com/project/science-in-a-snapshot-cce9d/firestore/rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Rate limiting: Only allow reasonable number of requests
    match /ratings/{ratingId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['photoId', 'totalRatings', 'totalStars', 'averageRating']);
      allow update: if request.resource.data.totalRatings > resource.data.totalRatings
                    && request.resource.data.totalRatings <= resource.data.totalRatings + 1;
    }

    match /views/{viewId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['photoId', 'count']);
      allow update: if request.resource.data.count > resource.data.count
                    && request.resource.data.count <= resource.data.count + 5;
    }
  }
}
```

## 4. Monitor Your Firebase Usage

Check for any suspicious activity:

1. Go to Firebase Console → Usage
2. Look for unusual spikes in reads/writes
3. Check if someone abused the exposed key

## Why This Happened

Firebase API keys in `firebase-config.js` were committed to git before being added to `.gitignore`.

## Prevention Going Forward

### ✅ Already Protected:
- `.env` - In .gitignore
- `firebase-config.js` - Now in .gitignore
- `PROJECT_SUMMARY.md` - In .gitignore (had API key)
- `QUICK_REFERENCE.md` - In .gitignore (had API key)

### ✅ Safe Templates Created:
- `.env.example` - Safe template
- `firebase-config.example.js` - Safe template
- `*_PUBLIC.md` files - Safe documentation

### 🔒 Best Practices:
1. **Never commit real API keys** - Always use .gitignore first
2. **Use environment variables** - Store secrets in .env files
3. **Rotate keys regularly** - Change keys periodically
4. **Monitor usage** - Watch for suspicious activity
5. **Use security rules** - Firestore rules prevent abuse

## Timeline

- **2026-02-03 07:21** - firebase-config.js created with API keys
- **2026-02-03 (commit 7093134)** - File committed to GitHub
- **2026-02-03 (GitHub scan)** - Secret detected by GitHub
- **2026-02-03 (commit be606f9)** - Security fix applied
- **2026-02-03 (PENDING)** - YOU need to rotate the API key

## Status

- ✅ File removed from tracking
- ✅ Added to .gitignore
- ✅ Template created
- ✅ Fix pushed to GitHub
- ⚠️ **WAITING: You must rotate API key**
- ⏳ **OPTIONAL: Clean git history**

## Questions?

If you need help with any of these steps, let me know!

---

**Remember:** The old API key is still valid until you rotate it in Firebase Console!
