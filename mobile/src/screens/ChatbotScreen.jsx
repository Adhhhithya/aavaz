import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bot,
  Send,
  Mic,
  XCircle,
  Sparkles,
  LogOut,
  RefreshCw,
} from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import { api } from '../services/api';
import { useWarningModal } from '../context/WarningModalContext';

const PROMPT_CHIPS = [
  'I feel anxious',
  'Check my case status',
  'Need immediate help',
  'Grounding exercises',
];

export default function ChatbotScreen({ userProfile, onDiscreetExit }) {
  const { showWarning, showError } = useWarningModal();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [crisisAlert, setCrisisAlert] = useState(null);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, isTyping]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (userProfile?.id) {
        try {
          const res = await api.get(`/api/v1/intake/chatbot/history/${userProfile.id}`);
          if (res.messages && res.messages.length > 0) {
            setMessages(res.messages);
          } else {
            setMessages([{ id: 'init', sender: 'bot', text: 'Hello. I am here to support you. How are you feeling today?' }]);
          }
        } catch (e) {
          console.error("Failed to load chat history", e);
        }
      }
    };
    fetchHistory();
  }, [userProfile]);

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
      if (userProfile?.id) {
        // S2: user_id is no longer sent — the backend derives the sender from
        // the authenticated victim's session.
        const res = await api.post('/api/v1/intake/chatbot/message', {
          session_id: 'app_session',
          message: text.trim()
        });
        
        const botMsg = {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: res.reply,
          emotion: res.emotion_flagged,
          distress_score: res.distress_score,
          risk_level: res.risk_level,
          escalated: res.escalated,
        };
        setMessages((prev) => [...prev, botMsg]);

        if (res.escalated || res.distress_score >= 70) {
          setCrisisAlert({
            level: res.risk_level || 'high',
            score: res.distress_score,
            message: 'A safety alert has been recorded for your counsellor. If you are in immediate danger, please call 112 or press SOS.',
          });
        }
      }
    } catch (e) {
      console.error("Chat error", e);
      showWarning({
        title: 'Connection Notice',
        message: 'Unable to reach the assistant right now. Please check your connection and try again.',
        type: 'warning',
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleClear = () => {
    setMessages([{ id: 'init', sender: 'bot', text: 'Hello. I am here to support you. How are you feeling today?' }]);
    setCrisisAlert(null);
  };

  const handleMicToggle = () => {
    if (!isListeningMic) {
      setIsListeningMic(true);
      if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.lang = userProfile?.preferred_language === 'hi' ? 'hi-IN' : 'en-IN';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setIsListeningMic(false);
          if (transcript) {
            sendMessage(transcript);
          }
        };
        recognition.onerror = () => setIsListeningMic(false);
        recognition.onend = () => setIsListeningMic(false);
        try {
          recognition.start();
        } catch (_) {
          setIsListeningMic(false);
        }
      } else {
        // Voice active check simulation
        setTimeout(() => {
          setIsListeningMic(false);
          setInputText('I am feeling very overwhelmed and scared today.');
        }, 1200);
      }
    } else {
      setIsListeningMic(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Header with Discreet Exit & Clear Actions */}
        <View style={styles.header}>
          <View style={styles.botProfile}>
            <View style={styles.avatarWrap}>
              <Bot size={22} color={DS.primary.main} />
            </View>
            <View>
              <Text style={styles.botName}>Support Assistant</Text>
              <Text style={styles.botStatus}>Always here to listen</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={handleClear}
              title="Clear Conversation"
            >
              <RefreshCw size={16} color={DS.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.discreetExitButton}
              onPress={onDiscreetExit}
              activeOpacity={0.8}
            >
              <LogOut size={14} color={DS.text.muted} style={{ marginRight: 4 }} />
              <Text style={styles.discreetExitText}>Discreet Exit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Message Stream */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesScroll}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <View
                key={msg.id}
                style={[
                  styles.messageRow,
                  isUser ? styles.userMessageRow : styles.botMessageRow,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isUser ? styles.userBubble : styles.botBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      isUser ? styles.userBubbleText : styles.botBubbleText,
                    ]}
                  >
                    {msg.text}
                  </Text>
                </View>
              </View>
            );
          })}

          {isTyping && (
            <View style={[styles.messageRow, styles.botMessageRow]}>
              <View style={[styles.bubble, styles.botBubble, styles.typingBubble]}>
                <ActivityIndicator size="small" color={DS.primary.main} />
                <Text style={styles.typingText}>Thinking &amp; composing...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Crisis Safety Alert Banner */}
        {crisisAlert && (
          <View style={styles.crisisBanner}>
            <View style={styles.crisisBannerHeader}>
              <XCircle size={16} color="#DC2626" style={{ marginRight: 6 }} />
              <Text style={styles.crisisBannerTitle}>Safety Notice: Elevated Distress</Text>
            </View>
            <Text style={styles.crisisBannerText}>{crisisAlert.message}</Text>
          </View>
        )}

        {/* Quick Reply Prompt Chips */}
        <View style={styles.chipsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {PROMPT_CHIPS.map((chip, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.chipPill}
                onPress={() => sendMessage(chip)}
                activeOpacity={0.7}
              >
                <Sparkles size={12} color={DS.primary.main} style={{ marginRight: 4 }} />
                <Text style={styles.chipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Sticky Bottom Input Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.inputContainer}>
            <TouchableOpacity
              style={[styles.micButton, isListeningMic && styles.micButtonActive]}
              onPress={handleMicToggle}
            >
              <Mic size={18} color={isListeningMic ? '#FFFFFF' : DS.text.muted} />
            </TouchableOpacity>

            <TextInput
              style={styles.inputField}
              placeholder="Type your thoughts or ask a question..."
              placeholderTextColor={DS.text.muted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={400}
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                !inputText.trim() && styles.sendButtonDisabled,
              ]}
              onPress={() => sendMessage()}
              disabled={!inputText.trim()}
              activeOpacity={0.8}
            >
              <Send size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.canvas.base, // Cloud Mist #F8F9FC
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DS.spacing.lg,
    paddingVertical: DS.spacing.sm,
    backgroundColor: DS.canvas.surface,
    borderBottomWidth: 1,
    borderBottomColor: DS.canvas.border,
  },
  botProfile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: DS.primary.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  botName: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.text.primary,
  },
  botStatus: {
    fontSize: 11,
    color: DS.accent.sage,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconButton: {
    padding: 8,
    marginRight: 4,
  },
  discreetExitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.canvas.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: DS.radius.pill,
    borderWidth: 1,
    borderColor: DS.canvas.border,
  },
  discreetExitText: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.text.muted,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: DS.spacing.lg,
    paddingVertical: DS.spacing.md,
  },
  messageRow: {
    marginBottom: DS.spacing.md,
    flexDirection: 'row',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  botMessageRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: DS.primary.main, // Lavender #8A79B8
    borderBottomRightRadius: 4,
    ...DS.shadow.hover,
  },
  botBubble: {
    backgroundColor: DS.canvas.surface, // Cloud White #FFFFFF
    borderWidth: 1,
    borderColor: DS.canvas.border, // #EBE8F6
    borderBottomLeftRadius: 4,
    ...DS.shadow.card,
  },
  userBubbleText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  botBubbleText: {
    color: DS.text.primary, // Charcoal #1E1F24
    fontSize: 14,
    lineHeight: 20,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    fontSize: 12,
    color: DS.text.muted,
    marginLeft: 8,
  },
  chipsContainer: {
    paddingVertical: DS.spacing.xs,
    backgroundColor: DS.canvas.base,
  },
  chipsScroll: {
    paddingHorizontal: DS.spacing.lg,
    gap: 8,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.canvas.surface,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: DS.radius.pill,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: DS.text.primary,
  },
  bottomBar: {
    paddingHorizontal: DS.spacing.lg,
    paddingTop: DS.spacing.xs,
    paddingBottom: Platform.OS === 'ios' ? 90 : 80, // space for floating ribbon tab
    backgroundColor: DS.canvas.base,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.canvas.surface,
    borderWidth: 1.5,
    borderColor: DS.canvas.border,
    borderRadius: DS.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: DS.accent.sos,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    color: DS.text.primary,
    maxHeight: 70,
    paddingHorizontal: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DS.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  crisisBanner: {
    marginHorizontal: DS.spacing.lg,
    marginBottom: DS.spacing.xs,
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  crisisBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  crisisBannerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  crisisBannerText: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
});
