import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import MarkdownDisplay from 'react-native-markdown-display';
import { useTheme } from '../hooks/useTheme';
import { typography, spacing, radius } from '../theme';

interface MarkdownProps {
  children: string;
  isUser?: boolean;
}

export function Markdown({ children, isUser = false }: MarkdownProps) {
  const { colors: c, isDark } = useTheme();

  const textColor = isUser ? '#ffffff' : c.text;
  const secondaryColor = isUser ? 'rgba(255,255,255,0.7)' : c.textSecondary;
  const codeBackground = isUser 
    ? 'rgba(0,0,0,0.2)' 
    : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)');
  const blockquoteBorder = isUser ? 'rgba(255,255,255,0.4)' : c.accent;

  const markdownStyles = StyleSheet.create({
    body: {
      color: textColor,
      ...typography.body,
    },
    heading1: {
      color: textColor,
      fontSize: 24,
      fontWeight: '600',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      lineHeight: 30,
    },
    heading2: {
      color: textColor,
      fontSize: 20,
      fontWeight: '600',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      lineHeight: 26,
    },
    heading3: {
      color: textColor,
      fontSize: 18,
      fontWeight: '600',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      lineHeight: 24,
    },
    heading4: {
      color: textColor,
      fontSize: 16,
      fontWeight: '600',
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: spacing.sm,
    },
    strong: {
      fontWeight: '600',
    },
    em: {
      fontStyle: 'italic',
    },
    link: {
      color: isUser ? '#ffffff' : c.accent,
      textDecorationLine: 'underline',
    },
    blockquote: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.1)' : c.accentSubtle,
      borderLeftColor: blockquoteBorder,
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginVertical: spacing.sm,
    },
    code_inline: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      fontSize: 14,
      backgroundColor: codeBackground,
      color: isUser ? '#ffffff' : c.accent,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    code_block: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      fontSize: 13,
      backgroundColor: codeBackground,
      color: textColor,
      padding: spacing.md,
      borderRadius: radius.md,
      marginVertical: spacing.sm,
      overflow: 'hidden',
      lineHeight: 20,
    },
    fence: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      fontSize: 13,
      backgroundColor: codeBackground,
      color: textColor,
      padding: spacing.md,
      borderRadius: radius.md,
      marginVertical: spacing.sm,
      overflow: 'hidden',
      lineHeight: 20,
    },
    list_item: {
      marginVertical: 3,
    },
    bullet_list: {
      marginVertical: spacing.sm,
    },
    ordered_list: {
      marginVertical: spacing.sm,
    },
    bullet_list_icon: {
      color: secondaryColor,
      marginRight: spacing.sm,
      fontSize: 14,
    },
    ordered_list_icon: {
      color: secondaryColor,
      marginRight: spacing.sm,
      fontSize: 14,
    },
    table: {
      borderWidth: 1,
      borderColor: isUser ? 'rgba(255,255,255,0.2)' : c.border,
      borderRadius: radius.md,
      marginVertical: spacing.sm,
      overflow: 'hidden',
    },
    thead: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.1)' : c.bgHover,
    },
    th: {
      padding: spacing.sm,
      fontWeight: '600',
    },
    td: {
      padding: spacing.sm,
      borderTopWidth: 1,
      borderColor: isUser ? 'rgba(255,255,255,0.1)' : c.divider,
    },
    hr: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : c.divider,
      height: 1,
      marginVertical: spacing.lg,
    },
  });

  return (
    <MarkdownDisplay style={markdownStyles}>
      {children}
    </MarkdownDisplay>
  );
}
