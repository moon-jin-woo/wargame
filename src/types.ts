export type FactionId = 'player' | 'red' | 'blue' | 'green' | 'neutral'
export type AiFactionId = 'red' | 'blue' | 'green'
export type PlayableFactionId = 'player' | AiFactionId
export type GamePhase = 'setup' | 'running' | 'victory' | 'defeat'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type AiCount = 1 | 2 | 3
export type GameSpeed = 1 | 2 | 4 | 10
export type AttackStance = 'cautious' | 'balanced' | 'aggressive'
export type IndustryType = 'civilian' | 'military' | 'logistics' | 'infrastructure' | 'research'
export type ProductionKind = IndustryType | 'factory' | 'division' | 'defense'
export type TerrainType = 'urban' | 'plains' | 'hills' | 'mountain' | 'forest' | 'coastal' | 'island'
export type TechnologyId = 'industrialMethods' | 'logisticsPlanning' | 'commandNetwork' | 'fieldEngineering'
export type DivisionOrderType = 'move' | 'attack'
export type DivisionStatus = 'idle' | 'moving' | 'attacking' | 'defending'
export type DivisionRole = 'line' | 'mobile' | 'guard'
export type ArmyPlanStatus = 'idle' | 'planning' | 'executing'
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

export interface IndustryState {
  civilian: number
  military: number
  logistics: number
  infrastructure: number
  research: number
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

export interface DivisionOrder {
  type: DivisionOrderType
  targetId: string
  path: string[]
  totalTicks: number
  remainingTicks: number
  issuedTick: number
}

export interface DivisionUnit {
  id: string
  owner: PlayableFactionId
  name: string
  commander: string
  role: DivisionRole
  armyId: string | null
  locationId: string
  strength: number
  organization: number
  experience: number
  entrenchment: number
  status: DivisionStatus
  order: DivisionOrder | null
  createdTick: number
}

export interface ArmyGroup {
  id: string
  owner: PlayableFactionId
  name: string
  commander: string
  divisionIds: string[]
  objectiveId: string | null
  planStatus: ArmyPlanStatus
  preparation: number
  createdTick: number
}

export interface BattleState {
  id: string
  attacker: PlayableFactionId
  defender: FactionId
  fromId: string
  toId: string
  attackerDivisionIds: string[]
  defenderDivisionIds: string[]
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
  industry: IndustryState
  terrain: TerrainType
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
  selectedDivisionId: string | null
  selectedArmyId: string | null
  playerName: string
  aiNames: Record<AiFactionId, string>
  factionColors: Record<PlayableFactionId, string>
  funds: Record<PlayableFactionId, number>
  researchPoints: Record<PlayableFactionId, number>
  technologies: Record<
    PlayableFactionId,
    Record<TechnologyId, number>
  >
  aiCount: AiCount
  difficulty: Difficulty
  attackStance: AttackStance
  autoOffensive: boolean
  dataVersion: string
  events: GameEvent[]
  productionQueue: ProductionOrder[]
  battles: BattleState[]
  divisionUnits: Record<string, DivisionUnit>
  armies: Record<string, ArmyGroup>
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
