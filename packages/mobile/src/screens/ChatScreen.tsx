import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Image,
  Dimensions,
  TextInput,
  Platform,
  ActivityIndicator,
  Keyboard,
  Animated,
} from 'react-native';
import type { KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '../hooks/useTheme';
import { Markdown } from '../components/Markdown';
import { Icon, IconName } from '../components/Icon';
import { spacing, typography } from '../theme';
import type { Session, MessageWithParts, MessagePart } from '../providers/OpenCodeProvider';

interface ChatScreenProps {
  session: Session;
  messages: MessageWithParts[];
  loading: boolean;
  serverUrl: string;
  onBack: () => void;
  onSendMessage: (text: string) => Promise<boolean>;
  onBranch: () => void;
  isSending: boolean;
}

// Get icon for tool type
function getToolIcon(toolName: string): IconName {
  const iconMap: Record<string, IconName> = {
    'read': 'file-text',
    'write': 'file-plus',
    'edit': 'pencil',
    'bash': 'terminal',
    'glob': 'folder-search',
    'grep': 'search',
    'list': 'folder-open',
    'todowrite': 'list-todo',
    'todoread': 'list-todo',
    'task': 'play',
    'webfetch': 'globe',
    'websearch': 'globe',
    'codesearch': 'search',
  };
  return iconMap[toolName] || 'zap';
}

// Extract meaningful info from tool input/output
interface ToolDetails {
  label: string;
  detail?: string;
  expandedContent?: {
    input?: string;
    output?: string;
    filePath?: string;
    command?: string;
    todos?: any[];
  };
}

function getToolDetails(toolName: string, state: any): ToolDetails | null {
  const input = state?.input;
  const output = state?.output;
  
  // Clean output - remove line numbers if present
  const cleanOutput = (text: string | undefined) => {
    if (!text) return undefined;
    // Remove <file> tags and line number prefixes like "00001| "
    return text
      .replace(/<\/?file>/g, '')
      .replace(/^\d{5}\| /gm, '')
      .trim()
      .substring(0, 800);
  };
  
  switch (toolName) {
    case 'read': {
      const filePath = input?.filePath;
      const fileName = filePath?.split('/').pop() || filePath;
      return { 
        label: 'Read file', 
        detail: fileName,
        expandedContent: {
          filePath,
          output: cleanOutput(output),
        }
      };
    }
    case 'write': {
      const filePath = input?.filePath;
      const fileName = filePath?.split('/').pop() || filePath;
      return { 
        label: 'Wrote file', 
        detail: fileName,
        expandedContent: { filePath }
      };
    }
    case 'edit': {
      const filePath = input?.filePath;
      const fileName = filePath?.split('/').pop() || filePath;
      return { 
        label: 'Edited', 
        detail: fileName,
        expandedContent: { filePath }
      };
    }
    case 'bash': {
      const command = input?.command;
      const description = input?.description;
      return { 
        label: 'Ran', 
        detail: description || (command?.length > 40 ? command.substring(0, 37) + '...' : command),
        expandedContent: {
          command,
          output: cleanOutput(output),
        }
      };
    }
    case 'glob': {
      const pattern = input?.pattern;
      return { 
        label: 'Found files', 
        detail: pattern,
        expandedContent: { output: cleanOutput(output) }
      };
    }
    case 'grep': {
      const pattern = input?.pattern;
      return { 
        label: 'Searched', 
        detail: pattern,
        expandedContent: { output: cleanOutput(output) }
      };
    }
    case 'list': {
      const path = input?.path;
      const dirName = path?.split('/').pop() || path;
      return { 
        label: 'Listed', 
        detail: dirName || 'directory',
        expandedContent: { output: cleanOutput(output) }
      };
    }
    case 'todowrite': {
      const todos = input?.todos;
      const count = Array.isArray(todos) ? todos.length : 0;
      return { 
        label: 'Updated todos', 
        detail: `${count} item${count !== 1 ? 's' : ''}`,
        expandedContent: { todos }
      };
    }
    case 'todoread': {
      return { 
        label: 'Read todos',
        expandedContent: { output: cleanOutput(output) }
      };
    }
    case 'task': {
      const description = input?.description;
      return { 
        label: 'Task', 
        detail: description,
        expandedContent: { output: cleanOutput(output) }
      };
    }
    case 'webfetch': {
      const url = input?.url;
      let hostname = 'URL';
      try {
        hostname = new URL(url).hostname;
      } catch {}
      return { 
        label: 'Fetched', 
        detail: hostname,
        expandedContent: { output: cleanOutput(output) }
      };
    }
    case 'websearch':
    case 'codesearch': {
      const query = input?.query;
      const shortQuery = query?.length > 35 ? query.substring(0, 32) + '...' : query;
      return { 
        label: 'Searched', 
        detail: shortQuery,
        expandedContent: { output: cleanOutput(output) }
      };
    }
    default:
      return { 
        label: toolName,
        expandedContent: { output: cleanOutput(output) }
      };
  }
}

function ToolBlock({ part, colors }: { part: any; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const stateObj = part.state;
  const status = typeof stateObj === 'object' ? stateObj?.status : stateObj;
  const isComplete = status === 'completed' || status === 'complete' || status === 'result';
  const toolName = part.tool || part.toolName || 'tool';
  
  const icon = getToolIcon(toolName);
  const details = getToolDetails(toolName, stateObj);
  const hasExpandedContent = details?.expandedContent && (
    details.expandedContent.output || 
    details.expandedContent.command || 
    details.expandedContent.filePath ||
    details.expandedContent.todos
  );
  
  const accentColor = isComplete ? colors.success : colors.warning;
  
  return (
    <View style={[styles.toolBlock, { borderLeftColor: accentColor, backgroundColor: colors.bgCard }]}>
      <TouchableOpacity 
        style={styles.toolRow} 
        onPress={() => hasExpandedContent && setExpanded(!expanded)}
        activeOpacity={hasExpandedContent ? 0.7 : 1}
      >
        <Icon name={icon} size={16} color={colors.textSecondary} />
        <Text style={[styles.toolLabel, { color: colors.textSecondary }]}>
          {details?.label || toolName}
        </Text>
        {details?.detail && (
          <Text style={[styles.toolDetail, { color: colors.text }]} numberOfLines={1}>
            {details.detail}
          </Text>
        )}
        <View style={styles.toolRight}>
          <Icon 
            name="check" 
            size={14} 
            color={accentColor} 
          />
          {hasExpandedContent && (
            <Icon 
              name={expanded ? 'chevron-up' : 'chevron-down'} 
              size={16} 
              color={colors.textMuted} 
            />
          )}
        </View>
      </TouchableOpacity>
      
      {expanded && details?.expandedContent && (
        <View style={styles.toolExpanded}>
          {details.expandedContent.filePath && (
            <View style={styles.expandedSection}>
              <Text style={[styles.expandedLabel, { color: colors.textMuted }]}>PATH</Text>
              <Text style={[styles.expandedPath, { color: colors.textSecondary }]} numberOfLines={2}>
                {details.expandedContent.filePath}
              </Text>
            </View>
          )}
          {details.expandedContent.command && (
            <View style={styles.expandedSection}>
              <Text style={[styles.expandedLabel, { color: colors.textMuted }]}>COMMAND</Text>
              <View style={[styles.codeBlock, { backgroundColor: colors.bg }]}>
                <Text style={[styles.codeText, { color: colors.accent }]}>
                  {details.expandedContent.command}
                </Text>
              </View>
            </View>
          )}
          {details.expandedContent.todos && (
            <View style={styles.expandedSection}>
              <Text style={[styles.expandedLabel, { color: colors.textMuted }]}>ITEMS</Text>
              <View style={styles.todoList}>
                {details.expandedContent.todos.slice(0, 6).map((todo: any, i: number) => (
                  <View key={i} style={styles.todoItem}>
                    <Icon 
                      name={todo.status === 'completed' ? 'check' : 'circle'} 
                      size={14} 
                      color={todo.status === 'completed' ? colors.success : colors.textMuted} 
                    />
                    <Text style={[styles.todoText, { color: colors.text }]} numberOfLines={1}>
                      {todo.content}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {details.expandedContent.output && !details.expandedContent.todos && (
            <View style={styles.expandedSection}>
              <Text style={[styles.expandedLabel, { color: colors.textMuted }]}>OUTPUT</Text>
              <Text style={[styles.outputText, { color: colors.textSecondary }]}>
                {details.expandedContent.output}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// Check if a mime type is an image
function isImageMime(mime?: string): boolean {
  if (!mime) return false;
  return mime.startsWith('image/');
}

// Construct full URL for images
function getFullImageUrl(url: string, serverUrl: string): string {
  if (!url) return '';
  // If it's already an absolute URL, return as-is
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  // Otherwise, prepend the server URL
  const baseUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${baseUrl}${path}`;
}

// Image block component
function ImageBlock({ part, colors, serverUrl }: { part: MessagePart; colors: any; serverUrl: string }) {
  const [imageError, setImageError] = useState(false);
  const screenWidth = Dimensions.get('window').width;
  const maxImageWidth = screenWidth - spacing.lg * 2;
  const maxImageHeight = 300;

  const imageUrl = part.url ? getFullImageUrl(part.url, serverUrl) : '';

  if (!imageUrl || imageError) {
    return (
      <View style={[styles.imagePlaceholder, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Icon name="file" size={24} color={colors.textMuted} />
        <Text style={[styles.imagePlaceholderText, { color: colors.textMuted }]}>
          Image
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={[styles.messageImage, { maxWidth: maxImageWidth, maxHeight: maxImageHeight }]}
      resizeMode="contain"
      onError={() => setImageError(true)}
    />
  );
}

// Helper to check if a message has displayable content
function hasDisplayableContent(message: MessageWithParts): boolean {
  const textContent = message.parts
    .filter(p => p.type === 'text' && (p as any).text?.trim())
    .map(p => (p as any).text)
    .join('');
  
  const toolParts = message.parts.filter(
    p => p.type === 'tool' || p.type === 'tool-invocation' || p.type === 'tool-result'
  );

  const imageParts = message.parts.filter(
    p => p.type === 'file' && isImageMime(p.mime)
  );
  
  return textContent.length > 0 || toolParts.length > 0 || imageParts.length > 0;
}

const MessageBlock = React.memo(function MessageBlock({ message, colors, serverUrl }: { 
  message: MessageWithParts; 
  colors: any;
  serverUrl: string;
}) {
  const isUser = message.info.role === 'user';
  
  // Combine all text parts
  const textContent = message.parts
    .filter(p => p.type === 'text' && (p as any).text?.trim())
    .map(p => (p as any).text)
    .join('\n\n');
  
  // Get tool parts
  const toolParts = message.parts.filter(
    p => p.type === 'tool' || p.type === 'tool-invocation' || p.type === 'tool-result'
  );

  // Get image parts
  const imageParts = message.parts.filter(
    p => p.type === 'file' && isImageMime(p.mime)
  );

  // Don't render if no displayable content
  if (!textContent && toolParts.length === 0 && imageParts.length === 0) {
    return null;
  }

  const hasText = textContent.length > 0;
  const hasTools = toolParts.length > 0;
  const hasImages = imageParts.length > 0;

  // User messages - with accent sidebar and tinted background
  if (isUser) {
    return (
      <View style={[styles.userMessageBlock, { backgroundColor: colors.userMessageBg }]}>
        <View style={[styles.userMessageAccent, { backgroundColor: colors.accent }]} />
        <View style={styles.userMessageContent}>
          {hasImages && (
            <View style={styles.imagesContainer}>
              {imageParts.map((part, index) => (
                <ImageBlock key={index} part={part} colors={colors} serverUrl={serverUrl} />
              ))}
            </View>
          )}
          {hasText && <Markdown isUser={true}>{textContent}</Markdown>}
        </View>
      </View>
    );
  }

  // Assistant message with text - full width, no border radius
  if (hasText || hasImages) {
    return (
      <View style={styles.messageContainer}>
        <View style={[styles.assistantMessageBlock, { backgroundColor: colors.assistantMessage }]}>
          {hasImages && (
            <View style={styles.imagesContainer}>
              {imageParts.map((part, index) => (
                <ImageBlock key={index} part={part} colors={colors} serverUrl={serverUrl} />
              ))}
            </View>
          )}
          {hasText && <Markdown isUser={false}>{textContent}</Markdown>}
        </View>
        {hasTools && (
          <View style={styles.toolsContainer}>
            {toolParts.map((part, index) => (
              <ToolBlock key={index} part={part} colors={colors} />
            ))}
          </View>
        )}
      </View>
    );
  }

  // Tool-only message
  return (
    <View style={styles.toolsContainer}>
      {toolParts.map((part, index) => (
        <ToolBlock key={index} part={part} colors={colors} />
      ))}
    </View>
  );
});

export function ChatScreen({
  session,
  messages,
  loading,
  serverUrl,
  onBack,
  onSendMessage,
  onBranch,
  isSending,
}: ChatScreenProps) {
  const { theme, colors: c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  
  // Animated value for keyboard height - smooth transitions
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Track keyboard height for input positioning with smooth animation
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event: KeyboardEvent) => {
        setKeyboardVisible(true);
        Animated.timing(keyboardHeightAnim, {
          toValue: event.endCoordinates.height,
          duration: event.duration || 250,
          useNativeDriver: false, // Can't use native driver for layout properties
        }).start();
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (event: KeyboardEvent) => {
        setKeyboardVisible(false);
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: event.duration || 250,
          useNativeDriver: false,
        }).start();
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardHeightAnim]);

  // Just safe area padding - no tabs on chat screen
  const topPadding = insets.top + spacing.sm;

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isSending) return;
    
    const text = inputText.trim();
    setInputText('');
    
    const success = await onSendMessage(text);
    if (!success) {
      // Restore the text if sending failed
      setInputText(text);
    }
  }, [inputText, isSending, onSendMessage]);

  // Reverse messages for inverted list (newest at bottom visually, but first in array)
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Show/hide scroll button based on scroll position
  // For inverted list, "top" in scroll terms is actually the bottom of the chat
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    // In inverted list, scrolling "up" (positive offset) means going to older messages
    const shouldShow = contentOffset.y > 200;
    
    if (shouldShow !== showScrollButton) {
      setShowScrollButton(shouldShow);
    }
  }, [showScrollButton]);

  // For inverted list, scroll to "top" (offset 0) is actually the bottom of chat
  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // Height of floating header for content padding
  const headerHeight = topPadding + 50;
  
  // Base height of input area (without keyboard)
  const baseInputHeight = 44 + spacing.sm + spacing.md;
  
  // For FlatList padding - use state-based value (updates less smoothly but ok for content)
  const inputAreaHeight = baseInputHeight + (keyboardVisible ? 300 : insets.bottom); // Approximate for content padding
  
  // Animated bottom offset for input container - smooth keyboard animation
  const inputBottomOffset = keyboardHeightAnim;
  
  // Animated padding bottom for input container
  const inputPaddingBottom = keyboardHeightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [insets.bottom + spacing.sm, spacing.sm],
    extrapolate: 'clamp',
  });
  
  // For scroll button positioning - use animated value (with more spacing above input)
  const scrollButtonBottom = Animated.add(
    keyboardHeightAnim,
    baseInputHeight + spacing.xl
  );

  return (
    <View style={theme.container}>
      <View style={styles.keyboardAvoidingView}>
        <FlatList
          ref={flatListRef}
          data={invertedMessages}
          inverted
          keyExtractor={(item, index) => item.info.id || String(index)}
          renderItem={({ item }) => (
            <MessageBlock message={item} colors={c} serverUrl={serverUrl} />
          )}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: headerHeight, paddingBottom: inputAreaHeight },
            invertedMessages.length === 0 && styles.emptyList
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="message-square" size={48} color={c.textMuted} />
              <Text style={[theme.subtitle, { marginTop: spacing.lg, color: c.text }]}>
                {loading ? 'Loading...' : 'No Messages'}
              </Text>
              <Text style={[theme.body, theme.textSecondary, styles.emptyText]}>
                {loading 
                  ? 'Fetching messages' 
                  : 'This session has no messages yet'}
              </Text>
            </View>
          }
        />

        {/* Top gradient fade - messages fade out under header */}
        <LinearGradient
          colors={[c.bg, 'transparent']}
          locations={[0.5, 1]}
          style={[styles.topGradient, { height: headerHeight }]}
          pointerEvents="none"
        />

        {/* Floating Liquid Glass Header - overlays content */}
        <View style={[styles.floatingHeader, { paddingTop: topPadding }]}>
          <TouchableOpacity 
            onPress={onBack} 
            activeOpacity={0.8}
          >
            <GlassView style={styles.glassBackButton}>
              <Icon name="chevron-left" size={20} color={c.text} />
              <Text style={[styles.backText, { color: c.text }]}>Back</Text>
            </GlassView>
          </TouchableOpacity>
          
          <GlassView style={styles.glassTitlePill}>
            <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
              {session.title || 'Chat'}
            </Text>
          </GlassView>
          
          <TouchableOpacity 
            onPress={onBranch}
            activeOpacity={0.8}
            style={styles.headerRight}
          >
            <GlassView style={styles.glassBranchButton}>
              <Icon name="code" size={18} color={c.accent} />
              <Text style={[styles.branchText, { color: c.accent }]}>Branch</Text>
            </GlassView>
          </TouchableOpacity>
        </View>

        {/* Scroll to bottom button - Liquid Glass */}
        {showScrollButton && (
          <Animated.View style={[styles.scrollButtonContainer, { bottom: scrollButtonBottom }]}>
            <TouchableOpacity
              onPress={scrollToBottom}
              activeOpacity={0.8}
            >
              <GlassView style={styles.glassScrollButton}>
                <Icon name="chevrons-down" size={24} color={c.text} />
                <Text style={[styles.scrollButtonText, { color: c.text }]}>Latest</Text>
              </GlassView>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* iOS 26 Liquid Glass Message Input - Floating overlay */}
        <Animated.View style={[
          styles.inputContainer, 
          { 
            bottom: inputBottomOffset,
            paddingBottom: keyboardVisible ? spacing.sm : insets.bottom + spacing.sm 
          }
        ]}>
          <GlassView style={styles.glassInputBar}>
            <TextInput
              ref={inputRef}
              style={[styles.glassTextInput, { color: c.text }]}
              placeholder="Message..."
              placeholderTextColor={c.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={10000}
              editable={!isSending}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || isSending}
              activeOpacity={0.7}
              style={[
                styles.glassSendButton,
                { backgroundColor: inputText.trim() && !isSending ? c.accent : 'transparent' }
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={c.text} />
              ) : (
                <Icon 
                  name="arrow-up" 
                  size={20} 
                  color={inputText.trim() ? '#fff' : c.textMuted} 
                />
              )}
            </TouchableOpacity>
          </GlassView>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  // Top gradient fade for smooth transition under header
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
  },
  // Floating header that overlays content
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  glassBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 22,
    gap: 4,
  },
  glassTitlePill: {
    flex: 1,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 22,
    alignItems: 'center',
  },
  backText: {
    ...typography.body,
    fontWeight: '500',
  },
  headerTitle: {
    ...typography.bodyMedium,
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  glassBranchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 22,
    gap: 4,
  },
  branchText: {
    ...typography.small,
    fontWeight: '600',
  },
  glassScrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 22,
    gap: spacing.xs,
  },
  scrollButtonText: {
    ...typography.small,
    fontWeight: '600',
  },
  listContent: {
    // paddingTop and paddingBottom set dynamically
  },
  emptyList: {
    flex: 1,
  },
  
  // Message containers
  messageContainer: {},
  
  // User message - with accent sidebar
  userMessageBlock: {
    flexDirection: 'row',
  },
  userMessageAccent: {
    width: 3,
  },
  userMessageContent: {
    flex: 1,
    padding: spacing.lg,
  },
  
  // Assistant message - edge to edge
  assistantMessageBlock: {
    padding: spacing.lg,
  },

  // Images
  imagesContainer: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  imagePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  imagePlaceholderText: {
    ...typography.small,
  },
  
  // Tools container
  toolsContainer: {},
  
  // Tool block - edge to edge
  toolBlock: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
  },
  toolLabel: {
    ...typography.small,
  },
  toolDetail: {
    ...typography.smallMedium,
    flex: 1,
  },
  toolRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  
  // Expanded content
  toolExpanded: {
    marginTop: spacing.sm,
    marginLeft: spacing.xl,
    gap: spacing.md,
  },
  expandedSection: {
    gap: spacing.xs,
  },
  expandedLabel: {
    ...typography.caption,
    letterSpacing: 0.5,
  },
  expandedPath: {
    ...typography.small,
  },
  codeBlock: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  codeText: {
    ...typography.mono,
    fontSize: 13,
  },
  outputText: {
    ...typography.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  
  // Todos
  todoList: {
    gap: spacing.xs,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  todoText: {
    ...typography.small,
    flex: 1,
  },
  
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 100,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  
  // Scroll to bottom button
  scrollButtonContainer: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 101,
  },
  
  // iOS 26 Liquid Glass Input Area - Floating overlay
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    zIndex: 100,
  },
  glassInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: 22,
    minHeight: 44,
    gap: spacing.sm,
  },
  glassTextInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    maxHeight: 120,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  glassSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
