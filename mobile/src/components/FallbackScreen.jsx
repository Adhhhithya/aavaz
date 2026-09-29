import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ChevronLeft, 
  SearchX, 
  WifiOff, 
  ServerCrash, 
  Wrench,
  AlertTriangle,
  RefreshCw,
  Home,
  ShieldAlert,
  MicOff,
  FolderOpen
} from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import ScalePressable from './ScalePressable';

const { width } = Dimensions.get('window');

const FALLBACK_CONFIG = {
  '404': {
    title: 'Not Found',
    subtitle: "Whoops! We can't find this page :(",
    badgeIcon: AlertTriangle,
    badgeText: 'Status Code: 404',
    icon: SearchX,
    iconColor: DS.primary.main,
    blobColor: DS.primary.muted,
    actionText: 'Take Me Home',
    actionIcon: Home,
  },
  'network': {
    title: 'No Internet!',
    subtitle: "It seems you don't have active internet.",
    badgeIcon: RefreshCw,
    badgeText: 'Refresh or Try Again',
    icon: WifiOff,
    iconColor: DS.accent.danger,
    blobColor: DS.accent.dangerMuted,
    actionText: 'Take Me Home',
    actionIcon: Home,
  },
  '500': {
    title: 'Internal Error',
    subtitle: "Whoops! Our server seems to be having issues :(",
    badgeIcon: AlertTriangle,
    badgeText: 'Status Code: 500',
    icon: ServerCrash,
    iconColor: DS.accent.warning,
    blobColor: DS.accent.warningMuted,
    actionText: 'Take Me Home',
    actionIcon: Home,
  },
  'maintenance': {
    title: 'Maintenance',
    subtitle: "We're currently undergoing scheduled maintenance.",
    badgeIcon: Wrench,
    badgeText: 'Come back in a while',
    icon: Wrench,
    iconColor: DS.accent.info,
    blobColor: DS.accent.infoMuted,
    actionText: 'Take Me Home',
    actionIcon: Home,
  },
  'session-expired': {
    title: 'Session Expired',
    subtitle: "Your secure session has expired for your protection. Please log in again.",
    badgeIcon: ShieldAlert,
    badgeText: 'Security Notice: 401',
    icon: ShieldAlert,
    iconColor: DS.accent.critical,
    blobColor: DS.accent.criticalMuted,
    actionText: 'Log In Again',
    actionIcon: Home,
  },
  'permissions-denied': {
    title: 'Permissions Needed',
    subtitle: "We need access to your microphone or location to use this feature.",
    badgeIcon: AlertTriangle,
    badgeText: 'Access Denied',
    icon: MicOff,
    iconColor: DS.accent.danger,
    blobColor: DS.accent.dangerMuted,
    actionText: 'Open Settings',
    actionIcon: Wrench,
  },
  'empty-state': {
    title: 'No Data Yet',
    subtitle: "There is nothing to show here at the moment. Your history will appear here.",
    badgeIcon: FolderOpen,
    badgeText: 'Empty Result',
    icon: FolderOpen,
    iconColor: DS.primary.main,
    blobColor: DS.primary.muted,
    actionText: 'Go Back',
    actionIcon: ChevronLeft,
  },
};

export default function FallbackScreen({ 
  type = '404', 
  onAction, 
  onBack,
  customTitle,
  customSubtitle,
  customActionText
}) {
  const config = FALLBACK_CONFIG[type] || FALLBACK_CONFIG['404'];
  const MainIcon = config.icon;
  const BadgeIcon = config.badgeIcon;
  const ActionIcon = config.actionIcon;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ChevronLeft size={24} color={DS.text.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>
        
        {/* Illustration Area (Replaces the complex vectors with our design system blob + icon) */}
        <View style={styles.illustrationContainer}>
          <View style={[styles.blob1, { backgroundColor: config.blobColor }]} />
          <View style={[styles.blob2, { backgroundColor: config.blobColor, opacity: 0.5 }]} />
          
          <View style={[styles.iconWrapper, { backgroundColor: '#FFFFFF' }]}>
            <MainIcon size={64} color={config.iconColor} strokeWidth={1.5} />
          </View>
        </View>

        {/* Text Area */}
        <Text style={styles.title}>{customTitle || config.title}</Text>
        <Text style={styles.subtitle}>{customSubtitle || config.subtitle}</Text>

        {/* Status Badge */}
        <View style={styles.badge}>
          <BadgeIcon size={14} color={DS.accent.warningHover} style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>{config.badgeText}</Text>
        </View>

      </View>

      {/* Bottom Action */}
      <View style={styles.footer}>
        <ScalePressable style={styles.actionBtn} onPress={onAction}>
          <Text style={styles.actionBtnText}>{customActionText || config.actionText}</Text>
          <ActionIcon size={18} color="#FFFFFF" />
        </ScalePressable>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.canvas.base, // Uses #F8FAFC
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    height: 60,
    justifyContent: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.canvas.surface,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  illustrationContainer: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  blob1: {
    position: 'absolute',
    width: 200,
    height: 180,
    borderRadius: 90,
    transform: [{ rotate: '45deg' }],
  },
  blob2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: 20,
    left: -20,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    ...DS.shadow.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: DS.text.primary,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: DS.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.accent.warningMuted,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: DS.radius.pill,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.accent.warningHover,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.primary.main, // Blue 500
    paddingVertical: 18,
    borderRadius: DS.radius.pill,
    ...DS.shadow.md,
    gap: 8,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
