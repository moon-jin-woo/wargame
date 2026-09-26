import type {
  AiCount,
  AiFactionId,
  ArmyGroup,
  AttackStance,
  BattleState,
  Difficulty,
  DivisionRole,
  DivisionUnit,
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

type SavedTerritory = {
  owner: FactionId
  troops?: number
  supply: number
  factories?: number
  divisions?: number
  defense?: number
}

type SavedGame = {
  schema: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  savedAt: number
  tick: number
  speed: GameSpeed
  phase: GamePhase
  selectedId: string | null
  selectedDivisionId?: string | null
  selectedArmyId?: string | null
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
  divisionUnits?: Record<string, DivisionUnit>
  armies?: Record<string, ArmyGroup>
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

function validDivisionUnits(
  units: unknown,
  territories: GameState['territories'],
): Record<string, DivisionUnit> {
  if (!units || typeof units !== 'object') return {}

  const result: Record<string, DivisionUnit> = {}

  for (const [id, value] of Object.entries(units)) {
    if (!value || typeof value !== 'object') continue
    const unit = value as DivisionUnit

    if (
      typeof unit.id !== 'string' ||
      unit.id !== id ||
      !VALID_PLAYABLE.has(unit.owner) ||
      typeof unit.locationId !== 'string' ||
      !territories[unit.locationId] ||
      typeof unit.name !== 'string' ||
      typeof unit.commander !== 'string'
    ) {
      continue
    }

    const status =
      unit.status === 'moving' ||
      unit.status === 'attacking' ||
      unit.status === 'defending'
        ? unit.status
        : 'idle'

    const order =
      unit.order &&
      (unit.order.type === 'move' || unit.order.type === 'attack') &&
      territories[unit.order.targetId]
        ? {
            ...unit.order,
            path: Array.isArray(unit.order.path)
              ? unit.order.path.filter(
                  (territoryId) =>
                    typeof territoryId === 'string' &&
                    Boolean(territories[territoryId]),
                )
              : [unit.order.targetId],
            totalTicks: Math.max(0, Math.floor(unit.order.totalTicks || 0)),
            remainingTicks: Math.max(
              0,
              Math.floor(unit.order.remainingTicks || 0),
            ),
            issuedTick: Math.max(0, Math.floor(unit.order.issuedTick || 0)),
          }
        : null

    const role: DivisionRole =
      unit.role === 'mobile' || unit.role === 'guard' ? unit.role : 'line'

    result[id] = {
      ...unit,
      name: unit.name.slice(0, 32),
      commander: unit.commander.slice(0, 24),
      role,
      armyId: typeof unit.armyId === 'string' ? unit.armyId : null,
      strength: clamp(Number(unit.strength) || 0, 0, 100),
      organization: clamp(Number(unit.organization) || 0, 0, 100),
      experience: clamp(Number(unit.experience) || 0, 0, 100),
      entrenchment: clamp(Number(unit.entrenchment) || 0, 0, 100),
      status,
      order,
      createdTick: Math.max(0, Math.floor(unit.createdTick || 0)),
    }
  }

  return result
}

function migratedCommander(index: number): string {
  const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤']
  const given = ['도현', '민재', '서준', '지훈', '현우', '준혁', '태윤', '시우']
  return `${surnames[index % surnames.length]}${
    given[Math.floor(index / surnames.length) % given.length]
  }`
}

function migrateLegacyDivisionCounts(
  territories: GameState['territories'],
  saved: SavedGame,
): Record<string, DivisionUnit> {
  const result: Record<string, DivisionUnit> = {}
  const ownerOrdinal: Record<PlayableFactionId, number> = {
    player: 0,
    red: 0,
    blue: 0,
    green: 0,
  }

  let globalIndex = 0

  for (const [territoryId, territory] of Object.entries(territories)) {
    if (!VALID_PLAYABLE.has(territory.owner as PlayableFactionId)) continue

    const owner = territory.owner as PlayableFactionId
    const savedCount = saved.territories[territoryId]?.divisions
    const count = Number.isFinite(savedCount)
      ? clamp(Math.floor(Number(savedCount)), 0, 24)
      : 0

    for (let index = 0; index < count; index += 1) {
      ownerOrdinal[owner] += 1
      globalIndex += 1
      const ordinal = ownerOrdinal[owner]
      const id = `migrated-${owner}-${territoryId}-${ordinal}`

      result[id] = {
        id,
        owner,
        name:
          owner === 'player'
            ? `제${ordinal}보병사단`
            : `${owner.toUpperCase()}-${ordinal} 사단`,
        commander: migratedCommander(globalIndex),
        role: 'line',
        armyId: null,
        locationId: territoryId,
        strength: 100,
        organization: 80,
        experience: 0,
        entrenchment: 0,
        status: 'idle',
        order: null,
        createdTick: Math.max(0, saved.tick || 0),
      }
    }
  }

  return result
}

function syncDivisionCounts(
  territories: GameState['territories'],
  divisionUnits: Record<string, DivisionUnit>,
): GameState['territories'] {
  const counts: Record<string, number> = {}
  for (const division of Object.values(divisionUnits)) {
    counts[division.locationId] = (counts[division.locationId] ?? 0) + 1
  }

  return Object.fromEntries(
    Object.entries(territories).map(([id, territory]) => [
      id,
      { ...territory, divisions: counts[id] ?? 0 },
    ]),
  )
}

function validArmies(
  armies: unknown,
  territories: GameState['territories'],
  divisionUnits: Record<string, DivisionUnit>,
): Record<string, ArmyGroup> {
  if (!armies || typeof armies !== 'object') return {}

  const result: Record<string, ArmyGroup> = {}

  for (const [id, value] of Object.entries(armies)) {
    if (!value || typeof value !== 'object') continue
    const army = value as ArmyGroup

    if (
      typeof army.id !== 'string' ||
      army.id !== id ||
      !VALID_PLAYABLE.has(army.owner) ||
      typeof army.name !== 'string' ||
      typeof army.commander !== 'string'
    ) {
      continue
    }

    const divisionIds = Array.isArray(army.divisionIds)
      ? army.divisionIds.filter(
          (divisionId) =>
            typeof divisionId === 'string' &&
            divisionUnits[divisionId]?.owner === army.owner,
        )
      : []

    const objectiveId =
      typeof army.objectiveId === 'string' &&
      territories[army.objectiveId]
        ? army.objectiveId
        : null

    const planStatus =
      army.planStatus === 'planning' ||
      army.planStatus === 'executing'
        ? army.planStatus
        : 'idle'

    result[id] = {
      ...army,
      name: army.name.slice(0, 28),
      commander: army.commander.slice(0, 24),
      divisionIds,
      objectiveId,
      planStatus,
      preparation: clamp(Number(army.preparation) || 0, 0, 100),
      createdTick: Math.max(0, Math.floor(army.createdTick || 0)),
    }
  }

  return result
}

function validBattles(
  battles: unknown,
  territories: GameState['territories'],
  divisionUnits: Record<string, DivisionUnit>,
): BattleState[] {
  if (!Array.isArray(battles)) return []

  return battles
    .filter((battle): battle is BattleState => {
      if (!battle || typeof battle !== 'object') return false
      const candidate = battle as BattleState

      return (
        typeof candidate.id === 'string' &&
        VALID_PLAYABLE.has(candidate.attacker) &&
        VALID_OWNERS.has(candidate.defender) &&
        typeof candidate.fromId === 'string' &&
        typeof candidate.toId === 'string' &&
        Boolean(territories[candidate.fromId]) &&
        Boolean(territories[candidate.toId]) &&
        Array.isArray(candidate.attackerDivisionIds) &&
        Array.isArray(candidate.defenderDivisionIds) &&
        VALID_STANCES.has(candidate.stance)
      )
    })
    .map((battle) => ({
      ...battle,
      attackerDivisionIds: battle.attackerDivisionIds.filter((id) =>
        Boolean(divisionUnits[id]),
      ),
      defenderDivisionIds: battle.defenderDivisionIds.filter((id) =>
        Boolean(divisionUnits[id]),
      ),
      progress: clamp(Number(battle.progress), -99, 99),
      startedTick: Math.max(0, Math.floor(battle.startedTick || 0)),
    }))
    .filter((battle) => battle.attackerDivisionIds.length > 0)
    .slice(0, 30)
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
    schema: 8,
    savedAt,
    tick: state.tick,
    speed: state.speed,
    phase: state.phase,
    selectedId: state.selectedId,
    selectedDivisionId: state.selectedDivisionId,
    selectedArmyId: state.selectedArmyId,
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
    battles: state.battles,
    divisionUnits: state.divisionUnits,
    armies: state.armies,
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
        saved.schema !== 6 &&
        saved.schema !== 7 &&
        saved.schema !== 8) ||
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
      const defense = Number.isFinite(dynamic.defense)
        ? clamp(Math.floor(Number(dynamic.defense)), 0, 4)
        : current.defense

      territories[id] = {
        ...current,
        owner,
        troops,
        supply,
        factories,
        divisions: 0,
        defense,
      }
    }

    const divisionUnits =
      saved.schema === 7 || saved.schema === 8
        ? validDivisionUnits(saved.divisionUnits, territories)
        : migrateLegacyDivisionCounts(
            territories,
            saved as SavedGame,
          )

    territories = syncDivisionCounts(territories, divisionUnits)

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

    const selectedDivisionId =
      typeof saved.selectedDivisionId === 'string' &&
      divisionUnits[saved.selectedDivisionId]?.owner === 'player'
        ? saved.selectedDivisionId
        : Object.values(divisionUnits).find(
            (division) => division.owner === 'player',
          )?.id ?? null

    const armies =
      saved.schema === 8
        ? validArmies(saved.armies, territories, divisionUnits)
        : {}

    for (const division of Object.values(divisionUnits)) {
      if (!division.armyId || !armies[division.armyId]) {
        division.armyId = null
      }
    }

    const selectedArmyId =
      typeof saved.selectedArmyId === 'string' &&
      armies[saved.selectedArmyId]?.owner === 'player'
        ? saved.selectedArmyId
        : Object.values(armies).find(
            (army) => army.owner === 'player',
          )?.id ?? null

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
      selectedDivisionId,
      selectedArmyId,
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
      productionQueue: validProductionOrders(
        saved.productionQueue,
        territories,
      ),
      battles:
        saved.schema === 7 || saved.schema === 8
          ? validBattles(saved.battles, territories, divisionUnits)
          : [],
      divisionUnits,
      armies,
      territories,
    }
  } catch {
    return null
  }
}
