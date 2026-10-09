import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Live Deployed Backend API Base URL
const API_BASE = 'https://chatgpt-clone-xx1j.onrender.com/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) fetchChats();
  }, [token]);

  const fetchChats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/chat/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChats(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSingleChat = async (id) => {
    try {
      setActiveChatId(id);
      const res = await axios.get(`${API_BASE}/chat/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/auth/login' : '/auth/signup';
    try {
      const res = await axios.post(`${API_BASE}${endpoint}`, { email, password });
      localStorage.setItem('token', res.data.token);
      setToken(res.data.token);
    } catch (err) {
      alert(err.response?.data?.error || 'Authentication failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setMessages([]);
    setActiveChatId(null);
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
  };

  // Streaming Message Handler (Typewriter Chunks Effect)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userPrompt = input;
    setInput('');
    setLoading(true);

    // Instant UI update: Add User message and empty Assistant placeholder
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: '' }
    ]);

    try {
      const response = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ chatId: activeChatId, prompt: userPrompt })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let aiText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                aiText += parsed.text;

                // Update the last assistant message in real-time
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: aiText
                  };
                  return updated;
                });

                if (parsed.chatId && !activeChatId) {
                  setActiveChatId(parsed.chatId);
                  fetchChats();
                }
              }
            } catch (err) {
              // Ignore partial JSON parse chunks
            }
          }
        }
      }
    } catch (err) {
      console.error('Streaming error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Authentication UI
  if (!token) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#212121', color: '#fff' }}>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '320px', padding: '30px', backgroundColor: '#2f2f2f', borderRadius: '8px' }}>
          <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#171717', color: '#fff' }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#171717', color: '#fff' }} />
          <button type="submit" style={{ padding: '12px', backgroundColor: '#10a37f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isLogin ? 'Login' : 'Sign Up'}
          </button>
          <p style={{ fontSize: '14px', cursor: 'pointer', textAlign: 'center', color: '#ccc' }} onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
          </p>
        </form>
      </div>
    );
  }

  // Main Workspace UI
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#212121', color: '#ececec', fontFamily: 'sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', backgroundColor: '#171717', padding: '15px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <button onClick={startNewChat} style={{ width: '100%', padding: '12px', backgroundColor: '#212121', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', marginBottom: '15px' }}>
            + New Chat
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '75vh' }}>
            {chats.map(c => (
              <div key={c._id} onClick={() => fetchSingleChat(c._id)} style={{ padding: '10px', borderRadius: '4px', cursor: 'pointer', backgroundColor: activeChatId === c._id ? '#212121' : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.title}
              </div>
            ))}
          </div>
        </div>
        <button onClick={handleLogout} style={{ padding: '10px', backgroundColor: '#d9534f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>

      {/* Chat Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '30px 100px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '100px', color: '#8e8e93' }}>
              <h1>ChatGPT Clone</h1>
              <p>Start typing a message below...</p>
            </div>
          )}
          {messages.map((m, idx) => (
            <div key={idx} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '14px 18px', borderRadius: '12px', backgroundColor: m.role === 'user' ? '#2f2f2f' : '#171717', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong> {m.content || (loading && idx === messages.length - 1 ? '...' : '')}
            </div>
          ))}
        </div>

        {/* Prompt Input Form */}
        <form onSubmit={handleSendMessage} style={{ padding: '20px 100px', backgroundColor: '#212121' }}>
          <div style={{ display: 'flex', backgroundColor: '#2f2f2f', borderRadius: '8px', padding: '8px 12px' }}>
            <input type="text" placeholder="Send a message..." value={input} onChange={e => setInput(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', color: '#fff', fontSize: '16px', padding: '8px' }} />
            <button type="submit" disabled={loading} style={{ padding: '8px 20px', backgroundColor: '#10a37f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}