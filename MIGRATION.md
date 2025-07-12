# Migration Guide: ChatGPT/Bing to Groq

This document outlines the changes made to migrate from ChatGPT and Bing AI to Groq AI.

## Changes Made

### 1. Discord Commands
- **Removed**: `/ask-gpt` and `/ask-bing` commands
- **Added**: `/ask-groq` command for Groq AI interactions

### 2. API Integration
- **Changed**: API endpoint from ChatGPT proxy to Groq's OpenAI-compatible API
- **Updated**: Request format to use Groq's chat completions endpoint
- **Added**: Groq API key authentication

### 3. Environment Variables
**Old Variables (Removed):**
- `CHATGPT_PROXY_URL`
- `CHATGPT_INITIAL_PROMPT`
- `CLIENT_TO_USE`

**New Variables (Added):**
- `GROQ_API_URL` - Groq API endpoint (default: https://api.groq.com/openai/v1)
- `GROQ_API_KEY` - Your Groq API key
- `GROQ_MODEL` - Groq model to use (default: llama3-8b-8192)
- `GROQ_INITIAL_PROMPT` - Initial prompt for Groq

### 4. Database Changes
- **Updated**: Collection names from `chatgpt` and `bing` to `groq`
- **Simplified**: Conversation storage (removed Bing-specific fields)
- **Maintained**: Chat history and user settings structure

### 5. Response Handling
- **Updated**: Response parsing to work with Groq's API format
- **Maintained**: Embed formatting and Discord message structure
- **Preserved**: Typing effect and streaming simulation

## Setup Instructions

1. **Get a Groq API Key**:
   - Sign up at [groq.com](https://groq.com)
   - Generate an API key from your dashboard

2. **Update Environment Variables**:
   ```bash
   # Copy .env.example to .env
   cp .env.example .env
   
   # Edit .env with your credentials
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   GROQ_API_KEY=your_groq_api_key
   ```

3. **Deploy the Bot**:
   - The bot will automatically register the new `/ask-groq` command
   - Old commands (`/ask-gpt`, `/ask-bing`) will be removed

## Available Groq Models

The bot supports all Groq models. Popular options include:
- `llama3-8b-8192` (default) - Fast and efficient
- `llama3-70b-8192` - More capable but slower
- `mixtral-8x7b-32768` - Good balance of speed and capability
- `gemma2-9b-it` - Google's Gemma model

## Benefits of Groq

- **Speed**: Groq provides extremely fast inference
- **Cost**: Competitive pricing compared to other providers
- **Reliability**: High availability and consistent performance
- **OpenAI Compatibility**: Uses OpenAI-compatible API format

## Troubleshooting

1. **API Key Issues**: Ensure your Groq API key is valid and has sufficient credits
2. **Model Not Found**: Check that the model name in `GROQ_MODEL` is correct
3. **Rate Limits**: Groq has generous rate limits, but monitor usage if needed

## Backward Compatibility

- Existing chat history will be preserved but stored under the new `groq` collection
- User settings and preferences remain unchanged
- The bot maintains the same user experience with faster responses