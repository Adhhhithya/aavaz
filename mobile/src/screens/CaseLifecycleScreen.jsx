import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  Linking
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Shield,
  ShieldCheck,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  FileDown,
  PhoneCall,
  PlusCircle,
  FolderHeart,
  Search,
  X
} from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import { api, API_BASE_URL } from '../services/api';

export default function CaseLifecycleScreen({ userProfile, onContactCounselor }) {
  const [cases, setCases] = useState([]);
  const [expandedCaseId, setExpandedCaseId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cnrNumber, setCnrNumber] = useState('');
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    fetchCases();
  }, [userProfile]);

  const fetchCases = async () => {
    if (userProfile?.id) {
      try {
        setIsLoading(true);
        const res = await api.get(`/api/v1/intake/app/cases/${userProfile.id}`);
        setCases(res.cases || []);
      } catch (e) {
        console.error("Failed to fetch cases:", e);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const activeCount = cases.filter((c) => !c.isResolved).length;
  const resolvedCount = cases.filter((c) => c.isResolved).length;

  const toggleExpand = (id) => {
    setExpandedCaseId((prev) => (prev === id ? null : id));
  };

  const handleDownloadDoc = (docName) => {
    Alert.alert('Download Document', `Downloading ${docName} to your local device secure storage.`);
  };

  const handleDownloadReport = (caseId) => {
    const url = `${API_BASE_URL}/api/v1/cases/${caseId}/report`;
    setPdfUrl(url);
    setPdfModalVisible(true);
  };

  const buildTimeline = (c) => {
    if (!c.ecourts_data) return c.timeline;
    
    const e = c.ecourts_data;
    const t = [];
    
    if (e.filingDate) {
       t.push({ step: "Case Filed", timestamp: e.filingDate, completed: true, active: false });
    }
    if (e.registrationDate) {
       t.push({ step: "Case Registered", timestamp: e.registrationDate, completed: true, active: false });
    }
    
    if (e.decisionDate) {
       t.push({ step: "Decision Made", timestamp: e.decisionDate, completed: true, active: true });
    } else if (e.nextHearingDate) {
       t.push({ step: "Next Hearing", timestamp: e.nextHearingDate, completed: false, active: true });
    } else if (t.length > 0) {
       t.push({ step: "Updates Pending", timestamp: "Awaiting next steps", completed: false, active: true });
    } else {
       return c.timeline;
    }
    return t;
  };

  const handleFileNewComplaint = () => {
    Alert.prompt(
      'Search Case via CNR',
      'Enter your 16-character eCourts CNR number:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Search',
          onPress: async (cnr) => {
            if (!cnr || cnr.length < 10) {
              Alert.alert('Error', 'Please enter a valid CNR number.');
              return;
            }
            try {
              setIsLoading(true);
              setCnrNumber(cnr);
              // Call the new single synchronous API to auto-solve and scrape
              const res = await api.post('/api/v1/ecourts/search', { 
                cnr,
                user_id: userProfile?.id
              });
              
              if (res.success) {
                Alert.alert('Success', 'Case fetched and parsed successfully!');
                await fetchCases();
              }
            } catch (e) {
              Alert.alert("Failed to search case", e.message || 'Error occurred while scraping eCourts.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Case Tracking</Text>
          <Text style={styles.screenSubtitle}>
            Track legal progress, official steps, and psychological support
          </Text>

          {/* Metric Summary Chips */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{activeCount}</Text>
              <Text style={styles.statLabel}>Active Cases</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{resolvedCount}</Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
          </View>
        </View>

        {/* Empty State vs Case List */}
        {cases.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBox}>
              <FolderHeart size={44} color={DS.primary.main} />
            </View>
            <Text style={styles.emptyTitle}>No active reports on file</Text>
            <Text style={styles.emptySubtitle}>
              You currently have no ongoing complaints or incidents registered under your profile.
            </Text>

            <TouchableOpacity
              style={styles.fileNewButton}
              onPress={handleFileNewComplaint}
              activeOpacity={0.85}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Search size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.fileNewButtonText}>Search Case via CNR</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.casesList}>
            {cases.map((c) => {
              const isExpanded = expandedCaseId === c.id;
              return (
                <View key={c.id} style={styles.caseCard}>
                  {/* Collapsed Header / Summary */}
                  <TouchableOpacity
                    style={styles.caseHeaderRow}
                    onPress={() => toggleExpand(c.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.caseHeaderLeft}>
                      <View style={styles.badgeRow}>
                        <View style={styles.statusBadge}>
                          <Text style={styles.statusBadgeText}>{c.status}</Text>
                        </View>
                        <Text style={styles.caseIdText}>#{c.id}</Text>
                      </View>
                      <Text style={styles.caseTitle}>{c.title}</Text>
                      <Text style={styles.caseDate}>Filed on {c.dateFiled}</Text>
                    </View>

                    <View style={styles.expandIcon}>
                      {isExpanded ? (
                        <ChevronUp size={20} color={DS.text.muted} />
                      ) : (
                        <ChevronDown size={20} color={DS.text.muted} />
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Expanded View: Vertical Step Tracker & Actions */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <View style={styles.divider} />
                      
                      <Text style={styles.timelineHeading}>Case Milestones &amp; Progress</Text>

                      {/* Vertical Step Tracker */}
                      <View style={styles.timelineContainer}>
                        {buildTimeline(c).map((item, idx, arr) => {
                          const isLast = idx === arr.length - 1;
                          return (
                            <View key={idx} style={styles.timelineItem}>
                              <View style={styles.timelineLeft}>
                                <View
                                  style={[
                                    styles.stepDot,
                                    item.completed && styles.stepDotCompleted,
                                    item.active && styles.stepDotActive,
                                  ]}
                                >
                                  {item.completed && (
                                    <Check size={12} strokeWidth={3} color="#FFFFFF" />
                                  )}
                                  {item.active && (
                                    <View style={styles.activeInnerPulse} />
                                  )}
                                </View>
                                {!isLast && (
                                  <View
                                    style={[
                                      styles.timelineLine,
                                      item.completed && styles.timelineLineDone,
                                    ]}
                                  />
                                )}
                              </View>

                              <View style={styles.timelineRight}>
                                <Text
                                  style={[
                                    styles.stepTitle,
                                    item.active && styles.stepTitleActive,
                                  ]}
                                >
                                  {item.step}
                                </Text>
                                <Text style={styles.stepTimestamp}>{item.timestamp}</Text>
                                {item.officer && (
                                  <Text style={styles.stepOfficer}>{item.officer}</Text>
                                )}
                                {item.nextAction && (
                                  <View style={styles.nextActionBox}>
                                    <Clock size={12} color={DS.primary.main} style={{ marginRight: 4 }} />
                                    <Text style={styles.nextActionText}>
                                      Next: {item.nextAction}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>

                      {/* Native Case Details from eCourts */}
                      {c.ecourts_data && (
                        <View style={styles.caseDetailsSection}>
                          <Text style={styles.sectionSubhead}>Case Details</Text>
                          <View style={styles.detailsCard}>
                            
                            {/* Case Type & Status */}
                            {c.ecourts_data.caseType && (
                              <>
                                <Text style={styles.detailLabel}>Case Type / Status:</Text>
                                <Text style={styles.detailValue}>
                                  {c.ecourts_data.caseType} • {c.ecourts_data.caseStatus || 'Unknown'}
                                </Text>
                              </>
                            )}

                            {/* Presiding Judge */}
                            {c.ecourts_data.judges && c.ecourts_data.judges.length > 0 && (
                              <>
                                <Text style={styles.detailLabel}>Presiding Judge:</Text>
                                <Text style={styles.detailValue}>{c.ecourts_data.judges.join(', ')}</Text>
                              </>
                            )}
                            
                            {/* Acts & Sections */}
                            <Text style={styles.detailLabel}>Acts & Sections:</Text>
                            <Text style={styles.detailValue}>
                              {(() => {
                                const acts = c.ecourts_data.actsAndSections;
                                if (!acts || acts.length === 0) return 'Not specified';
                                if (Array.isArray(acts)) return acts.join('\n');
                                return String(acts);
                              })()}
                            </Text>

                            {/* Parties Involved */}
                            {c.ecourts_data.petitioners && c.ecourts_data.petitioners.length > 0 && (
                              <>
                                <Text style={styles.detailLabel}>Petitioner(s):</Text>
                                <Text style={styles.detailValue}>{c.ecourts_data.petitioners.join(', ')}</Text>
                              </>
                            )}

                            {c.ecourts_data.respondents && c.ecourts_data.respondents.length > 0 && (
                              <>
                                <Text style={styles.detailLabel}>Respondent(s):</Text>
                                <Text style={styles.detailValue}>
                                  {c.ecourts_data.respondents.length > 3 
                                    ? `${c.ecourts_data.respondents.slice(0, 3).join(', ')} ... (+${c.ecourts_data.respondents.length - 3} more)`
                                    : c.ecourts_data.respondents.join(', ')}
                                </Text>
                              </>
                            )}
                          </View>
                        </View>
                      )}

                      {/* Attached Documentation */}
                      <View style={styles.docsSection}>
                        <Text style={styles.sectionSubhead}>Attached Documentation</Text>
                        
                        <TouchableOpacity
                          style={styles.docItem}
                          onPress={() => handleDownloadReport(c.id)}
                          activeOpacity={0.7}
                        >
                          <FileDown size={16} color={DS.primary.main} style={{ marginRight: 8 }} />
                          <Text style={styles.docName} numberOfLines={1}>Official_Case_Report.pdf</Text>
                          <Text style={styles.docSize}>Auto-generated</Text>
                        </TouchableOpacity>

                        {c.documents && c.documents.length > 0 && c.documents.map((doc, dIdx) => (
                          <TouchableOpacity
                            key={dIdx}
                            style={styles.docItem}
                            onPress={() => handleDownloadDoc(doc.name)}
                            activeOpacity={0.7}
                          >
                            <FileDown size={16} color={DS.primary.main} style={{ marginRight: 8 }} />
                            <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                            <Text style={styles.docSize}>{doc.size}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Counselor Support Button */}
                      <TouchableOpacity
                        style={styles.counselorButton}
                        onPress={() => {
                          Alert.alert(
                            'Connect with Counselor',
                            `Dialing assigned counselor for Case #${c.id}...`,
                            [{ text: 'OK' }]
                          );
                        }}
                        activeOpacity={0.8}
                      >
                        <PhoneCall size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.counselorButtonText}>
                          Speak to Case Counselor
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add Another Case Button at the bottom of the list */}
            <TouchableOpacity
              style={styles.addCaseFooterButton}
              onPress={handleFileNewComplaint}
              activeOpacity={0.85}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={DS.primary.main} size="small" />
              ) : (
                <>
                  <PlusCircle size={20} color={DS.primary.main} style={{ marginRight: 8 }} />
                  <Text style={styles.addCaseFooterText}>Search & Add Another Case</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* PDF Viewer Modal */}
      <Modal
        visible={pdfModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPdfModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: DS.canvas.base }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: DS.canvas.border }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: DS.text.primary }}>Case Report PDF</Text>
            <TouchableOpacity onPress={() => setPdfModalVisible(false)} style={{ padding: 8, backgroundColor: DS.canvas.surfaceSubtle, borderRadius: 20 }}>
              <X size={20} color={DS.text.primary} />
            </TouchableOpacity>
          </View>
          {pdfUrl ? (
            <WebView 
              source={{ 
                uri: pdfUrl, 
                headers: { 'ngrok-skip-browser-warning': '1' } 
              }} 
              style={{ flex: 1 }} 
              startInLoadingState={true}
              renderLoading={() => (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={DS.primary.main} />
                </View>
              )}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.canvas.base, // Cloud Mist #F8F9FC
  },
  scrollContent: {
    paddingHorizontal: DS.spacing.lg,
    paddingTop: DS.spacing.md,
    paddingBottom: 100, // space for tab bar
  },
  header: {
    marginBottom: DS.spacing.lg,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: DS.text.primary,
  },
  screenSubtitle: {
    fontSize: 13,
    color: DS.text.muted,
    marginTop: 2,
    marginBottom: DS.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: DS.canvas.surface,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    borderRadius: DS.radius.lg,
    padding: DS.spacing.md,
    alignItems: 'center',
    ...DS.shadow.card,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: DS.text.primary,
  },
  statLabel: {
    fontSize: 12,
    color: DS.text.muted,
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: DS.canvas.surface,
    borderRadius: DS.radius.xl,
    padding: DS.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DS.canvas.border,
    marginTop: DS.spacing.xl,
    ...DS.shadow.card,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: DS.primary.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DS.text.primary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: DS.text.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: DS.spacing.xl,
    paddingHorizontal: DS.spacing.md,
  },
  fileNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.primary.main,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: DS.radius.pill,
    ...DS.shadow.hover,
  },
  fileNewButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  casesList: {
    gap: DS.spacing.md,
  },
  caseCard: {
    backgroundColor: DS.canvas.surface,
    borderRadius: DS.radius.xl,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    overflow: 'hidden',
    ...DS.shadow.card,
  },
  caseHeaderRow: {
    flexDirection: 'row',
    padding: DS.spacing.lg,
    alignItems: 'center',
  },
  caseHeaderLeft: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusBadge: {
    backgroundColor: DS.accent.periwinkle, // Soft Periwinkle #EBE8F6
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: DS.radius.sm,
    marginRight: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.accent.periwinkleText,
  },
  caseIdText: {
    fontSize: 12,
    color: DS.text.muted,
    fontWeight: '600',
  },
  caseTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.text.primary,
    marginBottom: 4,
  },
  caseDate: {
    fontSize: 12,
    color: DS.text.muted,
  },
  expandIcon: {
    paddingLeft: 8,
  },
  expandedContent: {
    paddingHorizontal: DS.spacing.lg,
    paddingBottom: DS.spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: DS.canvas.border,
    marginBottom: DS.spacing.md,
  },
  timelineHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: DS.text.primary,
    marginBottom: DS.spacing.md,
  },
  timelineContainer: {
    paddingLeft: 4,
    marginBottom: DS.spacing.md,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 56,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
    marginRight: 10,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: DS.canvas.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotCompleted: {
    backgroundColor: DS.accent.sage,
  },
  stepDotActive: {
    backgroundColor: DS.primary.main, // Lavender #8A79B8
  },
  activeInnerPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: DS.canvas.border,
    marginVertical: 4,
  },
  timelineLineDone: {
    backgroundColor: DS.accent.sage,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 14,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: DS.text.primary,
  },
  stepTitleActive: {
    color: DS.primary.main,
  },
  stepTimestamp: {
    fontSize: 12,
    color: DS.text.muted,
    marginTop: 2,
  },
  stepOfficer: {
    fontSize: 12,
    color: DS.text.primary,
    marginTop: 2,
  },
  nextActionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.primary.muted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: DS.radius.sm,
    marginTop: 6,
  },
  nextActionText: {
    fontSize: 11,
    color: DS.primary.main,
    fontWeight: '600',
  },
  docsSection: {
    marginTop: DS.spacing.sm,
    marginBottom: DS.spacing.md,
  },
  sectionSubhead: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.text.muted,
    marginBottom: 6,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    padding: 10,
    borderRadius: DS.radius.md,
    marginBottom: 6,
  },
  docName: {
    fontSize: 13,
    color: DS.text.primary,
    flex: 1,
    fontWeight: '500',
  },
  docSize: {
    fontSize: 11,
    color: DS.text.muted,
    marginLeft: 6,
  },
  counselorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.primary.main,
    paddingVertical: 12,
    borderRadius: DS.radius.pill,
    ...DS.shadow.hover,
  },
  counselorButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  caseDetailsSection: {
    marginBottom: DS.spacing.md,
  },
  detailsCard: {
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    borderRadius: DS.radius.md,
    padding: DS.spacing.md,
  },
  detailLabel: {
    fontSize: 11,
    color: DS.text.muted,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    color: DS.text.primary,
    marginBottom: 4,
  },
  addCaseFooterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.primary.main,
    borderStyle: 'dashed',
    paddingVertical: 14,
    borderRadius: DS.radius.xl,
    marginTop: DS.spacing.sm,
  },
  addCaseFooterText: {
    color: DS.primary.main,
    fontSize: 15,
    fontWeight: '600',
  },
});
