export type FactionId = 'player' | 'red' | 'blue' | 'green' | 'neutral'
export type AiFactionId = 'red' | 'blue' | 'green'
export type PlayableFactionId = 'player' | AiFactionId
export type GamePhase = 'setup' | 'running' | 'victory' | 'defeat'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type AiCount = 1 | 2 | 3
export type GameSpeed = 1 | 2 | 4 | 10
export type AttackStance = 'cautious' | 'balanced' | 'aggressive'
export type ProductionKind = 'factory' | 'division' | 'defense'
export type DivisionStatus =
  | 'idle'
  | 'moving'
  | 'attacking'
  | 'defending'
  | 'retreating'
export type DivisionOrderKind = 'move' | 'attack'
export type GameEventKind =
  | 'system'
  | 'capture'
  | 'defense'
  | 'support'
  | 'economy'
  | 'military'
  | 'production'
  | 'battle'
  | 'movement'

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

export interface ProductionOrder {
  id: string
  owner: PlayableFactionId
  territoryId: string
  kind: ProductionKind
  cost: number
  totalTicks: number
  remainingTicks: number
  queuedTick: number
}

export interface DivisionState {
  id: string
  owner: PlayableFactionId
  name: string
  commanderName: string
  locationId: string
  strength: number
  organization: number
  experience: number
  status: DivisionStatus
  orderId: string | null
  battleId: string | null
}

export interface DivisionOrder {
  id: string
  owner: PlayableFactionId
  divisionIds: string[]
  fromId: string
  targetId: string
  path: string[]
  stepIndex: number
  remainingTicks: number
  kind: DivisionOrderKind
  createdTick: number
}

export interface BattleState {
  id: string
  attacker: PlayableFactionId
  defender: FactionId
  fromId: string
  toId: string
  divisionIds: string[]
  defenderDivisionIds: string[]
  committedDivisions: number
  progress: number
  stance: AttackStance
  startedTick: number
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
  factories: number
  divisions: number
  defense: number
  neighbors: string[]
  centroid: [number, number]
}

export interface GameState {
  phase: GamePhase
  running: boolean
  speed: GameSpeed
  tick: number
  selectedId: string | null
  playerName: string
  aiNames: Record<AiFactionId, string>
  factionColors: Record<PlayableFactionId, string>
  funds: Record<PlayableFactionId, number>
  aiCount: AiCount
  difficulty: Difficulty
  attackStance: AttackStance
  autoOffensive: boolean
  dataVersion: string
  events: GameEvent[]
  productionQueue: ProductionOrder[]
  divisions: Record<string, DivisionState>
  divisionOrders: DivisionOrder[]
  divisionSerials: Record<PlayableFactionId, number>
  battles: BattleState[]
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
