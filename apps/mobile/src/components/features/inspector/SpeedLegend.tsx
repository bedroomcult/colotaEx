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
import {
  ABSOLUTE_RAMP_MAX_MPS,
  computeSpeedPercentiles,
  getSpeedColor,
  relativeSpeedColor,
  speedRampColor,
  type SpeedPercentileStops
} from "../map/mapUtils"
import { formatSpeed } from "../../../utils/geo"
import { useTranslation } from "../../../i18n/useTranslation"

// Enough steps that the bar reads as a gradient without a gradient dependency
const STEPS = 24

interface Props {
  /** Speeds in m/s, the same range the track is coloured over. */
  minSpeed: number
  maxSpeed: number
  /** All fixes, for the percentile stops the track is coloured over in relative mode. */
  speeds?: ArrayLike<number | undefined | null>
  /** "absolute" draws fixed 0-12 m/s anchors; default draws the trip's percentile stops. */
  mode?: "relative" | "absolute"
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Names the ends of the track's speed ramp. In relative mode the stops are the trip's own
 * percentiles, so the legend prints them and says the colours are trip-relative.
 */
export function SpeedLegend({ minSpeed, maxSpeed, speeds, mode = "relative", style, testID = "speed-legend" }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const stops: SpeedPercentileStops | null =
    mode === "relative" && speeds ? computeSpeedPercentiles(speeds) : null
  const slow = formatSpeed(mode === "absolute" ? 0 : minSpeed)
  const fast = formatSpeed(mode === "absolute" ? ABSOLUTE_RAMP_MAX_MPS : maxSpeed)
  const mid =
    mode === "relative" && stops
      ? formatSpeed(stops.p50)
      : formatSpeed((minSpeed + maxSpeed) / 2)
  const steps = Array.from({ length: STEPS }, (_, i) => {
    const speed = minSpeed + ((maxSpeed - minSpeed) * i) / (STEPS - 1)
    if (mode === "absolute") return getSpeedColor(speed)
    if (stops) return relativeSpeedColor(speed, stops)
    return speedRampColor(speed, minSpeed, maxSpeed)
  })

  return (
    <View
      pointerEvents="none"
      style={[styles.legend, { backgroundColor: colors.card }, style]}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={t("tripDetail.speedGradient", {
        slow,
        mid,
        fast,
        mode: t(mode === "absolute" ? "tripDetail.speedMode.absolute" : "tripDetail.speedRelative")
      })}
    >
      <View style={[styles.bar, { borderColor: colors.border }]}>
        {steps.map((color, i) => (
          <View key={i} style={[styles.step, { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{slow}</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{mid}</Text>
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
