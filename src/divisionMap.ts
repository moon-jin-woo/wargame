import type { DivisionUnit, GameState } from './types'

export const DIVISION_SOURCE_ID = 'division-units'
export const DIVISION_SHADOW_LAYER_ID = 'division-unit-shadow'
export const DIVISION_LAYER_ID = 'division-unit-circle'

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
      const [dx, dy] = statusOffset(index, divisions.length)
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
          coordinates: [
            territory.centroid[0] + dx,
            territory.centroid[1] + dy,
          ],
        },
      })
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}
