const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS Configuration - Allows requests from your Vercel frontend and local development
app.use(cors({
  origin: '*', // You can also restrict this to your Vercel URL if needed
  credentials: true
}));

app.use(express.json());

// Database Connection
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 10000;

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected successfully'))
.catch((err) => console.error('MongoDB connection error:', err));

// Import Routes (Adjust paths if your route files are structured differently)
const authRoutes = require('./routes/auth'); // Check if path matches your folder structure
const chatRoutes = require('./routes/chat'); // Check if path matches your folder structure

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('ChatGPT Clone Backend is running successfully 🚀');
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});