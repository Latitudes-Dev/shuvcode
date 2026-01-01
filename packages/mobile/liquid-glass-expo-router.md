# Liquid Glass Implementation Plan - Expo Router Native Tabs

This document outlines the migration from our current React Navigation setup to Expo Router with Native Tabs to enable iPadOS 26 Liquid Glass effects.

## Prerequisites

- **Expo SDK 54+** (already have ~54.0.30)
- **Xcode 26** (required to compile for iOS 26 liquid glass)
- **iOS 26+ device/simulator** to see the effect
- Fallback styling will be used on older iOS versions

## Current Architecture

```
openpad/
├── App.tsx                    # Manual tab state management
├── src/
│   ├── screens/
│   │   ├── ConnectScreen.tsx  # Pre-auth screen
│   │   ├── SessionsScreen.tsx # Tab 1
│   │   ├── SettingsScreen.tsx # Tab 2
│   │   └── ChatScreen.tsx     # Pushed from Sessions
│   ├── hooks/
│   │   ├── useOpenCode.ts
│   │   └── useTheme.ts
│   ├── components/
│   │   ├── Icon.tsx
│   │   ├── Markdown.tsx
│   │   └── GlassCard.tsx
│   └── theme/
│       └── index.ts
```

## Target Architecture (Expo Router)

```
openpad/
├── app/
│   ├── _layout.tsx            # Root layout (auth check)
│   ├── index.tsx              # Redirect to /connect or /(tabs)
│   ├── connect.tsx            # Connect screen (outside tabs)
│   └── (tabs)/
│       ├── _layout.tsx        # NativeTabs layout with liquid glass
│       ├── sessions/
│       │   ├── _layout.tsx    # Stack navigator for sessions
│       │   ├── index.tsx      # Sessions list
│       │   └── [id].tsx       # Chat screen (dynamic route)
│       └── settings.tsx       # Settings screen
├── src/
│   ├── hooks/                 # Keep as-is
│   ├── components/            # Keep as-is
│   └── theme/                 # Keep as-is
```

## Step-by-Step Implementation

### Step 1: Install Dependencies

```bash
npx expo install expo-router
```

### Step 2: Update package.json

Change the entry point:

```json
{
  "main": "expo-router/entry"
}
```

### Step 3: Update app.json

Add required configuration:

```json
{
  "expo": {
    "scheme": "openpad",
    "web": {
      "bundler": "metro"
    },
    "plugins": [
      "expo-router"
    ]
  }
}
```

### Step 4: Create App Directory Structure

#### `app/_layout.tsx` - Root Layout

```tsx
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useOpenCode } from '../src/hooks/useOpenCode';

export default function RootLayout() {
  const { connected } = useOpenCode();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(tabs)';
    
    if (!connected && inAuthGroup) {
      // Redirect to connect if not authenticated
      router.replace('/connect');
    } else if (connected && !inAuthGroup) {
      // Redirect to tabs if authenticated
      router.replace('/(tabs)/sessions');
    }
  }, [connected, segments]);

  return <Slot />;
}
```

#### `app/index.tsx` - Initial Route

```tsx
import { Redirect } from 'expo-router';
import { useOpenCode } from '../src/hooks/useOpenCode';

export default function Index() {
  const { connected } = useOpenCode();
  
  if (connected) {
    return <Redirect href="/(tabs)/sessions" />;
  }
  return <Redirect href="/connect" />;
}
```

#### `app/connect.tsx` - Connect Screen

```tsx
import { ConnectScreen } from '../src/screens/ConnectScreen';
import { useOpenCode } from '../src/hooks/useOpenCode';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

export default function Connect() {
  const router = useRouter();
  const { serverUrl, setServerUrl, connect, connecting, error } = useOpenCode();

  const handleConnect = useCallback(async () => {
    const success = await connect(serverUrl);
    if (success) {
      router.replace('/(tabs)/sessions');
    }
  }, [connect, serverUrl, router]);

  return (
    <ConnectScreen
      serverUrl={serverUrl}
      onServerUrlChange={setServerUrl}
      onConnect={handleConnect}
      connecting={connecting}
      error={error}
    />
  );
}
```

#### `app/(tabs)/_layout.tsx` - Native Tabs with Liquid Glass

```tsx
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { Platform, DynamicColorIOS } from 'react-native';

export default function TabLayout() {
  return (
    <NativeTabs
      // iOS 26 features
      minimizeBehavior="onScrollDown"
      disableTransparentOnScrollEdge  // For FlatList compatibility
      
      // Styling for liquid glass color adaptation
      labelStyle={Platform.OS === 'ios' ? {
        color: DynamicColorIOS({
          dark: 'white',
          light: 'black',
        }),
      } : undefined}
      tintColor={Platform.OS === 'ios' ? DynamicColorIOS({
        dark: '#22d3ee',  // Our accent color
        light: '#0891b2',
      }) : '#0891b2'}
    >
      <NativeTabs.Trigger name="sessions">
        <Icon 
          sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }}
          drawable="ic_chat"  // Android fallback
        />
        <Label>Sessions</Label>
      </NativeTabs.Trigger>
      
      <NativeTabs.Trigger name="settings">
        <Icon 
          sf={{ default: 'gear', selected: 'gear' }}
          drawable="ic_settings"  // Android fallback
        />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

#### `app/(tabs)/sessions/_layout.tsx` - Sessions Stack

```tsx
import { Stack } from 'expo-router';
import { useTheme } from '../../../src/hooks/useTheme';

export default function SessionsLayout() {
  const { colors } = useTheme();
  
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Sessions',
          headerLargeTitle: true,
        }} 
      />
      <Stack.Screen 
        name="[id]" 
        options={{ 
          title: 'Chat',
          headerBackTitle: 'Back',
        }} 
      />
    </Stack>
  );
}
```

#### `app/(tabs)/sessions/index.tsx` - Sessions List

```tsx
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SessionsScreen } from '../../../src/screens/SessionsScreen';
import { useOpenCode } from '../../../src/hooks/useOpenCode';

export default function Sessions() {
  const router = useRouter();
  const { getSessions } = useOpenCode();

  const handleSelectSession = useCallback((session) => {
    router.push(`/sessions/${session.id}`);
  }, [router]);

  return (
    <SessionsScreen
      getSessions={getSessions}
      onSelectSession={handleSelectSession}
    />
  );
}
```

#### `app/(tabs)/sessions/[id].tsx` - Chat Screen

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ChatScreen } from '../../../src/screens/ChatScreen';
import { useOpenCode } from '../../../src/hooks/useOpenCode';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getSessions, getSessionMessages } = useOpenCode();
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Load session info
    getSessions().then(sessions => {
      const found = sessions.find(s => s.id === id);
      setSession(found);
    });
  }, [id, getSessions]);

  if (!session) {
    return null; // Loading state
  }

  return (
    <ChatScreen
      session={session}
      getSessionMessages={getSessionMessages}
      onBack={() => router.back()}
    />
  );
}
```

#### `app/(tabs)/settings.tsx` - Settings Screen

```tsx
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SettingsScreen } from '../../src/screens/SettingsScreen';
import { useOpenCode } from '../../src/hooks/useOpenCode';

export default function Settings() {
  const router = useRouter();
  const { serverUrl, disconnect } = useOpenCode();

  const handleDisconnect = useCallback(() => {
    disconnect();
    router.replace('/connect');
  }, [disconnect, router]);

  return (
    <SettingsScreen
      serverUrl={serverUrl}
      onDisconnect={handleDisconnect}
    />
  );
}
```

### Step 5: Update useOpenCode Hook

The hook needs to be wrapped in a context provider at the root level:

```tsx
// src/hooks/useOpenCode.tsx - Update to use context

import React, { createContext, useContext, useState, useCallback } from 'react';
// ... existing code ...

const OpenCodeContext = createContext(null);

export function OpenCodeProvider({ children }) {
  // Move all state and logic here
  const [connected, setConnected] = useState(false);
  // ... rest of hook logic ...
  
  return (
    <OpenCodeContext.Provider value={{
      connected,
      connecting,
      error,
      serverUrl,
      connect,
      disconnect,
      setServerUrl,
      getSessions,
      getProjects,
      getSessionMessages,
    }}>
      {children}
    </OpenCodeContext.Provider>
  );
}

export function useOpenCode() {
  const context = useContext(OpenCodeContext);
  if (!context) {
    throw new Error('useOpenCode must be used within OpenCodeProvider');
  }
  return context;
}
```

Then wrap the app in `app/_layout.tsx`:

```tsx
import { OpenCodeProvider } from '../src/hooks/useOpenCode';

export default function RootLayout() {
  return (
    <OpenCodeProvider>
      {/* ... rest of layout */}
    </OpenCodeProvider>
  );
}
```

### Step 6: Update Screen Components

Remove SafeAreaView from screens (Expo Router handles this):

- `SessionsScreen.tsx` - Remove SafeAreaView, use View
- `SettingsScreen.tsx` - Remove SafeAreaView, use View
- `ChatScreen.tsx` - Keep as-is for now (has custom header)

### Step 7: Delete Old Files

After migration is complete and tested:

- Delete `App.tsx` (replaced by `app/_layout.tsx`)
- Delete `index.ts` (replaced by expo-router/entry)
- Delete `src/screens/ProjectsScreen.tsx` (not used)

## iOS 26 Specific Features

### Tab Bar Minimize on Scroll

The `minimizeBehavior="onScrollDown"` prop automatically minimizes the tab bar when scrolling down in a ScrollView/FlatList.

### Search Tab (Optional)

To add a dedicated search tab that appears separately:

```tsx
<NativeTabs.Trigger name="search" role="search">
  <Icon sf="magnifyingglass" />
  <Label>Search</Label>
</NativeTabs.Trigger>
```

### Badges

```tsx
<NativeTabs.Trigger name="sessions">
  <Badge>3</Badge>  {/* Shows notification count */}
  <Icon sf="bubble.left.fill" />
  <Label>Sessions</Label>
</NativeTabs.Trigger>
```

## Known Limitations

1. **FlatList scroll-to-top** doesn't work perfectly with native tabs
2. **Maximum 5 tabs** on Android
3. **Cannot nest native tabs** inside other native tabs
4. **Tab bar height** cannot be measured directly (moves around on iPad/Vision Pro)

## Fallback Behavior

On iOS < 26 and Android:
- Native tabs still render but without liquid glass effect
- Uses standard platform tab bar appearance
- All functionality works the same

## Testing Checklist

- [ ] Connect screen works and redirects properly
- [ ] Sessions list loads and displays
- [ ] Tapping session navigates to chat
- [ ] Back button works in chat
- [ ] Settings screen shows server info
- [ ] Disconnect works and redirects to connect
- [ ] Tab bar switches between sessions and settings
- [ ] Pull-to-refresh works on sessions list
- [ ] Deep linking works (openpad://sessions/123)
- [ ] iOS 26: Liquid glass effect visible
- [ ] iOS 26: Tab bar minimizes on scroll
- [ ] Android: Tabs work with material design

## Resources

- [Expo Router Native Tabs Docs](https://docs.expo.dev/router/advanced/native-tabs/)
- [Expo SDK 54 Blog Post](https://expo.dev/blog/expo-router-v6)
- [Liquid Glass Blog](https://expo.dev/blog/liquid-glass-app-with-expo-ui-and-swiftui)
- [YouTube Tutorial](https://www.youtube.com/watch?v=QqNZXdGFl44)
