import type {
  AiCount,
  AiFactionId,
  ArmyGroup,
  AttackStance,
  BattleState,
  Difficulty,
  DivisionRole,
  DivisionUnit,
  Faction,
  FactionId,
  GameEventKind,
  GameState,
  PlayableFactionId,
  ProductionKind,
  ProductionOrder,
  TerritoryState,
} from './types'

export const factions: Record<FactionId, Faction> = {
  player: { id: 'player', name: '플레이어', color: '#2f7df6' },
  red: { id: 'red', name: '적색 세력', color: '#d65757' },
  blue: { id: 'blue', name: '청색 세력', color: '#7066dc' },
  green: { id: 'green', name: '녹색 세력', color: '#3f9b73' },
  neutral: { id: 'neutral', name: '중립', color: '#6f7782' },
}

export const difficultyLabels: Record<Difficulty, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
}

export const attackStanceLabels: Record<AttackStance, string> = {
  cautious: '신중',
  balanced: '균형',
  aggressive: '공세',
}

export const FACTORY_COST = 120
export const DIVISION_COST = 80
export const FACTORY_INCOME = 12
export const ECONOMY_INTERVAL = 5
export const MAX_FACTORIES = 4
export const MAX_DEFENSE = 4

export const PRODUCTION_TICKS: Record<ProductionKind, number> = {
  factory: 30,
  division: 12,
  defense: 16,
}

const STARTING_FUNDS = 320
const DIVISION_POWER = 100
const DEFENSE_POWER = 60
const aiFactions: AiFactionId[] = ['red', 'blue', 'green']

const commanderSurnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
const commanderGiven = [
  '도현',
  '민재',
  '서준',
  '지훈',
  '현우',
  '준혁',
  '태윤',
  '시우',
  '건우',
  '승민',
  '하준',
  '재현',
]

const stancePower: Record<AttackStance, number> = {
  cautious: 0.94,
  balanced: 1,
  aggressive: 1.08,
}

const stanceOrganizationCost: Record<AttackStance, number> = {
  cautious: 1.7,
  balanced: 2.4,
  aggressive: 3.2,
}

export const divisionRoleLabels: Record<DivisionRole, string> = {
  line: '전열',
  mobile: '기동',
  guard: '경비',
}

const rolePower: Record<DivisionRole, number> = {
  line: 1,
  mobile: 0.94,
  guard: 0.9,
}

const roleDefense: Record<DivisionRole, number> = {
  line: 1,
  mobile: 0.92,
  guard: 1.18,
}

const roleMoveMultiplier: Record<DivisionRole, number> = {
  line: 1,
  mobile: 0.72,
  guard: 1.18,
}

function activeAiFactions(count: AiCount): AiFactionId[] {
  return aiFactions.slice(0, count)
}

function actorName(state: GameState, owner: FactionId): string {
  if (owner === 'player') return state.playerName.trim() || '플레이어'
  if (owner === 'neutral') return factions.neutral.name
  return state.aiNames[owner].trim() || factions[owner].name
}

function withEvent(
  state: GameState,
  kind: GameEventKind,
  message: string,
): GameState {
  const event = {
    id: `${state.tick}:${kind}:${state.events.length}:${message.slice(0, 20)}`,
    tick: state.tick,
    kind,
    message,
  }

  return {
    ...state,
    events: [event, ...state.events].slice(0, 80),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function distanceSquared(a: [number, number], b: [number, number]): number {
  const latScale = Math.cos(((a[1] + b[1]) * Math.PI) / 360)
  const dx = (a[0] - b[0]) * latScale
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function commanderName(seed: string): string {
  const hash = hashString(seed)
  return `${commanderSurnames[hash % commanderSurnames.length]}${
    commanderGiven[Math.floor(hash / 13) % commanderGiven.length]
  }`
}

function divisionDisplayName(owner: PlayableFactionId, ordinal: number): string {
  const prefix =
    owner === 'player'
      ? '제'
      : owner === 'red'
        ? 'R-'
        : owner === 'blue'
          ? 'B-'
          : 'G-'

  return owner === 'player'
    ? `${prefix}${ordinal}보병사단`
    : `${prefix}${ordinal} 사단`
}

function makeDivision(
  owner: PlayableFactionId,
  locationId: string,
  ordinal: number,
  createdTick: number,
  seedSuffix = '',
): DivisionUnit {
  const id = `${owner}-division-${createdTick}-${ordinal}-${hashString(
    `${locationId}:${seedSuffix}`,
  ).toString(36)}`

  const role: DivisionRole =
    ordinal % 5 === 0 ? 'mobile' : ordinal % 4 === 0 ? 'guard' : 'line'

  return {
    id,
    owner,
    name: divisionDisplayName(owner, ordinal),
    commander: commanderName(`${owner}:${locationId}:${ordinal}:${seedSuffix}`),
    role,
    armyId: null,
    locationId,
    strength: 100,
    organization: 85,
    experience: 0,
    entrenchment: 0,
    status: 'idle',
    order: null,
    createdTick,
  }
}

function syncTerritoryDivisionCounts(state: GameState): GameState {
  const counts: Record<string, number> = {}

  for (const division of Object.values(state.divisionUnits)) {
    counts[division.locationId] = (counts[division.locationId] ?? 0) + 1
  }

  let changed = false
  const territories: Record<string, TerritoryState> = {}

  for (const [id, territory] of Object.entries(state.territories)) {
    const divisions = counts[id] ?? 0
    if (territory.divisions !== divisions) changed = true
    territories[id] =
      territory.divisions === divisions ? territory : { ...territory, divisions }
  }

  return changed ? { ...state, territories } : state
}

export function divisionsAt(
  state: GameState,
  territoryId: string,
  owner?: PlayableFactionId,
): DivisionUnit[] {
  return Object.values(state.divisionUnits).filter(
    (division) =>
      division.locationId === territoryId &&
      (owner === undefined || division.owner === owner),
  )
}

export function playerDivisions(state: GameState): DivisionUnit[] {
  return Object.values(state.divisionUnits)
    .filter((division) => division.owner === 'player')
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'ko') ||
        a.id.localeCompare(b.id),
    )
}

export function playerArmies(state: GameState): ArmyGroup[] {
  return Object.values(state.armies)
    .filter((army) => army.owner === 'player')
    .sort(
      (a, b) =>
        a.createdTick - b.createdTick ||
        a.name.localeCompare(b.name, 'ko'),
    )
}

function nextArmyOrdinal(state: GameState): number {
  return playerArmies(state).length + 1
}

export function createArmy(state: GameState): GameState {
  if (state.phase !== 'running') return state

  const ordinal = nextArmyOrdinal(state)
  const id = `player-army-${state.tick}-${ordinal}`
  const army: ArmyGroup = {
    id,
    owner: 'player',
    name: `제${ordinal}군`,
    commander: commanderName(`army:${id}`),
    divisionIds: [],
    objectiveId: null,
    planStatus: 'idle',
    preparation: 0,
    createdTick: state.tick,
  }

  return withEvent(
    {
      ...state,
      selectedArmyId: id,
      armies: {
        ...state.armies,
        [id]: army,
      },
    },
    'military',
    `${army.name} 창설 · 지휘관 ${army.commander}`,
  )
}

export function renameArmy(
  state: GameState,
  armyId: string,
  name: string,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state

  return {
    ...state,
    armies: {
      ...state.armies,
      [armyId]: { ...army, name: name.slice(0, 28) },
    },
  }
}

export function renameArmyCommander(
  state: GameState,
  armyId: string,
  commander: string,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state

  return {
    ...state,
    armies: {
      ...state.armies,
      [armyId]: { ...army, commander: commander.slice(0, 24) },
    },
  }
}

export function assignDivisionToArmy(
  state: GameState,
  divisionId: string,
  armyId: string | null,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player') return state
  if (armyId !== null && state.armies[armyId]?.owner !== 'player') return state

  const armies = Object.fromEntries(
    Object.entries(state.armies).map(([id, army]) => [
      id,
      {
        ...army,
        divisionIds: army.divisionIds.filter(
          (candidateId) => candidateId !== divisionId,
        ),
      },
    ]),
  ) as Record<string, ArmyGroup>

  if (armyId) {
    armies[armyId] = {
      ...armies[armyId],
      divisionIds: [...armies[armyId].divisionIds, divisionId],
    }
  }

  return {
    ...state,
    armies,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        armyId,
      },
    },
  }
}

export function setDivisionRole(
  state: GameState,
  divisionId: string,
  role: DivisionRole,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (
    !division ||
    division.owner !== 'player' ||
    division.status !== 'idle'
  ) {
    return state
  }

  return {
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        role,
        entrenchment: 0,
      },
    },
  }
}

export function setArmyObjective(
  state: GameState,
  armyId: string,
  territoryId: string | null,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state
  if (territoryId !== null && !state.territories[territoryId]) return state

  return {
    ...state,
    armies: {
      ...state.armies,
      [armyId]: {
        ...army,
        objectiveId: territoryId,
        planStatus: territoryId ? 'planning' : 'idle',
        preparation: territoryId ? 0 : army.preparation,
      },
    },
  }
}

export function executeArmyPlan(
  state: GameState,
  armyId: string,
): GameState {
  const army = state.armies[armyId]
  if (
    !army ||
    army.owner !== 'player' ||
    !army.objectiveId ||
    !state.territories[army.objectiveId]
  ) {
    return state
  }

  let next = state
  let issued = 0

  for (const divisionId of army.divisionIds) {
    const division = next.divisionUnits[divisionId]
    if (
      !division ||
      division.owner !== 'player' ||
      division.status !== 'idle'
    ) {
      continue
    }

    const ordered = issueDivisionOrder(
      next,
      division.id,
      army.objectiveId,
    )
    if (ordered !== next) {
      next = ordered
      issued += 1
    }
  }

  if (issued === 0) return state

  const currentArmy = next.armies[armyId] ?? army
  return withEvent(
    {
      ...next,
      armies: {
        ...next.armies,
        [armyId]: {
          ...currentArmy,
          planStatus: 'executing',
        },
      },
    },
    'military',
    `${army.name} · 작전 실행 · ${issued}개 사단 명령`,
  )
}

export function haltArmyPlan(
  state: GameState,
  armyId: string,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state

  let next = state
  for (const divisionId of army.divisionIds) {
    const division = next.divisionUnits[divisionId]
    if (!division || division.owner !== 'player') continue
    if (division.status !== 'idle') {
      next = cancelDivisionOrder(next, division.id)
    }
  }

  const currentArmy = next.armies[armyId] ?? army
  return withEvent(
    {
      ...next,
      armies: {
        ...next.armies,
        [armyId]: {
          ...currentArmy,
          planStatus: currentArmy.objectiveId ? 'planning' : 'idle',
        },
      },
    },
    'military',
    `${army.name} · 작전 중지`,
  )
}

function nextDivisionOrdinal(state: GameState, owner: PlayableFactionId): number {
  return (
    Object.values(state.divisionUnits).filter(
      (division) => division.owner === owner,
    ).length + 1
  )
}

export function defenseUpgradeCost(level: number): number {
  if (level >= MAX_DEFENSE) return 0
  return 70 + level * 50
}

export function productionCost(
  kind: ProductionKind,
  territory: TerritoryState,
): number {
  if (kind === 'factory') return FACTORY_COST
  if (kind === 'division') return DIVISION_COST
  return defenseUpgradeCost(territory.defense)
}

export function productionDuration(
  kind: ProductionKind,
  territory: TerritoryState,
): number {
  if (kind === 'defense') {
    return PRODUCTION_TICKS.defense + territory.defense * 4
  }
  return PRODUCTION_TICKS[kind]
}

export function territoryMilitaryPower(
  territory: TerritoryState,
  state?: GameState,
): number {
  const divisionPower = state
    ? divisionsAt(state, territory.id).reduce(
        (sum, division) =>
          sum +
          DIVISION_POWER *
            (division.strength / 100) *
            (0.55 + division.organization / 220),
        0,
      )
    : territory.divisions * DIVISION_POWER

  return Math.round(divisionPower + territory.defense * DEFENSE_POWER)
}

export function factionIncomePerCycle(
  state: GameState,
  owner: PlayableFactionId,
): number {
  let factories = 0
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === owner) factories += territory.factories
  }
  return factories * FACTORY_INCOME
}

function normalizeTerritories(
  territories: Record<string, TerritoryState>,
): Record<string, TerritoryState> {
  return Object.fromEntries(
    Object.entries(territories).map(([id, territory]) => [
      id,
      {
        ...territory,
        factories: Number.isFinite(territory.factories)
          ? Math.max(0, Math.floor(territory.factories))
          : 0,
        divisions: 0,
        defense: Number.isFinite(territory.defense)
          ? Math.max(0, Math.floor(territory.defense))
          : 0,
      },
    ]),
  )
}

export function createInitialState(
  territories: Record<string, TerritoryState>,
  dataVersion: string,
): GameState {
  const normalized = normalizeTerritories(territories)
  const firstId = Object.keys(normalized)[0] ?? null

  return {
    phase: 'setup',
    running: false,
    speed: 1,
    tick: 0,
    selectedId: firstId,
    selectedDivisionId: null,
    selectedArmyId: null,
    playerName: '플레이어 세력',
    aiNames: {
      red: '적색 세력',
      blue: '청색 세력',
      green: '녹색 세력',
    },
    factionColors: {
      player: '#2f7df6',
      red: '#d65757',
      blue: '#7066dc',
      green: '#3f9b73',
    },
    funds: {
      player: STARTING_FUNDS,
      red: STARTING_FUNDS,
      blue: STARTING_FUNDS,
      green: STARTING_FUNDS,
    },
    aiCount: 3,
    difficulty: 'normal',
    attackStance: 'balanced',
    autoOffensive: false,
    dataVersion,
    events: [],
    productionQueue: [],
    battles: [],
    divisionUnits: {},
    armies: {},
    territories: normalized,
  }
}

function chooseFarthestSeed(
  territories: Record<string, TerritoryState>,
  anchors: string[],
  reserved: Set<string>,
): string | null {
  let bestId: string | null = null
  let bestScore = -1

  for (const territory of Object.values(territories)) {
    if (reserved.has(territory.id)) continue

    let minDistance = Number.POSITIVE_INFINITY
    for (const anchorId of anchors) {
      const anchor = territories[anchorId]
      if (!anchor) continue
      minDistance = Math.min(
        minDistance,
        distanceSquared(territory.centroid, anchor.centroid),
      )
    }

    if (minDistance > bestScore) {
      bestScore = minDistance
      bestId = territory.id
    }
  }

  return bestId
}

function claimCluster(
  territories: Record<string, TerritoryState>,
  seedId: string,
  owner: FactionId,
  reserved: Set<string>,
): { territories: Record<string, TerritoryState>; claimed: string[] } {
  const next = { ...territories }
  const seed = next[seedId]
  if (!seed) return { territories: next, claimed: [] }

  const cluster = [seedId, ...seed.neighbors.slice(0, 4)]
  const claimed: string[] = []

  cluster.forEach((id, index) => {
    const territory = next[id]
    if (!territory || (reserved.has(id) && id !== seedId)) return

    reserved.add(id)
    claimed.push(id)
    next[id] = {
      ...territory,
      owner,
      troops: 0,
      factories: index === 0 ? 2 : 0,
      divisions: 0,
      defense: index === 0 ? 1 : 0,
      supply: index === 0 ? 92 : 78,
    }
  })

  return { territories: next, claimed }
}

function spawnStartingDivisions(
  state: GameState,
  owner: PlayableFactionId,
  claimed: string[],
): GameState {
  const divisionUnits = { ...state.divisionUnits }
  let ordinal = nextDivisionOrdinal(state, owner)

  claimed.forEach((territoryId, index) => {
    const amount = index === 0 ? 3 : 1

    for (let i = 0; i < amount; i += 1) {
      const division = makeDivision(
        owner,
        territoryId,
        ordinal,
        state.tick,
        `start:${i}`,
      )
      divisionUnits[division.id] = division
      ordinal += 1
    }
  })

  return syncTerritoryDivisionCounts({ ...state, divisionUnits })
}

export function startGame(state: GameState, startId: string): GameState {
  const start = state.territories[startId]
  if (!start) return state

  let territories = Object.fromEntries(
    Object.entries(state.territories).map(([id, territory]) => [
      id,
      {
        ...territory,
        owner: 'neutral' as FactionId,
        troops: 0,
        factories: 0,
        divisions: 0,
        defense: 0,
        supply: 55,
      },
    ]),
  )

  const reserved = new Set<string>()
  const seeds = [startId]
  const claimedByOwner: Partial<Record<PlayableFactionId, string[]>> = {}

  const playerClaim = claimCluster(territories, startId, 'player', reserved)
  territories = playerClaim.territories
  claimedByOwner.player = playerClaim.claimed

  for (const faction of activeAiFactions(state.aiCount)) {
    const seed = chooseFarthestSeed(territories, seeds, reserved)
    if (!seed) continue
    seeds.push(seed)
    const result = claimCluster(territories, seed, faction, reserved)
    territories = result.territories
    claimedByOwner[faction] = result.claimed
  }

  let next: GameState = {
    ...state,
    phase: 'running',
    running: true,
    tick: 0,
    selectedId: startId,
    selectedDivisionId: null,
    selectedArmyId: null,
    funds: {
      player: STARTING_FUNDS,
      red: STARTING_FUNDS,
      blue: STARTING_FUNDS,
      green: STARTING_FUNDS,
    },
    productionQueue: [],
    battles: [],
    divisionUnits: {},
    armies: {},
    events: [],
    territories,
  }

  next = spawnStartingDivisions(next, 'player', claimedByOwner.player ?? [])
  for (const faction of activeAiFactions(state.aiCount)) {
    next = spawnStartingDivisions(
      next,
      faction,
      claimedByOwner[faction] ?? [],
    )
  }

  const firstPlayerDivision = playerDivisions(next)[0]?.id ?? null

  return withEvent(
    { ...next, selectedDivisionId: firstPlayerDivision },
    'system',
    `작전 개시 · ${start.fullName} · 사단 단위 지휘 체계 가동`,
  )
}

function hasProductionAt(
  state: GameState,
  owner: PlayableFactionId,
  territoryId: string,
): boolean {
  return state.productionQueue.some(
    (order) => order.owner === owner && order.territoryId === territoryId,
  )
}

function queueProductionForOwner(
  state: GameState,
  territoryId: string,
  kind: ProductionKind,
  owner: PlayableFactionId,
): GameState {
  if (state.phase !== 'running') return state

  const territory = state.territories[territoryId]
  if (!territory || territory.owner !== owner) return state
  if (hasProductionAt(state, owner, territoryId)) return state
  if (kind === 'factory' && territory.factories >= MAX_FACTORIES) return state
  if (kind === 'defense' && territory.defense >= MAX_DEFENSE) return state

  const cost = productionCost(kind, territory)
  if (cost <= 0 || state.funds[owner] < cost) return state

  const duration = productionDuration(kind, territory)
  const order: ProductionOrder = {
    id: `${owner}:${territoryId}:${kind}:${state.tick}:${state.productionQueue.length}`,
    owner,
    territoryId,
    kind,
    cost,
    totalTicks: duration,
    remainingTicks: duration,
    queuedTick: state.tick,
  }

  const next: GameState = {
    ...state,
    funds: {
      ...state.funds,
      [owner]: state.funds[owner] - cost,
    },
    productionQueue: [...state.productionQueue, order],
  }

  if (owner !== 'player') return next

  const label =
    kind === 'factory'
      ? '산업 시설'
      : kind === 'division'
        ? '신규 사단'
        : '방어 공사'

  return withEvent(
    next,
    'production',
    `${territory.fullName} · ${label} 생산 시작 · ${duration}틱`,
  )
}

export function queueProduction(
  state: GameState,
  territoryId: string,
  kind: ProductionKind,
): GameState {
  return queueProductionForOwner(state, territoryId, kind, 'player')
}

export function buildFactory(state: GameState, territoryId: string): GameState {
  return queueProduction(state, territoryId, 'factory')
}

export function buildDivision(state: GameState, territoryId: string): GameState {
  return queueProduction(state, territoryId, 'division')
}

export function upgradeDefense(state: GameState, territoryId: string): GameState {
  return queueProduction(state, territoryId, 'defense')
}

export function cancelProduction(
  state: GameState,
  orderId: string,
): GameState {
  const order = state.productionQueue.find(
    (candidate) => candidate.id === orderId && candidate.owner === 'player',
  )
  if (!order) return state

  const refund = Math.floor(order.cost * 0.75)
  return withEvent(
    {
      ...state,
      funds: {
        ...state.funds,
        player: state.funds.player + refund,
      },
      productionQueue: state.productionQueue.filter(
        (candidate) => candidate.id !== orderId,
      ),
    },
    'production',
    `생산 취소 · 자금 ${refund} 환급`,
  )
}

function completeProduction(
  state: GameState,
  order: ProductionOrder,
): GameState {
  const territory = state.territories[order.territoryId]
  if (!territory || territory.owner !== order.owner) return state

  let next = state

  if (order.kind === 'factory') {
    next = {
      ...next,
      territories: {
        ...next.territories,
        [territory.id]: {
          ...territory,
          factories: Math.min(MAX_FACTORIES, territory.factories + 1),
        },
      },
    }
  } else if (order.kind === 'defense') {
    next = {
      ...next,
      territories: {
        ...next.territories,
        [territory.id]: {
          ...territory,
          defense: Math.min(MAX_DEFENSE, territory.defense + 1),
        },
      },
    }
  } else {
    const ordinal = nextDivisionOrdinal(next, order.owner)
    const division = makeDivision(
      order.owner,
      territory.id,
      ordinal,
      next.tick,
      `production:${order.id}`,
    )

    next = syncTerritoryDivisionCounts({
      ...next,
      divisionUnits: {
        ...next.divisionUnits,
        [division.id]: division,
      },
      selectedDivisionId:
        order.owner === 'player' && !next.selectedDivisionId
          ? division.id
          : next.selectedDivisionId,
    })
  }

  if (order.owner === 'player') {
    const label =
      order.kind === 'factory'
        ? '산업 시설 완공'
        : order.kind === 'division'
          ? '신규 사단 배치'
          : '방어 공사 완료'

    next = withEvent(next, 'production', `${territory.fullName} · ${label}`)
  }

  return next
}

function processProduction(state: GameState): GameState {
  if (state.productionQueue.length === 0) return state

  let next = state
  const remaining: ProductionOrder[] = []

  for (const order of state.productionQueue) {
    const territory = next.territories[order.territoryId]
    if (!territory || territory.owner !== order.owner) continue

    const progressed = {
      ...order,
      remainingTicks: order.remainingTicks - 1,
    }

    if (progressed.remainingTicks <= 0) {
      next = completeProduction(next, progressed)
    } else {
      remaining.push(progressed)
    }
  }

  return { ...next, productionQueue: remaining }
}

function movementTicks(
  source: TerritoryState,
  target: TerritoryState,
  role: DivisionRole = 'line',
): number {
  const supplyPenalty = Math.round((100 - source.supply) / 35)
  const distancePenalty = Math.min(
    2,
    Math.floor(Math.sqrt(distanceSquared(source.centroid, target.centroid)) * 5),
  )
  return clamp(
    Math.ceil(
      (2 + supplyPenalty + distancePenalty) * roleMoveMultiplier[role],
    ),
    1,
    7,
  )
}

function findDivisionRoute(
  state: GameState,
  owner: PlayableFactionId,
  fromId: string,
  targetId: string,
): string[] {
  if (fromId === targetId) return []

  const queue: string[] = [fromId]
  const previous = new Map<string, string | null>([[fromId, null]])

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const current = state.territories[currentId]
    if (!current) continue

    for (const neighborId of current.neighbors) {
      if (previous.has(neighborId)) continue
      const neighbor = state.territories[neighborId]
      if (!neighbor) continue

      const allowed =
        neighborId === targetId || neighbor.owner === owner
      if (!allowed) continue

      previous.set(neighborId, currentId)

      if (neighborId === targetId) {
        const path: string[] = []
        let cursor: string | null = targetId

        while (cursor && cursor !== fromId) {
          path.unshift(cursor)
          cursor = previous.get(cursor) ?? null
        }

        return path
      }

      queue.push(neighborId)
    }
  }

  return []
}

function defenderIdsAt(
  state: GameState,
  territoryId: string,
  defender: FactionId,
): string[] {
  if (defender === 'neutral') return []
  return Object.values(state.divisionUnits)
    .filter(
      (division) =>
        division.locationId === territoryId &&
        division.owner === defender &&
        division.status !== 'attacking',
    )
    .map((division) => division.id)
}

function setDivision(
  state: GameState,
  division: DivisionUnit,
): GameState {
  return syncTerritoryDivisionCounts({
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [division.id]: division,
    },
  })
}

export function issueDivisionOrder(
  state: GameState,
  divisionId: string,
  targetId: string,
): GameState {
  if (state.phase !== 'running') return state

  const division = state.divisionUnits[divisionId]
  const source = division ? state.territories[division.locationId] : null
  const target = state.territories[targetId]

  if (
    !division ||
    !source ||
    !target ||
    division.owner !== 'player' ||
    division.status !== 'idle' ||
    targetId === source.id
  ) {
    return state
  }

  const path = findDivisionRoute(
    state,
    division.owner,
    source.id,
    targetId,
  )

  if (path.length === 0) return state

  const firstStep = state.territories[path[0]]
  if (!firstStep) return state

  const totalTicks = movementTicks(source, firstStep, division.role)
  const orderType =
    target.owner === division.owner ? 'move' : 'attack'

  const nextDivision: DivisionUnit = {
    ...division,
    entrenchment: 0,
    status: 'moving',
    order: {
      type: orderType,
      targetId,
      path,
      totalTicks,
      remainingTicks: totalTicks,
      issuedTick: state.tick,
    },
  }

  return withEvent(
    setDivision(state, nextDivision),
    'movement',
    `${division.name} · ${source.name} → ${target.name} ${orderType === 'attack' ? '공격 이동' : '이동'} 명령`,
  )
}

function startDivisionBattle(
  state: GameState,
  divisionId: string,
  targetId: string,
  owner: PlayableFactionId,
  stance: AttackStance,
): GameState {
  const division = state.divisionUnits[divisionId]
  const source = division ? state.territories[division.locationId] : null
  const target = state.territories[targetId]

  if (
    !division ||
    !source ||
    !target ||
    division.owner !== owner ||
    division.status !== 'idle' ||
    target.owner === owner ||
    !source.neighbors.includes(targetId)
  ) {
    return state
  }

  const conflicting = state.battles.some(
    (battle) =>
      battle.toId === targetId &&
      battle.attacker !== owner,
  )
  if (conflicting) return state

  const existing = state.battles.find(
    (battle) =>
      battle.attacker === owner &&
      battle.toId === targetId,
  )

  if (existing) {
    const nextDivision: DivisionUnit = {
      ...division,
      entrenchment: 0,
      status: 'attacking',
      order: {
        type: 'attack',
        targetId,
        path: [targetId],
        totalTicks: 0,
        remainingTicks: 0,
        issuedTick: state.tick,
      },
    }

    return withEvent(
      {
        ...state,
        divisionUnits: {
          ...state.divisionUnits,
          [division.id]: nextDivision,
        },
        battles: state.battles.map((battle) =>
          battle.id === existing.id
            ? {
                ...battle,
                attackerDivisionIds: [
                  ...battle.attackerDivisionIds,
                  division.id,
                ],
              }
            : battle,
        ),
      },
      'battle',
      `${division.name} · ${target.name} 전투에 증원`,
    )
  }

  const defenders = defenderIdsAt(state, targetId, target.owner)

  if (defenders.length === 0 && target.defense === 0) {
    const totalTicks = movementTicks(source, target, division.role)
    const nextDivision: DivisionUnit = {
      ...division,
      entrenchment: 0,
      status: 'moving',
      order: {
        type: 'move',
        targetId,
        path: [targetId],
        totalTicks,
        remainingTicks: totalTicks,
        issuedTick: state.tick,
      },
    }

    return withEvent(
      setDivision(state, nextDivision),
      'movement',
      `${division.name} · ${target.name} 무저항 진입 시작`,
    )
  }

  const battle: BattleState = {
    id: `${owner}:${source.id}:${target.id}:${state.tick}`,
    attacker: owner,
    defender: target.owner,
    fromId: source.id,
    toId: target.id,
    attackerDivisionIds: [division.id],
    defenderDivisionIds: defenders,
    progress: 0,
    stance,
    startedTick: state.tick,
  }

  const divisionUnits = { ...state.divisionUnits }
  divisionUnits[division.id] = {
    ...division,
    entrenchment: 0,
    status: 'attacking',
    order: {
      type: 'attack',
      targetId,
      path: [targetId],
      totalTicks: 0,
      remainingTicks: 0,
      issuedTick: state.tick,
    },
  }

  for (const defenderId of defenders) {
    const defender = divisionUnits[defenderId]
    if (!defender) continue
    divisionUnits[defenderId] = {
      ...defender,
      status: 'defending',
    }
  }

  return withEvent(
    {
      ...state,
      divisionUnits,
      battles: [...state.battles, battle],
    },
    'battle',
    `${division.name} · ${source.name} → ${target.name} 공격 개시`,
  )
}

export function cancelDivisionOrder(
  state: GameState,
  divisionId: string,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player' || division.status === 'idle') {
    return state
  }

  let battles = state.battles
  let divisionUnits = { ...state.divisionUnits }

  if (division.status === 'attacking') {
    battles = battles
      .map((battle) =>
        battle.attackerDivisionIds.includes(divisionId)
          ? {
              ...battle,
              attackerDivisionIds: battle.attackerDivisionIds.filter(
                (id) => id !== divisionId,
              ),
            }
          : battle,
      )
      .filter((battle) => battle.attackerDivisionIds.length > 0)
  }

  divisionUnits[divisionId] = {
    ...division,
    status: 'idle',
    order: null,
  }

  return withEvent(
    syncTerritoryDivisionCounts({ ...state, battles, divisionUnits }),
    'movement',
    `${division.name} · 명령 취소`,
  )
}

export function renameDivision(
  state: GameState,
  divisionId: string,
  name: string,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player') return state

  return {
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        name: name.slice(0, 32),
      },
    },
  }
}

export function renameCommander(
  state: GameState,
  divisionId: string,
  commander: string,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player') return state

  return {
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        commander: commander.slice(0, 24),
      },
    },
  }
}

function processMovement(state: GameState): GameState {
  let next = state
  let divisionUnits = { ...state.divisionUnits }
  let territories = state.territories
  const captured: Array<{ territoryId: string; divisionId: string }> = []
  const battleStarts: Array<{
    divisionId: string
    targetId: string
    owner: PlayableFactionId
  }> = []

  for (const original of Object.values(state.divisionUnits)) {
    const division = divisionUnits[original.id]
    if (!division || division.status !== 'moving' || !division.order) continue

    const order = division.order
    const remainingTicks = order.remainingTicks - 1

    if (remainingTicks > 0) {
      divisionUnits[division.id] = {
        ...division,
        order: { ...order, remainingTicks },
      }
      continue
    }

    const nextStepId = order.path[0]
    const nextStep = territories[nextStepId]
    const source = territories[division.locationId]

    if (!nextStep || !source || !source.neighbors.includes(nextStep.id)) {
      divisionUnits[division.id] = {
        ...division,
        status: 'idle',
        order: null,
      }
      continue
    }

    const finalStep = order.path.length === 1

    if (
      finalStep &&
      order.type === 'attack' &&
      nextStep.owner !== division.owner
    ) {
      divisionUnits[division.id] = {
        ...division,
        status: 'idle',
        order: null,
      }
      battleStarts.push({
        divisionId: division.id,
        targetId: nextStep.id,
        owner: division.owner,
      })
      continue
    }

    if (nextStep.owner !== division.owner) {
      const hostileUnits = Object.values(divisionUnits).filter(
        (unit) =>
          unit.locationId === nextStep.id &&
          unit.owner !== division.owner,
      )

      if (hostileUnits.length > 0 || nextStep.defense > 0) {
        divisionUnits[division.id] = {
          ...division,
          status: 'idle',
          order: null,
        }
        continue
      }
    }

    const remainingPath = order.path.slice(1)
    const arrivedAtFinal = remainingPath.length === 0
    let nextOrder = null

    if (!arrivedAtFinal) {
      const following = territories[remainingPath[0]]
      if (!following) {
        divisionUnits[division.id] = {
          ...division,
          status: 'idle',
          order: null,
        }
        continue
      }

      const legTicks = movementTicks(nextStep, following, division.role)
      nextOrder = {
        ...order,
        path: remainingPath,
        totalTicks: legTicks,
        remainingTicks: legTicks,
      }
    }

    divisionUnits[division.id] = {
      ...division,
      locationId: nextStep.id,
      entrenchment: 0,
      status: arrivedAtFinal ? 'idle' : 'moving',
      order: nextOrder,
      organization: Math.max(30, division.organization - 2.5),
    }

    if (nextStep.owner !== division.owner) {
      territories = {
        ...territories,
        [nextStep.id]: {
          ...nextStep,
          owner: division.owner,
          supply: Math.max(35, nextStep.supply),
        },
      }
      captured.push({
        territoryId: nextStep.id,
        divisionId: division.id,
      })
    }
  }

  next = syncTerritoryDivisionCounts({
    ...next,
    divisionUnits,
    territories,
  })

  for (const battle of battleStarts) {
    next = startDivisionBattle(
      next,
      battle.divisionId,
      battle.targetId,
      battle.owner,
      battle.owner === 'player'
        ? next.attackStance
        : next.difficulty === 'hard'
          ? 'aggressive'
          : next.difficulty === 'easy'
            ? 'cautious'
            : 'balanced',
    )
  }

  for (const capture of captured) {
    const territory = next.territories[capture.territoryId]
    const occupier = next.divisionUnits[capture.divisionId]
    next = withEvent(
      next,
      'capture',
      `${occupier?.name ?? '사단'} · ${territory.fullName} 점령`,
    )
  }

  return next
}

function divisionCombatPower(
  division: DivisionUnit,
  defending = false,
): number {
  const roleModifier = defending
    ? roleDefense[division.role]
    : rolePower[division.role]
  const entrenchmentModifier = defending
    ? 1 + division.entrenchment * 0.002
    : 1

  return (
    DIVISION_POWER *
    roleModifier *
    entrenchmentModifier *
    (division.strength / 100) *
    (0.35 + division.organization / 150) *
    (1 + division.experience / 300)
  )
}

function chooseRetreatTerritory(
  state: GameState,
  owner: PlayableFactionId,
  fromId: string,
): string | null {
  const territory = state.territories[fromId]
  if (!territory) return null

  return (
    territory.neighbors
      .map((id) => state.territories[id])
      .filter(
        (candidate): candidate is TerritoryState =>
          Boolean(candidate && candidate.owner === owner),
      )
      .sort(
        (a, b) =>
          b.supply - a.supply ||
          a.id.localeCompare(b.id),
      )[0]?.id ?? null
  )
}

function applyCombatWear(
  division: DivisionUnit,
  strengthLoss: number,
  organizationLoss: number,
  experienceGain: number,
): DivisionUnit {
  return {
    ...division,
    strength: clamp(division.strength - strengthLoss, 0, 100),
    organization: clamp(
      division.organization - organizationLoss,
      0,
      100,
    ),
    experience: clamp(division.experience + experienceGain, 0, 100),
  }
}

function processBattles(state: GameState): GameState {
  if (state.battles.length === 0) return state

  let next = state
  let divisionUnits = { ...state.divisionUnits }
  let territories = state.territories
  const active: BattleState[] = []

  for (const battle of state.battles) {
    const source = territories[battle.fromId]
    const target = territories[battle.toId]

    if (
      !source ||
      !target ||
      source.owner !== battle.attacker ||
      target.owner !== battle.defender
    ) {
      for (const divisionId of battle.attackerDivisionIds) {
        const division = divisionUnits[divisionId]
        if (!division) continue
        divisionUnits[divisionId] = {
          ...division,
          status: 'idle',
          order: null,
        }
      }
      continue
    }

    const attackers = battle.attackerDivisionIds
      .map((id) => divisionUnits[id])
      .filter(
        (division): division is DivisionUnit =>
          Boolean(
            division &&
              division.owner === battle.attacker &&
              division.status === 'attacking',
          ),
      )

    const defenders = battle.defenderDivisionIds
      .map((id) => divisionUnits[id])
      .filter(
        (division): division is DivisionUnit =>
          Boolean(
            division &&
              division.locationId === target.id &&
              division.owner === target.owner,
          ),
      )

    if (attackers.length === 0) continue

    const averageAttackerSupply =
      attackers.reduce(
        (sum, division) =>
          sum +
          (territories[division.locationId]?.supply ?? source.supply),
        0,
      ) / Math.max(1, attackers.length)

    const attackerPower =
      attackers.reduce(
        (sum, division) => sum + divisionCombatPower(division, false),
        0,
      ) *
      (0.62 + averageAttackerSupply / 210) *
      stancePower[battle.stance]

    const defenderPower =
      defenders.reduce(
        (sum, division) => sum + divisionCombatPower(division, true),
        0,
      ) *
        (0.68 + target.supply / 220) +
      target.defense * DEFENSE_POWER +
      (target.owner === 'neutral' ? 20 : 35)

    const ratio = attackerPower / Math.max(45, defenderPower)
    const jitter =
      ((hashString(`${battle.id}:${next.tick}`) % 9) - 4) * 0.28
    const delta = clamp((ratio - 1) * 11 + jitter, -11, 13)
    const progress = battle.progress + delta

    const attackerStrengthLoss = clamp(
      0.45 + defenderPower / Math.max(220, attackerPower) * 0.55,
      0.35,
      2.1,
    )
    const defenderStrengthLoss = clamp(
      0.35 + attackerPower / Math.max(220, defenderPower) * 0.5,
      0.3,
      2.2,
    )

    for (const division of attackers) {
      divisionUnits[division.id] = applyCombatWear(
        division,
        attackerStrengthLoss,
        stanceOrganizationCost[battle.stance],
        0.35,
      )
    }

    for (const division of defenders) {
      divisionUnits[division.id] = applyCombatWear(
        division,
        defenderStrengthLoss,
        2.1,
        0.3,
      )
    }

    const survivingAttackers = attackers.filter(
      (division) => (divisionUnits[division.id]?.strength ?? 0) > 12,
    )
    const survivingDefenders = defenders.filter(
      (division) => (divisionUnits[division.id]?.strength ?? 0) > 12,
    )

    for (const division of attackers) {
      if ((divisionUnits[division.id]?.strength ?? 0) <= 12) {
        delete divisionUnits[division.id]
      }
    }

    for (const division of defenders) {
      if ((divisionUnits[division.id]?.strength ?? 0) <= 12) {
        delete divisionUnits[division.id]
      }
    }

    const attackerVictory =
      progress >= 100 || survivingDefenders.length === 0 && target.defense === 0
    const defenderVictory =
      progress <= -100 || survivingAttackers.length === 0

    if (attackerVictory) {
      const defenderOwner = target.owner

      for (const defender of survivingDefenders) {
        const current = divisionUnits[defender.id]
        if (!current) continue
        const retreat =
          defenderOwner === 'neutral'
            ? null
            : chooseRetreatTerritory(
                { ...next, territories, divisionUnits },
                defenderOwner as PlayableFactionId,
                target.id,
              )

        if (retreat) {
          divisionUnits[defender.id] = {
            ...current,
            locationId: retreat,
            status: 'idle',
            order: null,
            organization: Math.min(current.organization, 35),
          }
        } else {
          delete divisionUnits[defender.id]
        }
      }

      for (const attacker of survivingAttackers) {
        const current = divisionUnits[attacker.id]
        if (!current) continue
        divisionUnits[attacker.id] = {
          ...current,
          locationId: target.id,
          status: 'idle',
          order: null,
          organization: Math.min(70, current.organization + 5),
        }
      }

      territories = {
        ...territories,
        [target.id]: {
          ...target,
          owner: battle.attacker,
          defense: Math.max(0, target.defense - 1),
          supply: Math.max(30, Math.floor((source.supply + target.supply) / 2)),
        },
      }

      next = withEvent(
        { ...next, territories, divisionUnits },
        'capture',
        `${actorName(next, battle.attacker)} · ${target.fullName} 점령 · ${survivingAttackers.length}개 사단 진입`,
      )
      continue
    }

    if (defenderVictory) {
      for (const attacker of survivingAttackers) {
        const current = divisionUnits[attacker.id]
        if (!current) continue
        divisionUnits[attacker.id] = {
          ...current,
          status: 'idle',
          order: null,
          organization: Math.min(current.organization, 35),
        }
      }

      for (const defender of survivingDefenders) {
        const current = divisionUnits[defender.id]
        if (!current) continue
        divisionUnits[defender.id] = {
          ...current,
          status: 'idle',
          order: null,
        }
      }

      next = withEvent(
        { ...next, territories, divisionUnits },
        'defense',
        `${actorName(next, battle.attacker)} · ${target.fullName} 공격 실패`,
      )
      continue
    }

    active.push({
      ...battle,
      progress,
      attackerDivisionIds: survivingAttackers.map((division) => division.id),
      defenderDivisionIds: survivingDefenders.map((division) => division.id),
    })
  }

  next = {
    ...next,
    divisionUnits,
    territories,
    battles: active,
  }

  if (
    next.selectedDivisionId &&
    !next.divisionUnits[next.selectedDivisionId]
  ) {
    next = { ...next, selectedDivisionId: null }
  }

  return syncTerritoryDivisionCounts(next)
}

export function transferTroops(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const division = divisionsAt(state, fromId, 'player').find(
    (candidate) => candidate.status === 'idle',
  )
  if (!division) return state
  return issueDivisionOrder(state, division.id, toId)
}

function aiBuild(state: GameState, owner: AiFactionId): GameState {
  const owned = Object.values(state.territories).filter(
    (territory) => territory.owner === owner,
  )
  if (owned.length === 0) return state

  const queueCap =
    state.difficulty === 'easy' ? 1 : state.difficulty === 'hard' ? 4 : 3
  if (
    state.productionQueue.filter((order) => order.owner === owner).length >=
    queueCap
  ) {
    return state
  }

  const frontlines = owned.filter((territory) =>
    territory.neighbors.some(
      (id) => state.territories[id]?.owner !== owner,
    ),
  )

  const divisionTarget = [...(frontlines.length > 0 ? frontlines : owned)]
    .filter((territory) => !hasProductionAt(state, owner, territory.id))
    .sort(
      (a, b) =>
        a.divisions - b.divisions ||
        b.supply - a.supply ||
        a.id.localeCompare(b.id),
    )[0]

  if (divisionTarget && state.funds[owner] >= DIVISION_COST) {
    return queueProductionForOwner(
      state,
      divisionTarget.id,
      'division',
      owner,
    )
  }

  const totalFactories = owned.reduce(
    (sum, territory) => sum + territory.factories,
    0,
  )
  const desiredFactories = Math.max(2, Math.ceil(owned.length / 4))
  const factoryTarget = [...owned]
    .filter(
      (territory) =>
        territory.factories < MAX_FACTORIES &&
        !hasProductionAt(state, owner, territory.id),
    )
    .sort(
      (a, b) => a.factories - b.factories || a.id.localeCompare(b.id),
    )[0]

  if (
    totalFactories < desiredFactories &&
    factoryTarget &&
    state.funds[owner] >= FACTORY_COST
  ) {
    return queueProductionForOwner(state, factoryTarget.id, 'factory', owner)
  }

  return state
}

function aiIssueOrders(state: GameState, owner: AiFactionId): GameState {
  const candidates = Object.values(state.divisionUnits)
    .filter(
      (division) =>
        division.owner === owner &&
        division.status === 'idle' &&
        division.organization >= 35,
    )
    .sort((a, b) => b.organization - a.organization)

  if (candidates.length === 0) return state

  const maxOrders =
    state.difficulty === 'easy' ? 1 : state.difficulty === 'hard' ? 3 : 2
  let next = state
  let issued = 0

  for (const division of candidates) {
    if (issued >= maxOrders) break

    const current = next.divisionUnits[division.id]
    if (!current || current.status !== 'idle') continue
    const territory = next.territories[current.locationId]
    if (!territory) continue

    const hostileTargets = territory.neighbors
      .map((id) => next.territories[id])
      .filter(
        (target): target is TerritoryState =>
          Boolean(target && target.owner !== owner),
      )
      .sort(
        (a, b) =>
          territoryMilitaryPower(a, next) -
            territoryMilitaryPower(b, next) ||
          a.id.localeCompare(b.id),
      )

    const target = hostileTargets[0]
    if (target) {
      next = startDivisionBattle(
        next,
        current.id,
        target.id,
        owner,
        state.difficulty === 'hard'
          ? 'aggressive'
          : state.difficulty === 'easy'
            ? 'cautious'
            : 'balanced',
      )
      issued += 1
      continue
    }

    const friendlyFront = territory.neighbors
      .map((id) => next.territories[id])
      .find(
        (candidate) =>
          candidate?.owner === owner &&
          candidate.neighbors.some(
            (neighborId) =>
              next.territories[neighborId]?.owner !== owner,
          ),
      )

    if (friendlyFront) {
      const totalTicks = movementTicks(territory, friendlyFront, current.role)
      next = setDivision(next, {
        ...current,
        status: 'moving',
        order: {
          type: 'move',
          targetId: friendlyFront.id,
          path: [friendlyFront.id],
          totalTicks,
          remainingTicks: totalTicks,
          issuedTick: next.tick,
        },
      })
      issued += 1
    }
  }

  return next
}

function runAutoOffensive(state: GameState): GameState {
  if (!state.autoOffensive) return state

  const candidate = playerDivisions(state)
    .filter(
      (division) =>
        division.status === 'idle' &&
        division.organization >= 55 &&
        division.strength >= 55,
    )
    .map((division) => ({
      division,
      territory: state.territories[division.locationId],
    }))
    .filter(
      (
        item,
      ): item is { division: DivisionUnit; territory: TerritoryState } =>
        Boolean(
          item.territory &&
            item.territory.neighbors.some(
              (id) => state.territories[id]?.owner !== 'player',
            ),
        ),
    )
    .sort(
      (a, b) =>
        b.division.organization - a.division.organization ||
        b.division.strength - a.division.strength,
    )[0]

  if (!candidate) return state

  const target = candidate.territory.neighbors
    .map((id) => state.territories[id])
    .filter(
      (territory): territory is TerritoryState =>
        Boolean(territory && territory.owner !== 'player'),
    )
    .sort(
      (a, b) =>
        territoryMilitaryPower(a, state) -
          territoryMilitaryPower(b, state) ||
        a.id.localeCompare(b.id),
    )[0]

  if (!target) return state

  return startDivisionBattle(
    state,
    candidate.division.id,
    target.id,
    'player',
    state.attackStance,
  )
}

function recoverDivisions(state: GameState): GameState {
  const divisionUnits = { ...state.divisionUnits }
  let changed = false

  for (const [id, division] of Object.entries(divisionUnits)) {
    if (division.status !== 'idle') continue

    const territory = state.territories[division.locationId]
    if (!territory || territory.owner !== division.owner) continue

    const organization = Math.min(
      100,
      division.organization + (territory.supply >= 55 ? 2.2 : 0.6),
    )
    const strength = Math.min(
      100,
      division.strength + (territory.supply >= 70 ? 0.35 : 0.08),
    )

    if (
      organization !== division.organization ||
      strength !== division.strength
    ) {
      divisionUnits[id] = {
        ...division,
        organization,
        strength,
      }
      changed = true
    }
  }

  return changed ? { ...state, divisionUnits } : state
}

function applyIncome(state: GameState): GameState {
  const active: PlayableFactionId[] = [
    'player',
    ...activeAiFactions(state.aiCount),
  ]

  const funds = { ...state.funds }
  for (const owner of active) {
    funds[owner] += factionIncomePerCycle(state, owner)
  }

  let next: GameState = { ...state, funds }
  const playerIncome = factionIncomePerCycle(state, 'player')

  if (playerIncome > 0) {
    next = withEvent(
      next,
      'economy',
      `산업 수익 +${playerIncome} · 보유 자금 ${funds.player}`,
    )
  }

  for (const owner of activeAiFactions(state.aiCount)) {
    next = aiBuild(next, owner)
  }

  return next
}

function updatePhase(state: GameState): GameState {
  const values = Object.values(state.territories)
  const playerOwned = values.filter(
    (territory) => territory.owner === 'player',
  ).length

  if (
    playerOwned === values.length &&
    values.length > 0 &&
    state.phase === 'running'
  ) {
    return withEvent(
      { ...state, phase: 'victory', running: false },
      'system',
      '전국 통제 완료',
    )
  }

  if (playerOwned === 0 && state.phase === 'running') {
    return withEvent(
      { ...state, phase: 'defeat', running: false },
      'system',
      '플레이어 세력 소멸',
    )
  }

  return state
}

export function advanceTick(state: GameState): GameState {
  if (!state.running || state.phase !== 'running') return state

  const nextTick = state.tick + 1
  let territories = state.territories

  if (nextTick % 4 === 0) {
    territories = { ...territories }

    for (const [id, territory] of Object.entries(territories)) {
      if (territory.owner === 'neutral') continue

      const connected = territory.neighbors.some(
        (neighborId) =>
          territories[neighborId]?.owner === territory.owner,
      )

      territories[id] = {
        ...territory,
        supply: connected
          ? Math.min(100, territory.supply + 1.2)
          : Math.max(0, territory.supply - 3),
      }
    }
  }

  let next: GameState = {
    ...state,
    tick: nextTick,
    territories,
  }

  next = processProduction(next)
  next = processMovement(next)
  next = processBattles(next)

  if (nextTick % 2 === 0) {
    next = recoverDivisions(next)
  }

  if (nextTick % ECONOMY_INTERVAL === 0) {
    next = applyIncome(next)
  }

  const aiInterval =
    state.difficulty === 'easy'
      ? 7
      : state.difficulty === 'hard'
        ? 2
        : 4

  if (nextTick % aiInterval === 0) {
    for (const faction of activeAiFactions(state.aiCount)) {
      next = aiIssueOrders(next, faction)
    }
  }

  if (nextTick % 5 === 0) {
    next = runAutoOffensive(next)
  }

  return updatePhase(syncTerritoryDivisionCounts(next))
}

export function ownerCounts(state: GameState): Record<FactionId, number> {
  const counts: Record<FactionId, number> = {
    player: 0,
    red: 0,
    blue: 0,
    green: 0,
    neutral: 0,
  }

  for (const territory of Object.values(state.territories)) {
    counts[territory.owner] += 1
  }

  return counts
}

export function captureTerritory(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const division = divisionsAt(state, fromId, 'player').find(
    (candidate) => candidate.status === 'idle',
  )
  if (!division) return state
  return issueDivisionOrder(state, division.id, toId)
}
