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
  console.error('Warning: GEMINI_API_KEY is not defined in your .env file.');
}

const ai = new GoogleGenAI({ apiKey });

// Waterfall list of models: shifts down automatically if high demand (503) or rate limits occur
const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

// Helper to strip markdown code fences safely before JSON parsing
function cleanAndParseJson(text) {
  if (!text) return {};
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// Multi-model executor with automatic failover
async function generateWithFallback(prompt, config = {}) {
  let lastError;
  for (const model of FALLBACK_MODELS) {
    try {
      console.log(`Attempting request with model: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config
      });
      console.log(`Success using model: ${model}`);
      return response;
    } catch (err) {
      console.warn(`Model ${model} failed (${err.message || 'Unavailable'}). Shifting to next model...`);
      lastError = err;
    }
  }
  throw lastError;
}

// Endpoint 1: Fix & Refactor
app.post('/api/fix-code', async (req, res) => {
  const { code, language } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required.' });

  const prompt = `You are an expert developer and code refactor engine.
Analyze and repair the following ${language || 'code'} snippet.
Fix bugs, correct syntax errors, and optimize performance.
Return strictly a valid JSON object without markdown fences:
{
  "fixedCode": "the corrected code here",
  "explanation": "brief summary of improvements made"
}

Code:
${code}`;

  try {
    const response = await generateWithFallback(prompt, {
      responseMimeType: 'application/json'
    });
    const parsed = cleanAndParseJson(response.text);
    res.json(parsed);
  } catch (err) {
    console.error('All fallback models failed for Fix:', err.message, err.cause || '');
    res.status(500).json({ error: err.message || 'Fix failed across all models.' });
  }
});

// Endpoint 2: Summarize & Explain Code
app.post('/api/summarize-code', async (req, res) => {
  const { code, language } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required.' });

  const prompt = `You are an AI code reviewer. Summarize what this ${language || 'code'} file/snippet does in clear, concise bullet points.
Return strictly a valid JSON object without markdown fences:
{
  "summary": "plain text overview with bullet points",
  "suggestions": "optional improvement suggestions"
}

Code:
${code}`;

  try {
    const response = await generateWithFallback(prompt, {
      responseMimeType: 'application/json'
    });
    const parsed = cleanAndParseJson(response.text);
    res.json(parsed);
  } catch (err) {
    console.error('All fallback models failed for Summarize:', err.message, err.cause || '');
    res.status(500).json({ error: err.message || 'Summarization failed across all models.' });
  }
});
app.post('/api/generate-code', async (req, res) => {
  try {
    const { prompt, language = 'javascript' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'A prompt is required to generate code.' });
    }

    const systemPrompt = `You are an expert software engineer.
Generate clean, production-ready, well-commented ${language} code based on this user request:
"${prompt}"

Respond ONLY with valid JSON in this exact structure:
{
  "code": "/* the raw generated code here without markdown ticks */",
  "explanation": "Brief explanation of what the code does"
}`;

    const response = await generateWithFallback(systemPrompt, {
      responseMimeType: 'application/json'
    });
    const parsed = cleanAndParseJson(response.text);
    res.json(parsed);
  } catch (err) {
    console.error('All fallback models failed for Generate:', err.message, err.cause || '');
    res.status(500).json({ error: err.message || 'Code generation failed across all models.' });
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Fixer Engine running on http://localhost:${PORT}`);
});