export type FactionId = 'player' | 'red' | 'blue' | 'green' | 'neutral'
export type AiFactionId = 'red' | 'blue' | 'green'
export type PlayableFactionId = 'player' | AiFactionId
export type GamePhase = 'setup' | 'running' | 'victory' | 'defeat'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type AiCount = 1 | 2 | 3
export type GameEventKind = 'system' | 'capture' | 'defense' | 'support'

export interface Faction {
  id: FactionId
  name: string
  color: string
}

export interface GameEvent {
  id: string
  tick: number
  kind: GameEventKind
  message: string
}

export interface TerritoryState {
  id: string
  name: string
  fullName: string
  sidoName: string
  sggName: string
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
  aiNames: Record<AiFactionId, string>
  factionColors: Record<PlayableFactionId, string>
  aiCount: AiCount
  difficulty: Difficulty
  dataVersion: string
  events: GameEvent[]
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
