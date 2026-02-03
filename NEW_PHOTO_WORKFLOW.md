# New Photo Workflow

This guide explains how to add new photos to Science In A Snapshot and automatically generate K-5 educational content.

## Quick Start

### 1. Check for New Photos

```bash
node check-new-photos.js
```

This will scan your `images/` folder and tell you which photos don't have content yet.

### 2. Generate Content for All Missing Photos

```bash
node generate-educational-content.js
```

This will:
- Detect all photos without educational content
- Prompt you to assign each photo to a category (if needed)
- Generate K-5 educational content automatically
- Estimated cost: ~$0.01 per photo

## Detailed Workflow

### Adding a New Photo

1. **Copy the image** to the `images/` folder
   - Supported formats: JPG, PNG, GIF, WebP
   - Recommended naming: Use descriptive filenames (e.g., `butterfly-pollination.jpg`)

2. **Run the check script** to verify it's detected:
   ```bash
   node check-new-photos.js
   ```

3. **Choose the category** for your photo:
   - `earth-space-science` - Rocks, weather, astronomy, geology
   - `life-science` - Plants, animals, ecosystems, life cycles
   - `physical-science` - Forces, energy, matter, electricity

4. **Create a basic JSON file** in the appropriate category folder:

   For example, create `content/life-science/butterfly.json`:
   ```json
   {
     "id": "butterfly",
     "title": "Butterfly Pollination",
     "description": "A butterfly collecting nectar from a flower",
     "image": "butterfly-pollination.jpg",
     "category": "life-science",
     "tags": ["pollination", "insects", "flowers", "ecosystems"],
     "content": "Basic 3rd grade content here"
   }
   ```

5. **Generate K-5 content**:
   ```bash
   node generate-educational-content.js --photo=butterfly.json --category=life-science
   ```

   Or generate for all photos at once:
   ```bash
   node generate-educational-content.js
   ```

### What Gets Generated

For each photo, the script generates:

- ✅ **Kindergarten content** - Very simple language, observation-focused
- ✅ **1st Grade content** - Basic concepts, hands-on activities
- ✅ **2nd Grade content** - Simple patterns and relationships
- ✅ **3rd Grade content** - Balanced complexity (your current level)
- ✅ **4th Grade content** - More complex concepts, data analysis
- ✅ **5th Grade content** - Advanced topics, experimental design

Each grade level includes:
- Photo description
- Scientific phenomena explanation
- Core science concepts
- NGSS connections
- Discussion questions
- Vocabulary
- Extension activities
- Teaching tips
- UDL suggestions

## Scripts Reference

### `check-new-photos.js`
Fast check to see which photos need content. No API calls, instant results.

```bash
node check-new-photos.js
```

### `generate-educational-content.js`
Main content generation script with Claude API.

```bash
# Generate for all photos
node generate-educational-content.js

# Generate for specific category
node generate-educational-content.js --category=life-science

# Generate for specific photo
node generate-educational-content.js --photo=butterfly.json --category=life-science

# Dry run (see what would be generated without API calls)
node generate-educational-content.js --dry-run
```

### `auto-generate-content.js`
Advanced script for fully automated content generation (beta).

```bash
node auto-generate-content.js
```

## Cost Estimates

Using Claude 3 Haiku (most economical):
- **Per photo**: ~$0.01 (generates 6 grade levels)
- **10 photos**: ~$0.10
- **50 photos**: ~$0.50
- **100 photos**: ~$1.00

Very affordable for high-quality, grade-differentiated content!

## Tips

1. **Use descriptive filenames** - The script uses filenames as hints for content generation
2. **Batch process** - Generate content for multiple photos at once to save time
3. **Review generated content** - Always review and adjust content as needed
4. **Test on the site** - Use the grade dropdown to verify all levels work correctly

## Troubleshooting

### "API key not found"
Make sure your `.env` file exists and contains:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### "Model not found" errors
The script uses `claude-3-haiku-20240307` which is stable and active. If you see errors, check the [model status page](https://platform.claude.com/docs/en/about-claude/model-deprecations).

### Photo shows but no content
1. Check that the JSON file exists in the correct category folder
2. Verify the `image` field matches the actual image filename
3. Refresh the page and clear browser cache

## Support

For issues or questions:
1. Check the console for error messages
2. Run with `--dry-run` to test without API calls
3. Verify your `.env` file is configured correctly
