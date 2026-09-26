import type {
  AiCount,
  AiFactionId,
  Difficulty,
  PlayableFactionId,
  FactionId,
  GameEvent,
  GamePhase,
  GameState,
} from './types'

const SAVE_KEY = 'wargame-save-v1'
const VALID_OWNERS = new Set<FactionId>(['player', 'red', 'blue', 'green', 'neutral'])
const VALID_PHASES = new Set<GamePhase>(['setup', 'running', 'victory', 'defeat'])
const VALID_DIFFICULTIES = new Set<Difficulty>(['easy', 'normal', 'hard'])

type SavedTerritory = {
  owner: FactionId
  troops?: number
  supply: number
  factories?: number
  divisions?: number
  defense?: number
}

type SavedGame = {
  schema: 1 | 2 | 3 | 4 | 5
  savedAt: number
  tick: number
  speed: 1 | 2 | 4
  phase: GamePhase
  selectedId: string | null
  playerName: string
  dataVersion: string
  aiCount?: AiCount
  difficulty?: Difficulty
  aiNames?: Record<AiFactionId, string>
  factionColors?: Record<PlayableFactionId, string>
  funds?: Record<PlayableFactionId, number>
  events?: GameEvent[]
  territories: Record<string, SavedTerritory>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isSpeed(value: unknown): value is 1 | 2 | 4 {
  return value === 1 || value === 2 || value === 4
}

function isAiCount(value: unknown): value is AiCount {
  return value === 1 || value === 2 || value === 3
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
    schema: 5,
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
    events: state.events.slice(0, 40),
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
        saved.schema !== 5) ||
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
      if (typeof value === 'string' && value.trim()) {
        aiNames[id] = value.trim().slice(0, 24)
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
        typeof saved.playerName === 'string' && saved.playerName.trim()
          ? saved.playerName.slice(0, 24)
          : base.playerName,
      aiCount: isAiCount(saved.aiCount) ? saved.aiCount : base.aiCount,
      difficulty,
      aiNames,
      factionColors,
      funds,
      events: Array.isArray(saved.events) ? saved.events.slice(0, 40) : base.events,
      territories,
    }
  } catch {
    return null
  }
}
