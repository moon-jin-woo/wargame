import type {
  AiCount,
  Difficulty,
  Faction,
  FactionId,
  GameState,
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

const aiFactions: FactionId[] = ['red', 'blue', 'green']

function activeAiFactions(count: AiCount): FactionId[] {
  return aiFactions.slice(0, count)
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

export function createInitialState(
  territories: Record<string, TerritoryState>,
  dataVersion: string,
): GameState {
  const firstId = Object.keys(territories)[0] ?? null

  return {
    phase: 'setup',
    running: false,
    speed: 1,
    tick: 0,
    selectedId: firstId,
    playerName: '플레이어 세력',
    aiCount: 3,
    difficulty: 'normal',
    dataVersion,
    territories,
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
      minDistance = Math.min(minDistance, distanceSquared(territory.centroid, anchor.centroid))
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
      troops: index === 0 ? 85 : 48,
      supply: index === 0 ? 92 : 78,
    }
  })

  return next
}

export function startGame(state: GameState, startId: string): GameState {
  if (!state.territories[startId]) return state

  let territories = Object.fromEntries(
    Object.entries(state.territories).map(([id, territory]) => [
      id,
      {
        ...territory,
        owner: 'neutral' as FactionId,
        troops: Math.min(territory.troops, 35),
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

  return {
    ...state,
    phase: 'running',
    running: true,
    tick: 0,
    selectedId: startId,
    territories,
  }
}

function resolveCapture(
  state: GameState,
  fromId: string,
  toId: string,
  owner: FactionId,
): GameState {
  const from = state.territories[fromId]
  const to = state.territories[toId]

  if (
    !from ||
    !to ||
    from.owner !== owner ||
    to.owner === owner ||
    !from.neighbors.includes(toId) ||
    from.troops < 18
  ) {
    return state
  }

  const committed = Math.max(8, Math.floor(from.troops * 0.38))
  const variation = 0.9 + (hashString(`${fromId}:${toId}:${state.tick}`) % 21) / 100
  const captureScore = committed * (0.8 + from.supply / 220) * variation
  const holdScore = to.troops * (0.72 + to.supply / 260)
  const success = captureScore > holdScore

  const territories = { ...state.territories }
  territories[fromId] = {
    ...from,
    troops: Math.max(10, from.troops - committed),
    supply: Math.max(20, from.supply - 4),
  }

  if (success) {
    territories[toId] = {
      ...to,
      owner,
      troops: Math.max(10, Math.floor(committed - holdScore * 0.45)),
      supply: Math.max(35, Math.floor((from.supply + to.supply) / 2)),
    }
  } else {
    territories[toId] = {
      ...to,
      troops: Math.max(8, Math.floor(to.troops - captureScore * 0.3)),
      supply: Math.max(25, to.supply - 2),
    }
  }

  return {
    ...state,
    selectedId: owner === 'player' ? toId : state.selectedId,
    territories,
  }
}

export function captureTerritory(state: GameState, fromId: string, toId: string): GameState {
  if (state.phase !== 'running') return state
  return resolveCapture(state, fromId, toId, 'player')
}

function targetScore(target: TerritoryState, difficulty: Difficulty): number {
  if (difficulty === 'easy') return 0
  const neutralBonus = target.owner === 'neutral' ? 18 : 0
  const weakness = Math.max(0, 120 - target.troops)
  const supplyWeakness = Math.max(0, 100 - target.supply)
  return neutralBonus + weakness + supplyWeakness * 0.25
}

function runAiTurn(state: GameState, owner: FactionId): GameState {
  const threshold = state.difficulty === 'easy' ? 36 : state.difficulty === 'hard' ? 23 : 28
  const candidates = Object.values(state.territories).filter(
    (territory) =>
      territory.owner === owner &&
      territory.troops >= threshold &&
      territory.neighbors.some((id) => state.territories[id]?.owner !== owner),
  )

  if (candidates.length === 0) return state

  const from = candidates[hashString(`${owner}:${state.tick}`) % candidates.length]
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
      const scoreDifference =
        targetScore(b, state.difficulty) - targetScore(a, state.difficulty)
      if (scoreDifference !== 0) return scoreDifference
      return a.id.localeCompare(b.id)
    })[0]
  }

  return resolveCapture(state, from.id, to.id, owner)
}

function updatePhase(state: GameState): GameState {
  const values = Object.values(state.territories)
  const playerOwned = values.filter((territory) => territory.owner === 'player').length

  if (playerOwned === values.length && values.length > 0) {
    return { ...state, phase: 'victory', running: false }
  }

  if (playerOwned === 0 && state.phase === 'running') {
    return { ...state, phase: 'defeat', running: false }
  }

  return state
}

export function advanceTick(state: GameState): GameState {
  if (!state.running || state.phase !== 'running') return state

  const nextTick = state.tick + 1
  let territories = state.territories

  if (nextTick % 2 === 0) {
    territories = { ...territories }

    for (const [id, territory] of Object.entries(territories)) {
      if (territory.owner === 'neutral') continue

      territories[id] = {
        ...territory,
        troops: Math.min(160, territory.troops + 1),
        supply: Math.min(100, territory.supply + 0.6),
      }
    }
  }

  let next: GameState = {
    ...state,
    tick: nextTick,
    territories,
  }

  const aiInterval =
    state.difficulty === 'easy' ? 5 : state.difficulty === 'hard' ? 2 : 3

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
