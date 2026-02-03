/**
 * Configuration file for Science In A Snapshot automation tools
 *
 * To use these tools, you need to set up your Anthropic API key:
 * 1. Create an account at https://console.anthropic.com/
 * 2. Generate an API key
 * 3. Set environment variable: export ANTHROPIC_API_KEY="sk-ant-..."
 *
 * Or create a .env file in the tools directory with:
 * ANTHROPIC_API_KEY=sk-ant-your-key-here
 */

export const config = {
  // Claude API Configuration
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.7,

  // Paths
  IMAGES_DIR: '../images',
  CONTENT_DIR: '../content',

  // Categories
  CATEGORIES: {
    'life-science': {
      name: 'Life Science',
      description: 'Organisms, ecosystems, life processes, plants, animals, fungi',
      keywords: ['animal', 'plant', 'bird', 'insect', 'mammal', 'reptile', 'fungi', 'mushroom', 'bee', 'butterfly', 'flower', 'tree', 'life', 'organism', 'ecosystem']
    },
    'earth-space-science': {
      name: 'Earth & Space Science',
      description: 'Geology, weather, astronomy, Earth systems, fossils, rocks',
      keywords: ['rock', 'fossil', 'geology', 'earth', 'landscape', 'beach', 'water', 'stone', 'mineral', 'weather', 'space', 'astronomy']
    },
    'physical-science': {
      name: 'Physical Science',
      description: 'Forces, energy, matter, physical changes, electricity, light, sound',
      keywords: ['energy', 'force', 'matter', 'mixture', 'experiment', 'conductor', 'electricity', 'light', 'sound', 'reflection', 'buoyancy', 'static', 'physical', 'chemistry']
    }
  },

  // Image Processing
  THUMBNAIL_WIDTH: 300,
  IMAGE_QUALITY: 85,

  // API Rate Limiting
  RATE_LIMIT_DELAY: 1000, // 1 second between requests
  MAX_RETRIES: 3
};

export default config;
