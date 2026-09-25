import type {
  AiCount,
  Difficulty,
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
  troops: number
  supply: number
}

type SavedGame = {
  schema: 1 | 2 | 3
  savedAt: number
  tick: number
  speed: 1 | 2 | 4
  phase: GamePhase
  selectedId: string | null
  playerName: string
  dataVersion: string
  aiCount?: AiCount
  difficulty?: Difficulty
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
      },
    ]),
  )

  const payload: SavedGame = {
    schema: 3,
    savedAt,
    tick: state.tick,
    speed: state.speed,
    phase: state.phase,
    selectedId: state.selectedId,
    playerName: state.playerName,
    dataVersion: state.dataVersion,
    aiCount: state.aiCount,
    difficulty: state.difficulty,
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
      (saved.schema !== 1 && saved.schema !== 2 && saved.schema !== 3) ||
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

      territories[id] = {
        ...current,
        owner,
        troops,
        supply,
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
      events: Array.isArray(saved.events) ? saved.events.slice(0, 40) : base.events,
      territories,
    }
  } catch {
    return null
  }
}
