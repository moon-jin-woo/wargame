import type { DivisionUnit, GameState } from './types'

export const DIVISION_SOURCE_ID = 'division-units'
export const DIVISION_SHADOW_LAYER_ID = 'division-unit-shadow'
export const DIVISION_LAYER_ID = 'division-unit-circle'
export const DIVISION_ORDER_SOURCE_ID = 'division-orders'
export const DIVISION_ORDER_LAYER_ID = 'division-order-line'

type DivisionFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: string
    properties: {
      divisionId: string
      owner: string
      name: string
      commander: string
      status: string
      selected: boolean
      color: string
      strength: number
      organization: number
    }
    geometry: {
      type: 'Point'
      coordinates: [number, number]
    }
  }>
}

type OrderFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: string
    properties: {
      divisionId: string
      status: string
    }
    geometry: {
      type: 'LineString'
      coordinates: [number, number][]
    }
  }>
}

function statusOffset(index: number, count: number): [number, number] {
  if (count <= 1) return [0, 0]

  const ring = Math.floor(index / 8)
  const slot = index % 8
  const radius = 0.0065 + ring * 0.004
  const angle = (slot / Math.min(8, count)) * Math.PI * 2

  return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.75]
}

function divisionColor(division: DivisionUnit, game: GameState): string {
  const base = game.factionColors[division.owner]

  if (division.status === 'battle') return '#d86c53'
  if (division.status === 'moving') return '#c5a45d'
  if (division.status === 'recovering') return '#8f8267'

  return base
}

function interpolatedPosition(
  division: DivisionUnit,
  game: GameState,
): [number, number] | null {
  const current = game.territories[division.territoryId]
  if (!current) return null

  if (division.status !== 'moving' || !division.order) {
    return [...current.centroid]
  }

  const nextId = division.order.path[division.order.nextIndex]
  const next = game.territories[nextId]
  if (!next) return [...current.centroid]

  const progress = Math.max(
    0,
    Math.min(
      1,
      1 - division.order.remainingTicks / division.order.totalTicks,
    ),
  )

  return [
    current.centroid[0] + (next.centroid[0] - current.centroid[0]) * progress,
    current.centroid[1] + (next.centroid[1] - current.centroid[1]) * progress,
  ]
}

export function buildDivisionFeatureCollection(
  game: GameState,
  selectedIds: readonly string[],
): DivisionFeatureCollection {
  const selected = new Set(selectedIds)
  const grouped = new Map<string, DivisionUnit[]>()

  for (const division of Object.values(game.divisions)) {
    const list = grouped.get(division.territoryId) ?? []
    list.push(division)
    grouped.set(division.territoryId, list)
  }

  const features: DivisionFeatureCollection['features'] = []

  for (const [territoryId, divisions] of grouped) {
    const territory = game.territories[territoryId]
    if (!territory) continue

    divisions.sort((a, b) => a.id.localeCompare(b.id))

    divisions.forEach((division, index) => {
      const position = interpolatedPosition(division, game)
      if (!position) return

      const [dx, dy] =
        division.status === 'moving'
          ? [0, 0]
          : statusOffset(index, divisions.length)

      features.push({
        type: 'Feature',
        id: division.id,
        properties: {
          divisionId: division.id,
          owner: division.owner,
          name: division.name,
          commander: division.commander,
          status: division.status,
          selected: selected.has(division.id),
          color: divisionColor(division, game),
          strength: Math.round(division.strength),
          organization: Math.round(division.organization),
        },
        geometry: {
          type: 'Point',
          coordinates: [position[0] + dx, position[1] + dy],
        },
      })
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

export function buildDivisionOrderFeatureCollection(
  game: GameState,
  selectedIds: readonly string[],
): OrderFeatureCollection {
  const features: OrderFeatureCollection['features'] = []

  for (const divisionId of selectedIds) {
    const division = game.divisions[divisionId]
    if (!division?.order || division.status !== 'moving') continue

    const currentPosition = interpolatedPosition(division, game)
    if (!currentPosition) continue

    const coordinates: [number, number][] = [currentPosition]

    for (
      let index = division.order.nextIndex;
      index < division.order.path.length;
      index += 1
    ) {
      const territory = game.territories[division.order.path[index]]
      if (territory) coordinates.push([...territory.centroid])
    }

    if (coordinates.length < 2) continue

    features.push({
      type: 'Feature',
      id: division.id,
      properties: {
        divisionId: division.id,
        status: division.status,
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}
