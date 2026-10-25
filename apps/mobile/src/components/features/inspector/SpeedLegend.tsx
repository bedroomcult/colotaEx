/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { fontSizes, fonts } from "../../../styles/typography"
import { size, space } from "../../../constants"
import { radius } from "@colota/shared"
import { speedRampColor } from "../map/mapUtils"
import { formatSpeed } from "../../../utils/geo"
import { useTranslation } from "../../../i18n/useTranslation"

// Enough steps that the bar reads as a gradient without a gradient dependency
const STEPS = 24

interface Props {
  /** Speeds in m/s, the same range the track is coloured over. */
  minSpeed: number
  maxSpeed: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Names the two ends of the track's speed ramp. Without it the colours on the map are guesswork:
 * the ramp is scaled to the trip, so the same red can be a stroll or a motorway.
 */
export function SpeedLegend({ minSpeed, maxSpeed, style, testID = "speed-legend" }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const slow = formatSpeed(minSpeed)
  const fast = formatSpeed(maxSpeed)
  const steps = Array.from({ length: STEPS }, (_, i) =>
    speedRampColor(minSpeed + ((maxSpeed - minSpeed) * i) / (STEPS - 1), minSpeed, maxSpeed, colors)
  )

  return (
    <View
      pointerEvents="none"
      style={[styles.legend, { backgroundColor: colors.card }, style]}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={t("tripDetail.speedGradient", { slow, fast })}
    >
      <View style={[styles.bar, { borderColor: colors.border }]}>
        {steps.map((color, i) => (
          <View key={i} style={[styles.step, { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{slow}</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{fast}</Text>
      </View>
    </View>
  )
}

const BAR_HEIGHT = 6

const styles = StyleSheet.create({
  legend: {
    padding: space.sm,
    borderRadius: radius.sm,
    gap: space.xxs,
    minWidth: size.iconColumn * 2
  },
  bar: {
    flexDirection: "row",
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: 1,
    overflow: "hidden"
  },
  step: {
    flex: 1
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  label: {
    fontSize: fontSizes.micro,
    ...fonts.regular,
    fontVariant: ["tabular-nums"]
  }
})
