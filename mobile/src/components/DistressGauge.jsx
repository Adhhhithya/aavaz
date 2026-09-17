import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { DS } from '../theme/designSystem';

/**
 * Creates an SVG arc path between two angles (in degrees, 0 to 180)
 * 180 deg = 9 o'clock (left)
 * 90 deg  = 12 o'clock (top)
 * 0 deg   = 3 o'clock (right)
 */
function createArcPath(cx, cy, r, startAngleDeg, endAngleDeg) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const startRad = toRad(startAngleDeg);
  const endRad = toRad(endAngleDeg);

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy - r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy - r * Math.sin(endRad);

  const largeArcFlag = Math.abs(startAngleDeg - endAngleDeg) > 180 ? 1 : 0;
  // Sweep flag 1 draws clockwise from start to end in SVG screen coordinates
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function DistressGauge({ score = 72, maxScore = 100 }) {
  const boundedScore = Math.max(0, Math.min(maxScore, score));
  
  // Dimensions
  const width = 280;
  const height = 160;
  const cx = width / 2;
  const cy = 135;
  const radius = 105;
  const strokeWidth = 14;

  // Segment angles with gaps (Total: 180 deg from left to right)
  // Sage (0-40%): 180 -> 124 (span 56)
  // Gap: 124 -> 118 (span 6)
  // Amber (41-70%): 118 -> 62 (span 56)
  // Gap: 62 -> 56 (span 6)
  // Terracotta (71-100%): 56 -> 0 (span 56)
  const pathNormal = createArcPath(cx, cy, radius, 180, 124);
  const pathModerate = createArcPath(cx, cy, radius, 118, 62);
  const pathCritical = createArcPath(cx, cy, radius, 56, 0);

  // Indicator math (angle in radians running from PI down to 0)
  const angleDeg = 180 - (boundedScore / maxScore) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const thumbX = cx + radius * Math.cos(angleRad);
  const thumbY = cy - radius * Math.sin(angleRad);

  // Status & color resolution
  let activeColor = DS.accent.sage;
  let statusText = 'Stable & Grounded';
  if (boundedScore > 70) {
    activeColor = DS.accent.terracotta;
    statusText = 'Elevated Stress / Critical';
  } else if (boundedScore > 40) {
    activeColor = DS.accent.amber;
    statusText = 'Moderate Tension';
  }

  return (
    <View style={styles.container}>
      {/* Semicircular SVG Track */}
      <View style={styles.svgWrapper}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Normal Segment */}
          <Path
            d={pathNormal}
            stroke={DS.accent.sage}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />

          {/* Moderate Segment */}
          <Path
            d={pathModerate}
            stroke={DS.accent.amber}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />

          {/* Critical Segment */}
          <Path
            d={pathCritical}
            stroke={DS.accent.terracotta}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />

          {/* Track-Riding Thumb Indicator */}
          {/* Outer colored halo ring */}
          <Circle
            cx={thumbX}
            cy={thumbY}
            r={13}
            fill={activeColor}
          />
          {/* Inner white core */}
          <Circle
            cx={thumbX}
            cy={thumbY}
            r={7}
            fill="#FFFFFF"
          />
        </Svg>

        {/* Centered Readout */}
        <View style={[styles.centeredTextWrap, { top: cy - 65 }]}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreValue}>{boundedScore}</Text>
            <Text style={styles.scoreUnit}>/{maxScore}</Text>
          </View>
          <Text style={[styles.statusLabel, { color: activeColor }]}>{statusText}</Text>
        </View>
      </View>

      {/* Bottom Color-Coded Legend */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: DS.accent.sage }]} />
          <Text style={styles.legendText}>Normal 0–40</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: DS.accent.amber }]} />
          <Text style={styles.legendText}>Elevated 41–70</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: DS.accent.terracotta }]} />
          <Text style={styles.legendText}>Critical &gt;70</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: DS.spacing.md,
  },
  svgWrapper: {
    width: 280,
    height: 155,
    alignItems: 'center',
    position: 'relative',
  },
  centeredTextWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: '800',
    color: DS.text.primary,
    letterSpacing: -1,
  },
  scoreUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: DS.text.muted,
    marginLeft: 4,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: DS.spacing.md,
    paddingHorizontal: DS.spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: DS.text.muted,
    fontWeight: '500',
  },
});
