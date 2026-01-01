import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';

// Try to import GlassView, fallback to blur if not available
let GlassView: any = null;
let isLiquidGlassAvailable: (() => boolean) | null = null;

try {
  const glassEffect = require('expo-glass-effect');
  GlassView = glassEffect.GlassView;
  isLiquidGlassAvailable = glassEffect.isLiquidGlassAvailable;
} catch {
  // expo-glass-effect not available or iOS < 26
}

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
}

export function GlassCard({ children, style, intensity = 60 }: GlassCardProps) {
  const { colors: c, isDark } = useTheme();
  
  // Check if liquid glass is available (iOS 26+)
  const canUseLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable?.();
  
  if (canUseLiquidGlass && GlassView) {
    return (
      <GlassView 
        style={[styles.container, { borderColor: c.border }, style]}
        glassEffectStyle="regular"
      >
        {children}
      </GlassView>
    );
  }
  
  // Fallback to BlurView for older iOS / Android
  return (
    <View style={[styles.container, { borderColor: c.border }, style]}>
      <BlurView
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    padding: spacing.lg,
  },
});
