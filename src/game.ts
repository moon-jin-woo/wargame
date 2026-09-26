import type {
  AiCount,
  AiFactionId,
  AttackStance,
  BattleState,
  Difficulty,
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

const stanceCommit: Record<AttackStance, number> = {
  cautious: 0.35,
  balanced: 0.5,
  aggressive: 0.7,
}

const stancePower: Record<AttackStance, number> = {
  cautious: 0.92,
  balanced: 1,
  aggressive: 1.1,
}

const stanceSupplyCost: Record<AttackStance, number> = {
  cautious: 4,
  balanced: 6,
  aggressive: 9,
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
    events: [event, ...state.events].slice(0, 60),
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
      productionQueue: [],
      battles: [],
      events: [],
      territories,
    },
    'system',
    `작전 개시 · ${start.fullName}`,
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
    kind === 'factory' ? '공장 건설' : kind === 'division' ? '사단 편성' : '방어 강화'

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

  let updated = territory
  if (order.kind === 'factory') {
    updated = {
      ...territory,
      factories: Math.min(MAX_FACTORIES, territory.factories + 1),
    }
  } else if (order.kind === 'division') {
    updated = { ...territory, divisions: territory.divisions + 1 }
  } else {
    updated = {
      ...territory,
      defense: Math.min(MAX_DEFENSE, territory.defense + 1),
    }
  }

  let next: GameState = {
    ...state,
    territories: {
      ...state.territories,
      [territory.id]: updated,
    },
  }

  if (order.owner === 'player') {
    const label =
      order.kind === 'factory'
        ? '공장 완공'
        : order.kind === 'division'
          ? '사단 편성 완료'
          : '방어 강화 완료'
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
    if (!territory || territory.owner !== order.owner) {
      continue
    }

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

function stanceForAi(state: GameState): AttackStance {
  if (state.difficulty === 'easy') return 'cautious'
  if (state.difficulty === 'hard') return 'aggressive'
  return 'balanced'
}

function startBattle(
  state: GameState,
  fromId: string,
  toId: string,
  owner: PlayableFactionId,
  stance: AttackStance,
): GameState {
  if (state.phase !== 'running') return state

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

  const collision = state.battles.some(
    (battle) =>
      battle.fromId === fromId ||
      battle.toId === fromId ||
      battle.fromId === toId ||
      battle.toId === toId,
  )
  if (collision) return state

  const committed = Math.max(
    1,
    Math.min(from.divisions, Math.ceil(from.divisions * stanceCommit[stance])),
  )

  const battle: BattleState = {
    id: `${owner}:${fromId}:${toId}:${state.tick}`,
    attacker: owner,
    defender: to.owner,
    fromId,
    toId,
    committedDivisions: committed,
    progress: 0,
    stance,
    startedTick: state.tick,
  }

  const territories = {
    ...state.territories,
    [fromId]: {
      ...from,
      divisions: Math.max(0, from.divisions - committed),
      supply: Math.max(0, from.supply - stanceSupplyCost[stance]),
    },
  }

  return withEvent(
    {
      ...state,
      territories,
      battles: [...state.battles, battle],
    },
    'battle',
    `${actorName(state, owner)} · ${from.name} → ${to.name} 작전 개시 · ${committed}개 사단`,
  )
}

export function captureTerritory(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  return startBattle(state, fromId, toId, 'player', state.attackStance)
}

function returnBattleSurvivors(
  state: GameState,
  battle: BattleState,
  ratio: number,
): GameState {
  const from = state.territories[battle.fromId]
  if (!from || from.owner !== battle.attacker) return state

  const survivors = Math.max(
    0,
    Math.floor(battle.committedDivisions * clamp(ratio, 0.35, 0.75)),
  )

  return {
    ...state,
    territories: {
      ...state.territories,
      [from.id]: {
        ...from,
        divisions: from.divisions + survivors,
      },
    },
  }
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
      next = returnBattleSurvivors(next, battle, 0.65)
      continue
    }

    const attackPower =
      battle.committedDivisions *
      DIVISION_POWER *
      (0.62 + from.supply / 210) *
      stancePower[battle.stance]

    const defensePower =
      (to.divisions * DIVISION_POWER +
        to.defense * DEFENSE_POWER +
        (to.owner === 'neutral' ? 25 : 45)) *
      (0.65 + to.supply / 230)

    const ratio = attackPower / Math.max(50, defensePower)
    const jitter =
      (((hashString(`${battle.id}:${next.tick}`) % 7) - 3) * 0.35)
    const emptyBonus = to.divisions === 0 && to.defense === 0 ? 7 : 0
    const delta = clamp((ratio - 1) * 13 + jitter + emptyBonus, -9, 15)
    const progress = battle.progress + delta

    if (progress >= 100) {
      const survivors = Math.max(
        1,
        Math.round(
          battle.committedDivisions *
            clamp(0.8 - to.divisions * 0.06 - to.defense * 0.05, 0.35, 0.8),
        ),
      )

      next = {
        ...next,
        selectedId:
          battle.attacker === 'player' ? battle.toId : next.selectedId,
        territories: {
          ...next.territories,
          [to.id]: {
            ...to,
            owner: battle.attacker,
            divisions: survivors,
            defense: Math.max(0, to.defense - 1),
            supply: Math.max(30, Math.floor((from.supply + to.supply) / 2)),
          },
        },
      }

      next = withEvent(
        next,
        'capture',
        `${actorName(next, battle.attacker)} · ${to.fullName} 점령`,
      )
      continue
    }

    if (progress <= -100) {
      next = returnBattleSurvivors(next, battle, 0.5)

      const currentTarget = next.territories[to.id]
      next = {
        ...next,
        territories: {
          ...next.territories,
          [to.id]: {
            ...currentTarget,
            divisions: Math.max(
              0,
              currentTarget.divisions -
                Math.max(0, Math.floor(battle.committedDivisions * 0.25)),
            ),
            supply: Math.max(20, currentTarget.supply - 4),
          },
        },
      }

      next = withEvent(
        next,
        'defense',
        `${actorName(next, battle.attacker)} · ${to.fullName} 공세 실패`,
      )
      continue
    }

    active.push({ ...battle, progress })
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
  if (state.phase !== 'running') return state

  const from = state.territories[fromId]
  const to = state.territories[toId]
  const engaged = state.battles.some(
    (battle) => battle.fromId === fromId || battle.toId === fromId,
  )

  if (
    !from ||
    !to ||
    engaged ||
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
    `${from.fullName} → ${to.fullName} · 1개 사단 재배치`,
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
  const battleCap =
    state.difficulty === 'easy' ? 1 : state.difficulty === 'hard' ? 3 : 2
  const activeBattles = state.battles.filter(
    (battle) => battle.attacker === owner,
  ).length
  if (activeBattles >= battleCap) return state

  const minimumDivisions =
    state.difficulty === 'easy' ? 3 : state.difficulty === 'hard' ? 1 : 2

  const candidates = Object.values(state.territories).filter(
    (territory) =>
      territory.owner === owner &&
      territory.divisions >= minimumDivisions &&
      !state.battles.some(
        (battle) =>
          battle.fromId === territory.id || battle.toId === territory.id,
      ) &&
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
        Boolean(
          territory &&
            territory.owner !== owner &&
            !state.battles.some(
              (battle) =>
                battle.fromId === territory.id || battle.toId === territory.id,
            ),
        ),
    )

  if (targets.length === 0) return state

  let to: TerritoryState
  if (state.difficulty === 'easy') {
    to = targets[hashString(`${from.id}:${state.tick}`) % targets.length]
  } else {
    to = [...targets].sort((a, b) => {
      const difference =
        targetScore(b, state.difficulty) -
        targetScore(a, state.difficulty)
      if (difference !== 0) return difference
      return a.id.localeCompare(b.id)
    })[0]
  }

  return startBattle(state, from.id, to.id, owner, stanceForAi(state))
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

  const candidates = Object.values(state.territories)
    .filter(
      (territory) =>
        territory.owner === 'player' &&
        territory.divisions >= 2 &&
        !state.battles.some(
          (battle) =>
            battle.fromId === territory.id || battle.toId === territory.id,
        ) &&
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
        Boolean(
          territory &&
            territory.owner !== 'player' &&
            !state.battles.some(
              (battle) =>
                battle.fromId === territory.id || battle.toId === territory.id,
            ),
        ),
    )
    .sort(
      (a, b) =>
        territoryMilitaryPower(a) - territoryMilitaryPower(b) ||
        a.id.localeCompare(b.id),
    )[0]

  if (!to) return state
  return startBattle(state, from.id, to.id, 'player', state.attackStance)
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
  next = processBattles(next)

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
