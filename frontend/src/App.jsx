import React, { useState, useEffect } from 'react';
import axios from 'axios';

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
    setChats([]);
    setMessages([]);
    setActiveChatId(null);
  };

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

  const loadChat = async (id) => {
    setActiveChatId(id);
    try {
      const res = await axios.get(`${API_BASE}/chat/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data.messages);
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userPrompt = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/chat/message`, 
        { chatId: activeChatId, prompt: userPrompt },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActiveChatId(res.data.chatId);
      setMessages(res.data.messages);
      fetchChats();
    } catch (err) {
      alert('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const deleteChat = async (id, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_BASE}/chat/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
      }
      fetchChats();
    } catch (err) {
      alert('Failed to delete chat');
    }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#202123', color: '#fff' }}>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '300px', padding: '30px', background: '#2b2c2f', borderRadius: '8px' }}>
          <h2>{isLogin ? 'Login to ChatGPT' : 'Sign Up'}</h2>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ padding: '10px' }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ padding: '10px' }} />
          <button type="submit" style={{ padding: '10px', background: '#10a37f', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {isLogin ? 'Login' : 'Sign Up'}
          </button>
          <p style={{ fontSize: '12px', cursor: 'pointer' }} onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
          </p>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#343541', color: '#fff', fontFamily: 'sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', background: '#202123', padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <button onClick={() => { setActiveChatId(null); setMessages([]); }} style={{ width: '100%', padding: '10px', background: '#2b2c2f', border: '1px solid #555', color: '#fff', cursor: 'pointer', marginBottom: '15px' }}>
            + New Chat
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '75vh', overflowY: 'auto' }}>
            {chats.map(chat => (
              <div key={chat._id} onClick={() => loadChat(chat._id)} style={{ padding: '10px', background: activeChatId === chat._id ? '#343541' : 'transparent', borderRadius: '5px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{chat.title}</span>
                <button onClick={(e) => deleteChat(chat._id, e)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
        <button onClick={handleLogout} style={{ padding: '10px', background: '#ba2525', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px' }}>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {messages.map((m, idx) => (
            <div key={idx} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? '#10a37f' : '#444654', padding: '12px 16px', borderRadius: '8px', maxWidth: '70%' }}>
              <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong> {m.content}
            </div>
          ))}
          {loading && <div style={{ alignSelf: 'flex-start', color: '#8e8ea0' }}>AI is thinking...</div>}
        </div>

        <form onSubmit={sendMessage} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <input type="text" placeholder="Send a message..." value={input} onChange={e => setInput(e.target.value)} style={{ flex: 1, padding: '12px', background: '#40414f', border: 'none', color: '#fff', borderRadius: '5px' }} />
          <button type="submit" style={{ padding: '12px 20px', background: '#10a37f', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Send</button>
        </form>
      </div>
    </div>
  );
}