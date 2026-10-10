const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const Groq = require('groq-sdk');

const router = express.Router();

// Send Message with SSE Streaming & Strict System Prompt
router.post('/message', auth, async (req, res) => {
  try {
    const { chatId, prompt } = req.body;
    let chat = null;

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

    // Auto-clean API key (removes spaces, quotes, newlines)
    const rawKey = process.env.GROQ_API_KEY || '';
    const apiKey = rawKey.replace(/[^a-zA-Z0-9_]/g, '').trim();

    if (!apiKey) {
      return res.status(400).json({ error: 'GROQ_API_KEY is missing or invalid in Render environment variables' });
    }

    // Format previous messages for chat history
    const formattedMessages = chat.messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    // Strict System Prompt
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
      ...formattedMessages,
      { role: 'user', content: prompt }
    ];

    const groq = new Groq({ apiKey });

    // Universal active model on Groq
    const stream = await groq.chat.completions.create({
      messages: finalMessages,
      model: 'llama-3.1-8b-instant',
      stream: true,
    });

    // Set headers for SSE & Disable Render proxy buffering
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    let fullAiText = '';

    // Stream chunks in real-time
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAiText += content;
        res.write(`data: ${JSON.stringify({ text: content, chatId: chat._id })}\n\n`);
      }
    }

    // Save conversation to MongoDB
    chat.messages.push({ role: 'user', content: prompt });
    chat.messages.push({ role: 'assistant', content: fullAiText });
    await chat.save();

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

// Get All User Chats
router.get('/history', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).select('title createdAt').sort({ updatedAt: -1 });
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