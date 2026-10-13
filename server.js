import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Warning: GEMINI_API_KEY is not defined in your env file.');
}

const ai = new GoogleGenAI({ apiKey });

// AI Studio ke Verified Active Models (Ordered by Speed & Reliability)
const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-pro-latest'
];

// Helper: 1 second delay for spikes
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Safely parse JSON from AI response
function cleanAndParseJson(text) {
  if (!text) return {};
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return { error: 'Invalid JSON format', raw: text };
  }
}

// Multi-model Waterfall Generator Engine with Backoff
async function generateWithFallback(prompt, config = {}) {
  let lastError = null;

  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const model = FALLBACK_MODELS[i];
    try {
      console.log(`[Waterfall] Trying model (${i + 1}/${FALLBACK_MODELS.length}): ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config
      });
      console.log(`[Waterfall] Success with model: ${model}`);
      return response;
    } catch (err) {
      console.warn(`[Waterfall] Model ${model} failed (${err.message || '503 High Demand'}). Retrying next model...`);
      lastError = err;
      // 503 spike clear karne ke liye short pause
      await delay(800);
    }
  }

  throw lastError || new Error('All fallback models failed to generate content.');
}

// Health Check
app.get('/', (req, res) => {
  res.send('AI Copilot Cloud Engine is live and operational!');
});

// 1. Fix & Refactor Endpoint
app.post('/api/fix-code', async (req, res) => {
  try {
    const { code, language = 'javascript' } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required.' });
    }

    const prompt = `You are an expert senior software engineer. Fix, refactor, and optimize the following ${language} code. Fix bugs, improve performance, and enhance readability while keeping the original logic intact.

Return ONLY a valid JSON object with exact keys:
{
  "fixedCode": "the optimized and fixed code string",
  "explanation": "brief description of fixes and enhancements"
}

Code to fix:
${code}`;

    const response = await generateWithFallback(prompt, {
      responseMimeType: 'application/json'
    });
    const parsed = cleanAndParseJson(response.text);
    res.json(parsed);
  } catch (err) {
    console.error('All fallback models failed for Fix:', err.message);
    res.status(500).json({ error: err.message || 'Code refactoring failed across all models.' });
  }
});

// 2. Summarize Endpoint
app.post('/api/summarize-code', async (req, res) => {
  try {
    const { code, language = 'javascript' } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required.' });
    }

    const prompt = `Analyze and summarize the following ${language} code. 
Return ONLY a valid JSON object with exact keys:
{
  "summary": "a clear breakdown of what the code does",
  "suggestions": "recommended optimizations or security tips"
}

Code:
${code}`;

    const response = await generateWithFallback(prompt, {
      responseMimeType: 'application/json'
    });
    const parsed = cleanAndParseJson(response.text);
    res.json(parsed);
  } catch (err) {
    console.error('All fallback models failed for Summarize:', err.message);
    res.status(500).json({ error: err.message || 'Summarization failed across all models.' });
  }
});

// 3. Generate Fresh Code Endpoint
app.post('/api/generate-code', async (req, res) => {
  try {
    const { prompt, language = 'javascript' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const systemPrompt = `You are an expert software engineer. Generate high quality ${language} code based on this request: "${prompt}". Return ONLY a JSON object with two fields: "code" (the generated code string) and "explanation" (a concise summary of what was built). Do NOT wrap in markdown outside the JSON.`;

    const response = await generateWithFallback(systemPrompt, {
      responseMimeType: 'application/json'
    });
    const parsed = cleanAndParseJson(response.text);
    res.json(parsed);
  } catch (err) {
    console.error('All fallback models failed for Generate:', err.message);
    res.status(500).json({ error: err.message || 'Code generation failed across all models.' });
  }
});

// 4. Multi-Turn AI Chat Endpoint (With Waterfall Fallback)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    let conversationPrompt = 
      "You are an expert AI software engineer and pair programmer inside VS Code.\n" +
      "Help the developer write, refactor, debug, and explain code.\n" +
      "Always provide clean code inside standard markdown code blocks (e.g. ```javascript ... ```).\n" +
      "Support English, Hindi, and Hinglish naturally based on user input.\n\n";

    if (history && history.length > 0) {
      conversationPrompt += "--- Conversation History ---\n";
      history.forEach(item => {
        const roleName = item.role === 'user' ? 'Developer' : 'AI Assistant';
        conversationPrompt += `${roleName}: ${item.text}\n\n`;
      });
      conversationPrompt += "--- End of History ---\n\n";
    }

    conversationPrompt += `Developer: ${message}\nAI Assistant:`;

    const response = await generateWithFallback(conversationPrompt);
    res.json({ reply: response.text });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: err.message || 'Chat service error.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Fixer Engine running on port ${PORT}`);
});