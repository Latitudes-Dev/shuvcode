import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SessionsScreen } from '../../../src/screens/SessionsScreen';
import { useOpenCode, Session } from '../../../src/providers/OpenCodeProvider';

export default function Sessions() {
  const router = useRouter();
  const {
    sessions,
    sessionsLoading,
    sessionsRefreshing,
    refreshSessions,
    createSession,
  } = useOpenCode();
  
  const handleCreateSession = useCallback(async () => {
    const session = await createSession();
    if (session) {
      router.push(`/chat/${session.id}`);
    }
  }, [createSession, router]);

  const handleSelectSession = useCallback((session: Session) => {
    // Navigate to chat screen outside of tabs (hides tab bar)
    router.push(`/chat/${session.id}`);
  }, [router]);

  return (
    <SessionsScreen
      sessions={sessions}
      loading={sessionsLoading}
      refreshing={sessionsRefreshing}
      onRefresh={refreshSessions}
      onSelectSession={handleSelectSession}
      onCreateSession={handleCreateSession}
    />
  );
}
