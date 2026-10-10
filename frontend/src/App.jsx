import React, { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://chatgpt-clone-web-service.onrender.com';

function App() {
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat history list for sidebar
  const fetchChatHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/api/chat/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  useEffect(() => {
    fetchChatHistory();
  }, []);

  // Load single chat messages
  const selectChat = async (chatId) => {
    try {
      const token = localStorage.getItem('token');
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

  // Start New Chat
  const startNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
  };

  // Delete Chat Function
  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();

    if (!window.confirm("Kya aap iss chat ko delete karna chahte hain?")) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/chat/${chatId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        setChats(prev => prev.filter(c => c._id !== chatId));
        if (currentChatId === chatId) {
          setCurrentChatId(null);
          setMessages([]);
        }
      } else {
        alert("Delete failed! Server error.");
      }
    } catch (err) {
      console.error("Delete Error:", err);
    }
  };

  // Send Message with SSE Streaming
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userPrompt = input.trim();
    setInput('');
    setIsStreaming(true);

    // Push user prompt & placeholder
    setMessages(prev => [...prev, { role: 'user', content: userPrompt }, { role: 'assistant', content: '' }]);

    try {
      const token = localStorage.getItem('token');
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

      if (!response.ok) {
        const errData = await response.json();
        alert(errData.error || 'Failed to get response');
        setIsStreaming(false);
        // Clear empty assistant boxes on error
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
              // Ignore fragment parse errors
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

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {chats.map(chat => (
            <div 
              key={chat._id}
              onClick={() => selectChat(chat._id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px',
                marginBottom: '6px',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: currentChatId === chat._id ? '#343541' : '#202123',
                gap: '8px'
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px' }}>
                💬 {chat.title}
              </span>
              
              {/* Delete Button */}
              <button
                onClick={(e) => handleDeleteChat(e, chat._id)}
                style={{
                  backgroundColor: '#ff4d4d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  flexShrink: 0
                }}
                title="Delete Chat"
              >
                Delete
              </button>
            </div>
          ))}
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