# 🔒 Important Security Notes

## Files Protected from GitHub

The following files contain sensitive information (API keys) and are protected by `.gitignore`:

- `.env` - Your Anthropic API key
- `PROJECT_SUMMARY.md` - Contains API key in examples
- `QUICK_REFERENCE.md` - Contains API key in examples

## Public Documentation (Safe for GitHub)

Use these files instead when publishing to GitHub:

- ✅ `PROJECT_SUMMARY_PUBLIC.md` - Complete project overview (no API keys)
- ✅ `QUICK_REFERENCE_PUBLIC.md` - Quick command reference (no API keys)
- ✅ All other `.md` files are safe to publish

## Before Publishing to GitHub

1. **Verify `.gitignore` is working:**
   ```bash
   git status
   ```
   You should NOT see `.env`, `PROJECT_SUMMARY.md`, or `QUICK_REFERENCE.md` listed.

2. **Double-check no API keys are committed:**
   ```bash
   git diff --cached
   ```
   Review all changes before committing.

3. **If you accidentally committed API keys:**
   ```bash
   # Remove from staging
   git reset HEAD .env PROJECT_SUMMARY.md QUICK_REFERENCE.md
   
   # If already committed, you'll need to:
   # 1. Remove the sensitive files from history
   # 2. Rotate your API key at https://console.anthropic.com/
   ```

## Current `.gitignore` Protection

```
# Environment variables (contains API keys)
.env

# Documentation with API keys (create sanitized versions for GitHub)
PROJECT_SUMMARY.md
QUICK_REFERENCE.md

# Node modules
node_modules/

# Package lock
package-lock.json

# macOS
.DS_Store

# Logs
*.log
```

## For Other Contributors

If you clone this repo, you'll need to:

1. Create your own `.env` file:
   ```bash
   echo "ANTHROPIC_API_KEY=your_key_here" > .env
   ```

2. Get an API key from: https://console.anthropic.com/

3. Install dependencies:
   ```bash
   npm install @anthropic-ai/sdk dotenv
   ```

4. Start generating content:
   ```bash
   node generate-educational-content.js
   ```

## What's Safe to Share

✅ **Safe to commit to GitHub:**
- All HTML, CSS, JavaScript files
- All JSON content files (no sensitive data)
- All images
- Public documentation files (`*_PUBLIC.md`)
- Scripts (`*.js` files)
- `.gitignore`

❌ **Never commit to GitHub:**
- `.env` file
- Files with API keys
- `node_modules/`
- Personal notes with credentials

---

**Remember:** If you ever accidentally commit an API key to GitHub, immediately:
1. Delete the key from GitHub history
2. Rotate the API key in your Anthropic console
3. Create a new `.env` file with the new key
