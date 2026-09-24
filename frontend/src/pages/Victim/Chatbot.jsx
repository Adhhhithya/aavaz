import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Bot, Send, Sparkles, RefreshCw, Mic, MicOff } from 'lucide-react';
import { useVoiceAgent } from '../../hooks/useVoiceAgent';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';

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

  // --- Voice mode --------------------------------------------------------
  const streamingBotIdRef = useRef(null);

  const getSystemPrompt = useCallback(async () => {
    const res = await authFetch('/api/v1/intake/chatbot/voice-context');
    const data = await res.json();
    return data;
  }, [authFetch]);

  const handleUserTranscript = useCallback((text) => {
    setMessages((prev) => [...prev, { id: `v-user-${Date.now()}`, sender: 'user', text }]);
  }, []);

  const handleAssistantStart = useCallback(() => {
    const id = `v-bot-${Date.now()}`;
    streamingBotIdRef.current = id;
    setMessages((prev) => [...prev, { id, sender: 'bot', text: '' }]);
  }, []);

  const handleAssistantToken = useCallback((_delta, fullText) => {
    const id = streamingBotIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: fullText } : m)));
  }, []);

  const handleVoiceError = useCallback((message) => {
    console.error('Voice agent error:', message);
  }, []);

  const { status: voiceStatus, start: startVoice, stop: stopVoice } = useVoiceAgent({
    getSystemPrompt,
    onUserTranscript: handleUserTranscript,
    onAssistantStart: handleAssistantStart,
    onAssistantToken: handleAssistantToken,
    onError: handleVoiceError,
  });

  const voiceActive = voiceStatus !== 'idle' && voiceStatus !== 'error';

  const toggleVoice = () => {
    if (voiceActive) {
      stopVoice();
    } else {
      startVoice();
    }
  };

  const voiceStatusLabel = {
    connecting: 'Connecting…',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
    error: 'Voice error',
  }[voiceStatus];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-screen bg-background animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:p-6 bg-surface border-b border-border shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center">
            <Bot size={20} className="text-primary-base" />
          </div>
          <div>
            <h2 className="font-bold text-text-main">Support Assistant</h2>
            <p className="text-xs font-semibold text-secondary-base">
              {voiceStatusLabel || 'Always here to listen'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleVoice}
            className={cn("rounded-full transition-colors", voiceActive ? "text-white bg-primary-base hover:bg-primary-hover animate-pulse" : "text-text-muted hover:text-text-main")}
            title={voiceActive ? 'Stop voice mode' : 'Talk instead of type'}
          >
            {voiceActive ? <Mic size={18} /> : <MicOff size={18} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="text-text-muted hover:text-text-main rounded-full"
            title="Clear Conversation"
          >
            <RefreshCw size={18} />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className={cn("flex", isUser ? 'justify-end' : 'justify-start')}
              >
                <div className={cn("max-w-[85%] md:max-w-[70%] p-4 rounded-2xl",
                  isUser 
                    ? 'bg-primary-base text-white rounded-br-sm shadow-sm' 
                    : 'bg-surface border border-border text-text-main rounded-bl-sm shadow-sm'
                )}>
                  <p className="text-sm md:text-base leading-relaxed font-medium">{msg.text}</p>
                </div>
              </motion.div>
            );
          })}

          {isTyping && (
            <motion.div 
              key="typing"
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%] p-4 rounded-2xl bg-surface border border-border rounded-bl-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-base/60 animate-[typing-bounce_1.4s_infinite_ease-in-out_both]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-primary-base/60 animate-[typing-bounce_1.4s_infinite_ease-in-out_both]" style={{animationDelay: '150ms'}}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-primary-base/60 animate-[typing-bounce_1.4s_infinite_ease-in-out_both]" style={{animationDelay: '300ms'}}></span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-3 bg-background flex gap-2 overflow-x-auto no-scrollbar shrink-0 border-t border-border">
        {PROMPT_CHIPS.map((chip, idx) => (
          <motion.button
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => sendMessage(chip)}
            className="flex items-center gap-1.5 px-4 py-2 bg-surface border border-border rounded-full text-xs font-bold text-text-main hover:border-primary-base hover:text-primary-base transition-colors whitespace-nowrap shadow-sm"
          >
            <Sparkles size={12} className="text-primary-base" />
            {chip}
          </motion.button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-surface border-t border-border shrink-0">
        <form 
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="flex items-center gap-2 bg-background border border-border rounded-full p-1.5 focus-within:border-primary-base/50 focus-within:ring-2 focus-within:ring-primary-base/20 transition-all"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your thoughts..."
            className="flex-1 bg-transparent border-none outline-none px-4 text-sm font-medium text-text-main placeholder:text-text-muted"
          />
          <Button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            size="icon"
            className="w-10 h-10 rounded-full bg-primary-base text-white hover:bg-primary-hover shadow-sm transition-all active:scale-95 shrink-0 disabled:opacity-50"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>

    </div>
  );
}
