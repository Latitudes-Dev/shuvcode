import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createOpencodeClient } from '@opencode-ai/sdk/client';

const SERVER_URL_KEY = 'opencode_server_url';

export type OpenCodeClient = ReturnType<typeof createOpencodeClient>;

export interface Session {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  projectID?: string;
  parentID?: string;
}

export interface SessionWithPreview extends Session {
  preview?: string;
}

export interface Project {
  id: string;
  name?: string;
  path?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  createdAt?: string;
}

export interface MessagePart {
  type: string;
  text?: string;
  tool?: string;
  toolName?: string;
  callID?: string;
  state?: {
    status?: string;
    input?: any;
    output?: string;
  } | string;
  reason?: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
  };
  // For file/image parts
  mime?: string;
  filename?: string;
  url?: string;
}

export interface MessageWithParts {
  info: Message;
  parts: MessagePart[];
}

// Cache entry with timestamp
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Cache for all data
interface Cache {
  sessions: CacheEntry<SessionWithPreview[]> | null;
  sessionMessages: Map<string, CacheEntry<MessageWithParts[]>>;
  projects: CacheEntry<Project[]> | null;
}

interface OpenCodeContextValue {
  // Connection state
  connected: boolean;
  connecting: boolean;
  error: string | null;
  serverUrl: string;
  
  // Connection actions
  connect: (url?: string) => Promise<boolean>;
  disconnect: () => void;
  setServerUrl: (url: string) => void;
  
  // Sessions with stale-while-revalidate
  sessions: SessionWithPreview[];
  sessionsLoading: boolean;
  sessionsRefreshing: boolean;
  refreshSessions: () => void;
  
  // Session messages with stale-while-revalidate + live updates
  getSessionMessages: (sessionId: string) => MessageWithParts[];
  isSessionMessagesLoading: (sessionId: string) => boolean;
  isSessionMessagesRefreshing: (sessionId: string) => boolean;
  refreshSessionMessages: (sessionId: string) => void;
  
  // Subscribe to live updates for a session
  subscribeToSession: (sessionId: string) => void;
  unsubscribeFromSession: () => void;
  activeSessionId: string | null;
  
  // Send prompt to session
  sendPrompt: (sessionId: string, text: string) => Promise<boolean>;
  isSending: boolean;
  
  // Create session
  createSession: (projectID?: string, parentID?: string) => Promise<Session | null>;
  
  // Projects
  projects: Project[];
  projectsLoading: boolean;
  refreshProjects: () => void;
  
  // Client access
  client: OpenCodeClient | null;
}

const OpenCodeContext = createContext<OpenCodeContextValue | null>(null);

interface OpenCodeProviderProps {
  children: ReactNode;
  defaultServerUrl?: string;
}

export function OpenCodeProvider({ children, defaultServerUrl = 'http://10.0.10.59:9034' }: OpenCodeProviderProps) {
  // Connection state
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState(defaultServerUrl);

  const setServerUrl = useCallback((url: string) => {
    setServerUrlState(url);
    AsyncStorage.setItem(SERVER_URL_KEY, url).catch(err => {
      console.error('Failed to save server URL to storage:', err);
    });
  }, []);
  
  const clientRef = useRef<OpenCodeClient | null>(null);
  
  // Cache
  const cacheRef = useRef<Cache>({
    sessions: null,
    sessionMessages: new Map(),
    projects: null,
  });
  
  // UI state for sessions
  const [sessions, setSessions] = useState<SessionWithPreview[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsRefreshing, setSessionsRefreshing] = useState(false);
  
  // UI state for session messages (per session)
  const [sessionMessagesState, setSessionMessagesState] = useState<Map<string, MessageWithParts[]>>(new Map());
  const [sessionMessagesLoading, setSessionMessagesLoading] = useState<Set<string>>(new Set());
  const [sessionMessagesRefreshing, setSessionMessagesRefreshing] = useState<Set<string>>(new Set());
  
  // UI state for projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  
  // SSE subscription state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sseAbortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Sending state
  const [isSending, setIsSending] = useState(false);
  
  // Helper to extract text preview from messages
  const extractPreview = (messages: MessageWithParts[]): string => {
    // Get the last message with text content
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      for (const part of message.parts) {
        if (part.type === 'text' && part.text?.trim()) {
          const text = part.text.trim();
          // Truncate to ~60 chars
          if (text.length > 60) {
            return text.substring(0, 57) + '...';
          }
          return text;
        }
      }
    }
    return '';
  };
  
  const connectionIdRef = useRef(0);
  
  // Connect to server
  const connect = useCallback(async (url?: string) => {
    const targetUrl = url || serverUrl;
    const connectionId = ++connectionIdRef.current;
    
    setConnecting(true);
    setError(null);
    
    try {
      const client = createOpencodeClient({
        baseUrl: targetUrl,
      });
      
      // Test connection with a timeout
      const listPromise = client.session.list();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timed out')), 5000)
      );
      
      await Promise.race([listPromise, timeoutPromise]);
      
      if (connectionId !== connectionIdRef.current) {
        return false;
      }

      clientRef.current = client;
      setServerUrl(targetUrl);
      setConnected(true);
      setConnecting(false);
      return true;
    } catch (err) {
      if (connectionId !== connectionIdRef.current) {
        return false;
      }

      setError((err as Error).message);
      setConnected(false);
      setConnecting(false);
      return false;
    }
  }, [serverUrl]);
  
  // Load saved URL and auto-connect on mount
  useEffect(() => {
    const init = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem(SERVER_URL_KEY);
        if (savedUrl) {
          setServerUrlState(savedUrl);
          // Silently try to connect
          connect(savedUrl);
        } else {
          connect(serverUrl);
        }
      } catch (err) {
        // Fallback to default
        connect(serverUrl);
      }
    };
    init();
  }, []); // Run once on mount

  // Disconnect
  const disconnect = useCallback(() => {
    // Stop any SSE subscription
    if (sseAbortControllerRef.current) {
      sseAbortControllerRef.current.abort();
      sseAbortControllerRef.current = null;
    }
    
    clientRef.current = null;
    setConnected(false);
    setActiveSessionId(null);
    
    // Clear cache
    cacheRef.current = {
      sessions: null,
      sessionMessages: new Map(),
      projects: null,
    };
    setSessions([]);
    setSessionMessagesState(new Map());
    setProjects([]);
  }, []);
  
  // Fetch sessions with stale-while-revalidate
  const fetchSessions = useCallback(async (isRefresh = false) => {
    if (!clientRef.current) return;
    
    const cache = cacheRef.current;
    
    // If we have cached data, return it immediately (stale-while-revalidate)
    if (cache.sessions && !isRefresh) {
      setSessions(cache.sessions.data);
    }
    
    // Set loading/refreshing state
    if (isRefresh || cache.sessions) {
      setSessionsRefreshing(true);
    } else {
      setSessionsLoading(true);
    }
    
    try {
      const result = await clientRef.current.session.list();
      const sessionsData = (result.data ?? []) as Session[];
      
      // Sort by updated/created date
      const sorted = sessionsData.sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || '';
        const dateB = b.updatedAt || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      
      // Fetch previews for each session (from cache or fetch)
      const sessionsWithPreviews: SessionWithPreview[] = await Promise.all(
        sorted.map(async (session) => {
          const cachedMessages = cache.sessionMessages.get(session.id);
          if (cachedMessages) {
            return {
              ...session,
              preview: extractPreview(cachedMessages.data),
            };
          }
          
          // Fetch messages for preview (lightweight - we'll cache it)
          try {
            const messagesResult = await clientRef.current!.session.messages({
              path: { id: session.id },
            });
            const messages = (messagesResult.data ?? []) as MessageWithParts[];
            
            // Cache the messages
            cache.sessionMessages.set(session.id, {
              data: messages,
              timestamp: Date.now(),
            });
            
            // Update session messages state
            setSessionMessagesState(prev => {
              const next = new Map(prev);
              next.set(session.id, messages);
              return next;
            });
            
            return {
              ...session,
              preview: extractPreview(messages),
            };
          } catch {
            return { ...session, preview: '' };
          }
        })
      );
      
      // Update cache
      cache.sessions = {
        data: sessionsWithPreviews,
        timestamp: Date.now(),
      };
      
      setSessions(sessionsWithPreviews);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSessionsLoading(false);
      setSessionsRefreshing(false);
    }
  }, []);
  
  // Refresh sessions
  const refreshSessions = useCallback(() => {
    fetchSessions(true);
  }, [fetchSessions]);
  
  // Auto-fetch sessions when connected
  useEffect(() => {
    if (connected) {
      fetchSessions();
    }
  }, [connected, fetchSessions]);
  
  // Get session messages (from cache or state)
  const getSessionMessages = useCallback((sessionId: string): MessageWithParts[] => {
    return sessionMessagesState.get(sessionId) ?? [];
  }, [sessionMessagesState]);
  
  // Check if session messages are loading
  const isSessionMessagesLoading = useCallback((sessionId: string): boolean => {
    return sessionMessagesLoading.has(sessionId);
  }, [sessionMessagesLoading]);
  
  // Check if session messages are refreshing
  const isSessionMessagesRefreshing = useCallback((sessionId: string): boolean => {
    return sessionMessagesRefreshing.has(sessionId);
  }, [sessionMessagesRefreshing]);
  
  // Fetch session messages with stale-while-revalidate
  const fetchSessionMessages = useCallback(async (sessionId: string, isRefresh = false) => {
    if (!clientRef.current) return;
    
    const cache = cacheRef.current;
    const cachedMessages = cache.sessionMessages.get(sessionId);
    
    // If we have cached data, return it immediately
    if (cachedMessages && !isRefresh) {
      setSessionMessagesState(prev => {
        const next = new Map(prev);
        next.set(sessionId, cachedMessages.data);
        return next;
      });
    }
    
    // Set loading/refreshing state
    if (isRefresh || cachedMessages) {
      setSessionMessagesRefreshing(prev => new Set(prev).add(sessionId));
    } else {
      setSessionMessagesLoading(prev => new Set(prev).add(sessionId));
    }
    
    try {
      const result = await clientRef.current.session.messages({
        path: { id: sessionId },
      });
      const messages = (result.data ?? []) as MessageWithParts[];
      
      // Update cache
      cache.sessionMessages.set(sessionId, {
        data: messages,
        timestamp: Date.now(),
      });
      
      // Update state
      setSessionMessagesState(prev => {
        const next = new Map(prev);
        next.set(sessionId, messages);
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSessionMessagesLoading(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      setSessionMessagesRefreshing(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, []);
  
  // Refresh session messages
  const refreshSessionMessages = useCallback((sessionId: string) => {
    fetchSessionMessages(sessionId, true);
  }, [fetchSessionMessages]);
  
  // Subscribe to live updates for a session
  const subscribeToSession = useCallback((sessionId: string) => {
    if (!clientRef.current) return;
    
    // Unsubscribe from previous session
    if (sseAbortControllerRef.current) {
      sseAbortControllerRef.current.abort();
    }
    
    setActiveSessionId(sessionId);
    
    // Fetch initial messages
    fetchSessionMessages(sessionId);
    
    // Start SSE subscription
    const abortController = new AbortController();
    sseAbortControllerRef.current = abortController;
    
    const startSubscription = async () => {
      try {
        const response = await clientRef.current!.event.subscribe();
        
        // Process events from the stream
        for await (const event of response.stream) {
          if (abortController.signal.aborted) break;
          
          // The event structure from SSE
          const eventData = event as any;
          
          // Events can be wrapped in a payload or be direct
          const payload = eventData?.payload || eventData;
          const eventType = payload?.type;
          const properties = payload?.properties;
          
          // Get sessionID from various places it might be
          const eventSessionId = 
            properties?.sessionID || 
            properties?.session?.id ||
            properties?.part?.sessionID ||
            properties?.info?.sessionID;
          
          // Check if this event is for our session
          if (eventSessionId === sessionId) {
            // Refresh messages when we get relevant events
            if (
              eventType === 'message.updated' ||
              eventType === 'message.part.updated' ||
              eventType === 'session.updated' ||
              eventType === 'session.status'
            ) {
              // Silently refresh messages
              fetchSessionMessages(sessionId, true);
            }
          }
        }
      } catch (err) {
        // Ignore abort errors
        if ((err as Error).name !== 'AbortError') {
          console.error('SSE subscription error:', err);
          // Try to reconnect after a delay if not aborted
          if (!abortController.signal.aborted) {
            setTimeout(() => {
              if (!abortController.signal.aborted && clientRef.current) {
                startSubscription();
              }
            }, 3000);
          }
        }
      }
    };
    
    startSubscription();
    
    // Also set up polling as a fallback (every 2 seconds)
    // This ensures updates even if SSE doesn't work well in React Native
    pollingIntervalRef.current = setInterval(() => {
      if (!abortController.signal.aborted) {
        fetchSessionMessages(sessionId, true);
      }
    }, 2000);
  }, [fetchSessionMessages]);
  
  // Unsubscribe from session
  const unsubscribeFromSession = useCallback(() => {
    if (sseAbortControllerRef.current) {
      sseAbortControllerRef.current.abort();
      sseAbortControllerRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setActiveSessionId(null);
  }, []);
  
  // Send a prompt to a session
  const sendPrompt = useCallback(async (sessionId: string, text: string): Promise<boolean> => {
    if (!clientRef.current || !text.trim()) {
      console.log('[OpenCode] sendPrompt: No client or empty text');
      return false;
    }
    
    setIsSending(true);
    try {
      console.log('[OpenCode] Sending prompt to session:', sessionId, 'text:', text.substring(0, 50));
      
      // Use promptAsync which returns immediately - updates come via SSE/polling
      const result = await clientRef.current.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: text.trim() }],
        },
      });
      
      console.log('[OpenCode] Prompt sent successfully:', result);
      
      // Refresh messages after sending
      fetchSessionMessages(sessionId, true);
      return true;
    } catch (err) {
      const error = err as Error;
      console.error('[OpenCode] Error sending prompt:', error.message, error);
      setError(error.message);
      return false;
    } finally {
      setIsSending(false);
    }
  }, [fetchSessionMessages]);
  
  // Create a new session
  const createSession = useCallback(async (directory?: string, parentID?: string): Promise<Session | null> => {
    if (!clientRef.current) return null;
    
    try {
      const result = await clientRef.current.session.create({
        body: {
          parentID,
        },
        query: {
          directory,
        },
      });
      
      const newSession = result.data as Session;
      if (newSession) {
        // Refresh sessions list to include the new one
        refreshSessions();
        return newSession;
      }
      return null;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [refreshSessions]);
  
  // Fetch projects with stale-while-revalidate
  const fetchProjects = useCallback(async () => {
    if (!clientRef.current) return;
    
    const cache = cacheRef.current;
    
    if (cache.projects) {
      setProjects(cache.projects.data);
    } else {
      setProjectsLoading(true);
    }
    
    try {
      const result = await clientRef.current.project.list();
      const projectsData = (result.data ?? []) as Project[];
      
      cache.projects = {
        data: projectsData,
        timestamp: Date.now(),
      };
      
      setProjects(projectsData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProjectsLoading(false);
    }
  }, []);
  
  // Refresh projects
  const refreshProjects = useCallback(() => {
    fetchProjects();
  }, [fetchProjects]);
  
  // Auto-fetch projects when connected
  useEffect(() => {
    if (connected) {
      fetchProjects();
    }
  }, [connected, fetchProjects]);
  
  const value: OpenCodeContextValue = {
    connected,
    connecting,
    error,
    serverUrl,
    connect,
    disconnect,
    setServerUrl,
    sessions,
    sessionsLoading,
    sessionsRefreshing,
    refreshSessions,
    getSessionMessages,
    isSessionMessagesLoading,
    isSessionMessagesRefreshing,
    refreshSessionMessages,
    subscribeToSession,
    unsubscribeFromSession,
    activeSessionId,
    sendPrompt,
    isSending,
    createSession,
    projects,
    projectsLoading,
    refreshProjects,
    client: clientRef.current,
  };
  
  return (
    <OpenCodeContext.Provider value={value}>
      {children}
    </OpenCodeContext.Provider>
  );
}

export function useOpenCode() {
  const context = useContext(OpenCodeContext);
  if (!context) {
    throw new Error('useOpenCode must be used within an OpenCodeProvider');
  }
  return context;
}
