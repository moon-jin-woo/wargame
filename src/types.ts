export type FactionId = 'player' | 'red' | 'blue' | 'green' | 'neutral'
export type GamePhase = 'setup' | 'running' | 'victory' | 'defeat'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type AiCount = 1 | 2 | 3

export interface Faction {
  id: FactionId
  name: string
  color: string
}

export interface TerritoryState {
  id: string
  name: string
  fullName: string
  owner: FactionId
  troops: number
  supply: number
  neighbors: string[]
  centroid: [number, number]
}

export interface GameState {
  phase: GamePhase
  running: boolean
  speed: 1 | 2 | 4
  tick: number
  selectedId: string | null
  playerName: string
  aiCount: AiCount
  difficulty: Difficulty
  dataVersion: string
  territories: Record<string, TerritoryState>
}

export interface AdminMapData {
  version: string
  collection: {
    type: 'FeatureCollection'
    features: Array<{
      type: 'Feature'
      id?: string | number
      properties: Record<string, unknown>
      geometry: {
        type: 'Polygon' | 'MultiPolygon'
        coordinates: unknown
      }
    }>
  }
  territories: Record<string, TerritoryState>
}
