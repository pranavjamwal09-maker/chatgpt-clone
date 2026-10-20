import React, { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://chatgpt-clone-web-service.onrender.com';

function App() {
  // --- AUTHENTICATION STATES ---
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [name, setName] = useState(''); // Added Name state for registration
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Added show/hide password toggle
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  // --- CHAT STATES ---
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null); 
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isLoggedIn) {
      fetchHistory();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  };

  // --- AUTH FUNCTIONS ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
      
      // Included name in payload if it's registration
      const payload = isLoginMode ? { email, password } : { name, email, password };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        setIsLoggedIn(true);
        setName('');
        setEmail('');
        setPassword('');
        setShowPassword(false);
        if (window.location.pathname === '/login') {
          window.history.replaceState({}, '', '/');
        }
      } else {
        setAuthError(data.error || data.msg || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Server error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.clear();
    sessionStorage.clear();
    setChats([]);
    setMessages([]);
    setCurrentChatId(null);
    setIsLoggedIn(false); 
    window.history.replaceState({}, '', '/');
  };

  // --- CHAT FUNCTIONS ---
  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chat/history`, { headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) return handleSignOut();
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const selectChat = async (id) => {
    setCurrentChatId(id);
    setChatToDelete(null); 
    try {
      const res = await fetch(`${API_URL}/api/chat/${id}`, { headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) return handleSignOut();
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch chat details:', err);
    }
  };

  const handleNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setChatToDelete(null);
  };

  const confirmDelete = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/api/chat/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.status === 401 || res.status === 403) return handleSignOut();
      if (res.ok) {
        setChats(prev => prev.filter(c => c._id !== id));
        if (currentChatId === id) handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    } finally {
      setChatToDelete(null);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userPrompt = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat/message`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ chatId: currentChatId, prompt: userPrompt })
      });

      if (response.status === 401 || response.status === 403) return handleSignOut();

      if (!response.ok) {
        const errData = await response.json();
        alert(errData.error || 'Failed to send message');
        setLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { value, done } = await reader.read();
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
                assistantText += parsed.text;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                  return updated;
                });
              }
              if (parsed.chatId && !currentChatId) setCurrentChatId(parsed.chatId);
            } catch (pErr) {}
          }
        }
      }
      fetchHistory();
    } catch (err) {
      alert(err.message || 'Error processing message');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 1. PREMIUM LOGIN / REGISTER UI
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div className="flex h-screen bg-[#212121] items-center justify-center text-white font-sans px-4 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#10a37f]/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="bg-[#2f2f2f] p-8 md:p-10 rounded-2xl border border-[#3e3e3e] shadow-2xl w-full max-w-[400px] relative z-10">
          
          {/* Logo Section */}
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-[#10a37f] rounded-full flex items-center justify-center shadow-lg shadow-[#10a37f]/20">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-2 text-center text-gray-100">
            {isLoginMode ? 'Welcome back' : 'Create an account'}
          </h2>
          <p className="text-center text-gray-400 text-sm mb-8">
            {isLoginMode ? 'Enter your details to continue to your chats' : 'Sign up to get started with your AI assistant'}
          </p>
          
          {authError && (
            <div className="bg-red-500/10 text-red-400 text-sm p-3 rounded-lg mb-6 border border-red-500/20 text-center flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            
            {/* Conditional Full Name Field for Registration */}
            {!isLoginMode && (
              <div>
                <label className="block text-sm text-gray-300 mb-1.5 font-medium">Full Name</label>
                <input 
                  type="text" 
                  required={!isLoginMode}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-[#212121] text-white border border-[#3e3e3e] rounded-xl px-4 py-3 focus:outline-none focus:border-[#10a37f] focus:ring-1 focus:ring-[#10a37f] transition-all placeholder:text-gray-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-300 mb-1.5 font-medium">Email Address</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-[#212121] text-white border border-[#3e3e3e] rounded-xl px-4 py-3 focus:outline-none focus:border-[#10a37f] focus:ring-1 focus:ring-[#10a37f] transition-all placeholder:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#212121] text-white border border-[#3e3e3e] rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-[#10a37f] focus:ring-1 focus:ring-[#10a37f] transition-all placeholder:text-gray-500"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  )}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={authLoading}
              className="w-full bg-[#10a37f] hover:bg-[#0b8c6d] text-white font-medium py-3 rounded-xl transition-colors mt-6 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#10a37f]/20"
            >
              {authLoading && <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              {authLoading ? 'Please wait...' : (isLoginMode ? 'Continue' : 'Create Account')}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-gray-400">
            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setAuthError('');
                setShowPassword(false);
                setName('');
              }}
              className="text-[#10a37f] hover:text-[#12b88f] font-medium transition-colors focus:outline-none"
            >
              {isLoginMode ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. MAIN CHAT UI (When logged in)
  // ==========================================
  return (
    <div className="flex h-screen bg-[#212121] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-[#171717] flex flex-col justify-between p-3 border-r border-[#2a2a2a]">
        <div>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-between p-3 mb-4 rounded-lg border border-[#3e3e3e] hover:bg-[#212121] transition-colors text-sm font-medium"
          >
            <span>+ New Chat</span>
          </button>

          <div className="space-y-1 max-h-[calc(100vh-160px)] overflow-y-auto">
            {chats.map((chat) => (
              <div
                key={chat._id}
                onClick={() => selectChat(chat._id)}
                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[#212121] ${
                  currentChatId === chat._id ? 'bg-[#2f2f2f]' : ''
                }`}
              >
                {chatToDelete === chat._id ? (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm text-red-400 font-medium">Delete chat?</span>
                    <div className="flex gap-2">
                      <button onClick={(e) => confirmDelete(e, chat._id)} className="px-2 py-1 text-xs bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded">Yes</button>
                      <button onClick={(e) => { e.stopPropagation(); setChatToDelete(null); }} className="px-2 py-1 text-xs bg-gray-600/30 text-gray-300 hover:bg-gray-500 hover:text-white rounded">No</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="truncate text-sm text-gray-200 pr-2">{chat.title || 'New Chat'}</span>
                    <button onClick={(e) => { e.stopPropagation(); setChatToDelete(chat._id); }} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-[#383838] rounded-md" title="Delete chat">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="p-2.5 text-left text-sm text-red-400 hover:bg-[#212121] rounded-lg transition-colors border-t border-[#2a2a2a] pt-3 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Sign Out
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between h-full bg-[#212121]">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-3xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-xl font-medium">
              What can I help with today?
            </div>
          ) : (
            messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#2f2f2f] text-white rounded-br-none' : 'text-gray-100'}`}>
                  {m.content || (loading && idx === messages.length - 1 ? '...' : '')}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 max-w-3xl mx-auto w-full">
          <form onSubmit={handleSendMessage} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message..."
              className="w-full bg-[#2f2f2f] text-white placeholder-gray-400 rounded-xl py-3.5 pl-4 pr-12 focus:outline-none focus:ring-1 focus:ring-gray-500 text-sm shadow-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-2.5 p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors bg-[#383838] rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;