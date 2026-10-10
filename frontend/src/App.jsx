import React, { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://chatgpt-clone-xx1j.onrender.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Auth Form State
  const [isLoginView, setIsLoginView] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchChatHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/chat/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        handleSignOut();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchChatHistory();
    }
  }, [token]);

  const handleSignOut = () => {
    localStorage.removeItem('token');
    setToken('');
    setChats([]);
    setCurrentChatId(null);
    setMessages([]);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = isLoginView ? '/api/auth/login' : '/api/auth/register';
    const payload = isLoginView 
      ? { email: authEmail, password: authPassword }
      : { name: authName, email: authEmail, password: authPassword };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      if (data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setAuthEmail('');
        setAuthPassword('');
        setAuthName('');
      }
    } catch (err) {
      setAuthError('Server error. Please try again.');
    }
  };

  const selectChat = async (chatId) => {
    try {
      setCurrentChatId(chatId);
      const res = await fetch(`${API_URL}/api/chat/${chatId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Error fetching chat details:', err);
    }
  };

  const startNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
  };

  // Sleek Delete with English Confirmation
  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this chat?")) return;

    try {
      const res = await fetch(`${API_URL}/api/chat/${chatId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setChats(prev => prev.filter(c => c._id !== chatId));
        if (currentChatId === chatId) {
          setCurrentChatId(null);
          setMessages([]);
        }
      } else {
        alert("Failed to delete chat.");
      }
    } catch (err) {
      console.error("Delete Error:", err);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userPrompt = input.trim();
    setInput('');
    setIsStreaming(true);

    setMessages(prev => [...prev, { role: 'user', content: userPrompt }, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`${API_URL}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chatId: currentChatId,
          prompt: userPrompt
        })
      });

      if (response.status === 401) {
        alert("Session expired. Please sign in again.");
        handleSignOut();
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        alert(errData.error || 'Failed to get response');
        setIsStreaming(false);
        setMessages(prev => prev.filter(m => m.content !== ''));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);

        const lines = chunkValue.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') {
              setIsStreaming(false);
              fetchChatHistory();
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                alert(`Error: ${parsed.error}`);
                setIsStreaming(false);
                setMessages(prev => prev.filter(m => m.content !== ''));
                return;
              }
              if (parsed.chatId && !currentChatId) {
                setCurrentChatId(parsed.chatId);
              }
              if (parsed.text) {
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIndex = updated.length - 1;
                  if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
                    updated[lastIndex] = {
                      ...updated[lastIndex],
                      content: updated[lastIndex].content + parsed.text
                    };
                  }
                  return updated;
                });
              }
            } catch (err) {
              // Ignore chunk fragments
            }
          }
        }
      }
    } catch (err) {
      console.error('Streaming error:', err);
      setMessages(prev => prev.filter(m => m.content !== ''));
    } finally {
      setIsStreaming(false);
    }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e1e1e', color: '#fff', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleAuthSubmit} style={{ width: '320px', padding: '30px', backgroundColor: '#282828', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h2 style={{ textAlign: 'center', margin: '0 0 10px 0' }}>{isLoginView ? 'Sign In' : 'Create Account'}</h2>
          
          {authError && <div style={{ color: '#ff4d4d', fontSize: '13px', textAlign: 'center' }}>{authError}</div>}

          {!isLoginView && (
            <input 
              type="text" 
              placeholder="Name" 
              value={authName} 
              onChange={e => setAuthName(e.target.value)} 
              required 
              style={{ padding: '10px', borderRadius: '5px', border: '1px solid #444', backgroundColor: '#1e1e1e', color: '#fff' }}
            />
          )}

          <input 
            type="email" 
            placeholder="Email" 
            value={authEmail} 
            onChange={e => setAuthEmail(e.target.value)} 
            required 
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #444', backgroundColor: '#1e1e1e', color: '#fff' }}
          />

          <input 
            type="password" 
            placeholder="Password" 
            value={authPassword} 
            onChange={e => setAuthPassword(e.target.value)} 
            required 
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #444', backgroundColor: '#1e1e1e', color: '#fff' }}
          />

          <button type="submit" style={{ padding: '10px', backgroundColor: '#10a37f', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
            {isLoginView ? 'Sign In' : 'Register'}
          </button>

          <p style={{ fontSize: '12px', textAlign: 'center', margin: '5px 0 0 0', cursor: 'pointer', color: '#888' }} onClick={() => setIsLoginView(!isLoginView)}>
            {isLoginView ? "Don't have an account? Register" : "Already have an account? Sign In"}
          </p>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#1e1e1e', color: '#fff', fontFamily: 'sans-serif' }}>
      
      {/* Sidebar */}
      <div style={{ width: '280px', backgroundColor: '#181818', padding: '15px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #333' }}>
        <button 
          onClick={startNewChat}
          style={{ width: '100%', padding: '12px', backgroundColor: '#2b2b2b', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', marginBottom: '15px', fontWeight: 'bold' }}
        >
          + New Chat
        </button>

        {/* Sidebar Chat List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {chats.map(chat => (
            <div 
              key={chat._id}
              onClick={() => selectChat(chat._id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                marginBottom: '6px',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: currentChatId === chat._id ? '#343541' : '#202123',
                gap: '8px',
                transition: 'background-color 0.2s'
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px' }}>
                💬 {chat.title}
              </span>
              
              {/* Minimalist Trash Icon Toggle */}
              <button
                onClick={(e) => handleDeleteChat(e, chat._id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8e8e93',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '14px',
                  borderRadius: '4px',
                  flexShrink: 0,
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#ff4d4d'}
                onMouseLeave={(e) => e.target.style.color = '#8e8e93'}
                title="Delete Chat"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div style={{ paddingTop: '15px', borderTop: '1px solid #333' }}>
          <button 
            onClick={handleSignOut}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#2b2b2b',
              color: '#ff4d4d',
              border: '1px solid #444',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'background-color 0.2s'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          {messages.map((m, idx) => (
            <div key={idx} style={{ marginBottom: '15px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <span style={{
                display: 'inline-block',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: m.role === 'user' ? '#0084ff' : '#2f2f2f',
                maxWidth: '70%',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: m.content ? '#fff' : '#8e8e93',
                fontStyle: m.content ? 'normal' : 'italic'
              }}>
                {m.content || (m.role === 'assistant' ? 'Thinking...' : '')}
              </span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={sendMessage} style={{ padding: '15px', backgroundColor: '#181818', display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid #444', backgroundColor: '#2f2f2f', color: '#fff', fontSize: '15px' }}
          />
          <button 
            type="submit" 
            disabled={isStreaming}
            style={{ padding: '12px 24px', backgroundColor: '#10a37f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isStreaming ? '...' : 'Send'}
          </button>
        </form>
      </div>

    </div>
  );
}

export default App;