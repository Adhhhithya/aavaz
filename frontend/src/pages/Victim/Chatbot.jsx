import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Bot, Send, Sparkles, RefreshCw } from 'lucide-react';

const PROMPT_CHIPS = [
  'I feel anxious',
  'Check my case status',
  'Need immediate help',
  'Grounding exercises',
];

export default function VictimChatbot() {
  const { user, authFetch } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (user?.id) {
        try {
          const res = await authFetch(`/api/v1/intake/chatbot/history/${user.id}`, {
            headers: { 'ngrok-skip-browser-warning': '1' }
          });
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          } else {
            setMessages([{ id: 'init', sender: 'bot', text: 'Hello. I am here to support you. How are you feeling today?' }]);
          }
        } catch (e) {
          console.error("Failed to load chat history", e);
        }
      }
    };
    fetchHistory();
  }, [user, authFetch]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const sendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg = {
      id: Date.now().toString(),
      sender: 'user',
      text: text.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      if (user?.id) {
        // S2: user_id is no longer sent — the backend derives the sender from
        // the authenticated victim's session (attached by authFetch).
        const res = await authFetch('/api/v1/intake/chatbot/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({
            session_id: 'web_session',
            message: text.trim()
          })
        });
        const data = await res.json();
        
        const botMsg = {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: data.reply,
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (e) {
      console.error("Chat error", e);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClear = () => {
    setMessages([{ id: 'init', sender: 'bot', text: 'Hello. I am here to support you. How are you feeling today?' }]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-screen bg-canvas-base animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:p-6 bg-canvas-surface border-b border-canvas-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center">
            <Bot size={20} className="text-primary-main" />
          </div>
          <div>
            <h2 className="font-bold text-text-primary">Support Assistant</h2>
            <p className="text-xs font-semibold text-accent-sage">Always here to listen</p>
          </div>
        </div>
        <button 
          onClick={handleClear}
          className="p-2 text-text-muted hover:text-text-primary hover:bg-canvas-base rounded-full transition-colors"
          title="Clear Conversation"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4"
      >
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl ${
                isUser 
                  ? 'bg-primary-main text-white rounded-br-sm shadow-hover' 
                  : 'bg-canvas-surface border border-canvas-border text-text-primary rounded-bl-sm shadow-card'
              }`}>
                <p className="text-sm md:text-base leading-relaxed font-medium">{msg.text}</p>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="max-w-[85%] p-4 rounded-2xl bg-canvas-surface border border-canvas-border rounded-bl-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary-main/50 animate-bounce"></span>
              <span className="w-2 h-2 rounded-full bg-primary-main/50 animate-bounce" style={{animationDelay: '150ms'}}></span>
              <span className="w-2 h-2 rounded-full bg-primary-main/50 animate-bounce" style={{animationDelay: '300ms'}}></span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-3 bg-canvas-base flex gap-2 overflow-x-auto no-scrollbar shrink-0 border-t border-canvas-border">
        {PROMPT_CHIPS.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => sendMessage(chip)}
            className="flex items-center gap-1.5 px-4 py-2 bg-canvas-surface border border-canvas-border rounded-pill text-xs font-bold text-text-primary hover:border-primary-main hover:text-primary-main transition-colors whitespace-nowrap shadow-sm"
          >
            <Sparkles size={12} className="text-primary-main" />
            {chip}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-canvas-surface border-t border-canvas-border shrink-0">
        <form 
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="flex items-center gap-2 bg-canvas-base border-2 border-canvas-border rounded-pill p-1.5 focus-within:border-primary-main/50 transition-colors"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your thoughts..."
            className="flex-1 bg-transparent border-none outline-none px-4 text-sm font-medium text-text-primary"
          />
          <button 
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="w-10 h-10 rounded-full bg-primary-main hover:bg-primary-hover active:scale-95 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0 shadow-sm"
          >
            <Send size={16} />
          </button>
        </form>
      </div>

    </div>
  );
}
