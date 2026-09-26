import type {
  AiCount,
  AiFactionId,
  AttackStance,
  BattleState,
  Difficulty,
  FactionId,
  GameEvent,
  GamePhase,
  GameSpeed,
  GameState,
  PlayableFactionId,
  ProductionOrder,
} from './types'

const SAVE_KEY = 'wargame-save-v1'
const VALID_OWNERS = new Set<FactionId>(['player', 'red', 'blue', 'green', 'neutral'])
const VALID_PHASES = new Set<GamePhase>(['setup', 'running', 'victory', 'defeat'])
const VALID_DIFFICULTIES = new Set<Difficulty>(['easy', 'normal', 'hard'])
const VALID_STANCES = new Set<AttackStance>(['cautious', 'balanced', 'aggressive'])

type SavedTerritory = {
  owner: FactionId
  troops?: number
  supply: number
  factories?: number
  divisions?: number
  defense?: number
}

type SavedGame = {
  schema: 1 | 2 | 3 | 4 | 5 | 6
  savedAt: number
  tick: number
  speed: GameSpeed
  phase: GamePhase
  selectedId: string | null
  playerName: string
  dataVersion: string
  aiCount?: AiCount
  difficulty?: Difficulty
  aiNames?: Record<AiFactionId, string>
  factionColors?: Record<PlayableFactionId, string>
  funds?: Record<PlayableFactionId, number>
  attackStance?: AttackStance
  autoOffensive?: boolean
  events?: GameEvent[]
  productionQueue?: ProductionOrder[]
  battles?: BattleState[]
  territories: Record<string, SavedTerritory>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isSpeed(value: unknown): value is GameSpeed {
  return value === 1 || value === 2 || value === 4 || value === 10
}

function isAiCount(value: unknown): value is AiCount {
  return value === 1 || value === 2 || value === 3
}

function validProductionOrders(
  orders: unknown,
  territories: GameState['territories'],
): ProductionOrder[] {
  if (!Array.isArray(orders)) return []

  return orders
    .filter((order): order is ProductionOrder => {
      if (!order || typeof order !== 'object') return false
      const candidate = order as ProductionOrder
      return (
        typeof candidate.id === 'string' &&
        (candidate.owner === 'player' ||
          candidate.owner === 'red' ||
          candidate.owner === 'blue' ||
          candidate.owner === 'green') &&
        typeof candidate.territoryId === 'string' &&
        Boolean(territories[candidate.territoryId]) &&
        (candidate.kind === 'factory' ||
          candidate.kind === 'division' ||
          candidate.kind === 'defense') &&
        Number.isFinite(candidate.cost) &&
        Number.isFinite(candidate.totalTicks) &&
        Number.isFinite(candidate.remainingTicks)
      )
    })
    .map((order) => ({
      ...order,
      cost: Math.max(0, Math.floor(order.cost)),
      totalTicks: Math.max(1, Math.floor(order.totalTicks)),
      remainingTicks: Math.max(1, Math.floor(order.remainingTicks)),
      queuedTick: Math.max(0, Math.floor(order.queuedTick || 0)),
    }))
    .slice(0, 80)
}

function validBattles(
  battles: unknown,
  territories: GameState['territories'],
): BattleState[] {
  if (!Array.isArray(battles)) return []

  return battles
    .filter((battle): battle is BattleState => {
      if (!battle || typeof battle !== 'object') return false
      const candidate = battle as BattleState
      return (
        typeof candidate.id === 'string' &&
        (candidate.attacker === 'player' ||
          candidate.attacker === 'red' ||
          candidate.attacker === 'blue' ||
          candidate.attacker === 'green') &&
        VALID_OWNERS.has(candidate.defender) &&
        typeof candidate.fromId === 'string' &&
        typeof candidate.toId === 'string' &&
        Boolean(territories[candidate.fromId]) &&
        Boolean(territories[candidate.toId]) &&
        Number.isFinite(candidate.committedDivisions) &&
        Number.isFinite(candidate.progress) &&
        VALID_STANCES.has(candidate.stance)
      )
    })
    .map((battle) => ({
      ...battle,
      committedDivisions: Math.max(
        1,
        Math.floor(battle.committedDivisions),
      ),
      progress: clamp(Number(battle.progress), -99, 99),
      startedTick: Math.max(0, Math.floor(battle.startedTick || 0)),
    }))
    .slice(0, 20)
}

export function saveGame(state: GameState): number {
  const savedAt = Date.now()
  const territories = Object.fromEntries(
    Object.entries(state.territories).map(([id, territory]) => [
      id,
      {
        owner: territory.owner,
        troops: Math.round(territory.troops * 10) / 10,
        supply: Math.round(territory.supply * 10) / 10,
        factories: territory.factories,
        divisions: territory.divisions,
        defense: territory.defense,
      },
    ]),
  )

  const payload: SavedGame = {
    schema: 6,
    savedAt,
    tick: state.tick,
    speed: state.speed,
    phase: state.phase,
    selectedId: state.selectedId,
    playerName: state.playerName,
    dataVersion: state.dataVersion,
    aiCount: state.aiCount,
    difficulty: state.difficulty,
    aiNames: state.aiNames,
    factionColors: state.factionColors,
    funds: state.funds,
    attackStance: state.attackStance,
    autoOffensive: state.autoOffensive,
    events: state.events.slice(0, 60),
    productionQueue: state.productionQueue,
    battles: state.battles,
    territories,
  }

  localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
  return savedAt
}

export function getSavedAt(): number | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedGame>
    return typeof parsed.savedAt === 'number' ? parsed.savedAt : null
  } catch {
    return null
  }
}

export function restoreGame(base: GameState): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null

    const saved = JSON.parse(raw) as Partial<SavedGame>
    if (
      (saved.schema !== 1 &&
        saved.schema !== 2 &&
        saved.schema !== 3 &&
        saved.schema !== 4 &&
        saved.schema !== 5 &&
        saved.schema !== 6) ||
      !saved.territories ||
      typeof saved.territories !== 'object'
    ) {
      return null
    }

    const territories = { ...base.territories }

    for (const [id, dynamic] of Object.entries(saved.territories)) {
      const current = territories[id]
      if (!current || !dynamic || typeof dynamic !== 'object') continue

      const owner = VALID_OWNERS.has(dynamic.owner as FactionId)
        ? (dynamic.owner as FactionId)
        : current.owner
      const troops = Number.isFinite(dynamic.troops)
        ? clamp(Number(dynamic.troops), 0, 999)
        : current.troops
      const supply = Number.isFinite(dynamic.supply)
        ? clamp(Number(dynamic.supply), 0, 100)
        : current.supply
      const factories = Number.isFinite(dynamic.factories)
        ? clamp(Math.floor(Number(dynamic.factories)), 0, 4)
        : current.factories
      const divisions = Number.isFinite(dynamic.divisions)
        ? clamp(Math.floor(Number(dynamic.divisions)), 0, 99)
        : Math.max(0, Math.round(troops / 35))
      const defense = Number.isFinite(dynamic.defense)
        ? clamp(Math.floor(Number(dynamic.defense)), 0, 4)
        : current.defense

      territories[id] = {
        ...current,
        owner,
        troops,
        supply,
        factories,
        divisions,
        defense,
      }
    }

    const phase = VALID_PHASES.has(saved.phase as GamePhase)
      ? (saved.phase as GamePhase)
      : base.phase

    const selectedId =
      typeof saved.selectedId === 'string' && territories[saved.selectedId]
        ? saved.selectedId
        : base.selectedId

    const difficulty = VALID_DIFFICULTIES.has(saved.difficulty as Difficulty)
      ? (saved.difficulty as Difficulty)
      : base.difficulty

    const aiNames = { ...base.aiNames }
    for (const id of ['red', 'blue', 'green'] as AiFactionId[]) {
      const value = saved.aiNames?.[id]
      if (typeof value === 'string') {
        aiNames[id] = value.slice(0, 24)
      }
    }

    const factionColors = { ...base.factionColors }
    for (const id of ['player', 'red', 'blue', 'green'] as PlayableFactionId[]) {
      const value = saved.factionColors?.[id]
      if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
        factionColors[id] = value
      }
    }

    const funds = { ...base.funds }
    for (const id of ['player', 'red', 'blue', 'green'] as PlayableFactionId[]) {
      const value = saved.funds?.[id]
      if (typeof value === 'number' && Number.isFinite(value)) {
        funds[id] = clamp(Math.floor(value), 0, 999999)
      }
    }

    const attackStance = VALID_STANCES.has(saved.attackStance as AttackStance)
      ? (saved.attackStance as AttackStance)
      : base.attackStance

    return {
      ...base,
      phase,
      running: false,
      speed: isSpeed(saved.speed) ? saved.speed : base.speed,
      tick:
        typeof saved.tick === 'number' && Number.isFinite(saved.tick)
          ? Math.max(0, saved.tick)
          : base.tick,
      selectedId,
      playerName:
        typeof saved.playerName === 'string'
          ? saved.playerName.slice(0, 24)
          : base.playerName,
      aiCount: isAiCount(saved.aiCount) ? saved.aiCount : base.aiCount,
      difficulty,
      aiNames,
      factionColors,
      funds,
      attackStance,
      autoOffensive:
        typeof saved.autoOffensive === 'boolean'
          ? saved.autoOffensive
          : base.autoOffensive,
      events: Array.isArray(saved.events)
        ? saved.events.slice(0, 60)
        : base.events,
      productionQueue: validProductionOrders(
        saved.productionQueue,
        territories,
      ),
      battles: validBattles(saved.battles, territories),
      territories,
    }
  } catch {
    return null
  }
}
