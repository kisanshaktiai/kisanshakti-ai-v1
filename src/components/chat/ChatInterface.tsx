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
import { 
  Send, 
  Mic, 
  MicOff, 
  Camera, 
  Paperclip, 
  Volume2, 
  VolumeX,
  Download,
  Star,
  Search,
  Trash2,
  MessageSquare,
  Loader2,
  Bot,
  User,
  MapPin,
  Clock,
  X,
  Image as ImageIcon
} from 'lucide-react';
import { format } from 'date-fns';

declare module 'html2pdf.js';
const html2pdf = (window as any).html2pdf;

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
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);

  // Speech recognition hook
  const { isListening, toggleListening, isSupported: isSpeechSupported } = useSpeechRecognition({
    onTranscript: (transcript) => {
      setInputMessage(prev => prev + ' ' + transcript);
    },
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US'
  });

  // Text to speech hook
  const { speak, stop, isSpeaking, isSupported: isTTSSupported } = useTextToSpeech({
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
    rate: 0.9,
    pitch: 1.0
  });

  // Load user's lands
  useEffect(() => {
    if (user?.id) {
      loadLands();
      loadChatSessions();
    }
  }, [user]);

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
      const { data, error } = await supabase
        .from('lands')
        .select('id, name, village')
        .eq('farmer_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLands(data || []);
    } catch (error) {
      console.error('Error loading lands:', error);
    }
  };

  const loadChatSessions = async () => {
    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('chat_sessions')
        .select('*, chat_messages(*)')
        .eq('user_id', user?.id)
        .order('updated_at', { ascending: false });

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
        const { data, error } = await supabase
          .from('chat_sessions')
          .insert({
            id: newSession.id,
            user_id: user.id,
            land_id: newSession.landId,
            title: newSession.title,
            type: newSession.type,
            is_favorite: false
          })
          .select()
          .single();

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
        await supabase
          .from('chat_messages')
          .insert({
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
    setCurrentSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
    setInputMessage('');
    setUploadedImage(null);
    setUploadedFile(null);
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Save user message to database
      if (navigator.onLine && currentSession && user?.id) {
        await supabase
          .from('chat_messages')
          .insert({
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
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
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
      setCurrentSession(prev => prev ? { ...prev, messages: finalMessages } : null);
      
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
        await supabase
          .from('chat_messages')
          .insert({
            session_id: currentSession.id,
            role: 'assistant',
            content: assistantMessage.content,
            metadata: assistantMessage.metadata
          });

        // Update session
        await supabase
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', currentSession.id);
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
      reader.onload = (e) => {
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

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera. Please check permissions.',
        variant: 'destructive'
      });
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageData = canvasRef.current.toDataURL('image/jpeg');
        setUploadedImage(imageData);
        closeCamera();
      }
    }
  };

  const closeCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const toggleFavorite = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const newFavoriteStatus = !session.isFavorite;
    
    // Update locally
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, isFavorite: newFavoriteStatus } : s
    ));

    // Update in database
    if (navigator.onLine && user?.id) {
      try {
        await supabase
          .from('chat_sessions')
          .update({ is_favorite: newFavoriteStatus })
          .eq('id', sessionId);
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
        await supabase
          .from('chat_sessions')
          .delete()
          .eq('id', sessionId);
      } catch (error) {
        console.error('Error deleting session:', error);
      }
    }

    saveToLocalStorage();
  };

  const exportChatAsPDF = () => {
    if (!currentSession) return;

    const element = document.createElement('div');
    element.innerHTML = `
      <h1 style="text-align: center; margin-bottom: 20px;">${currentSession.title}</h1>
      <p style="text-align: center; margin-bottom: 30px;">Date: ${format(currentSession.createdAt, 'PPP')}</p>
      ${currentSession.messages.map(msg => `
        <div style="margin-bottom: 15px; padding: 10px; background: ${msg.role === 'user' ? '#f0f0f0' : '#e8f5e9'}; border-radius: 8px;">
          <strong>${msg.role === 'user' ? 'You' : 'AI Assistant'}:</strong>
          <p style="margin-top: 5px;">${msg.content}</p>
          <small style="color: #666;">${format(msg.timestamp, 'PPp')}</small>
        </div>
      `).join('')}
    `;

    const opt = {
      margin: 10,
      filename: `chat-${currentSession.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.messages.some(msg => msg.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 p-4">
      {/* Sidebar - Chat History */}
      <Card className="w-80 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold mb-3">{t('chat.history')}</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('chat.searchChats')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedLand} onValueChange={setSelectedLand}>
            <SelectTrigger>
              <SelectValue placeholder={t('chat.selectLand')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">
                <MessageSquare className="inline-block w-4 h-4 mr-2" />
                {t('chat.generalChat')}
              </SelectItem>
              {lands.map(land => (
                <SelectItem key={land.id} value={land.id}>
                  <MapPin className="inline-block w-4 h-4 mr-2" />
                  {land.name} - {land.village}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <ScrollArea className="flex-1 px-4">
          {filteredSessions.map(session => (
            <div
              key={session.id}
              className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                currentSession?.id === session.id ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
              onClick={() => setCurrentSession(session)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-sm">{session.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {session.messages.length} messages
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Clock className="inline-block w-3 h-3 mr-1" />
                    {format(session.updatedAt, 'MMM d, h:mm a')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(session.id);
                    }}
                  >
                    <Star className={`h-4 w-4 ${session.isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </ScrollArea>

        <div className="p-4 border-t">
          <Button 
            onClick={createNewSession} 
            className="w-full"
            variant="outline"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {t('chat.newChat')}
          </Button>
        </div>
      </Card>

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col">
        {currentSession ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{currentSession.title}</h2>
                {currentSession.landName && (
                  <Badge variant="outline" className="mt-1">
                    <MapPin className="w-3 h-3 mr-1" />
                    {currentSession.landName}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                >
                  {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={exportChatAsPDF}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
              {currentSession.messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 max-w-[70%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent'
                    }`}>
                      {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`rounded-lg p-3 ${
                      message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent'
                    }`}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.attachments?.map((attachment, idx) => (
                        <div key={idx} className="mt-2">
                          {attachment.type === 'image' ? (
                            <img src={attachment.url} alt={attachment.name} className="max-w-full rounded" />
                          ) : (
                            <div className="flex items-center gap-2 p-2 bg-background/10 rounded">
                              <Paperclip className="w-4 h-4" />
                              <span className="text-sm">{attachment.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      <p className="text-xs opacity-70 mt-2">
                        {format(message.timestamp, 'h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Bot className="w-4 h-4" />
                  <span className="text-sm">AI is typing...</span>
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </ScrollArea>

            {/* Quick Replies */}
            {quickReplies.length > 0 && (
              <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {quickReplies.map((reply, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => setInputMessage(reply)}
                  >
                    {reply}
                  </Button>
                ))}
              </div>
            )}

            {/* Attachments Preview */}
            {(uploadedImage || uploadedFile) && (
              <div className="px-4 pb-2 flex gap-2">
                {uploadedImage && (
                  <div className="relative">
                    <img src={uploadedImage} alt="Upload" className="h-20 w-20 object-cover rounded" />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => setUploadedImage(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {uploadedFile && (
                  <div className="relative p-2 bg-accent rounded flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    <span className="text-sm">{uploadedFile.name}</span>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-6 w-6"
                      onClick={() => setUploadedFile(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={openCamera}
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                {isSpeechSupported && (
                  <Button
                    size="icon"
                    variant={isListening ? 'destructive' : 'outline'}
                    onClick={toggleListening}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t('chat.typeMessage')}
                  className="flex-1 min-h-[40px] max-h-[120px]"
                />
                <Button
                  onClick={sendMessage}
                  disabled={isLoading || (!inputMessage.trim() && !uploadedImage && !uploadedFile)}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.doc,.docx,.txt"
            />
            <input
              ref={imageInputRef}
              type="file"
              className="hidden"
              onChange={handleImageUpload}
              accept="image/*"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Bot className="w-12 h-12 mx-auto mb-4" />
              <p>{t('chat.selectOrCreate')}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-background rounded-lg p-4 max-w-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t('chat.capturePhoto')}</h3>
              <Button size="icon" variant="ghost" onClick={closeCamera}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <video ref={videoRef} autoPlay className="w-full rounded mb-4" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-2 justify-center">
              <Button onClick={capturePhoto}>
                <Camera className="h-4 w-4 mr-2" />
                {t('chat.capture')}
              </Button>
              <Button variant="outline" onClick={closeCamera}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}