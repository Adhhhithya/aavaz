import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Shield, Sparkles, User } from 'lucide-react-native';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  interpolateColor,
  useDerivedValue
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { DS } from '../theme/designSystem';
import ScalePressable from './ScalePressable';

const { width } = Dimensions.get('window');

const TABS = [
  { id: 'Home', label: 'Home', icon: Home },
  { id: 'Cases', label: 'Cases', icon: Shield, badgeCount: 1 },
  { id: 'Assistant', label: 'Assistant', icon: Sparkles },
  { id: 'Profile', label: 'Profile', icon: User },
];

export default function FloatingTabBar({ activeTab, onTabPress }) {
  const insets = useSafeAreaInsets();
  
  // Calculate tab width dynamically
  const containerPadding = 20;
  const ribbonPadding = 8;
  const ribbonWidth = width - (containerPadding * 2);
  const tabWidth = (ribbonWidth - (ribbonPadding * 2)) / TABS.length;

  // Find active index for sliding pill
  const activeIndex = Math.max(0, TABS.findIndex(t => t.id === activeTab));

  // Sliding pill animated style
  const pillStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { 
          translateX: withSpring(activeIndex * tabWidth, {
            stiffness: 300,
            damping: 25,
            mass: 0.5,
          }) 
        }
      ]
    };
  });

  return (
    <View style={[styles.outerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.ribbonBar}>
        
        {/* Animated Background Pill */}
        <Animated.View style={[styles.slidingPill, { width: tabWidth }, pillStyle]} />

        {TABS.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const IconComponent = tab.icon;

          return (
            <ScalePressable
              key={tab.id}
              style={[styles.tabItem, { width: tabWidth }]}
              scaleTo={0.85}
              onPress={() => {
                if (!isActive) {
                  Haptics.selectionAsync();
                  onTabPress(tab.id);
                }
              }}
            >
              <View style={styles.iconWrapper}>
                <IconComponent
                  size={20}
                  color={isActive ? DS.primary.main : DS.text.muted}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {tab.badgeCount && tab.badgeCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.badgeCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  ribbonBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    height: 64,
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    // Add glass blur if supported via react-native-blur (omitted for standard View)
  },
  slidingPill: {
    position: 'absolute',
    left: 8, // match paddingHorizontal of ribbonBar
    height: 48,
    backgroundColor: DS.primary.muted,
    borderRadius: 24,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    zIndex: 1, // ensure text/icon renders above pill
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: DS.accent.sos,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: DS.text.muted,
    marginTop: 2,
  },
  tabLabelActive: {
    color: DS.primary.main,
    fontFamily: 'Inter-Bold',
  },
});
