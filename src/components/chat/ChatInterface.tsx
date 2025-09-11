import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useTranslation } from 'react-i18next';
import { Send, Mic, MicOff, Camera, Paperclip, Volume2, VolumeX, Download, Star, Search, Trash2, MessageSquare, Loader2, Bot, User, MapPin, Clock, X, Image as ImageIcon, Smile } from 'lucide-react';
import { format } from 'date-fns';
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  attachments?: {
    type: 'image' | 'file';
    url: string;
    name: string;
  }[];
  metadata?: any;
}
interface ChatSession {
  id: string;
  title: string;
  landId?: string;
  landName?: string;
  type: 'general' | 'land_specific';
  isFavorite: boolean;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
export function ChatInterface() {
  const {
    t,
    i18n
  } = useTranslation();
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuthStore();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedLand, setSelectedLand] = useState<string>('general');
  const [lands, setLands] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);

  // Speech recognition hook
  const {
    isListening,
    toggleListening,
    isSupported: isSpeechSupported
  } = useSpeechRecognition({
    onTranscript: transcript => {
      setInputMessage(prev => prev + ' ' + transcript);
    },
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US'
  });

  // Text to speech hook
  const {
    speak,
    stop,
    isSpeaking,
    isSupported: isTTSSupported
  } = useTextToSpeech({
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
    rate: 0.9,
    pitch: 1.0
  });

  // Load user's lands and initialize chat
  useEffect(() => {
    if (user?.id) {
      loadLands();
      loadChatSessions();
    }
  }, [user]);

  // Auto-create general session on first load
  useEffect(() => {
    if (!currentSession && lands !== null) {
      createNewSession();
    }
  }, [lands]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [currentSession?.messages]);

  // Save pending messages when online
  useEffect(() => {
    if (navigator.onLine && pendingMessages.length > 0 && currentSession) {
      syncPendingMessages();
    }
  }, [navigator.onLine, pendingMessages]);
  const loadLands = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('lands').select('id, name, village').eq('farmer_id', user?.id).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setLands(data || []);
    } catch (error) {
      console.error('Error loading lands:', error);
    }
  };
  const loadChatSessions = async () => {
    try {
      const {
        data: sessionsData,
        error: sessionsError
      } = await supabase.from('chat_sessions').select('*, chat_messages(*)').eq('user_id', user?.id).order('updated_at', {
        ascending: false
      });
      if (sessionsError) throw sessionsError;
      const formattedSessions = sessionsData?.map(session => ({
        id: session.id,
        title: session.title,
        landId: session.land_id,
        type: session.type as 'general' | 'land_specific',
        isFavorite: session.is_favorite,
        messages: session.chat_messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          attachments: msg.attachments,
          metadata: msg.metadata
        })),
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at)
      })) || [];
      setSessions(formattedSessions);

      // Load last session or create new one
      if (formattedSessions.length > 0) {
        setCurrentSession(formattedSessions[0]);
      } else {
        createNewSession();
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      // Load from localStorage if offline
      loadOfflineSessions();
    }
  };
  const loadOfflineSessions = () => {
    const offlineSessions = localStorage.getItem('chatSessions');
    if (offlineSessions) {
      const parsed = JSON.parse(offlineSessions);
      setSessions(parsed);
      if (parsed.length > 0) {
        setCurrentSession(parsed[0]);
      }
    }
  };
  const createNewSession = async () => {
    const landData = selectedLand !== 'general' ? lands.find(l => l.id === selectedLand) : null;
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: landData ? `Chat - ${landData.name}` : 'General Agricultural Chat',
      landId: landData?.id,
      landName: landData?.name,
      type: selectedLand === 'general' ? 'general' : 'land_specific',
      isFavorite: false,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    if (navigator.onLine && user?.id) {
      try {
        const {
          data,
          error
        } = await supabase.from('chat_sessions').insert({
          id: newSession.id,
          user_id: user.id,
          land_id: newSession.landId,
          title: newSession.title,
          type: newSession.type,
          is_favorite: false
        }).select().single();
        if (error) throw error;
      } catch (error) {
        console.error('Error creating session:', error);
      }
    }
    setCurrentSession(newSession);
    setSessions(prev => [newSession, ...prev]);
    saveToLocalStorage();
  };
  const saveToLocalStorage = () => {
    localStorage.setItem('chatSessions', JSON.stringify(sessions));
    if (currentSession) {
      localStorage.setItem('currentSession', JSON.stringify(currentSession));
    }
  };
  const syncPendingMessages = async () => {
    if (!currentSession || !user?.id) return;
    for (const msg of pendingMessages) {
      try {
        await supabase.from('chat_messages').insert({
          session_id: currentSession.id,
          role: msg.role,
          content: msg.content,
          attachments: msg.attachments,
          metadata: msg.metadata
        });
      } catch (error) {
        console.error('Error syncing message:', error);
      }
    }
    setPendingMessages([]);
  };
  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImage && !uploadedFile) return;
    if (!currentSession) {
      await createNewSession();
    }
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
      attachments: []
    };
    if (uploadedImage) {
      userMessage.attachments?.push({
        type: 'image',
        url: uploadedImage,
        name: 'uploaded-image.jpg'
      });
    }
    if (uploadedFile) {
      userMessage.attachments?.push({
        type: 'file',
        url: URL.createObjectURL(uploadedFile),
        name: uploadedFile.name
      });
    }

    // Add user message to current session
    const updatedMessages = [...(currentSession?.messages || []), userMessage];
    setCurrentSession(prev => prev ? {
      ...prev,
      messages: updatedMessages
    } : null);
    setInputMessage('');
    setUploadedImage(null);
    setUploadedFile(null);
    setIsLoading(true);
    setIsTyping(true);
    try {
      // Save user message to database
      if (navigator.onLine && currentSession && user?.id) {
        await supabase.from('chat_messages').insert({
          session_id: currentSession.id,
          role: 'user',
          content: userMessage.content,
          attachments: userMessage.attachments,
          metadata: userMessage.metadata
        });
      } else {
        setPendingMessages(prev => [...prev, userMessage]);
      }

      // Call AI chat function
      const {
        data,
        error
      } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: updatedMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          landId: currentSession?.landId,
          imageUrl: uploadedImage,
          sessionId: currentSession?.id
        }
      });
      if (error) throw error;
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        metadata: data.metadata
      };

      // Add assistant message
      const finalMessages = [...updatedMessages, assistantMessage];
      setCurrentSession(prev => prev ? {
        ...prev,
        messages: finalMessages
      } : null);

      // Set quick replies
      if (data.quickReplies) {
        setQuickReplies(data.quickReplies);
      }

      // Speak the response if voice is enabled
      if (voiceEnabled && isTTSSupported) {
        speak(data.response);
      }

      // Save assistant message to database
      if (navigator.onLine && currentSession && user?.id) {
        await supabase.from('chat_messages').insert({
          session_id: currentSession.id,
          role: 'assistant',
          content: assistantMessage.content,
          metadata: assistantMessage.metadata
        });

        // Update session
        await supabase.from('chat_sessions').update({
          updated_at: new Date().toISOString()
        }).eq('id', currentSession.id);
      } else {
        setPendingMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      saveToLocalStorage();
    }
  };
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        setUploadedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };
  const toggleFavorite = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const newFavoriteStatus = !session.isFavorite;

    // Update locally
    setSessions(prev => prev.map(s => s.id === sessionId ? {
      ...s,
      isFavorite: newFavoriteStatus
    } : s));

    // Update in database
    if (navigator.onLine && user?.id) {
      try {
        await supabase.from('chat_sessions').update({
          is_favorite: newFavoriteStatus
        }).eq('id', sessionId);
      } catch (error) {
        console.error('Error updating favorite:', error);
      }
    }
    saveToLocalStorage();
  };
  const deleteSession = async (sessionId: string) => {
    // Remove locally
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
    }

    // Delete from database
    if (navigator.onLine && user?.id) {
      try {
        await supabase.from('chat_sessions').delete().eq('id', sessionId);
      } catch (error) {
        console.error('Error deleting session:', error);
      }
    }
    saveToLocalStorage();
  };
  const exportChatAsPDF = async () => {
    if (!currentSession) return;

    // Create a printable HTML content
    const printContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 20px; }
            .date { text-align: center; margin-bottom: 30px; color: #666; }
            .message { margin-bottom: 15px; padding: 10px; border-radius: 8px; }
            .user-message { background: #f0f0f0; }
            .assistant-message { background: #e8f5e9; }
            .role { font-weight: bold; margin-bottom: 5px; }
            .timestamp { color: #666; font-size: 0.85em; margin-top: 5px; }
          </style>
        </head>
        <body>
          <h1>${currentSession.title}</h1>
          <p class="date">Date: ${format(currentSession.createdAt, 'PPP')}</p>
          ${currentSession.messages.map(msg => `
            <div class="message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}">
              <div class="role">${msg.role === 'user' ? 'You' : 'AI Assistant'}:</div>
              <div>${msg.content}</div>
              <div class="timestamp">${format(msg.timestamp, 'PPp')}</div>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    // Open print dialog
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    } else {
      toast({
        title: 'Export Failed',
        description: 'Please allow pop-ups to export the chat',
        variant: 'destructive'
      });
    }
  };
  const filteredSessions = sessions.filter(session => session.title.toLowerCase().includes(searchQuery.toLowerCase()) || session.messages.some(msg => msg.content.toLowerCase().includes(searchQuery.toLowerCase())));
  return <div className="flex flex-col h-[calc(100vh-8rem)] p-4">
      {/* Land Selection Quick Buttons */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <Button variant={selectedLand === 'general' ? 'default' : 'outline'} size="sm" onClick={() => {
        setSelectedLand('general');
        createNewSession();
      }} className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {t('chat.generalChat')}
        </Button>
        {lands.map(land => <Button key={land.id} variant={selectedLand === land.id ? 'default' : 'outline'} size="sm" onClick={() => {
        setSelectedLand(land.id);
        createNewSession();
      }} className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {land.name}
          </Button>)}
      </div>

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col bg-background rounded-lg border shadow-sm overflow-hidden">
        {/* Chat Header */}
        <div className="p-4 border-b flex items-center justify-between bg-card">
          <div>
            <h2 className="text-lg font-semibold">
              {currentSession?.title || t('chat.title')}
            </h2>
            {currentSession?.landName && <Badge variant="outline" className="mt-1">
                <MapPin className="w-3 h-3 mr-1" />
                {currentSession.landName}
              </Badge>}
          </div>
          <div className="flex gap-2">
            <Button size="icon" variant="outline" onClick={() => setVoiceEnabled(!voiceEnabled)} title={voiceEnabled ? 'Disable voice' : 'Enable voice'}>
              {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="outline" onClick={exportChatAsPDF} title="Export chat">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          {currentSession?.messages.map(message => <div key={message.id} className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[70%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>
                  {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`rounded-lg p-3 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.attachments?.map((attachment, idx) => <div key={idx} className="mt-2">
                      {attachment.type === 'image' ? <img src={attachment.url} alt={attachment.name} className="max-w-full rounded" /> : <div className="flex items-center gap-2 p-2 bg-background/10 rounded">
                          <Paperclip className="w-4 h-4" />
                          <span className="text-sm">{attachment.name}</span>
                        </div>}
                    </div>)}
                  <p className="text-xs opacity-70 mt-2">
                    {format(message.timestamp, 'h:mm a')}
                  </p>
                </div>
              </div>
            </div>)}
          
          {isTyping && <div className="flex items-center gap-2 text-muted-foreground">
              <Bot className="w-4 h-4" />
              <span className="text-sm">AI is typing...</span>
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>}

          {/* Welcome message when no messages */}
          {(!currentSession || currentSession.messages.length === 0) && !isTyping && <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('chat.welcome')}</h3>
                <p className="text-sm">{t('chat.askAnything')}</p>
              </div>
            </div>}
        </ScrollArea>

        {/* Quick Replies */}
        {quickReplies.length > 0 && <div className="px-4 pb-2 flex gap-2 flex-wrap">
            {quickReplies.map((reply, idx) => <Button key={idx} variant="outline" size="sm" onClick={() => setInputMessage(reply)}>
                {reply}
              </Button>)}
          </div>}

        {/* Attachments Preview */}
        {(uploadedImage || uploadedFile) && <div className="px-4 pb-2 flex gap-2">
            {uploadedImage && <div className="relative">
                <img src={uploadedImage} alt="Upload" className="h-20 w-20 object-cover rounded" />
                <Button size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => setUploadedImage(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>}
            {uploadedFile && <div className="relative p-2 bg-accent rounded flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                <span className="text-sm">{uploadedFile.name}</span>
                <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => setUploadedFile(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>}
          </div>}

        {/* WhatsApp-style Input Area */}
        <div className="border-t border-border bg-card/95 backdrop-blur-sm">
          <div className="p-2">
            <div className="flex items-end gap-1">
              {/* Emoji Button */}
              
              
              {/* Message Input */}
              <div className="flex-1 min-w-0">
                <Input value={inputMessage} onChange={e => setInputMessage(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }} placeholder="Message" disabled={isLoading} className="h-10 rounded-full bg-muted/50 border-0 px-4 placeholder:text-muted-foreground/70" />
              </div>
              
              {/* Attachment Button */}
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="*/*" capture="environment" />
              <Button type="button" variant="ghost" size="icon" onClick={() => {
              // For mobile devices, trigger file input with camera/file options
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }} disabled={isLoading} className="h-10 w-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground" title="Attach">
                <Paperclip className="h-5 w-5" />
              </Button>
              
              {/* Camera Button */}
              <input ref={imageInputRef} type="file" className="hidden" onChange={handleImageUpload} accept="image/*" capture="environment" />
              <Button type="button" variant="ghost" size="icon" onClick={() => {
              // On mobile, this will open camera directly
              if (imageInputRef.current) {
                imageInputRef.current.click();
              }
            }} disabled={isLoading} className="h-10 w-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground" title="Camera">
                <Camera className="h-5 w-5" />
              </Button>
              
              {/* Voice/Send Button */}
              {inputMessage.trim() || uploadedImage || uploadedFile ? <Button type="button" size="icon" onClick={sendMessage} disabled={isLoading} className="h-10 w-10 rounded-full shrink-0 bg-primary hover:bg-primary/90">
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" /> : <Send className="h-5 w-5 text-primary-foreground" />}
                </Button> : <Button type="button" variant={isListening ? "destructive" : "default"} size="icon" onClick={isSpeechSupported ? toggleListening : undefined} disabled={isLoading || !isSpeechSupported} className="h-10 w-10 rounded-full shrink-0 bg-success hover:bg-success/90 text-success-foreground" title={isListening ? 'Stop recording' : 'Start recording'}>
                  {isListening ? <MicOff className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
                </Button>}
            </div>
          </div>
        </div>

        {/* Hidden File Inputs */}
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt" />
        <input ref={imageInputRef} type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
      </div>

    </div>;
}