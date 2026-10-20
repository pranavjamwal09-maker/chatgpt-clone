const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');

router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching history' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const chat = await Chat.findOne({ _id: req.params.id, userId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    await Chat.findOneAndDelete({ _id: req.params.id, userId });
    res.json({ message: 'Chat deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

router.post('/message', auth, async (req, res) => {
  try {
    const { chatId, prompt } = req.body;
    const userId = req.user.userId || req.user.id;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    let chat;
    if (chatId) chat = await Chat.findOne({ _id: chatId, userId });

    if (!chat) {
      chat = new Chat({ userId: userId, title: prompt.slice(0, 30), messages: [] });
    }

    chat.messages.push({ role: 'user', content: prompt });
    await chat.save();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const contents = chat.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Using environment variable securely
    const token = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:streamGenerateContent?alt=sse`;

    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: {
          parts: [{ text: "You are a helpful AI assistant. Always respond naturally in the exact same language, script, or style as the user prompt." }]
        }
      })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      throw new Error(`Gemini API Error: ${errText}`);
    }

    let fullAssistantMessage = '';

    for await (const chunk of apiResponse.body) {
      const decoded = chunk.toString();
      const lines = decoded.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.replace('data: ', '').trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              fullAssistantMessage += text;
              res.write(`data: ${JSON.stringify({ text: text, chatId: chat._id })}\n\n`);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }

    await Chat.updateOne(
      { _id: chat._id },
      { $push: { messages: { role: 'assistant', content: fullAssistantMessage } } }
    );

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error("Gemini Stream Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;