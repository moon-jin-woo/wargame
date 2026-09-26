import type {
  AiCount,
  AiFactionId,
  AttackStance,
  BattleState,
  Difficulty,
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
export const DIVISION_MOVE_TICKS = 2

export const PRODUCTION_TICKS: Record<ProductionKind, number> = {
  factory: 30,
  division: 12,
  defense: 16,
}

const STARTING_FUNDS = 320
const DIVISION_POWER = 100
const DEFENSE_POWER = 60
const aiFactions: AiFactionId[] = ['red', 'blue', 'green']

const stancePower: Record<AttackStance, number> = {
  cautious: 0.92,
  balanced: 1,
  aggressive: 1.1,
}

const commanderPool = [
  '강민재',
  '김도윤',
  '박서준',
  '이현우',
  '정우진',
  '최민석',
  '한지훈',
  '윤태경',
  '임도현',
  '서준혁',
  '오재민',
  '백승현',
  '권태윤',
  '조현민',
  '신도훈',
  '남우석',
]

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
        divisions: Number.isFinite(territory.divisions)
          ? Math.max(0, Math.floor(territory.divisions))
          : Math.max(0, Math.round((territory.troops ?? 0) / 35)),
        defense: Number.isFinite(territory.defense)
          ? Math.max(0, Math.floor(territory.defense))
          : 0,
      },
    ]),
  )
}

function divisionTemplateName(serial: number): string {
  const labels = ['전투', '기동', '경비', '전선']
  return `제${serial} ${labels[(serial - 1) % labels.length]}사단`
}

function divisionCommander(owner: PlayableFactionId, serial: number): string {
  const offset = hashString(owner) % commanderPool.length
  return commanderPool[(offset + serial - 1) % commanderPool.length]
}

function makeDivision(
  owner: PlayableFactionId,
  territoryId: string,
  serial: number,
  createdTick: number,
  idSeed: string,
): DivisionUnit {
  return {
    id: `div:${owner}:${idSeed}:${serial}`,
    owner,
    name: divisionTemplateName(serial),
    commander: divisionCommander(owner, serial),
    territoryId,
    strength: 100,
    organization: 82,
    supply: 85,
    experience: 0,
    status: 'idle',
    order: null,
    createdTick,
  }
}

function divisionPower(division: DivisionUnit): number {
  const readiness = 0.25 + (division.organization / 100) * 0.75
  const strength = 0.2 + (division.strength / 100) * 0.8
  const supply = 0.55 + division.supply / 220
  const experience = 1 + division.experience / 400
  return DIVISION_POWER * readiness * strength * supply * experience
}

function divisionsAt(
  state: GameState,
  territoryId: string,
  owner?: PlayableFactionId,
): DivisionUnit[] {
  return Object.values(state.divisions).filter(
    (division) =>
      division.territoryId === territoryId &&
      (owner ? division.owner === owner : true),
  )
}

function syncTerritoryDivisionCounts(state: GameState): GameState {
  const counts: Record<string, number> = {}

  for (const division of Object.values(state.divisions)) {
    counts[division.territoryId] = (counts[division.territoryId] ?? 0) + 1
  }

  let changed = false
  const territories = { ...state.territories }

  for (const [id, territory] of Object.entries(state.territories)) {
    const count = counts[id] ?? 0
    if (territory.divisions !== count) {
      territories[id] = { ...territory, divisions: count }
      changed = true
    }
  }

  return changed ? { ...state, territories } : state
}

function materializeDivisions(
  territories: Record<string, TerritoryState>,
  tick: number,
): Record<string, DivisionUnit> {
  const divisions: Record<string, DivisionUnit> = {}
  const serials: Record<PlayableFactionId, number> = {
    player: 0,
    red: 0,
    blue: 0,
    green: 0,
  }

  for (const territory of Object.values(territories).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (territory.owner === 'neutral') continue
    const owner = territory.owner

    for (let index = 0; index < territory.divisions; index += 1) {
      serials[owner] += 1
      const division = makeDivision(
        owner,
        territory.id,
        serials[owner],
        tick,
        `start:${territory.id}:${index}`,
      )
      divisions[division.id] = division
    }
  }

  return divisions
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

export function territoryMilitaryPower(territory: TerritoryState): number {
  return territory.divisions * DIVISION_POWER + territory.defense * DEFENSE_POWER
}

export function divisionMilitaryPower(division: DivisionUnit): number {
  return Math.round(divisionPower(division))
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
    battles: [],
    divisions: {},
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
): Record<string, TerritoryState> {
  const next = { ...territories }
  const seed = next[seedId]
  if (!seed) return next

  const cluster = [seedId, ...seed.neighbors.slice(0, 4)]

  cluster.forEach((id, index) => {
    const territory = next[id]
    if (!territory || (reserved.has(id) && id !== seedId)) return

    reserved.add(id)
    next[id] = {
      ...territory,
      owner,
      troops: 0,
      factories: index === 0 ? 2 : 0,
      divisions: index === 0 ? 4 : 1,
      defense: index === 0 ? 1 : 0,
      supply: index === 0 ? 92 : 78,
    }
  })

  return next
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

  territories = claimCluster(territories, startId, 'player', reserved)

  for (const faction of activeAiFactions(state.aiCount)) {
    const seed = chooseFarthestSeed(territories, seeds, reserved)
    if (!seed) continue
    seeds.push(seed)
    territories = claimCluster(territories, seed, faction, reserved)
  }

  const divisions = materializeDivisions(territories, 0)

  return withEvent(
    syncTerritoryDivisionCounts({
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
      battles: [],
      divisions,
      events: [],
      territories,
    }),
    'system',
    `작전 개시 · ${start.fullName} · 개별 사단 체계 활성화`,
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
    kind === 'factory' ? '산업 시설' : kind === 'division' ? '사단 편성' : '방어 공사'

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

function nextDivisionSerial(state: GameState, owner: PlayableFactionId): number {
  return Object.values(state.divisions).filter(
    (division) => division.owner === owner,
  ).length + 1
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
    const serial = nextDivisionSerial(state, order.owner)
    const division = makeDivision(
      order.owner,
      territory.id,
      serial,
      state.tick,
      order.id,
    )

    next = syncTerritoryDivisionCounts({
      ...state,
      divisions: {
        ...state.divisions,
        [division.id]: division,
      },
    })
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

  return {
    ...next,
    productionQueue: remaining,
  }
}

function findDivisionPath(
  state: GameState,
  division: DivisionUnit,
  targetId: string,
): string[] | null {
  if (division.territoryId === targetId) return []
  if (!state.territories[targetId]) return null

  const queue: string[] = [division.territoryId]
  const previous = new Map<string, string | null>([[division.territoryId, null]])

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) break
    const current = state.territories[currentId]
    if (!current) continue

    for (const neighborId of current.neighbors) {
      if (previous.has(neighborId)) continue
      const neighbor = state.territories[neighborId]
      if (!neighbor) continue

      const traversable =
        neighborId === targetId || neighbor.owner === division.owner
      if (!traversable) continue

      previous.set(neighborId, currentId)

      if (neighborId === targetId) {
        const reversed = [targetId]
        let cursor = currentId
        while (cursor !== division.territoryId) {
          reversed.push(cursor)
          cursor = previous.get(cursor) ?? division.territoryId
        }
        return reversed.reverse()
      }

      queue.push(neighborId)
    }
  }

  return null
}

export function issueDivisionMoveOrders(
  state: GameState,
  divisionIds: string[],
  targetId: string,
): GameState {
  if (state.phase !== 'running') return state

  const divisions = { ...state.divisions }
  let issued = 0

  for (const divisionId of divisionIds) {
    const division = divisions[divisionId]
    if (
      !division ||
      division.owner !== 'player' ||
      division.status === 'battle'
    ) {
      continue
    }

    const path = findDivisionPath(state, division, targetId)
    if (!path || path.length === 0) continue

    divisions[divisionId] = {
      ...division,
      status: 'moving',
      order: {
        kind: 'move',
        targetId,
        path,
        nextIndex: 0,
        remainingTicks: DIVISION_MOVE_TICKS,
        totalTicks: DIVISION_MOVE_TICKS,
      },
    }
    issued += 1
  }

  if (issued === 0) return state

  return withEvent(
    { ...state, divisions },
    'movement',
    `${issued}개 사단 이동 명령 · ${state.territories[targetId]?.name ?? '목표'}`,
  )
}

export function stopDivisionOrders(
  state: GameState,
  divisionIds: string[],
): GameState {
  const divisions = { ...state.divisions }
  let changed = false

  for (const id of divisionIds) {
    const division = divisions[id]
    if (!division || division.owner !== 'player' || division.status === 'battle') {
      continue
    }

    if (division.order || division.status === 'moving') {
      divisions[id] = {
        ...division,
        order: null,
        status: 'idle',
      }
      changed = true
    }
  }

  return changed ? { ...state, divisions } : state
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
  commander: string,
): GameState {
  const division = state.divisions[divisionId]
  if (!division || division.owner !== 'player') return state

  return {
    ...state,
    divisions: {
      ...state.divisions,
      [divisionId]: {
        ...division,
        commander: commander.slice(0, 32),
      },
    },
  }
}

function battleForTarget(
  state: GameState,
  targetId: string,
): BattleState | undefined {
  return state.battles.find((battle) => battle.toId === targetId)
}

function beginOrJoinBattle(
  state: GameState,
  divisionId: string,
  targetId: string,
  stance: AttackStance,
): GameState {
  const division = state.divisions[divisionId]
  const target = state.territories[targetId]
  if (!division || !target || target.owner === division.owner) return state
  if (!state.territories[division.territoryId]?.neighbors.includes(targetId)) {
    return state
  }

  const existing = battleForTarget(state, targetId)

  if (existing) {
    if (existing.attacker !== division.owner) {
      return {
        ...state,
        divisions: {
          ...state.divisions,
          [divisionId]: {
            ...division,
            status: 'idle',
            order: null,
          },
        },
      }
    }

    if (existing.attackerDivisionIds.includes(divisionId)) return state

    return {
      ...state,
      divisions: {
        ...state.divisions,
        [divisionId]: {
          ...division,
          status: 'battle',
          order: null,
        },
      },
      battles: state.battles.map((battle) =>
        battle.id === existing.id
          ? {
              ...battle,
              attackerDivisionIds: [...battle.attackerDivisionIds, divisionId],
            }
          : battle,
      ),
    }
  }

  const defenderDivisionIds = divisionsAt(
    state,
    targetId,
    target.owner === 'neutral' ? undefined : target.owner,
  )
    .filter((candidate) => candidate.status !== 'moving')
    .map((candidate) => candidate.id)

  const divisions = { ...state.divisions }
  divisions[divisionId] = {
    ...division,
    status: 'battle',
    order: null,
  }

  for (const defenderId of defenderDivisionIds) {
    const defender = divisions[defenderId]
    if (!defender) continue
    divisions[defenderId] = {
      ...defender,
      status: 'battle',
      order: null,
    }
  }

  const battle: BattleState = {
    id: `battle:${division.owner}:${targetId}:${state.tick}:${state.battles.length}`,
    attacker: division.owner,
    defender: target.owner,
    toId: targetId,
    attackerDivisionIds: [divisionId],
    defenderDivisionIds,
    progress: 0,
    stance,
    startedTick: state.tick,
  }

  return withEvent(
    {
      ...state,
      divisions,
      battles: [...state.battles, battle],
    },
    'battle',
    `${actorName(state, division.owner)} · ${division.name || '사단'} → ${target.name} 전투 개시`,
  )
}

function processDivisionMovement(state: GameState): GameState {
  let next = state
  let divisions = { ...next.divisions }

  for (const divisionId of Object.keys(divisions)) {
    const division = divisions[divisionId]
    if (division.status !== 'moving' || !division.order) continue

    const remainingTicks = division.order.remainingTicks - 1

    if (remainingTicks > 0) {
      divisions[divisionId] = {
        ...division,
        order: {
          ...division.order,
          remainingTicks,
        },
      }
      continue
    }

    const nextTerritoryId = division.order.path[division.order.nextIndex]
    const targetTerritory = next.territories[nextTerritoryId]

    if (!targetTerritory) {
      divisions[divisionId] = {
        ...division,
        status: 'idle',
        order: null,
      }
      continue
    }

    if (targetTerritory.owner === division.owner) {
      const nextIndex = division.order.nextIndex + 1
      const completed = nextIndex >= division.order.path.length

      divisions[divisionId] = {
        ...division,
        territoryId: nextTerritoryId,
        supply: Math.max(20, division.supply - 1),
        status: completed ? 'idle' : 'moving',
        order: completed
          ? null
          : {
              ...division.order,
              nextIndex,
              remainingTicks: DIVISION_MOVE_TICKS,
              totalTicks: DIVISION_MOVE_TICKS,
            },
      }
      continue
    }

    next = { ...next, divisions }
    next = beginOrJoinBattle(
      next,
      divisionId,
      nextTerritoryId,
      division.owner === 'player' ? next.attackStance : stanceForAi(next),
    )
    divisions = { ...next.divisions }
  }

  return syncTerritoryDivisionCounts({ ...next, divisions })
}

function updateDivisionReadiness(state: GameState): GameState {
  const divisions = { ...state.divisions }
  let changed = false

  for (const [id, division] of Object.entries(divisions)) {
    if (division.status === 'battle') continue
    const territory = state.territories[division.territoryId]
    if (!territory) continue

    const supplyTarget = Math.min(100, territory.supply)
    const supplyDelta = clamp((supplyTarget - division.supply) * 0.08, -2, 2)
    const organizationGain =
      division.status === 'moving' ? 0.25 : territory.owner === division.owner ? 1.5 : 0
    const strengthGain =
      division.status === 'idle' && territory.owner === division.owner && division.supply > 55
        ? 0.18
        : 0

    const supply = clamp(division.supply + supplyDelta, 0, 100)
    const organization = clamp(division.organization + organizationGain, 0, 100)
    const strength = clamp(division.strength + strengthGain, 0, 100)
    const status =
      division.status === 'recovering' && organization >= 70
        ? 'idle'
        : division.status

    if (
      supply !== division.supply ||
      organization !== division.organization ||
      strength !== division.strength ||
      status !== division.status
    ) {
      divisions[id] = {
        ...division,
        supply,
        organization,
        strength,
        status,
      }
      changed = true
    }
  }

  return changed ? { ...state, divisions } : state
}

function retreatDestination(
  state: GameState,
  division: DivisionUnit,
  fromTargetId: string,
): string | null {
  const territory = state.territories[fromTargetId]
  if (!territory) return null

  return (
    territory.neighbors.find(
      (neighborId) => state.territories[neighborId]?.owner === division.owner,
    ) ?? null
  )
}

function processBattles(state: GameState): GameState {
  if (state.battles.length === 0) return state

  let next = state
  const activeBattles: BattleState[] = []

  for (const battle of state.battles) {
    const target = next.territories[battle.toId]
    if (!target || target.owner !== battle.defender) {
      continue
    }

    let divisions = { ...next.divisions }

    const attackerDivisionIds = battle.attackerDivisionIds.filter((id) => {
      const division = divisions[id]
      return division && division.owner === battle.attacker && division.status === 'battle'
    })

    const targetDefenders =
      battle.defender === 'neutral'
        ? []
        : Object.values(divisions)
            .filter(
              (division) =>
                division.owner === battle.defender &&
                division.territoryId === battle.toId &&
                division.status !== 'moving',
            )
            .map((division) => division.id)

    for (const id of targetDefenders) {
      const division = divisions[id]
      if (division && division.status !== 'battle') {
        divisions[id] = { ...division, status: 'battle', order: null }
      }
    }

    if (attackerDivisionIds.length === 0) {
      for (const id of targetDefenders) {
        const division = divisions[id]
        if (division) divisions[id] = { ...division, status: 'recovering' }
      }
      next = { ...next, divisions }
      continue
    }

    const attackerPower = attackerDivisionIds.reduce(
      (sum, id) => sum + divisionPower(divisions[id]),
      0,
    ) * stancePower[battle.stance]

    const defenderUnitPower = targetDefenders.reduce(
      (sum, id) => sum + divisionPower(divisions[id]),
      0,
    )

    const defenderPower =
      defenderUnitPower +
      target.defense * DEFENSE_POWER +
      (battle.defender === 'neutral' ? 35 : 30)

    const ratio = attackerPower / Math.max(45, defenderPower)
    const jitter = ((hashString(`${battle.id}:${next.tick}`) % 9) - 4) * 0.3
    const emptyBonus = targetDefenders.length === 0 ? 6 : 0
    const delta = clamp((ratio - 1) * 11 + jitter + emptyBonus, -9, 14)
    const progress = battle.progress + delta

    const attackerOrgLoss = clamp(2.2 + Math.max(0, 1 - ratio) * 2.8, 1.5, 6)
    const attackerStrengthLoss = clamp(0.35 + Math.max(0, 1 - ratio) * 0.65, 0.25, 1.4)
    const defenderOrgLoss = clamp(2.4 + Math.max(0, ratio - 1) * 3.2, 1.5, 7)
    const defenderStrengthLoss = clamp(0.3 + Math.max(0, ratio - 1) * 0.8, 0.2, 1.6)

    for (const id of attackerDivisionIds) {
      const division = divisions[id]
      divisions[id] = {
        ...division,
        organization: clamp(division.organization - attackerOrgLoss, 0, 100),
        strength: clamp(division.strength - attackerStrengthLoss, 0, 100),
        supply: clamp(division.supply - 1.1, 0, 100),
      }
    }

    for (const id of targetDefenders) {
      const division = divisions[id]
      divisions[id] = {
        ...division,
        organization: clamp(division.organization - defenderOrgLoss, 0, 100),
        strength: clamp(division.strength - defenderStrengthLoss, 0, 100),
        supply: clamp(division.supply - 0.8, 0, 100),
      }
    }

    const attackerBroken = attackerDivisionIds.every(
      (id) =>
        divisions[id].organization <= 8 || divisions[id].strength <= 12,
    )
    const defenderBroken =
      targetDefenders.length === 0 ||
      targetDefenders.every(
        (id) =>
          divisions[id].organization <= 8 || divisions[id].strength <= 12,
      )

    if (progress >= 100 || defenderBroken) {
      const defeatedDefenderIds = new Set(targetDefenders)

      for (const id of attackerDivisionIds) {
        const division = divisions[id]
        divisions[id] = {
          ...division,
          territoryId: battle.toId,
          status: 'recovering',
          order: null,
          organization: Math.max(24, division.organization),
          experience: clamp(division.experience + 3, 0, 100),
        }
      }

      for (const id of targetDefenders) {
        const division = divisions[id]
        if (division.strength <= 18) {
          delete divisions[id]
          continue
        }

        const retreat = retreatDestination(
          { ...next, divisions },
          division,
          battle.toId,
        )

        if (!retreat) {
          delete divisions[id]
          continue
        }

        divisions[id] = {
          ...division,
          territoryId: retreat,
          status: 'recovering',
          order: null,
          organization: Math.max(16, division.organization),
          experience: clamp(division.experience + 1, 0, 100),
        }
      }

      next = {
        ...next,
        selectedId:
          battle.attacker === 'player' ? battle.toId : next.selectedId,
        divisions,
        territories: {
          ...next.territories,
          [battle.toId]: {
            ...target,
            owner: battle.attacker,
            defense: Math.max(0, target.defense - 1),
            supply: Math.max(30, target.supply - 8),
          },
        },
      }

      next = withEvent(
        next,
        'capture',
        `${actorName(next, battle.attacker)} · ${target.fullName} 점령 · ${attackerDivisionIds.length}개 사단 진입`,
      )

      for (const id of defeatedDefenderIds) {
        if (!next.divisions[id]) continue
      }
      continue
    }

    if (progress <= -100 || attackerBroken) {
      for (const id of attackerDivisionIds) {
        const division = divisions[id]
        if (division.strength <= 15) {
          delete divisions[id]
          continue
        }

        divisions[id] = {
          ...division,
          status: 'recovering',
          order: null,
          organization: Math.max(14, division.organization),
          experience: clamp(division.experience + 1, 0, 100),
        }
      }

      for (const id of targetDefenders) {
        const division = divisions[id]
        if (division) {
          divisions[id] = {
            ...division,
            status: 'recovering',
            organization: Math.max(25, division.organization),
          }
        }
      }

      next = withEvent(
        { ...next, divisions },
        'defense',
        `${actorName(next, battle.attacker)} · ${target.fullName} 공세 실패`,
      )
      continue
    }

    next = { ...next, divisions }
    activeBattles.push({
      ...battle,
      attackerDivisionIds,
      defenderDivisionIds: targetDefenders,
      progress,
    })
  }

  return syncTerritoryDivisionCounts({
    ...next,
    battles: activeBattles,
  })
}

export function captureTerritory(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const divisionIds = divisionsAt(state, fromId, 'player')
    .filter((division) => division.status !== 'battle')
    .map((division) => division.id)

  return issueDivisionMoveOrders(state, divisionIds, toId)
}

export function transferTroops(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const division = divisionsAt(state, fromId, 'player').find(
    (candidate) => candidate.status !== 'battle',
  )
  if (!division) return state
  return issueDivisionMoveOrders(state, [division.id], toId)
}

function targetScore(
  state: GameState,
  target: TerritoryState,
  difficulty: Difficulty,
): number {
  if (difficulty === 'easy') return 0
  const neutralBonus = target.owner === 'neutral' ? 30 : 0
  const defenders = Object.values(state.divisions).filter(
    (division) =>
      division.territoryId === target.id &&
      division.owner === target.owner,
  )
  const militaryWeakness = Math.max(
    0,
    450 -
      defenders.reduce((sum, division) => sum + divisionPower(division), 0) -
      target.defense * DEFENSE_POWER,
  )
  const supplyWeakness = Math.max(0, 100 - target.supply)
  const factoryValue = target.factories * 25
  return neutralBonus + militaryWeakness * 0.08 + supplyWeakness * 0.3 + factoryValue
}

function nearestFriendlyFront(
  state: GameState,
  division: DivisionUnit,
): TerritoryState | null {
  const candidates = Object.values(state.territories).filter(
    (territory) =>
      territory.owner === division.owner &&
      territory.neighbors.some(
        (id) => state.territories[id]?.owner !== division.owner,
      ),
  )

  let best: TerritoryState | null = null
  let bestPath = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const path = findDivisionPath(state, division, candidate.id)
    if (path && path.length < bestPath) {
      bestPath = path.length
      best = candidate
    }
  }

  return best
}

function runAiTurn(state: GameState, owner: AiFactionId): GameState {
  const battleCap =
    state.difficulty === 'easy' ? 1 : state.difficulty === 'hard' ? 4 : 2
  const activeBattles = state.battles.filter(
    (battle) => battle.attacker === owner,
  ).length
  if (activeBattles >= battleCap) return state

  const idleDivisions = Object.values(state.divisions)
    .filter(
      (division) =>
        division.owner === owner &&
        (division.status === 'idle' || division.status === 'recovering') &&
        division.organization >= 45 &&
        division.strength >= 45,
    )
    .sort(
      (a, b) =>
        b.organization - a.organization ||
        b.strength - a.strength ||
        a.id.localeCompare(b.id),
    )

  const division = idleDivisions[0]
  if (!division) return state

  const territory = state.territories[division.territoryId]
  if (!territory) return state

  const hostileNeighbors = territory.neighbors
    .map((id) => state.territories[id])
    .filter(
      (candidate): candidate is TerritoryState =>
        Boolean(candidate && candidate.owner !== owner),
    )

  if (hostileNeighbors.length > 0) {
    const target =
      state.difficulty === 'easy'
        ? hostileNeighbors[
            hashString(`${division.id}:${state.tick}`) % hostileNeighbors.length
          ]
        : [...hostileNeighbors].sort(
            (a, b) =>
              targetScore(state, b, state.difficulty) -
                targetScore(state, a, state.difficulty) ||
              a.id.localeCompare(b.id),
          )[0]

    return issueDivisionMoveOrdersForOwner(
      state,
      [division.id],
      target.id,
      owner,
    )
  }

  const front = nearestFriendlyFront(state, division)
  if (!front) return state

  return issueDivisionMoveOrdersForOwner(
    state,
    [division.id],
    front.id,
    owner,
  )
}

function issueDivisionMoveOrdersForOwner(
  state: GameState,
  divisionIds: string[],
  targetId: string,
  owner: PlayableFactionId,
): GameState {
  const divisions = { ...state.divisions }
  let issued = 0

  for (const divisionId of divisionIds) {
    const division = divisions[divisionId]
    if (!division || division.owner !== owner || division.status === 'battle') {
      continue
    }

    const path = findDivisionPath(state, division, targetId)
    if (!path || path.length === 0) continue

    divisions[divisionId] = {
      ...division,
      status: 'moving',
      order: {
        kind: 'move',
        targetId,
        path,
        nextIndex: 0,
        remainingTicks: DIVISION_MOVE_TICKS,
        totalTicks: DIVISION_MOVE_TICKS,
      },
    }
    issued += 1
  }

  return issued > 0 ? { ...state, divisions } : state
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

  const division = Object.values(state.divisions)
    .filter(
      (candidate) =>
        candidate.owner === 'player' &&
        candidate.status === 'idle' &&
        candidate.organization >= 55,
    )
    .sort(
      (a, b) =>
        b.organization - a.organization ||
        b.strength - a.strength ||
        a.id.localeCompare(b.id),
    )
    .find((candidate) => {
      const territory = state.territories[candidate.territoryId]
      return territory?.neighbors.some(
        (id) => state.territories[id]?.owner !== 'player',
      )
    })

  if (!division) return state
  const territory = state.territories[division.territoryId]
  if (!territory) return state

  const target = territory.neighbors
    .map((id) => state.territories[id])
    .filter(
      (candidate): candidate is TerritoryState =>
        Boolean(candidate && candidate.owner !== 'player'),
    )
    .sort(
      (a, b) =>
        targetScore(state, a, state.difficulty) -
        targetScore(state, b, state.difficulty),
    )[0]

  if (!target) return state
  return issueDivisionMoveOrders(state, [division.id], target.id)
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

  const playerDivisions = Object.values(state.divisions).filter(
    (division) => division.owner === 'player',
  ).length

  if (
    state.phase === 'running' &&
    (playerOwned === 0 || playerDivisions === 0)
  ) {
    return withEvent(
      { ...state, phase: 'defeat', running: false },
      'system',
      '플레이어 세력의 작전 가능 사단이 소멸했습니다.',
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
  next = processDivisionMovement(next)
  next = processBattles(next)
  next = updateDivisionReadiness(next)

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
