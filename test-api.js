const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testAPI() {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: 'Say hello'
      }]
    });
    console.log('✅ API works!');
    console.log('Response:', message.content[0].text);
  } catch (error) {
    console.error('❌ API Error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
  }
}

testAPI();
