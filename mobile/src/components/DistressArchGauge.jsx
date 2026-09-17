import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { DS } from '../theme/designSystem';

const DistressArchGauge = ({
  score = 78,
  maxScore = 100,
  ranges = [
    { label: 'Normal', min: 0, max: 40, color: DS.accent.blue, share: '40%' },
    { label: 'Moderate', min: 41, max: 70, color: DS.accent.amber, share: '30%' },
    { label: 'Critical', min: 71, max: 100, color: DS.accent.crimson, share: '30%' },
  ],
}) => {
  const size = 320;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2 - 10;
  const cx = size / 2;
  const cy = size / 2 + 30; // Sinks center downwards so the top arch is prioritized

  // Converts polar angle (in degrees, 180° to 360°/0°) to cartesian coordinates
  const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  // Helper to describe an SVG circular arc path
  const describeArc = (x, y, r, startAngle, endAngle) => {
    const start = polarToCartesian(x, y, r, startAngle);
    const end = polarToCartesian(x, y, r, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  // Total available arc spans 180 degrees (from left π to right 0)
  const totalArc = 180;
  const gap = 4; // Gap between segments in degrees

  // Map ranges to arc degrees
  const segments = ranges.map((item) => {
    const rangeSpan = item.max - item.min;
    const degreeSpan = (rangeSpan / maxScore) * (totalArc - gap * (ranges.length - 1));
    return { ...item, degreeSpan };
  });

  // Calculate segment paths
  let currentStartAngle = 180;
  const renderedSegments = segments.map((seg) => {
    const start = currentStartAngle;
    const end = currentStartAngle + seg.degreeSpan;
    currentStartAngle = end + gap;
    return {
      ...seg,
      path: describeArc(cx, cy, radius, start, end),
      startAngle: start,
      endAngle: end,
    };
  });

  // Calculate indicator thumb position along the semicircular arch
  const clampedScore = Math.min(Math.max(score, 0), maxScore);
  const indicatorAngle = 180 + (clampedScore / maxScore) * totalArc;
  const thumbPos = polarToCartesian(cx, cy, radius, indicatorAngle);

  // Active status tag based on current score
  const activeRange = ranges.find((r) => score >= r.min && score <= r.max) || ranges[ranges.length - 1];

  return (
    <View style={styles.container}>
      <Svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        {/* Render segmented paths with round caps */}
        {renderedSegments.map((seg, idx) => (
          <Path
            key={`seg-${idx}`}
            d={seg.path}
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />
        ))}

        {/* Dynamic target indicator thumb */}
        <Circle
          cx={thumbPos.x}
          cy={thumbPos.y}
          r={12}
          fill="#FFFFFF"
          stroke={activeRange.color}
          strokeWidth={4}
        />
      </Svg>

      {/* Central Readout */}
      <View style={styles.readoutWrapper}>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{score}</Text>
          <Text style={styles.scoreUnit}>/ 100</Text>
        </View>
        <Text style={styles.scoreSubtitle}>Distress Index</Text>
      </View>

      {/* Legend Area */}
      <View style={styles.legendContainer}>
        <View style={styles.legendRow}>
          {ranges.map((item, index) => (
            <View key={`lg-${index}`} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>
                {item.label} {index === ranges.length - 1 ? `>${item.min-1}` : `${item.min}-${item.max}`} ({item.share})
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: DS.spacing.md,
  },
  readoutWrapper: {
    position: 'absolute',
    top: 95,
    alignItems: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    ...DS.type.heroDisplay,
    fontSize: 50,
  },
  scoreUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: DS.text.muted,
    marginLeft: 4,
  },
  scoreSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: DS.text.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  legendContainer: {
    width: '100%',
    paddingHorizontal: 10,
    marginTop: DS.spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: DS.text.secondary,
    fontWeight: '500',
  },
});

export default DistressArchGauge;
