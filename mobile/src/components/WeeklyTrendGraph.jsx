import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DS } from '../theme/designSystem';
import ScalePressable from './ScalePressable';
import { api } from '../services/api';

const { width } = Dimensions.get('window');

const FILTERS = ['1d', '1w', '1m', '1y', 'All Time'];

export default function WeeklyTrendGraph() {
  const [activeFilter, setActiveFilter] = useState('1w');
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/intake/app/trends');
      if (res.data && res.data.trends) {
        setTrends(res.data.trends);
      }
    } catch (e) {
      console.error("Failed to fetch trends:", e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTrends();
    }, [activeFilter])
  );

  const displayTrends = trends;

  if (!loading && displayTrends.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Distress Trends & Deconstruction</Text>
          <Text style={styles.subtitle}>7-Day Multimodal Composition</Text>
        </View>
        <View style={[styles.graphWrapper, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: DS.text.muted, fontSize: 14 }}>No data available for this period.</Text>
        </View>
      </View>
    );
  }

  // Maximum value for scaling the bars
  const maxTotal = Math.max(...displayTrends.map(t => t.sentiment + t.vocal + t.physiological), 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Distress Trends & Deconstruction</Text>
        <Text style={styles.subtitle}>7-Day Multimodal Composition</Text>
      </View>

      {/* Graph Area */}
      <View style={styles.graphWrapper}>
        {/* Horizontal Grid Lines */}
        <View style={styles.gridContainer}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={styles.gridLine} />
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={DS.primary.main} />
          </View>
        ) : (
          <View style={styles.barsContainer}>
            {displayTrends.map((item, index) => {
              const hSentiment = (item.sentiment / maxTotal) * 120;
              const hVocal = (item.vocal / maxTotal) * 120;
              const hPhysio = (item.physiological / maxTotal) * 120;
              const isToday = index === displayTrends.length - 1;

              return (
                <View key={index} style={styles.barCol}>
                  <View style={[styles.barStack, isToday && styles.activeBarStack]}>
                    <View style={[styles.segment, { height: hSentiment, backgroundColor: '#DDD6FE', borderTopLeftRadius: 4, borderTopRightRadius: 4 }]} />
                    <View style={[styles.segment, { height: hVocal, backgroundColor: '#818CF8' }]} />
                    <View style={[styles.segment, { height: hPhysio, backgroundColor: '#4F46E5', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }]} />
                  </View>
                  <Text style={[styles.dayLabel, isToday && styles.activeDayLabel]}>{item.day}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4F46E5' }]} />
          <Text style={styles.legendText}>Physiological</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#818CF8' }]} />
          <Text style={styles.legendText}>Vocal</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#DDD6FE' }]} />
          <Text style={styles.legendText}>Sentiment</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterPillContainer}>
        {FILTERS.map(f => {
          const isActive = activeFilter === f;
          return (
            <ScalePressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.filterBtn, isActive && styles.activeFilterBtn]}
            >
              <Text style={[styles.filterText, isActive && styles.activeFilterText]}>
                {f}
              </Text>
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(60, 60, 67, 0.6)',
  },
  graphWrapper: {
    height: 160,
    width: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingBottom: 24, // Space for labels
    paddingTop: 10,
  },
  gridLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#F1F5F9', // Solid light line instead of dashed zigzag
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: '100%',
    paddingBottom: 24, // Space for X-axis labels
    paddingHorizontal: 4,
  },
  barCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    height: '100%',
  },
  barStack: {
    width: 26,
    justifyContent: 'flex-end',
    padding: 2,
    marginBottom: 8, // Space between bar and text
  },
  activeBarStack: {
    borderWidth: 2,
    borderColor: '#C4B5FD',
    borderRadius: 6,
    padding: 1,
  },
  segment: {
    width: '100%',
    marginBottom: 1,
  },
  dayLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  activeDayLabel: {
    color: DS.primary.main,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.05)',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: 'rgba(60, 60, 67, 0.6)',
    fontWeight: '500',
  },
  filterPillContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginTop: 8,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeFilterBtn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filterText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#0F172A',
    fontWeight: '700',
  },
});
