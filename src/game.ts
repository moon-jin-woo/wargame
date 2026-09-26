import type {
  AiCount,
  AiFactionId,
  AttackStance,
  BattleState,
  Difficulty,
  DivisionOrder,
  DivisionState,
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
export const DIVISION_MOVE_TICKS = 3

export const PRODUCTION_TICKS: Record<ProductionKind, number> = {
  factory: 30,
  division: 12,
  defense: 16,
}

const STARTING_FUNDS = 320
const DIVISION_POWER = 100
const DEFENSE_POWER = 60
const aiFactions: AiFactionId[] = ['red', 'blue', 'green']

const stanceCommit: Record<AttackStance, number> = {
  cautious: 0.4,
  balanced: 0.65,
  aggressive: 1,
}

const stancePower: Record<AttackStance, number> = {
  cautious: 0.94,
  balanced: 1,
  aggressive: 1.08,
}

const stanceSupplyCost: Record<AttackStance, number> = {
  cautious: 3,
  balanced: 5,
  aggressive: 8,
}

const commanderSurnames = ['강', '김', '남', '문', '박', '서', '송', '윤', '이', '정', '최', '한']
const commanderNames = ['도현', '민재', '서준', '시우', '유진', '지훈', '태윤', '하람', '현우', '예준', '준서', '성민']

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
    id: `${state.tick}:${kind}:${state.events.length}:${message.slice(0, 24)}`,
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

function emptySerials(): Record<PlayableFactionId, number> {
  return {
    player: 0,
    red: 0,
    blue: 0,
    green: 0,
  }
}

function divisionName(owner: PlayableFactionId, serial: number): string {
  const role =
    serial % 5 === 0 ? '기동사단' : serial % 3 === 0 ? '전투사단' : '보병사단'
  return `제${serial}${role}`
}

function commanderName(owner: PlayableFactionId, serial: number): string {
  const seed = hashString(`${owner}:${serial}:commander`)
  const surname = commanderSurnames[seed % commanderSurnames.length]
  const given = commanderNames[(seed >>> 5) % commanderNames.length]
  return `${surname}${given}`
}

function createDivision(
  state: GameState,
  owner: PlayableFactionId,
  territoryId: string,
  overrides: Partial<DivisionState> = {},
): GameState {
  const territory = state.territories[territoryId]
  if (!territory || territory.owner !== owner) return state

  const serial = state.divisionSerials[owner] + 1
  const id = `${owner}-division-${serial}-${state.tick}`
  const division: DivisionState = {
    id,
    owner,
    name: divisionName(owner, serial),
    commanderName: commanderName(owner, serial),
    locationId: territoryId,
    strength: 100,
    organization: 100,
    experience: 0,
    status: 'idle',
    orderId: null,
    battleId: null,
    ...overrides,
  }

  return {
    ...state,
    divisionSerials: {
      ...state.divisionSerials,
      [owner]: serial,
    },
    divisions: {
      ...state.divisions,
      [id]: division,
    },
    territories: {
      ...state.territories,
      [territoryId]: {
        ...territory,
        divisions: territory.divisions + 1,
      },
    },
  }
}

function removeDivision(state: GameState, divisionId: string): GameState {
  const division = state.divisions[divisionId]
  if (!division) return state

  const divisions = { ...state.divisions }
  delete divisions[divisionId]

  const territory = state.territories[division.locationId]
  return {
    ...state,
    divisions,
    territories: territory
      ? {
          ...state.territories,
          [territory.id]: {
            ...territory,
            divisions: Math.max(0, territory.divisions - 1),
          },
        }
      : state.territories,
  }
}

function moveDivisionGroupImmediately(
  state: GameState,
  divisionIds: string[],
  destinationId: string,
): GameState {
  const destination = state.territories[destinationId]
  if (!destination || divisionIds.length === 0) return state

  const divisions = { ...state.divisions }
  const touched = new Set<string>([destinationId])

  for (const id of divisionIds) {
    const division = divisions[id]
    if (!division) continue
    touched.add(division.locationId)
    divisions[id] = {
      ...division,
      locationId: destinationId,
    }
  }

  const counts = new Map<string, number>()
  for (const territoryId of touched) counts.set(territoryId, 0)

  for (const division of Object.values(divisions)) {
    if (counts.has(division.locationId)) {
      counts.set(
        division.locationId,
        (counts.get(division.locationId) ?? 0) + 1,
      )
    }
  }

  const territories = { ...state.territories }
  for (const [territoryId, count] of counts) {
    const territory = territories[territoryId]
    if (!territory) continue
    territories[territoryId] = {
      ...territory,
      divisions: count,
    }
  }

  return { ...state, divisions, territories }
}

function setDivisionStatus(
  state: GameState,
  divisionIds: string[],
  patch: Partial<DivisionState>,
): GameState {
  const divisions = { ...state.divisions }

  for (const id of divisionIds) {
    const division = divisions[id]
    if (!division) continue
    divisions[id] = { ...division, ...patch }
  }

  return { ...state, divisions }
}

function divisionsAt(
  state: GameState,
  territoryId: string,
  owner?: PlayableFactionId,
): DivisionState[] {
  return Object.values(state.divisions).filter(
    (division) =>
      division.locationId === territoryId &&
      (owner ? division.owner === owner : true),
  )
}

function idleDivisionsAt(
  state: GameState,
  territoryId: string,
  owner: PlayableFactionId,
): DivisionState[] {
  return divisionsAt(state, territoryId, owner).filter(
    (division) => division.status === 'idle',
  )
}

function friendlyPath(
  state: GameState,
  owner: PlayableFactionId,
  fromId: string,
  targetId: string,
): string[] | null {
  if (fromId === targetId) return []
  if (state.territories[targetId]?.owner !== owner) return null

  const queue: string[] = [fromId]
  const previous = new Map<string, string | null>([[fromId, null]])

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    const territory = state.territories[current]
    if (!territory) continue

    for (const neighborId of territory.neighbors) {
      if (previous.has(neighborId)) continue
      const neighbor = state.territories[neighborId]
      if (!neighbor || neighbor.owner !== owner) continue
      previous.set(neighborId, current)

      if (neighborId === targetId) {
        const path: string[] = []
        let cursor: string | null = neighborId

        while (cursor && cursor !== fromId) {
          path.unshift(cursor)
          cursor = previous.get(cursor) ?? null
        }

        return path
      }

      queue.push(neighborId)
    }
  }

  return null
}

function attackPath(
  state: GameState,
  owner: PlayableFactionId,
  fromId: string,
  targetId: string,
): string[] | null {
  const target = state.territories[targetId]
  if (!target || target.owner === owner) return null

  const from = state.territories[fromId]
  if (!from) return null

  if (from.neighbors.includes(targetId)) return [targetId]

  let best: string[] | null = null
  for (const neighborId of target.neighbors) {
    if (state.territories[neighborId]?.owner !== owner) continue
    const path = friendlyPath(state, owner, fromId, neighborId)
    if (!path) continue
    const candidate = [...path, targetId]
    if (!best || candidate.length < best.length) best = candidate
  }

  return best
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

export function divisionMilitaryPower(division: DivisionState): number {
  const readiness =
    (division.strength / 100) *
    (0.5 + division.organization / 200) *
    (1 + division.experience * 0.04)
  return Math.round(DIVISION_POWER * readiness)
}

export function territoryMilitaryPower(territory: TerritoryState): number {
  return territory.divisions * DIVISION_POWER + territory.defense * DEFENSE_POWER
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
    divisions: {},
    divisionOrders: [],
    divisionSerials: emptySerials(),
    battles: [],
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
  const initialClaims: Array<{
    owner: PlayableFactionId
    claimed: string[]
  }> = []

  const playerClaim = claimCluster(territories, startId, 'player', reserved)
  territories = playerClaim.territories
  initialClaims.push({ owner: 'player', claimed: playerClaim.claimed })

  for (const faction of activeAiFactions(state.aiCount)) {
    const seed = chooseFarthestSeed(territories, seeds, reserved)
    if (!seed) continue
    seeds.push(seed)
    const claim = claimCluster(territories, seed, faction, reserved)
    territories = claim.territories
    initialClaims.push({ owner: faction, claimed: claim.claimed })
  }

  let next: GameState = {
    ...state,
    phase: 'running',
    running: true,
    tick: 0,
    selectedId: startId,
    funds: {
      player: STARTING_FUNDS,
      red: STARTING_FUNDS,
      blue: STARTING_FUNDS,
      green: STARTING_FUNDS,
    },
    productionQueue: [],
    divisions: {},
    divisionOrders: [],
    divisionSerials: emptySerials(),
    battles: [],
    events: [],
    territories,
  }

  for (const claim of initialClaims) {
    claim.claimed.forEach((territoryId, index) => {
      const count = index === 0 ? 4 : 1
      for (let unit = 0; unit < count; unit += 1) {
        next = createDivision(next, claim.owner, territoryId)
      }
    })
  }

  return withEvent(
    next,
    'system',
    `작전 개시 · ${start.fullName} · 개별 사단 체계 가동`,
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
        ? '사단 편성'
        : '방어 공사'

  return withEvent(
    next,
    'production',
    `${territory.fullName} · ${label} 대기열 추가 · ${duration}틱`,
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
      ...state,
      territories: {
        ...state.territories,
        [territory.id]: {
          ...territory,
          factories: Math.min(MAX_FACTORIES, territory.factories + 1),
        },
      },
    }
  } else if (order.kind === 'division') {
    next = createDivision(state, order.owner, territory.id)
  } else {
    next = {
      ...state,
      territories: {
        ...state.territories,
        [territory.id]: {
          ...territory,
          defense: Math.min(MAX_DEFENSE, territory.defense + 1),
        },
      },
    }
  }

  if (order.owner === 'player') {
    const label =
      order.kind === 'factory'
        ? '산업 시설 완공'
        : order.kind === 'division'
          ? '신규 사단 편성 완료'
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

  return {
    ...next,
    productionQueue: remaining,
  }
}

function selectedForStance(
  divisions: DivisionState[],
  stance: AttackStance,
): DivisionState[] {
  const count = Math.max(
    1,
    Math.ceil(divisions.length * stanceCommit[stance]),
  )
  return divisions
    .slice()
    .sort(
      (a, b) =>
        b.organization - a.organization ||
        b.strength - a.strength ||
        a.id.localeCompare(b.id),
    )
    .slice(0, count)
}

function issueDivisionOrderForOwner(
  state: GameState,
  divisionIds: string[],
  targetId: string,
  owner: PlayableFactionId,
): GameState {
  if (state.phase !== 'running' || divisionIds.length === 0) return state

  const divisions = divisionIds
    .map((id) => state.divisions[id])
    .filter(
      (division): division is DivisionState =>
        Boolean(
          division &&
            division.owner === owner &&
            division.status === 'idle' &&
            division.orderId === null &&
            division.battleId === null,
        ),
    )

  if (divisions.length !== divisionIds.length) return state

  const fromId = divisions[0].locationId
  if (divisions.some((division) => division.locationId !== fromId)) {
    return owner === 'player'
      ? withEvent(
          state,
          'movement',
          '같은 행정동에 있는 사단만 하나의 명령으로 묶을 수 있습니다.',
        )
      : state
  }

  const target = state.territories[targetId]
  if (!target || targetId === fromId) return state

  const kind = target.owner === owner ? 'move' : 'attack'
  const path =
    kind === 'move'
      ? friendlyPath(state, owner, fromId, targetId)
      : attackPath(state, owner, fromId, targetId)

  if (!path || path.length === 0) {
    return owner === 'player'
      ? withEvent(
          state,
          'movement',
          '해당 지역까지 연결된 이동 경로가 없습니다.',
        )
      : state
  }

  const id = `${owner}:order:${state.tick}:${state.divisionOrders.length}:${fromId}:${targetId}`
  const order: DivisionOrder = {
    id,
    owner,
    divisionIds,
    fromId,
    targetId,
    path,
    stepIndex: 0,
    remainingTicks: DIVISION_MOVE_TICKS,
    kind,
    createdTick: state.tick,
  }

  let next = setDivisionStatus(state, divisionIds, {
    status: 'moving',
    orderId: id,
    battleId: null,
  })

  next = {
    ...next,
    divisionOrders: [...next.divisionOrders, order],
  }

  if (owner === 'player') {
    next = withEvent(
      next,
      'movement',
      `${divisions.length}개 사단 · ${state.territories[fromId]?.name ?? '?'} → ${target.name} 이동 명령`,
    )
  }

  return next
}

export function issueDivisionOrder(
  state: GameState,
  divisionIds: string[],
  targetId: string,
): GameState {
  return issueDivisionOrderForOwner(state, divisionIds, targetId, 'player')
}

export function haltDivisions(
  state: GameState,
  divisionIds: string[],
): GameState {
  const selected = new Set(divisionIds)
  const cancelledOrders = state.divisionOrders.filter((order) =>
    order.divisionIds.some((id) => selected.has(id)),
  )

  if (cancelledOrders.length === 0) return state

  const affected = new Set(
    cancelledOrders.flatMap((order) => order.divisionIds),
  )
  const divisions = { ...state.divisions }

  for (const id of affected) {
    const division = divisions[id]
    if (!division || division.battleId) continue
    divisions[id] = {
      ...division,
      status: 'idle',
      orderId: null,
    }
  }

  return withEvent(
    {
      ...state,
      divisions,
      divisionOrders: state.divisionOrders.filter(
        (order) => !cancelledOrders.some((item) => item.id === order.id),
      ),
    },
    'movement',
    '선택 사단의 이동 명령을 취소했습니다.',
  )
}

function startBattleWithDivisions(
  state: GameState,
  divisionIds: string[],
  fromId: string,
  toId: string,
  owner: PlayableFactionId,
  stance: AttackStance,
): GameState {
  const from = state.territories[fromId]
  const to = state.territories[toId]
  if (
    !from ||
    !to ||
    from.owner !== owner ||
    to.owner === owner ||
    !from.neighbors.includes(toId)
  ) {
    return setDivisionStatus(state, divisionIds, {
      status: 'idle',
      orderId: null,
    })
  }

  if (
    state.battles.some(
      (battle) =>
        battle.toId === toId ||
        battle.divisionIds.some((id) => divisionIds.includes(id)),
    )
  ) {
    return setDivisionStatus(state, divisionIds, {
      status: 'idle',
      orderId: null,
    })
  }

  const available = divisionIds
    .map((id) => state.divisions[id])
    .filter(
      (division): division is DivisionState =>
        Boolean(
          division &&
            division.owner === owner &&
            division.locationId === fromId,
        ),
    )

  if (available.length === 0) return state

  const committed = selectedForStance(available, stance)
  const committedIds = committed.map((division) => division.id)
  const reserveIds = available
    .filter((division) => !committedIds.includes(division.id))
    .map((division) => division.id)
  const defenderDivisionIds =
    to.owner === 'neutral'
      ? []
      : divisionsAt(state, toId, to.owner as PlayableFactionId)
          .filter((division) => division.status !== 'moving')
          .map((division) => division.id)

  const battleId = `${owner}:battle:${fromId}:${toId}:${state.tick}`
  const battle: BattleState = {
    id: battleId,
    attacker: owner,
    defender: to.owner,
    fromId,
    toId,
    divisionIds: committedIds,
    defenderDivisionIds,
    committedDivisions: committedIds.length,
    progress: 0,
    stance,
    startedTick: state.tick,
  }

  let next = setDivisionStatus(state, committedIds, {
    status: 'attacking',
    orderId: null,
    battleId,
  })
  next = setDivisionStatus(next, reserveIds, {
    status: 'idle',
    orderId: null,
    battleId: null,
  })
  next = setDivisionStatus(next, defenderDivisionIds, {
    status: 'defending',
    orderId: null,
    battleId,
  })
  next = {
    ...next,
    battles: [...next.battles, battle],
  }

  return withEvent(
    next,
    'battle',
    `${actorName(next, owner)} · ${from.name} → ${to.name} · ${committedIds.length}개 사단 전투 돌입`,
  )
}

function processDivisionOrders(state: GameState): GameState {
  if (state.divisionOrders.length === 0) return state

  let next = state
  const remaining: DivisionOrder[] = []

  for (const original of state.divisionOrders) {
    const order = { ...original }
    const validDivisions = order.divisionIds.filter((id) => {
      const division = next.divisions[id]
      return (
        division &&
        division.owner === order.owner &&
        division.orderId === order.id &&
        division.battleId === null
      )
    })

    if (validDivisions.length === 0) continue
    order.divisionIds = validDivisions

    if (order.remainingTicks > 1) {
      remaining.push({
        ...order,
        remainingTicks: order.remainingTicks - 1,
      })
      continue
    }

    const currentDivision = next.divisions[validDivisions[0]]
    if (!currentDivision) continue

    const currentId = currentDivision.locationId
    const stepId = order.path[order.stepIndex]
    const currentTerritory = next.territories[currentId]
    const stepTerritory = next.territories[stepId]

    if (!currentTerritory || !stepTerritory) {
      next = setDivisionStatus(next, validDivisions, {
        status: 'idle',
        orderId: null,
      })
      continue
    }

    const finalStep = order.stepIndex === order.path.length - 1

    if (finalStep && stepTerritory.owner !== order.owner) {
      if (!currentTerritory.neighbors.includes(stepId)) {
        next = setDivisionStatus(next, validDivisions, {
          status: 'idle',
          orderId: null,
        })
        continue
      }

      next = startBattleWithDivisions(
        next,
        validDivisions,
        currentId,
        stepId,
        order.owner,
        order.owner === 'player' ? next.attackStance : stanceForAi(next),
      )
      continue
    }

    if (stepTerritory.owner !== order.owner) {
      next = setDivisionStatus(next, validDivisions, {
        status: 'idle',
        orderId: null,
      })
      continue
    }

    next = moveDivisionGroupImmediately(next, validDivisions, stepId)
    const nextStepIndex = order.stepIndex + 1

    if (nextStepIndex >= order.path.length) {
      next = setDivisionStatus(next, validDivisions, {
        status: 'idle',
        orderId: null,
      })

      if (order.owner === 'player') {
        next = withEvent(
          next,
          'movement',
          `${validDivisions.length}개 사단 · ${stepTerritory.fullName} 도착`,
        )
      }
    } else {
      remaining.push({
        ...order,
        stepIndex: nextStepIndex,
        remainingTicks: DIVISION_MOVE_TICKS,
      })
    }
  }

  return {
    ...next,
    divisionOrders: remaining,
  }
}

export function captureTerritory(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const idle = idleDivisionsAt(state, fromId, 'player')
  if (idle.length === 0) return state
  return issueDivisionOrder(
    state,
    idle.map((division) => division.id),
    toId,
  )
}

function effectiveBattlePower(
  state: GameState,
  divisionIds: string[],
): number {
  return divisionIds.reduce((sum, id) => {
    const division = state.divisions[id]
    return division ? sum + divisionMilitaryPower(division) : sum
  }, 0)
}

function applyBattleWear(
  state: GameState,
  ids: string[],
  strengthLoss: number,
  organizationLoss: number,
): GameState {
  const divisions = { ...state.divisions }

  for (const id of ids) {
    const division = divisions[id]
    if (!division) continue
    divisions[id] = {
      ...division,
      strength: clamp(division.strength - strengthLoss, 0, 100),
      organization: clamp(
        division.organization - organizationLoss,
        0,
        100,
      ),
    }
  }

  return { ...state, divisions }
}

function retreatDefenders(
  state: GameState,
  battle: BattleState,
): GameState {
  let next = state
  const retreatCandidates = state.territories[battle.toId]?.neighbors.filter(
    (id) => state.territories[id]?.owner === battle.defender,
  ) ?? []

  for (const id of battle.defenderDivisionIds) {
    const division = next.divisions[id]
    if (!division) continue

    if (division.strength <= 8 || retreatCandidates.length === 0) {
      next = removeDivision(next, id)
      continue
    }

    const destination =
      retreatCandidates[
        hashString(`${id}:${state.tick}:retreat`) %
          retreatCandidates.length
      ]

    next = moveDivisionGroupImmediately(next, [id], destination)
    next = setDivisionStatus(next, [id], {
      status: 'idle',
      battleId: null,
      orderId: null,
      organization: Math.max(18, division.organization),
    })
  }

  return next
}

function resolveBattleVictory(
  state: GameState,
  battle: BattleState,
): GameState {
  const target = state.territories[battle.toId]
  if (!target) return state

  let next = retreatDefenders(state, battle)

  const survivingAttackers = battle.divisionIds.filter((id) => {
    const division = next.divisions[id]
    return Boolean(division && division.strength > 8)
  })

  for (const id of battle.divisionIds) {
    const division = next.divisions[id]
    if (division && division.strength <= 8) {
      next = removeDivision(next, id)
    }
  }

  next = {
    ...next,
    territories: {
      ...next.territories,
      [target.id]: {
        ...target,
        owner: battle.attacker,
        defense: Math.max(0, target.defense - 1),
        supply: Math.max(
          30,
          Math.floor(
            ((next.territories[battle.fromId]?.supply ?? 50) +
              target.supply) /
              2,
          ),
        ),
      },
    },
  }

  next = moveDivisionGroupImmediately(
    next,
    survivingAttackers,
    target.id,
  )
  next = setDivisionStatus(next, survivingAttackers, {
    status: 'idle',
    battleId: null,
    orderId: null,
  })

  const divisions = { ...next.divisions }
  for (const id of survivingAttackers) {
    const division = divisions[id]
    if (!division) continue
    divisions[id] = {
      ...division,
      organization: Math.max(24, division.organization),
      experience: clamp(division.experience + 0.18, 0, 5),
    }
  }

  next = { ...next, divisions }

  return withEvent(
    next,
    'capture',
    `${actorName(next, battle.attacker)} · ${target.fullName} 점령 · ${survivingAttackers.length}개 사단 진입`,
  )
}

function resolveBattleDefeat(
  state: GameState,
  battle: BattleState,
): GameState {
  let next = state

  for (const id of battle.divisionIds) {
    const division = next.divisions[id]
    if (!division) continue

    if (division.strength <= 8) {
      next = removeDivision(next, id)
    } else {
      next = setDivisionStatus(next, [id], {
        status: 'idle',
        battleId: null,
        orderId: null,
        organization: Math.max(18, division.organization),
      })
    }
  }

  next = setDivisionStatus(next, battle.defenderDivisionIds, {
    status: 'idle',
    battleId: null,
    orderId: null,
  })

  return withEvent(
    next,
    'defense',
    `${actorName(next, battle.attacker)} · ${state.territories[battle.toId]?.fullName ?? '목표'} 공세 실패`,
  )
}

function processBattles(state: GameState): GameState {
  if (state.battles.length === 0) return state

  let next = state
  const active: BattleState[] = []

  for (const battle of state.battles) {
    const from = next.territories[battle.fromId]
    const to = next.territories[battle.toId]

    if (
      !from ||
      !to ||
      from.owner !== battle.attacker ||
      to.owner !== battle.defender
    ) {
      next = setDivisionStatus(next, battle.divisionIds, {
        status: 'idle',
        battleId: null,
        orderId: null,
      })
      next = setDivisionStatus(next, battle.defenderDivisionIds, {
        status: 'idle',
        battleId: null,
        orderId: null,
      })
      continue
    }

    const attackerIds = battle.divisionIds.filter((id) => {
      const division = next.divisions[id]
      return Boolean(
        division &&
          division.owner === battle.attacker &&
          division.locationId === battle.fromId,
      )
    })
    const defenderIds = battle.defenderDivisionIds.filter((id) => {
      const division = next.divisions[id]
      return Boolean(
        division &&
          division.locationId === battle.toId &&
          division.owner === battle.defender,
      )
    })

    if (attackerIds.length === 0) {
      next = resolveBattleDefeat(next, battle)
      continue
    }

    const attackSupply = 0.65 + from.supply / 210
    const defenseSupply = 0.7 + to.supply / 230
    const attackPower =
      effectiveBattlePower(next, attackerIds) *
      attackSupply *
      stancePower[battle.stance]
    const garrisonPower =
      battle.defender === 'neutral' ? 18 : 35
    const defensePower =
      (effectiveBattlePower(next, defenderIds) +
        to.defense * DEFENSE_POWER +
        garrisonPower) *
      defenseSupply

    const ratio = attackPower / Math.max(30, defensePower)
    const jitter =
      (((hashString(`${battle.id}:${next.tick}`) % 9) - 4) * 0.32)
    const delta = clamp((ratio - 1) * 11 + jitter + (defenderIds.length === 0 ? 4 : 0), -12, 16)
    const progress = battle.progress + delta

    const attackerWear = clamp(0.45 / Math.max(0.55, ratio), 0.18, 1.3)
    const defenderWear = clamp(0.38 * Math.max(0.7, ratio), 0.18, 1.25)
    next = applyBattleWear(
      next,
      attackerIds,
      attackerWear,
      battle.stance === 'aggressive' ? 4.4 : battle.stance === 'cautious' ? 2.7 : 3.4,
    )
    next = applyBattleWear(
      next,
      defenderIds,
      defenderWear,
      3.1,
    )

    if (progress >= 100) {
      next = resolveBattleVictory(next, {
        ...battle,
        divisionIds: attackerIds,
        defenderDivisionIds: defenderIds,
      })
      continue
    }

    if (progress <= -100) {
      next = resolveBattleDefeat(next, {
        ...battle,
        divisionIds: attackerIds,
        defenderDivisionIds: defenderIds,
      })
      continue
    }

    active.push({
      ...battle,
      divisionIds: attackerIds,
      defenderDivisionIds: defenderIds,
      committedDivisions: attackerIds.length,
      progress,
    })
  }

  return {
    ...next,
    battles: active,
  }
}

export function transferTroops(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const division = idleDivisionsAt(state, fromId, 'player')[0]
  if (!division) return state
  return issueDivisionOrder(state, [division.id], toId)
}

export function renameDivision(
  state: GameState,
  divisionId: string,
  name: string,
): GameState {
  const division = state.divisions[divisionId]
  if (!division || division.owner !== 'player') return state

  return {
    ...state,
    divisions: {
      ...state.divisions,
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
  name: string,
): GameState {
  const division = state.divisions[divisionId]
  if (!division || division.owner !== 'player') return state

  return {
    ...state,
    divisions: {
      ...state.divisions,
      [divisionId]: {
        ...division,
        commanderName: name.slice(0, 24),
      },
    },
  }
}

function stanceForAi(state: GameState): AttackStance {
  if (state.difficulty === 'easy') return 'cautious'
  if (state.difficulty === 'hard') return 'aggressive'
  return 'balanced'
}

function targetScore(
  target: TerritoryState,
  difficulty: Difficulty,
): number {
  if (difficulty === 'easy') return 0
  const neutralBonus = target.owner === 'neutral' ? 30 : 0
  const militaryWeakness = Math.max(0, 500 - territoryMilitaryPower(target))
  const supplyWeakness = Math.max(0, 100 - target.supply)
  const factoryValue = target.factories * 25
  return neutralBonus + militaryWeakness * 0.08 + supplyWeakness * 0.3 + factoryValue
}

function runAiTurn(state: GameState, owner: AiFactionId): GameState {
  const battleCap =
    state.difficulty === 'easy' ? 1 : state.difficulty === 'hard' ? 3 : 2
  if (
    state.battles.filter((battle) => battle.attacker === owner).length >=
    battleCap
  ) {
    return state
  }

  const candidates = Object.values(state.territories).filter((territory) => {
    if (territory.owner !== owner) return false
    const idle = idleDivisionsAt(state, territory.id, owner)
    if (idle.length === 0) return false
    return territory.neighbors.some(
      (id) => state.territories[id]?.owner !== owner,
    )
  })

  if (candidates.length === 0) return state

  const from =
    candidates[hashString(`${owner}:${state.tick}`) % candidates.length]
  const targets = from.neighbors
    .map((id) => state.territories[id])
    .filter(
      (territory): territory is TerritoryState =>
        Boolean(territory && territory.owner !== owner),
    )

  if (targets.length === 0) return state

  const to =
    state.difficulty === 'easy'
      ? targets[hashString(`${from.id}:${state.tick}`) % targets.length]
      : [...targets].sort((a, b) => {
          const difference =
            targetScore(b, state.difficulty) -
            targetScore(a, state.difficulty)
          if (difference !== 0) return difference
          return a.id.localeCompare(b.id)
        })[0]

  const available = idleDivisionsAt(state, from.id, owner)
  const selected =
    state.difficulty === 'hard'
      ? available
      : available.slice(0, Math.max(1, Math.ceil(available.length * 0.7)))

  return issueDivisionOrderForOwner(
    state,
    selected.map((division) => division.id),
    to.id,
    owner,
  )
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
        territoryMilitaryPower(a) - territoryMilitaryPower(b) ||
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

  if (state.difficulty === 'hard') {
    const defenseTarget = [...frontlines]
      .filter(
        (territory) =>
          territory.defense < 2 &&
          !hasProductionAt(state, owner, territory.id),
      )
      .sort(
        (a, b) => a.defense - b.defense || a.id.localeCompare(b.id),
      )[0]

    if (
      defenseTarget &&
      state.funds[owner] >= defenseUpgradeCost(defenseTarget.defense)
    ) {
      return queueProductionForOwner(
        state,
        defenseTarget.id,
        'defense',
        owner,
      )
    }
  }

  return state
}

function runAutoOffensive(state: GameState): GameState {
  if (!state.autoOffensive) return state
  if (state.battles.some((battle) => battle.attacker === 'player')) return state
  if (state.divisionOrders.some((order) => order.owner === 'player' && order.kind === 'attack')) return state

  const candidates = Object.values(state.territories)
    .filter(
      (territory) =>
        territory.owner === 'player' &&
        idleDivisionsAt(state, territory.id, 'player').length >= 2 &&
        territory.neighbors.some(
          (neighborId) =>
            state.territories[neighborId]?.owner !== 'player',
        ),
    )
    .sort(
      (a, b) =>
        b.divisions - a.divisions ||
        b.supply - a.supply ||
        a.id.localeCompare(b.id),
    )

  const from = candidates[0]
  if (!from) return state

  const to = from.neighbors
    .map((id) => state.territories[id])
    .filter(
      (territory): territory is TerritoryState =>
        Boolean(territory && territory.owner !== 'player'),
    )
    .sort(
      (a, b) =>
        territoryMilitaryPower(a) - territoryMilitaryPower(b) ||
        a.id.localeCompare(b.id),
    )[0]

  if (!to) return state
  const idle = idleDivisionsAt(state, from.id, 'player')
  return issueDivisionOrder(
    state,
    idle.map((division) => division.id),
    to.id,
  )
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

function recoverDivisions(state: GameState): GameState {
  if (state.tick % 4 !== 0) return state
  const divisions = { ...state.divisions }

  for (const [id, division] of Object.entries(divisions)) {
    if (division.status !== 'idle') continue
    const territory = state.territories[division.locationId]
    if (!territory || territory.owner !== division.owner) continue
    divisions[id] = {
      ...division,
      strength: clamp(division.strength + 0.35, 0, 100),
      organization: clamp(
        division.organization + (territory.supply >= 55 ? 2.4 : 0.9),
        0,
        100,
      ),
    }
  }

  return { ...state, divisions }
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
  next = processDivisionOrders(next)
  next = processBattles(next)
  next = recoverDivisions(next)

  if (nextTick % ECONOMY_INTERVAL === 0) {
    next = applyIncome(next)
  }

  const aiInterval =
    state.difficulty === 'easy'
      ? 6
      : state.difficulty === 'hard'
        ? 2
        : 3

  if (nextTick % aiInterval === 0) {
    for (const faction of activeAiFactions(state.aiCount)) {
      next = runAiTurn(next, faction)
    }
  }

  if (nextTick % 4 === 0) {
    next = runAutoOffensive(next)
  }

  return updatePhase(next)
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
