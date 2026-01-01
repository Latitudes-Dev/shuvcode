import { useEffect, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatScreen } from '../../src/screens/ChatScreen';
import { useOpenCode, Session } from '../../src/providers/OpenCodeProvider';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    sessions,
    getSessionMessages,
    isSessionMessagesLoading,
    serverUrl,
    sendPrompt,
    isSending,
    createSession,
    subscribeToSession,
    unsubscribeFromSession,
  } = useOpenCode();
  
  const handleBranch = useCallback(async () => {
    if (!id) return;
    const currentSession = sessions.find(s => s.id === id);
    const session = await createSession(currentSession?.projectID, id);
    if (session) {
      router.push(`/chat/${session.id}`);
    }
  }, [id, createSession, sessions, router]);

  // Subscribe to session on mount
  useEffect(() => {
    if (id) {
      subscribeToSession(id);
    }
    return () => {
      unsubscribeFromSession();
    };
  }, [id, subscribeToSession, unsubscribeFromSession]);

  // Find session from the sessions list
  const session = sessions.find((s) => s.id === id) ?? {
    id: id || '',
    title: 'Chat',
  } as Session;

  const messages = getSessionMessages(id || '');
  const loading = isSessionMessagesLoading(id || '');

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!id) return false;
    return sendPrompt(id, text);
  }, [sendPrompt, id]);

  return (
    <ChatScreen
      session={session}
      messages={messages}
      loading={loading}
      serverUrl={serverUrl}
      onBack={handleBack}
      onSendMessage={handleSendMessage}
      onBranch={handleBranch}
      isSending={isSending}
    />
  );
}
