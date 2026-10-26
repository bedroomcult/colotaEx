/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { render } from "@testing-library/react-native"
import { loadDisplayPreferences } from "../../../../utils/geo"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { GpsStatusRow } from "../GpsStatusRow"

jest.useFakeTimers()

beforeAll(async () => {
  const NativeLocationService = require("../../../../services/NativeLocationService").default
  NativeLocationService.getSetting = jest.fn((key: string) =>
    Promise.resolve(key === "unitSystem" ? "metric" : "")
  )
  await loadDisplayPreferences()
})

afterAll(() => {
  jest.useRealTimers()
})

const live = {
  latitude: 52.52,
  longitude: 13.405,
  accuracy: 12,
  timestamp: Math.floor(Date.now() / 1000) - 5,
  satellitesUsed: 8,
  satellitesInView: 14
}

const renderRow = (props: Partial<React.ComponentProps<typeof GpsStatusRow>> = {}) =>
  render(
    <GpsStatusRow tracking coords={null} lastKnown={null} intervalSeconds={30} {...props} />
  )

describe("GpsStatusRow", () => {
  it("names accuracy, sats and age on a live fix, green at 10 m", () => {
    const { getByTestId } = renderRow({ tracking: true, coords: live })

    // The age ticks every 5 s, so only the shape is pinned, not the count.
    expect(getByTestId("gps-status").props.accessibilityLabel).toMatch(
      /^±12 m, 8\/14 sats · \d+s ago$/
    )
  })

  it("turns amber past 10 m and red past 25 m, so the band reads without the number", () => {
    const { getByTestId, rerender } = renderRow({
      tracking: true,
      coords: { ...live, accuracy: 20 }
    })
    expect(getByTestId("gps-status").props.accessibilityLabel).toMatch(/^±20 m, /)

    rerender(
      <GpsStatusRow tracking coords={{ ...live, accuracy: 40 }} lastKnown={null} intervalSeconds={30} />
    )
    expect(getByTestId("gps-status").props.accessibilityLabel).toMatch(/^±40 m, /)
  })

  it("marks a fix older than twice the interval as stale", () => {
    const { getByTestId } = renderRow({
      tracking: true,
      coords: { ...live, timestamp: Math.floor(Date.now() / 1000) - 120 },
      intervalSeconds: 30
    })

    expect(getByTestId("gps-status").props.accessibilityLabel).toMatch(/^Stale · ±12 m, /)
  })

  it("shows a dash when the chipset reports no satellite count", () => {
    const { getByTestId } = renderRow({
      tracking: true,
      coords: { ...live, satellitesUsed: undefined, satellitesInView: undefined }
    })

    expect(getByTestId("gps-status").props.accessibilityLabel).toContain("sats –")
  })

  it("reads searching while tracking without a fix, with the last-known age when there is one", () => {
    const { getByTestId } = renderRow({
      tracking: true,
      coords: null,
      lastKnown: { accuracy: 30, timestamp: Math.floor(Date.now() / 1000) - 65 }
    })

    // The dock state line names the same missing fix, so this row reads like its echo.
    expect(getByTestId("gps-status").props.accessibilityLabel).toMatch(
      /^Searching for GPS signal, No fix yet · 1 min ago$/
    )
  })

  it("names the last known fix when idle, never claiming it is live", () => {
    const { getByTestId } = renderRow({
      tracking: false,
      lastKnown: { accuracy: 18, timestamp: Math.floor(Date.now() / 1000) - 30 }
    })

    expect(getByTestId("gps-status").props.accessibilityLabel).toMatch(
      /^±18 m last fix, \d+s ago$/
    )
  })

  it("admits no fix at all when idle with an empty database", () => {
    const { getByTestId } = renderRow({ tracking: false, lastKnown: null })

    expect(getByTestId("gps-status").props.accessibilityLabel).toBe("No GPS fix, No fixes yet")
  })
})
