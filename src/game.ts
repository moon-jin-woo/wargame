import type {
  AiCount,
  AiFactionId,
  Difficulty,
  Faction,
  FactionId,
  GameEventKind,
  GameState,
  PlayableFactionId,
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

export const FACTORY_COST = 120
export const DIVISION_COST = 80
export const FACTORY_INCOME = 12
export const ECONOMY_INTERVAL = 5
export const MAX_FACTORIES = 4
export const MAX_DEFENSE = 4

const STARTING_FUNDS = 320
const DIVISION_POWER = 100
const DEFENSE_POWER = 60
const aiFactions: AiFactionId[] = ['red', 'blue', 'green']

export function defenseUpgradeCost(level: number): number {
  if (level >= MAX_DEFENSE) return 0
  return 70 + level * 50
}

export function territoryMilitaryPower(territory: TerritoryState): number {
  return territory.divisions * DIVISION_POWER + territory.defense * DEFENSE_POWER
}

function activeAiFactions(count: AiCount): AiFactionId[] {
  return aiFactions.slice(0, count)
}

function actorName(state: GameState, owner: FactionId): string {
  if (owner === 'player') return state.playerName
  if (owner === 'neutral') return factions.neutral.name
  return state.aiNames[owner]
}

function withEvent(
  state: GameState,
  kind: GameEventKind,
  message: string,
): GameState {
  const event = {
    id: `${state.tick}:${kind}:${state.events.length}:${message.slice(0, 18)}`,
    tick: state.tick,
    kind,
    message,
  }

  return {
    ...state,
    events: [event, ...state.events].slice(0, 40),
  }
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
    dataVersion,
    events: [],
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

  return withEvent(
    {
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
      events: [],
      territories,
    },
    'system',
    `게임 시작 · ${start.fullName} · 시작 자금 ${STARTING_FUNDS}`,
  )
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

function spendFunds(
  state: GameState,
  owner: PlayableFactionId,
  amount: number,
): GameState | null {
  if (state.funds[owner] < amount) return null

  return {
    ...state,
    funds: {
      ...state.funds,
      [owner]: state.funds[owner] - amount,
    },
  }
}

export function buildFactory(
  state: GameState,
  territoryId: string,
): GameState {
  if (state.phase !== 'running') return state
  const territory = state.territories[territoryId]
  if (
    !territory ||
    territory.owner !== 'player' ||
    territory.factories >= MAX_FACTORIES
  ) {
    return state
  }

  const paid = spendFunds(state, 'player', FACTORY_COST)
  if (!paid) return state

  const territories = {
    ...paid.territories,
    [territoryId]: {
      ...territory,
      factories: territory.factories + 1,
    },
  }

  return withEvent(
    { ...paid, territories },
    'economy',
    `${territory.fullName} · 공장 건설 · -${FACTORY_COST}`,
  )
}

export function buildDivision(
  state: GameState,
  territoryId: string,
): GameState {
  if (state.phase !== 'running') return state
  const territory = state.territories[territoryId]
  if (!territory || territory.owner !== 'player') return state

  const paid = spendFunds(state, 'player', DIVISION_COST)
  if (!paid) return state

  const territories = {
    ...paid.territories,
    [territoryId]: {
      ...territory,
      divisions: territory.divisions + 1,
    },
  }

  return withEvent(
    { ...paid, territories },
    'military',
    `${territory.fullName} · 1개 사단 편성 · -${DIVISION_COST}`,
  )
}

export function upgradeDefense(
  state: GameState,
  territoryId: string,
): GameState {
  if (state.phase !== 'running') return state
  const territory = state.territories[territoryId]
  if (
    !territory ||
    territory.owner !== 'player' ||
    territory.defense >= MAX_DEFENSE
  ) {
    return state
  }

  const cost = defenseUpgradeCost(territory.defense)
  const paid = spendFunds(state, 'player', cost)
  if (!paid) return state

  const territories = {
    ...paid.territories,
    [territoryId]: {
      ...territory,
      defense: territory.defense + 1,
    },
  }

  return withEvent(
    { ...paid, territories },
    'military',
    `${territory.fullName} · 방어력 ${territory.defense + 1}단계 · -${cost}`,
  )
}

function resolveCapture(
  state: GameState,
  fromId: string,
  toId: string,
  owner: PlayableFactionId,
): GameState {
  const from = state.territories[fromId]
  const to = state.territories[toId]

  if (
    !from ||
    !to ||
    from.owner !== owner ||
    to.owner === owner ||
    !from.neighbors.includes(toId) ||
    from.divisions < 1
  ) {
    return state
  }

  const committed = Math.max(1, Math.ceil(from.divisions * 0.5))
  const variation =
    0.9 + (hashString(`${fromId}:${toId}:${state.tick}`) % 21) / 100
  const attackSupply = 0.65 + from.supply / 200
  const defenseSupply = 0.7 + to.supply / 250
  const attackPower = committed * DIVISION_POWER * attackSupply * variation
  const defensePower =
    (to.divisions * DIVISION_POWER + to.defense * DEFENSE_POWER + 25) *
    defenseSupply
  const success = attackPower > defensePower

  const territories = { ...state.territories }
  territories[fromId] = {
    ...from,
    divisions: Math.max(0, from.divisions - committed),
    supply: Math.max(20, from.supply - 6),
  }

  if (success) {
    const survivorEstimate = Math.max(
      1,
      committed - Math.ceil(to.divisions * 0.5) - Math.floor(to.defense / 2),
    )

    territories[toId] = {
      ...to,
      owner,
      divisions: survivorEstimate,
      defense: Math.max(0, to.defense - 1),
      supply: Math.max(35, Math.floor((from.supply + to.supply) / 2)),
    }
  } else {
    territories[toId] = {
      ...to,
      divisions: Math.max(
        0,
        to.divisions - Math.max(0, Math.floor(committed * 0.35)),
      ),
      supply: Math.max(25, to.supply - 3),
    }
  }

  const next: GameState = {
    ...state,
    selectedId: owner === 'player' ? toId : state.selectedId,
    territories,
  }

  const actor = actorName(state, owner)
  return withEvent(
    next,
    success ? 'capture' : 'defense',
    success
      ? `${actor} · ${to.fullName} 점령 · ${survivingDivisions(territories[toId])}개 사단 잔존`
      : `${actor} · ${to.fullName} 공격 실패`,
  )
}

function survivingDivisions(territory: TerritoryState): number {
  return Math.max(0, Math.floor(territory.divisions))
}

export function captureTerritory(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  if (state.phase !== 'running') return state
  return resolveCapture(state, fromId, toId, 'player')
}

export function transferTroops(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  if (state.phase !== 'running') return state

  const from = state.territories[fromId]
  const to = state.territories[toId]

  if (
    !from ||
    !to ||
    from.owner !== 'player' ||
    to.owner !== 'player' ||
    !from.neighbors.includes(toId) ||
    from.divisions <= 1
  ) {
    return state
  }

  const territories = { ...state.territories }
  territories[fromId] = {
    ...from,
    divisions: from.divisions - 1,
  }
  territories[toId] = {
    ...to,
    divisions: to.divisions + 1,
  }

  return withEvent(
    {
      ...state,
      selectedId: toId,
      territories,
    },
    'support',
    `${from.fullName} → ${to.fullName} · 1개 사단 지원 이동`,
  )
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
  const minimumDivisions =
    state.difficulty === 'easy' ? 3 : state.difficulty === 'hard' ? 1 : 2
  const candidates = Object.values(state.territories).filter(
    (territory) =>
      territory.owner === owner &&
      territory.divisions >= minimumDivisions &&
      territory.neighbors.some(
        (id) => state.territories[id]?.owner !== owner,
      ),
  )

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

  let to: TerritoryState
  if (state.difficulty === 'easy') {
    to = targets[hashString(`${from.id}:${state.tick}`) % targets.length]
  } else {
    to = [...targets].sort((a, b) => {
      const difference =
        targetScore(b, state.difficulty) - targetScore(a, state.difficulty)
      if (difference !== 0) return difference
      return a.id.localeCompare(b.id)
    })[0]
  }

  return resolveCapture(state, from.id, to.id, owner)
}

function aiBuild(state: GameState, owner: AiFactionId): GameState {
  const owned = Object.values(state.territories).filter(
    (territory) => territory.owner === owner,
  )
  if (owned.length === 0) return state

  const frontlines = owned.filter((territory) =>
    territory.neighbors.some(
      (id) => state.territories[id]?.owner !== owner,
    ),
  )
  const target = [...(frontlines.length > 0 ? frontlines : owned)].sort(
    (a, b) => a.divisions - b.divisions || a.id.localeCompare(b.id),
  )[0]

  let next = state

  if (next.funds[owner] >= DIVISION_COST) {
    next = {
      ...next,
      funds: {
        ...next.funds,
        [owner]: next.funds[owner] - DIVISION_COST,
      },
      territories: {
        ...next.territories,
        [target.id]: {
          ...next.territories[target.id],
          divisions: next.territories[target.id].divisions + 1,
        },
      },
    }
  }

  const totalFactories = owned.reduce(
    (sum, territory) => sum + territory.factories,
    0,
  )
  const desiredFactories = Math.max(2, Math.ceil(owned.length / 4))

  if (
    totalFactories < desiredFactories &&
    next.funds[owner] >= FACTORY_COST + DIVISION_COST
  ) {
    const factoryTarget = [...owned].sort(
      (a, b) => a.factories - b.factories || a.id.localeCompare(b.id),
    )[0]

    if (next.territories[factoryTarget.id].factories < MAX_FACTORIES) {
      next = {
        ...next,
        funds: {
          ...next.funds,
          [owner]: next.funds[owner] - FACTORY_COST,
        },
        territories: {
          ...next.territories,
          [factoryTarget.id]: {
            ...next.territories[factoryTarget.id],
            factories: next.territories[factoryTarget.id].factories + 1,
          },
        },
      }
    }
  }

  if (
    state.difficulty === 'hard' &&
    target.defense < 2 &&
    next.funds[owner] >= defenseUpgradeCost(target.defense)
  ) {
    const defenseCost = defenseUpgradeCost(target.defense)
    next = {
      ...next,
      funds: {
        ...next.funds,
        [owner]: next.funds[owner] - defenseCost,
      },
      territories: {
        ...next.territories,
        [target.id]: {
          ...next.territories[target.id],
          defense: next.territories[target.id].defense + 1,
        },
      },
    }
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
      '전국 점령 완료',
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
      `공장 수익 +${playerIncome} · 보유 자금 ${funds.player}`,
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
