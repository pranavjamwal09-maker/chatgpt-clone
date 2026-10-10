const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const Groq = require('groq-sdk');

const router = express.Router();

// Send Message with SSE Streaming & Dynamic Active Model Auto-Detection
router.post('/message', auth, async (req, res) => {
  let chatIdToUse = req.body.chatId;
  const prompt = req.body.prompt;

  try {
    let chat = null;

    if (chatIdToUse && mongoose.Types.ObjectId.isValid(chatIdToUse)) {
      chat = await Chat.findOne({ _id: chatIdToUse, userId: req.user.id });
    }

    if (!chat) {
      chat = new Chat({
        userId: req.user.id,
        title: prompt.substring(0, 30) + '...',
        messages: []
      });
      await chat.save();
    }
    chatIdToUse = chat._id;

    // Save user message atomically
    await Chat.findByIdAndUpdate(chatIdToUse, {
      $push: { messages: { role: 'user', content: prompt } }
    });

    const rawKey = process.env.GROQ_API_KEY || '';
    const apiKey = rawKey.replace(/[^a-zA-Z0-9_]/g, '').trim();

    if (!apiKey) {
      return res.status(400).json({ error: 'GROQ_API_KEY is missing in Render environment variables' });
    }

    const updatedChat = await Chat.findById(chatIdToUse);
    const formattedMessages = updatedChat.messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content || ''
    }));

    const systemInstruction = {
      role: 'system',
      content: `You are a helpful, smart AI assistant.
Rules:
1. NEVER start responses with random numbers, debug codes, or special symbols.
2. Always respond in the EXACT same language and script used by the user. If the user talks in Hinglish (Roman Hindi), reply strictly in clean Hinglish or English. NEVER switch to Urdu or Arabic script.
3. Match response length strictly to query complexity. For short or daily questions, give concise 1-2 sentence answers. Do not write long answers unless explicitly asked.
4. Format all text cleanly using standard Markdown.`
    };

    const finalMessages = [systemInstruction, ...formattedMessages];
    const groq = new Groq({ apiKey });

    let candidateModels = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-3.2-3b-preview',
      'gemma2-9b-it'
    ];

    try {
      const availableModels = await groq.models.list();
      if (availableModels?.data?.length > 0) {
        const activeFetched = availableModels.data
          .map(m => m.id)
          .filter(id => !id.includes('whisper') && !id.includes('guard') && !id.includes('mixtral-8x7b') && !id.includes('llama3-8b-8192'));
        if (activeFetched.length > 0) {
          candidateModels = [...activeFetched, ...candidateModels];
        }
      }
    } catch (modelErr) {
      console.warn('Dynamic model fetch skipped:', modelErr.message);
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
      throw lastError || new Error('All Groq candidate models failed');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    let fullAiText = '';
    let isClientConnected = true;

    req.on('close', () => {
      isClientConnected = false;
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAiText += content;
        if (isClientConnected && !res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ text: content, chatId: chatIdToUse })}\n\n`);
          } catch (writeErr) {
            isClientConnected = false;
          }
        }
      }
    }

    if (fullAiText.trim()) {
      await Chat.findByIdAndUpdate(chatIdToUse, {
        $push: { messages: { role: 'assistant', content: fullAiText } }
      });
    }

    if (isClientConnected && !res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }

  } catch (err) {
    console.error('=== STREAMING ERROR ===\n', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Server Error' });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// Get All User Chats
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

// Delete Chat Session (Guaranteed Deletion)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid Chat ID' });
    }
    const deletedChat = await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deletedChat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json({ success: true, message: 'Chat deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;