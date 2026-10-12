import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Fallback models order
const fallbackModels = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp',
  'gemini-1.0-pro'
];

// Reusable robust generator with automatic fallback
async function generateWithFallback(prompt, generationConfig = {}) {
  let lastError = null;

  for (const modelName of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return { text: response.text() };
    } catch (err) {
      console.warn(`Model ${modelName} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All fallback models failed to generate content.');
}

// JSON cleaner helper
function cleanAndParseJson(rawText) {
  try {
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    return { error: 'Invalid JSON format from AI', raw: rawText };
  }
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

    const systemPrompt = `You are an expert senior software engineer. Fix, refactor, and optimize the following ${language} code. Fix bugs, improve performance, and enhance readability while keeping the original logic intact.

Return ONLY a valid JSON object with exact keys:
{
  "fixedCode": "the optimized and fixed code string",
  "explanation": "brief description of fixes and enhancements"
}

Code to fix:
${code}`;

    const response = await generateWithFallback(systemPrompt, {
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

    const systemPrompt = `Analyze and summarize the following ${language} code. 
Return ONLY a valid JSON object with exact keys:
{
  "summary": "a clear breakdown of what the code does",
  "suggestions": "recommended optimizations or security tips"
}

Code:
${code}`;

    const response = await generateWithFallback(systemPrompt, {
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
    console.error('All fallback models failed for Generate:', err.message, err.cause || '');
    res.status(500).json({ error: err.message || 'Code generation failed across all models.' });
  }
});

// 4. Robust Multi-Turn Chat Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    let conversationPrompt = 
      "You are an expert AI software engineer and pair programmer inside VS Code.\n" +
      "Help the developer write, refactor, debug, and explain code.\n" +
      "Always provide clean code inside markdown code blocks (e.g. ```javascript ... ```).\n" +
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
    const reply = typeof response === 'string' ? response : (response.text || response);

    res.json({ reply });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: err.message || 'Chat service error.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Fixer Engine running on http://localhost:${PORT}`);
});