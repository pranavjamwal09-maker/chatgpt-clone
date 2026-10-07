const fs = require('fs');
const path = require('path');

const folders = [
  'backend/models',
  'backend/middleware',
  'backend/routes',
  'frontend/src',
  'frontend/public'
];

folders.forEach(dir => fs.mkdirSync(dir, { recursive: true }));

const files = {
  // Backend Files
  'backend/models/User.js': `const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });
module.exports = mongoose.model('User', userSchema);`,

  'backend/models/Chat.js': `const mongoose = require('mongoose');
const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New Chat' },
  messages: [{
    role: { type: String, enum: ['user', 'model'], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });
module.exports = mongoose.model('Chat', chatSchema);`,

  'backend/middleware/auth.js': `const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};`,

  'backend/routes/auth.js': `const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret');
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;`,

  'backend/routes/chat.js': `const express = require('express');
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const { GoogleGenAI } = require('@google/genai');
const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

router.post('/message', auth, async (req, res) => {
  try {
    const { chatId, prompt } = req.body;
    let chat = chatId ? await Chat.findOne({ _id: chatId, userId: req.user.id }) : null;
    if (!chat) {
      chat = new Chat({ userId: req.user.id, title: prompt.substring(0, 30) + '...', messages: [] });
    }
    chat.messages.push({ role: 'user', content: prompt });
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    chat.messages.push({ role: 'model', content: response.text || '' });
    await chat.save();
    res.json({ chatId: chat._id, messages: chat.messages });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/history', auth, async (req, res) => {
  const chats = await Chat.find({ userId: req.user.id }).select('title createdAt').sort({ updatedAt: -1 });
  res.json(chats);
});

router.get('/:id', auth, async (req, res) => {
  const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
  res.json(chat);
});

router.delete('/:id', auth, async (req, res) => {
  await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  res.json({ success: true });
});

module.exports = router;`,

  'backend/server.js': `require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatgpt_clone')
  .then(() => app.listen(5000, () => console.log('Backend running on port 5000')))
  .catch(err => console.error(err));`,

  'backend/.env': `PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/chatgpt_clone
JWT_SECRET=supersecret123
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE`,

  'backend/package.json': JSON.stringify({
    name: 'backend',
    version: '1.0.0',
    main: 'server.js',
    scripts: { start: 'node server.js' }
  }, null, 2)
};

Object.entries(files).forEach(([filepath, content]) => {
  fs.writeFileSync(filepath, content);
  console.log(`Created: ${filepath}`);
});

console.log('\nAll files created successfully!');