import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Shield, Sparkles, User } from 'lucide-react-native';
import { DS } from '../theme/designSystem';

const TABS = [
  { id: 'Home', label: 'Home', icon: Home },
  { id: 'Cases', label: 'Cases', icon: Shield, badgeCount: 1 },
  { id: 'Assistant', label: 'Assistant', icon: Sparkles },
  { id: 'Profile', label: 'Profile', icon: User },
];

export default function FloatingTabBar({ activeTab, onTabPress }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.outerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.ribbonBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const IconComponent = tab.icon;

          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => onTabPress(tab.id)}
              activeOpacity={0.7}
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
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
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
    backgroundColor: 'rgba(255, 255, 255, 0.94)', // Frosted cloud white base
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: DS.canvas.border, // Soft Periwinkle #EBE8F6
    height: 64,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 24,
  },
  tabItemActive: {
    backgroundColor: DS.primary.muted, // Soft lavender tint
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: DS.accent.sos,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: DS.text.muted,
    marginTop: 3,
  },
  tabLabelActive: {
    color: DS.primary.main, // Lavender #8A79B8
    fontWeight: '700',
  },
});
