require('dotenv').config();
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
  .catch(err => console.error(err));