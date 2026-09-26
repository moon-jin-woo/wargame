import type {
  AiCount,
  AiFactionId,
  AttackStance,
  BattleState,
  Difficulty,
  DivisionOrder,
  DivisionState,
  DivisionStatus,
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
const VALID_PLAYABLE = new Set<PlayableFactionId>(['player', 'red', 'blue', 'green'])
const VALID_PHASES = new Set<GamePhase>(['setup', 'running', 'victory', 'defeat'])
const VALID_DIFFICULTIES = new Set<Difficulty>(['easy', 'normal', 'hard'])
const VALID_STANCES = new Set<AttackStance>(['cautious', 'balanced', 'aggressive'])
const VALID_DIVISION_STATUS = new Set<DivisionStatus>([
  'idle',
  'moving',
  'attacking',
  'defending',
  'retreating',
])

type SavedTerritory = {
  owner: FactionId
  troops?: number
  supply: number
  factories?: number
  divisions?: number
  defense?: number
}

type SavedGame = {
  schema: 1 | 2 | 3 | 4 | 5 | 6 | 7
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
  divisions?: Record<string, DivisionState>
  divisionOrders?: DivisionOrder[]
  divisionSerials?: Record<PlayableFactionId, number>
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
        VALID_PLAYABLE.has(candidate.owner) &&
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
    .slice(0, 120)
}

function legacyCommander(serial: number): string {
  const surnames = ['강', '김', '박', '서', '윤', '이', '정', '최']
  const names = ['도현', '민재', '서준', '유진', '지훈', '태윤', '현우', '성민']
  return `${surnames[serial % surnames.length]}${names[(serial * 3) % names.length]}`
}

function materializeLegacyDivisions(
  territories: GameState['territories'],
): {
  divisions: Record<string, DivisionState>
  serials: Record<PlayableFactionId, number>
} {
  const divisions: Record<string, DivisionState> = {}
  const serials: Record<PlayableFactionId, number> = {
    player: 0,
    red: 0,
    blue: 0,
    green: 0,
  }

  for (const territory of Object.values(territories)) {
    if (territory.owner === 'neutral') continue
    const owner = territory.owner as PlayableFactionId
    const count = Math.max(0, Math.floor(territory.divisions))

    for (let index = 0; index < count; index += 1) {
      serials[owner] += 1
      const serial = serials[owner]
      const id = `legacy-${owner}-division-${serial}-${territory.id}`
      divisions[id] = {
        id,
        owner,
        name: `제${serial}보병사단`,
        commanderName: legacyCommander(serial),
        locationId: territory.id,
        strength: 100,
        organization: 85,
        experience: 0,
        status: 'idle',
        orderId: null,
        battleId: null,
      }
    }
  }

  return { divisions, serials }
}

function validDivisions(
  raw: unknown,
  territories: GameState['territories'],
): Record<string, DivisionState> {
  if (!raw || typeof raw !== 'object') return {}

  const result: Record<string, DivisionState> = {}

  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const division = value as DivisionState

    if (
      typeof division.id !== 'string' ||
      division.id !== id ||
      !VALID_PLAYABLE.has(division.owner) ||
      typeof division.locationId !== 'string' ||
      !territories[division.locationId] ||
      typeof division.name !== 'string' ||
      typeof division.commanderName !== 'string'
    ) {
      continue
    }

    result[id] = {
      ...division,
      strength: clamp(Number(division.strength) || 0, 0, 100),
      organization: clamp(Number(division.organization) || 0, 0, 100),
      experience: clamp(Number(division.experience) || 0, 0, 5),
      status: VALID_DIVISION_STATUS.has(division.status)
        ? division.status
        : 'idle',
      orderId:
        typeof division.orderId === 'string' ? division.orderId : null,
      battleId:
        typeof division.battleId === 'string' ? division.battleId : null,
    }
  }

  return result
}

function validDivisionOrders(
  raw: unknown,
  divisions: Record<string, DivisionState>,
  territories: GameState['territories'],
): DivisionOrder[] {
  if (!Array.isArray(raw)) return []

  return raw
    .filter((value): value is DivisionOrder => {
      if (!value || typeof value !== 'object') return false
      const order = value as DivisionOrder
      return (
        typeof order.id === 'string' &&
        VALID_PLAYABLE.has(order.owner) &&
        Array.isArray(order.divisionIds) &&
        order.divisionIds.length > 0 &&
        order.divisionIds.every((id) => Boolean(divisions[id])) &&
        typeof order.fromId === 'string' &&
        typeof order.targetId === 'string' &&
        Boolean(territories[order.fromId]) &&
        Boolean(territories[order.targetId]) &&
        Array.isArray(order.path) &&
        order.path.every((id) => Boolean(territories[id])) &&
        (order.kind === 'move' || order.kind === 'attack')
      )
    })
    .map((order) => ({
      ...order,
      stepIndex: clamp(Math.floor(order.stepIndex || 0), 0, Math.max(0, order.path.length - 1)),
      remainingTicks: Math.max(1, Math.floor(order.remainingTicks || 1)),
      createdTick: Math.max(0, Math.floor(order.createdTick || 0)),
    }))
    .slice(0, 80)
}

function validBattles(
  raw: unknown,
  divisions: Record<string, DivisionState>,
  territories: GameState['territories'],
): BattleState[] {
  if (!Array.isArray(raw)) return []

  return raw
    .filter((value): value is BattleState => {
      if (!value || typeof value !== 'object') return false
      const battle = value as BattleState
      return (
        typeof battle.id === 'string' &&
        VALID_PLAYABLE.has(battle.attacker) &&
        VALID_OWNERS.has(battle.defender) &&
        Boolean(territories[battle.fromId]) &&
        Boolean(territories[battle.toId]) &&
        Array.isArray(battle.divisionIds) &&
        battle.divisionIds.every((id) => Boolean(divisions[id])) &&
        Array.isArray(battle.defenderDivisionIds) &&
        battle.defenderDivisionIds.every((id) => Boolean(divisions[id])) &&
        VALID_STANCES.has(battle.stance)
      )
    })
    .map((battle) => ({
      ...battle,
      committedDivisions: battle.divisionIds.length,
      progress: clamp(Number(battle.progress) || 0, -99, 99),
      startedTick: Math.max(0, Math.floor(battle.startedTick || 0)),
    }))
    .slice(0, 30)
}

function recountTerritories(
  territories: GameState['territories'],
  divisions: Record<string, DivisionState>,
): GameState['territories'] {
  const counts: Record<string, number> = {}
  for (const division of Object.values(divisions)) {
    counts[division.locationId] = (counts[division.locationId] ?? 0) + 1
  }

  return Object.fromEntries(
    Object.entries(territories).map(([id, territory]) => [
      id,
      {
        ...territory,
        divisions: counts[id] ?? 0,
      },
    ]),
  )
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
    schema: 7,
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
    events: state.events.slice(0, 80),
    productionQueue: state.productionQueue,
    divisions: state.divisions,
    divisionOrders: state.divisionOrders,
    divisionSerials: state.divisionSerials,
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
      !saved.schema ||
      saved.schema < 1 ||
      saved.schema > 7 ||
      !saved.territories ||
      typeof saved.territories !== 'object'
    ) {
      return null
    }

    let territories = { ...base.territories }

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
        : current.divisions
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

    let divisions: Record<string, DivisionState>
    let serials: Record<PlayableFactionId, number>

    if (saved.schema === 7) {
      divisions = validDivisions(saved.divisions, territories)
      const savedSerials = saved.divisionSerials
      serials = {
        player: Math.max(0, Math.floor(savedSerials?.player ?? 0)),
        red: Math.max(0, Math.floor(savedSerials?.red ?? 0)),
        blue: Math.max(0, Math.floor(savedSerials?.blue ?? 0)),
        green: Math.max(0, Math.floor(savedSerials?.green ?? 0)),
      }
    } else {
      const migrated = materializeLegacyDivisions(territories)
      divisions = migrated.divisions
      serials = migrated.serials
    }

    territories = recountTerritories(territories, divisions)

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
      if (typeof value === 'string') aiNames[id] = value.slice(0, 24)
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

    const productionQueue = validProductionOrders(
      saved.productionQueue,
      territories,
    )
    const divisionOrders =
      saved.schema === 7
        ? validDivisionOrders(saved.divisionOrders, divisions, territories)
        : []
    const battles =
      saved.schema === 7
        ? validBattles(saved.battles, divisions, territories)
        : []

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
        ? saved.events.slice(0, 80)
        : base.events,
      productionQueue,
      divisions,
      divisionOrders,
      divisionSerials: serials,
      battles,
      territories,
    }
  } catch {
    return null
  }
}
