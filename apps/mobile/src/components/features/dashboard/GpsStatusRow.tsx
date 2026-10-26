/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useState } from "react"
import { Satellite } from "lucide-react-native"
import type { LocationCoords } from "../../../types/global"
import { metersToInput, shortDistanceUnit } from "../../../utils/geo"
import { useTheme } from "../../../hooks/useTheme"
import { useTranslation } from "../../../i18n/useTranslation"
import { StateLine } from "../../ui/StateLine"

/** Live fix older than this multiple of the tracking interval reads as stale. */
const STALE_MULTIPLE = 2
/** Good at or under 10 m, fair at or under 25 m, poor above. */
const GOOD_M = 10
const FAIR_M = 25

interface Props {
  tracking: boolean
  coords: LocationCoords | null
  /** Last fix from the database; shown when idle or still searching. */
  lastKnown: { accuracy: number; timestamp: number } | null | undefined
  /** Tracking interval in seconds; drives the stale threshold. */
  intervalSeconds: number
}

function ageSeconds(timestampSec: number | undefined, nowMs: number): number | null {
  if (timestampSec == null) return null
  return Math.max(0, Math.round(nowMs / 1000 - timestampSec))
}

function formatAge(ageSec: number | null, t: (key: string, opts?: any) => string): string | null {
  if (ageSec == null) return null
  if (ageSec < 60) return t("gps.ageSeconds", { n: ageSec })
  return t("gps.ageMinutes", { n: Math.round(ageSec / 60) })
}

/**
 * GPS fix quality row in the dashboard dock: accuracy, satellites, fix age.
 * Always rendered; the copy names the state (live, searching, idle, stale) so it
 * never presents a stale fix as current.
 */
export function GpsStatusRow({ tracking, coords, lastKnown, intervalSeconds }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  // Ticks the "5 s ago" caption without touching any tracking state.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const hasFix = tracking && coords !== null && coords.latitude !== 0 && coords.longitude !== 0

  if (hasFix && coords) {
    const accuracy = Math.round(metersToInput(coords.accuracy ?? 0))
    const age = ageSeconds(coords.timestamp, nowMs)
    const stale = age != null && intervalSeconds > 0 && age > STALE_MULTIPLE * intervalSeconds
    const sats =
      coords.satellitesUsed != null
        ? t("gps.sats", { used: coords.satellitesUsed, total: coords.satellitesInView ?? "–" })
        : t("gps.satsUnknown")
    const caption = [sats, formatAge(age, t)].filter(Boolean).join(" · ")
    const tone =
      stale || accuracy > FAIR_M ? colors.error : accuracy > GOOD_M ? colors.warning : colors.success
    return (
      <StateLine
        icon={Satellite}
        iconColor={tone}
        label={t(stale ? "gps.stale" : "gps.accuracy", { value: accuracy, unit: shortDistanceUnit() })}
        caption={caption}
        testID="gps-status"
      />
    )
  }

  if (tracking) {
    const age = ageSeconds(lastKnown?.timestamp, nowMs)
    const agePart = age != null ? ` · ${formatAge(age, t)}` : ""
    return (
      <StateLine
        icon={Satellite}
        iconColor={colors.textSecondary}
        label={t("gps.searching")}
        caption={`${t("state.noFixYet")}${agePart}`}
        testID="gps-status"
      />
    )
  }

  if (lastKnown) {
    const accuracy = Math.round(metersToInput(lastKnown.accuracy ?? 0))
    const caption = formatAge(ageSeconds(lastKnown.timestamp, nowMs), t) ?? ""
    return (
      <StateLine
        icon={Satellite}
        iconColor={colors.textSecondary}
        label={t("gps.lastKnown", { value: accuracy, unit: shortDistanceUnit() })}
        caption={caption}
        testID="gps-status"
      />
    )
  }

  return (
    <StateLine
      icon={Satellite}
      iconColor={colors.textSecondary}
      label={t("gps.noFix")}
      caption={t("state.noFixes")}
      testID="gps-status"
    />
  )
}
