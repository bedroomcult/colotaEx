/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { ThemeColors, Geofence } from "../../../types/global"
import { size } from "../../../constants"

/** MapLibre line-layer style for colored track segments (`color` is a per-feature property). */
export const TRACK_LINE_STYLE: any = {
  lineColor: ["get", "color"],
  lineWidth: 3,
  lineCap: "round",
  lineJoin: "round"
}

/** Drawn under `TRACK_LINE_STYLE` on the same source; the caller adds `lineColor` from its theme. */
export const TRACK_CASING_STYLE: any = {
  lineWidth: ["case", ["get", "focused"], 7, 5],
  lineCap: "round",
  lineJoin: "round"
}

// ============================================================================
// SPEED COLOR INTERPOLATION
// ============================================================================

/** Parse a hex color string into [r, g, b] */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

/** Linearly interpolate between two hex colors by factor t (0..1) */
export function lerpColor(c1: string, c2: string, t: number): string {
  const a = parseHex(c1)
  const b = parseHex(c2)
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

/**
 * The speed ramp's stops, slowest to fastest: green, yellow, orange, red. Fixed rather than
 * themed, so a speed means the same colour in light and dark and the four steps stay distinct.
 */
const SPEED_RAMP_STOPS = ["#2E9E4F", "#E8C547", "#E8813A", "#D93A3A"] as const

/** Absolute speeds the ramp spans: below the first is green, above the last is red. */
const SPEED_RAMP_MIN_MPS = 0
export const ABSOLUTE_RAMP_MAX_MPS = 12

/** At or below this a fix reads as stopped: green, and excluded from percentile math. */
export const NEAR_STATIONARY_MPS = 3 / 3.6

/** Implausible GPS spikes never anchor the scale; matches the service's jitter reject. */
const MAX_PLAUSIBLE_MPS = 278

/** Interpolates along the four-stop speed ramp; t is 0 (slowest) to 1 (fastest). */
export function rampColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const scaled = clamped * (SPEED_RAMP_STOPS.length - 1)
  // A ratio that lands on a stop (a third, two thirds) must return that stop,
  // not a near-identical interpolation of it: doubles rarely hit integers exactly.
  const snapped = Math.round(scaled)
  if (Math.abs(scaled - snapped) < 1e-9)
    return SPEED_RAMP_STOPS[Math.min(snapped, SPEED_RAMP_STOPS.length - 1)]
  const index = Math.min(Math.floor(scaled), SPEED_RAMP_STOPS.length - 2)
  return lerpColor(SPEED_RAMP_STOPS[index], SPEED_RAMP_STOPS[index + 1], scaled - index)
}

/**
 * Returns a color for a given speed (m/s) on fixed absolute anchors, so the same speed reads
 * the same colour in every trip. Below 0 green, above 12 m/s red.
 */
export function getSpeedColor(speed: number): string {
  if (!(speed >= 0) || speed <= SPEED_RAMP_MIN_MPS) return SPEED_RAMP_STOPS[0]
  if (speed >= ABSOLUTE_RAMP_MAX_MPS) return SPEED_RAMP_STOPS[SPEED_RAMP_STOPS.length - 1]
  return rampColor((speed - SPEED_RAMP_MIN_MPS) / (ABSOLUTE_RAMP_MAX_MPS - SPEED_RAMP_MIN_MPS))
}

/** A speed sample is usable when it is finite, non-negative and plausible. */
export function isValidSpeed(speed: number | undefined | null): speed is number {
  return (
    typeof speed === "number" && Number.isFinite(speed) && speed >= 0 && speed <= MAX_PLAUSIBLE_MPS
  )
}

export interface SpeedPercentileStops {
  p10: number
  p30: number
  p50: number
  p70: number
  p90: number
  max: number
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = (q / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower)
}

/**
 * Percentile stops from a trip's moving speeds, slowest to fastest. Stops (at or below
 * 3 km/h) and invalid samples are excluded so long rests and GPS spikes never anchor the
 * scale. Returns null when fewer than 3 moving samples exist or they all read the same,
 * in which case the caller falls back to a stable min/max span.
 */
export function computeSpeedPercentiles(speeds: ArrayLike<number | undefined | null>): SpeedPercentileStops | null {
  const moving: number[] = []
  for (let i = 0; i < speeds.length; i++) {
    const speed = speeds[i]
    if (isValidSpeed(speed) && speed > NEAR_STATIONARY_MPS) moving.push(speed)
  }
  if (moving.length < 3) return null
  moving.sort((a, b) => a - b)
  if (moving[0] === moving[moving.length - 1]) return null
  return {
    p10: percentile(moving, 10),
    p30: percentile(moving, 30),
    p50: percentile(moving, 50),
    p70: percentile(moving, 70),
    p90: percentile(moving, 90),
    max: moving[moving.length - 1]
  }
}

/** The seven percentile stops interpolated across the four ramp colours. */
const RELATIVE_STOP_T = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1] as const

function relativeStopColor(index: number, fraction: number): string {
  const t = RELATIVE_STOP_T[index] + fraction * (RELATIVE_STOP_T[index + 1] - RELATIVE_STOP_T[index])
  return rampColor(t)
}

/**
 * Colour along the trip's own percentile stops: p10 green, p50 yellow, p90 orange-red,
 * max red, smooth between. Stops and anything slower read green. Falls back to green.
 * Deterministic: same speed and stops always yield the same colour.
 */
export function relativeSpeedColor(speed: number, stops: SpeedPercentileStops): string {
  if (!isValidSpeed(speed) || speed <= NEAR_STATIONARY_MPS || speed <= stops.p10)
    return SPEED_RAMP_STOPS[0]
  if (speed >= stops.max) return SPEED_RAMP_STOPS[SPEED_RAMP_STOPS.length - 1]
  const bounds = [stops.p10, stops.p30, stops.p50, stops.p70, stops.p90, stops.max]
  for (let i = 0; i < bounds.length - 1; i++) {
    if (speed <= bounds[i + 1]) {
      const span = bounds[i + 1] - bounds[i]
      const fraction = span > 0 ? (speed - bounds[i]) / span : 0
      return relativeStopColor(i, Math.max(0, Math.min(1, fraction)))
    }
  }
  return SPEED_RAMP_STOPS[SPEED_RAMP_STOPS.length - 1]
}

/**
 * The slowest and fastest speed a set of fixes reports, for a ramp scaled to one trip. A fix with
 * no speed counts as still, so imported tracks without speeds collapse to a single colour.
 */
export function speedRange(locations: ArrayLike<{ speed?: number }>): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < locations.length; i++) {
    const speed = locations[i].speed ?? 0
    if (speed < min) min = speed
    if (speed > max) max = speed
  }
  return min <= max ? { min, max } : { min: 0, max: 0 }
}

/**
 * Colour along a ramp scaled to this trip's own min/max. Kept for the day map and other
 * callers without a percentile context. For trip display prefer percentile stops via
 * {@link computeSpeedPercentiles} + {@link relativeSpeedColor}.
 */
export function speedRampColor(speed: number, min: number, max: number): string {
  if (!(max > min) || speed <= min) return SPEED_RAMP_STOPS[0]
  if (speed >= max) return SPEED_RAMP_STOPS[SPEED_RAMP_STOPS.length - 1]
  return rampColor((speed - min) / (max - min))
}

// ============================================================================
// GEOGRAPHIC CIRCLE POLYGON
// ============================================================================

const EARTH_RADIUS_M = 6371000

/**
 * Generates a GeoJSON Polygon approximating a circle on the Earth's surface.
 * MapLibre's CircleLayer is screen-space (fixed pixel size), so we need
 * actual polygon geometry for meter-based geofence circles.
 */
export function createCirclePolygon(
  center: [number, number], // [lon, lat]
  radiusMeters: number,
  numPoints: number = 64
): GeoJSON.Polygon {
  const [lon, lat] = center
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180
  const d = radiusMeters / EARTH_RADIUS_M

  const coords: [number, number][] = []
  for (let i = 0; i <= numPoints; i++) {
    const bearing = (2 * Math.PI * i) / numPoints
    const pLat = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearing))
    const pLon =
      lonRad +
      Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(latRad), Math.cos(d) - Math.sin(latRad) * Math.sin(pLat))
    coords.push([(pLon * 180) / Math.PI, (pLat * 180) / Math.PI])
  }

  return { type: "Polygon", coordinates: [coords] }
}

// ============================================================================
// GEOJSON BUILDERS
// ============================================================================

export interface TrackLocation {
  id?: number
  latitude: number
  longitude: number
  timestamp?: number
  accuracy?: number
  speed?: number
  altitude?: number
  note?: string
}

interface TrackSegmentOptions {
  skipIndices?: Set<number>
  locationColors?: string[]
  defaultColor?: string
  /** Trip index per location, -1 outside any trip. */
  locationTrips?: ArrayLike<number>
  focusedTrip?: number | null
}

/** Build LineString features with a pre-computed `color` property.
 *  Consecutive segments of the same color are merged into a single multi-point LineString
 *  to keep feature count low on long trips (O(color changes) instead of O(points)).
 *  Pass `skipIndices` to leave gaps between trips (indices where a new trip starts).
 *  Pass `locationColors` to override speed-based coloring with per-location colors.
 *  Pass `locationTrips` to stamp each feature with its `tripIndex` and a `focused` flag. */
export function buildTrackSegmentsGeoJSON(
  locations: TrackLocation[],
  _colors: ThemeColors,
  options?: TrackSegmentOptions
): GeoJSON.FeatureCollection {
  const { skipIndices, locationColors, defaultColor, locationTrips, focusedTrip } = options ?? {}
  const features: GeoJSON.Feature[] = []

  let currentColor: string | null = null
  let currentTrip = -1
  let currentCoords: [number, number][] = []

  const flush = () => {
    if (currentCoords.length >= 2 && currentColor !== null) {
      features.push({
        type: "Feature",
        properties: {
          color: currentColor,
          tripIndex: currentTrip,
          focused: focusedTrip != null && currentTrip === focusedTrip
        },
        geometry: { type: "LineString", coordinates: currentCoords }
      })
    }
    currentCoords = []
    currentColor = null
    currentTrip = -1
  }

  for (let i = 1; i < locations.length; i++) {
    if (skipIndices?.has(i)) {
      flush()
      continue
    }

    const color = defaultColor
      ? defaultColor
      : locationColors
        ? locationColors[i]
        : getSpeedColor(((locations[i - 1].speed ?? 0) + (locations[i].speed ?? 0)) / 2)
    const trip = locationTrips ? locationTrips[i] : -1

    if (currentColor === null) {
      currentCoords.push([locations[i - 1].longitude, locations[i - 1].latitude])
      currentCoords.push([locations[i].longitude, locations[i].latitude])
      currentColor = color
      currentTrip = trip
    } else if (color === currentColor && trip === currentTrip) {
      currentCoords.push([locations[i].longitude, locations[i].latitude])
    } else {
      flush()
      currentCoords.push([locations[i - 1].longitude, locations[i - 1].latitude])
      currentCoords.push([locations[i].longitude, locations[i].latitude])
      currentColor = color
      currentTrip = trip
    }
  }
  flush()

  return { type: "FeatureCollection", features }
}

export type TerminalTrip = { index: number; color: string; locations: TrackLocation[] }

/** Build one Point per trip end: a `start` and an `end`, in the trip's colour, flagged when focused. */
export function buildTripTerminalsGeoJSON(
  trips: TerminalTrip[],
  focusedTrip?: number | null
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const trip of trips) {
    const first = trip.locations[0]
    const last = trip.locations[trip.locations.length - 1]
    if (!first || !last || first === last) continue
    const focused = focusedTrip != null && trip.index === focusedTrip
    for (const [kind, loc] of [
      ["start", first],
      ["end", last]
    ] as const) {
      features.push({
        type: "Feature",
        properties: { kind, trip: trip.index, color: trip.color, focused },
        geometry: { type: "Point", coordinates: [loc.longitude, loc.latitude] }
      })
    }
  }
  return { type: "FeatureCollection", features }
}

/** Build Point features for each track location with metadata properties.
 *  Pass `locationColors` to override speed-based dot coloring. */
export function buildTrackPointsGeoJSON(
  locations: TrackLocation[],
  _colors: ThemeColors,
  locationColors?: string[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.map((loc, i) => ({
      type: "Feature" as const,
      properties: {
        id: loc.id ?? -1,
        speed: loc.speed ?? 0,
        timestamp: loc.timestamp ?? 0,
        accuracy: loc.accuracy ?? 0,
        altitude: loc.altitude ?? 0,
        note: loc.note ?? "",
        color: locationColors ? locationColors[i] : getSpeedColor(loc.speed ?? 0)
      },
      geometry: {
        type: "Point" as const,
        coordinates: [loc.longitude, loc.latitude]
      }
    }))
  }
}

/** Build geofence circle polygons + label points as separate FeatureCollections */
export function buildGeofencesGeoJSON(
  geofences: Geofence[],
  colors: ThemeColors
): { fills: GeoJSON.FeatureCollection; labels: GeoJSON.FeatureCollection } {
  const fills: GeoJSON.Feature[] = []
  const labels: GeoJSON.Feature[] = []

  for (const zone of geofences) {
    const fillColor = zone.pauseTracking ? colors.warning : colors.info
    fills.push({
      type: "Feature",
      properties: {
        id: zone.id,
        name: zone.name,
        fillColor,
        fillOpacity: 0.3,
        strokeColor: fillColor,
        pauseTracking: zone.pauseTracking,
        radius: zone.radius
      },
      geometry: createCirclePolygon([zone.lon, zone.lat], zone.radius)
    })

    labels.push({
      type: "Feature",
      properties: {
        name: zone.name,
        textColor: fillColor
      },
      geometry: {
        type: "Point",
        coordinates: [zone.lon, zone.lat]
      }
    })
  }

  return {
    fills: { type: "FeatureCollection", features: fills },
    labels: { type: "FeatureCollection", features: labels }
  }
}

/** Compute the bounding box [sw, ne] for a set of track locations */
export function computeTrackBounds(locations: TrackLocation[]): { sw: [number, number]; ne: [number, number] } | null {
  if (locations.length === 0) return null
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity
  for (const loc of locations) {
    if (loc.longitude < minLon) minLon = loc.longitude
    if (loc.latitude < minLat) minLat = loc.latitude
    if (loc.longitude > maxLon) maxLon = loc.longitude
    if (loc.latitude > maxLat) maxLat = loc.latitude
  }
  return {
    sw: [minLon, minLat],
    ne: [maxLon, maxLat]
  }
}

// ============================================================================
// DARK MODE STYLE TRANSFORMATION
// ============================================================================

// Base
const DARK_BG = "#1a1a2e"
const DARK_WATER = "#0d1b2a"
const DARK_LAND = "#16213e"

// Nature
const DARK_PARK = "#162e20"
const DARK_WOOD = "#132618"
const DARK_SAND = "#2a2820"

// Land use
const DARK_RESIDENTIAL = "#181c36"
const DARK_COMMERCIAL = "#1a1a32"

// Buildings
const DARK_BUILDING = "#252545"
const DARK_BUILDING_OUTLINE = "#3a3a60"

// Roads
const DARK_ROAD = "#2a2a4a"
const DARK_ROAD_SECONDARY = "#323252"
const DARK_ROAD_MAJOR = "#3a3a5c"
const DARK_RAILWAY = "#3d3050"

// Other
const DARK_BORDER = "#4a4a6a"
const DARK_TEXT = "#c8c8d8"
const DARK_TEXT_HALO = "#1a1a2e"

/**
 * Transforms a vector tile style JSON into a dark theme variant.
 * Deep-clones the style and overrides paint properties by matching layer IDs.
 *
 * Tuned for OpenFreeMap "bright" style layer naming conventions.
 */
export function darkifyStyle(style: any): object {
  const result = JSON.parse(JSON.stringify(style))

  for (const layer of result.layers ?? []) {
    const id: string = layer.id ?? ""
    const type: string = layer.type ?? ""
    if (!layer.paint) layer.paint = {}

    if (type === "background") {
      layer.paint["background-color"] = DARK_BG
    } else if (type === "fill") {
      if (id.includes("water") || id.includes("glacier") || id.includes("ice")) {
        layer.paint["fill-color"] = DARK_WATER
      } else if (id.includes("building")) {
        layer.paint["fill-color"] = DARK_BUILDING
        layer.paint["fill-outline-color"] = DARK_BUILDING_OUTLINE
      } else if (id.includes("wood")) {
        layer.paint["fill-color"] = DARK_WOOD
      } else if (id.includes("park") || id.includes("grass")) {
        layer.paint["fill-color"] = DARK_PARK
      } else if (id.includes("sand")) {
        layer.paint["fill-color"] = DARK_SAND
      } else if (id.includes("residential") || id.includes("suburb")) {
        layer.paint["fill-color"] = DARK_RESIDENTIAL
      } else if (id.includes("commercial") || id.includes("industrial")) {
        layer.paint["fill-color"] = DARK_COMMERCIAL
      } else {
        layer.paint["fill-color"] = DARK_LAND
      }
    } else if (type === "line") {
      if (id.includes("boundary") || id.includes("admin")) {
        layer.paint["line-color"] = DARK_BORDER
      } else if (id.includes("water")) {
        layer.paint["line-color"] = DARK_WATER
      } else if (id.includes("railway") || id.includes("rail")) {
        layer.paint["line-color"] = DARK_RAILWAY
      } else if (id.includes("motorway") || id.includes("trunk") || id.includes("primary")) {
        layer.paint["line-color"] = DARK_ROAD_MAJOR
      } else if (id.includes("secondary") || id.includes("tertiary")) {
        layer.paint["line-color"] = DARK_ROAD_SECONDARY
      } else {
        layer.paint["line-color"] = DARK_ROAD
      }
    } else if (type === "symbol") {
      layer.paint["text-color"] = DARK_TEXT
      layer.paint["text-halo-color"] = DARK_TEXT_HALO
      layer.paint["text-halo-width"] = 1
    }
  }

  return result
}

const METERS_PER_DEGREE = 111_320

/** The box around every zone's circle, for fitBounds. */
export function geofenceBounds(geofences: Geofence[]): [number, number, number, number] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const zone of geofences) {
    const dLat = zone.radius / METERS_PER_DEGREE
    const dLon = zone.radius / (METERS_PER_DEGREE * Math.cos((zone.lat * Math.PI) / 180))
    west = Math.min(west, zone.lon - dLon)
    east = Math.max(east, zone.lon + dLon)
    south = Math.min(south, zone.lat - dLat)
    north = Math.max(north, zone.lat + dLat)
  }
  return [west, south, east, north]
}

/** A zone circle takes a 48 dp target like a point does. */
export const ZONE_HITBOX = { top: size.touch / 2, right: size.touch / 2, bottom: size.touch / 2, left: size.touch / 2 }

/** Where circles overlap, the smallest is the one the finger meant; it is the one the others hide. */
export function pickSmallestZone(features: GeoJSON.Feature[]): number | null {
  let best: { id: number; radius: number } | null = null
  for (const f of features) {
    const id = f.properties?.id
    const radius = f.properties?.radius ?? Infinity
    if (typeof id !== "number") continue
    if (!best || radius < best.radius) best = { id, radius }
  }
  return best?.id ?? null
}
