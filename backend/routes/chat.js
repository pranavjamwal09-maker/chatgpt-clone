const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const Groq = require('groq-sdk');

const router = express.Router();

// Send Message with SSE Streaming & Guaranteed MongoDB Persistence
router.post('/message', auth, async (req, res) => {
  try {
    const { chatId, prompt } = req.body;
    let chat = null;

    // 1. Fetch existing chat or create a new one immediately in MongoDB
    if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
      chat = await Chat.findOne({ _id: chatId, userId: req.user.id });
    }

    if (!chat) {
      chat = new Chat({
        userId: req.user.id,
        title: prompt.substring(0, 30) + '...',
        messages: []
      });
    }

    // Save user prompt immediately into MongoDB before streaming starts
    chat.messages.push({ role: 'user', content: prompt });
    await chat.save();

    // Clean API Key
    const rawKey = process.env.GROQ_API_KEY || '';
    const apiKey = rawKey.replace(/[^a-zA-Z0-9_]/g, '').trim();

    if (!apiKey) {
      return res.status(400).json({ error: 'GROQ_API_KEY is missing or invalid in Render environment variables' });
    }

    // Format chat history for Groq context
    const formattedMessages = chat.messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content || ''
    }));

    // System Instruction
    const systemInstruction = {
      role: 'system',
      content: `You are a helpful, smart AI assistant.
Rules:
1. NEVER start responses with random numbers, debug codes, or special symbols.
2. Always respond in the EXACT same language and script used by the user. If the user talks in Hinglish (Roman Hindi), reply strictly in clean Hinglish or English. NEVER switch to Urdu or Arabic script.
3. Match response length strictly to query complexity. For short or daily questions, give concise 1-2 sentence answers. Do not write long answers unless explicitly asked.
4. Format all text cleanly using standard Markdown.`
    };

    const finalMessages = [
      systemInstruction,
      ...formattedMessages
    ];

    const groq = new Groq({ apiKey });

    // Fallback active models
    let candidateModels = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-3.2-3b-preview',
      'gemma2-9b-it',
      'qwen-2.5-coder-32b'
    ];

    // Fetch live active models dynamically
    try {
      const availableModels = await groq.models.list();
      if (availableModels && availableModels.data && availableModels.data.length > 0) {
        const activeFetched = availableModels.data
          .map(m => m.id)
          .filter(id => !id.includes('whisper') && !id.includes('guard') && !id.includes('mixtral-8x7b') && !id.includes('llama3-8b-8192'));
        if (activeFetched.length > 0) {
          candidateModels = [...activeFetched, ...candidateModels];
        }
      }
    } catch (modelListErr) {
      console.warn('Could not fetch dynamic model list:', modelListErr.message);
    }

    let stream = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        stream = await groq.chat.completions.create({
          messages: finalMessages,
          model: modelName,
          stream: true,
        });
        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      throw lastError || new Error('All candidate Groq models failed');
    }

    // Set headers for SSE & Disable Render proxy buffering
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    let fullAiText = '';

    // Stream chunks to frontend
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAiText += content;
        res.write(`data: ${JSON.stringify({ text: content, chatId: chat._id })}\n\n`);
      }
    }

    // 2. Save full AI response into MongoDB after stream completes
    if (fullAiText.trim()) {
      chat.messages.push({ role: 'assistant', content: fullAiText });
      await chat.save();
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('=== STREAMING CHAT ERROR ===\n', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Server Error' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// Get All User Chats (Sidebar)
router.get('/history', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).select('title createdAt updatedAt').sort({ updatedAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Chat
router.get('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid Chat ID' });
    }
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Chat Session
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid Chat ID' });
    }
    await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;