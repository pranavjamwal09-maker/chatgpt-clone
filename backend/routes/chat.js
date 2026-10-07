const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const Groq = require('groq-sdk');

const router = express.Router();

// Fetch live active models dynamically from Groq
async function getGroqResponse(formattedMessages) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  let candidateModels = [];

  try {
    // Groq API se live active models ki list fetch karna
    const modelList = await groq.models.list();
    candidateModels = modelList.data
      .map(m => m.id)
      .filter(id => !id.includes('whisper') && !id.includes('safetensors'));

    console.log('[GROQ ACTIVE MODELS AVAILABLE]:', candidateModels);
  } catch (err) {
    console.warn('[GROQ LIST FETCH ERROR]: Using default fallback array');
  }

  // Backup fallback list if dynamic fetch fails
  if (!candidateModels.length) {
    candidateModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama3-8b-8192'];
  }

  let lastErr = null;
  for (const modelName of candidateModels) {
    try {
      console.log(`[GROQ TRYING MODEL]: ${modelName}`);
      const completion = await groq.chat.completions.create({
        messages: formattedMessages,
        model: modelName,
      });
      const text = completion.choices[0]?.message?.content;
      if (text) {
        console.log(`[GROQ SUCCESS] Model used: ${modelName}`);
        return text;
      }
    } catch (err) {
      console.warn(`[GROQ MODEL FAILED] ${modelName}: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error('All Groq models failed.');
}

// Send Message / Generate AI Response
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

    // Format chat history for Groq
    const formattedMessages = chat.messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    formattedMessages.push({ role: 'user', content: prompt });
    chat.messages.push({ role: 'user', content: prompt });

    // Fetch AI response
    const aiText = await getGroqResponse(formattedMessages);

    chat.messages.push({ role: 'model', content: aiText });
    await chat.save();

    res.json({ chatId: chat._id, messages: chat.messages });
  } catch (err) {
    console.error('=== CHAT API ERROR ===\n', err);
    res.status(500).json({ error: err.message || 'Server Error' });
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

// Delete Chat
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