# Educational Content Generator

This script automatically generates grade-level educational content (K-5) for all photos in your gallery using the Claude Haiku API.

## Setup

### 1. Install Node.js Dependencies

```bash
npm install @anthropic-ai/sdk
```

### 2. Get Your Anthropic API Key

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (it starts with `sk-ant-`)

### 3. Set Your API Key

**On Mac/Linux:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**On Windows (Command Prompt):**
```cmd
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**On Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

## Usage

### Generate Content for All Photos

```bash
node generate-educational-content.js
```

This will process all photos in all categories and generate K-5 educational content for each.

### Generate Content for Specific Category

```bash
node generate-educational-content.js --category=life-science
```

Available categories:
- `earth-space-science`
- `life-science`
- `physical-science`

### Generate Content for Specific Photo

```bash
node generate-educational-content.js --photo=beach.json
```

You can also combine flags:

```bash
node generate-educational-content.js --category=earth-space-science --photo=dawn.json
```

### Dry Run (No API Calls)

Test what the script would do without making any API calls:

```bash
node generate-educational-content.js --dry-run
```

## Cost Estimation

Using Claude Haiku (recommended):
- **Per photo**: ~$0.01 (6 grade levels × ~$0.0015 each)
- **For 80 photos**: ~$0.80
- **For all ~80 photos**: Less than $1.00

The script automatically:
- Skips photos that already have educational content
- Adds small delays between API calls to respect rate limits
- Shows progress and cost estimates

## What Gets Generated

For each photo, the script generates grade-specific content (K-5) including:

- 📸 Photo Description (age-appropriate)
- 🔬 Scientific Phenomena explanation
- 📚 Core Science Concepts
- 🎓 NGSS Connections
- 💬 Discussion Questions (with DOK levels)
- 📖 Vocabulary
- 🌡️ Extension Activities
- Pedagogical tips and UDL suggestions

## Content Differentiation by Grade

- **K-2**: Simpler vocabulary, observation-focused, hands-on activities
- **3**: Balanced (your existing content level)
- **4-5**: More complex concepts, data analysis, experimental design

## Example Output Structure

The script updates your existing JSON files to include an `educational` object:

```json
{
  "id": 44,
  "title": "Beach Ecosystem",
  "content": "...general content...",
  "educational": {
    "kindergarten": "...K content...",
    "grade1": "...1st grade content...",
    "grade2": "...2nd grade content...",
    "grade3": "...3rd grade content...",
    "grade4": "...4th grade content...",
    "grade5": "...5th grade content..."
  }
}
```

## Safety Features

- ✅ Never overwrites existing educational content (skips photos that already have it)
- ✅ Preserves all original photo data
- ✅ Creates properly formatted JSON
- ✅ Includes error handling and progress reporting
- ✅ Rate limiting to avoid API throttling

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
Make sure you've exported the environment variable in your current terminal session.

### "Error: 401 Unauthorized"
Your API key is invalid or expired. Generate a new one from the Anthropic Console.

### "Error: Rate limit exceeded"
The script has built-in delays, but if you hit rate limits, wait a few minutes and try again.

### Photos being skipped
If a photo already has the `educational` object in its JSON, it will be skipped. To regenerate:
1. Manually remove the `educational` object from the JSON file
2. Run the script again for that specific photo

## Tips

1. **Start small**: Test with a single photo first:
   ```bash
   node generate-educational-content.js --photo=dawn.json
   ```

2. **Use dry run**: Preview what will happen:
   ```bash
   node generate-educational-content.js --dry-run
   ```

3. **Process by category**: Generate content one category at a time:
   ```bash
   node generate-educational-content.js --category=earth-space-science
   ```

4. **Check results**: After running, open a few JSON files to verify the content quality before running for all photos.

## Support

If you encounter issues:
1. Check that Node.js is installed: `node --version`
2. Verify dependencies are installed: `npm list @anthropic-ai/sdk`
3. Confirm your API key is valid at https://console.anthropic.com/
4. Review the error messages - they usually indicate what went wrong

---

**Note**: The two sample photos (`dawn.json` and `beach.json`) already have educational content generated manually as examples. The script will skip these automatically.
