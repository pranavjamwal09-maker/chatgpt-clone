const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS Configuration - Allows requests from your Vercel frontend
app.use(cors({
  origin: '*', 
  credentials: true
}));

app.use(express.json());

// Database Connection (Updated without deprecated/blocking options)
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 10000;

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Import Routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('ChatGPT Clone Backend is running successfully 🚀');
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});