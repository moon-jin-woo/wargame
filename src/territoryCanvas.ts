import type { Map as MapLibreMap } from 'maplibre-gl'
import type { AdminMapData, GameState } from './types'
import { factions } from './game'

type Position = [number, number]
type Ring = Position[]
type PolygonCoordinates = Ring[]
type MultiPolygonCoordinates = PolygonCoordinates[]

function polygonSets(feature: AdminMapData['collection']['features'][number]): PolygonCoordinates[] {
  if (feature.geometry.type === 'Polygon') {
    return [feature.geometry.coordinates as PolygonCoordinates]
  }

  return feature.geometry.coordinates as MultiPolygonCoordinates
}

function ownerColor(owner: string, game: GameState): string {
  if (owner === 'neutral') return factions.neutral.color
  if (owner === 'player') return game.factionColors.player
  if (owner === 'red' || owner === 'blue' || owner === 'green') {
    return game.factionColors[owner]
  }
  return factions.neutral.color
}

export function drawTerritoryCanvas(
  canvas: HTMLCanvasElement,
  map: MapLibreMap,
  adminData: AdminMapData,
  game: GameState,
): void {
  const rect = map.getContainer().getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.round(rect.width * dpr)
  const height = Math.round(rect.height * dpr)

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const zoom = map.getZoom()
  const ordinaryWidth = zoom < 7 ? 0.8 : zoom < 9 ? 1.1 : 1.5

  for (const feature of adminData.collection.features) {
    const id = String(feature.properties.gameId ?? feature.id ?? '')
    const territory = game.territories[id]
    if (!territory) continue

    ctx.beginPath()

    for (const polygon of polygonSets(feature)) {
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 3) continue

        const first = map.project(ring[0])
        ctx.moveTo(first.x, first.y)

        for (let i = 1; i < ring.length; i += 1) {
          const point = map.project(ring[i])
          ctx.lineTo(point.x, point.y)
        }

        ctx.closePath()
      }
    }

    ctx.fillStyle = ownerColor(territory.owner, game)
    ctx.globalAlpha = territory.owner === 'neutral' ? 0.28 : 0.56
    ctx.fill('evenodd')
    ctx.globalAlpha = 1

    const selected = game.selectedId === id
    const frontline =
      territory.owner !== 'neutral' &&
      territory.neighbors.some(
        (neighborId) =>
          game.territories[neighborId] &&
          game.territories[neighborId].owner !== territory.owner,
      )

    ctx.strokeStyle = selected
      ? '#ffffff'
      : frontline
        ? '#f2b35f'
        : 'rgba(219, 228, 238, 0.72)'
    ctx.lineWidth = selected ? 3.2 : frontline ? 2 : ordinaryWidth
    ctx.stroke()
  }
}

function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi

    if (intersects) inside = !inside
  }

  return inside
}

function pointInPolygon(point: Position, polygon: PolygonCoordinates): boolean {
  const outer = polygon[0]
  if (!outer || !pointInRing(point, outer)) return false

  for (const hole of polygon.slice(1)) {
    if (pointInRing(point, hole)) return false
  }

  return true
}

export function findTerritoryAtLngLat(
  adminData: AdminMapData,
  lng: number,
  lat: number,
): string | null {
  const point: Position = [lng, lat]

  for (const feature of adminData.collection.features) {
    const id = String(feature.properties.gameId ?? feature.id ?? '')
    if (!id) continue

    for (const polygon of polygonSets(feature)) {
      const outer = polygon[0]
      if (!outer || outer.length < 3) continue

      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY

      for (const [x, y] of outer) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }

      if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue
      if (pointInPolygon(point, polygon)) return id
    }
  }

  return null
}
