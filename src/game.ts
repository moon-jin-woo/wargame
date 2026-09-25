import type { DongState, Faction, GameState } from './types'

export const factions: Record<Faction['id'], Faction> = {
  player: { id: 'player', name: '플레이어', color: '#2f7df6' },
  red: { id: 'red', name: '적색 세력', color: '#d84a4a' },
  blue: { id: 'blue', name: '청색 세력', color: '#6457d9' },
  neutral: { id: 'neutral', name: '중립', color: '#777777' },
}

const sampleDongs: DongState[] = [
  { id: 'seoul', name: '서울 중심권', owner: 'player', troops: 120, supply: 100, neighbors: ['incheon', 'suwon'] },
  { id: 'incheon', name: '인천권', owner: 'red', troops: 90, supply: 80, neighbors: ['seoul', 'suwon'] },
  { id: 'suwon', name: '수원권', owner: 'neutral', troops: 35, supply: 60, neighbors: ['seoul', 'incheon', 'daejeon'] },
  { id: 'daejeon', name: '대전권', owner: 'blue', troops: 75, supply: 85, neighbors: ['suwon', 'daegu', 'gwangju'] },
  { id: 'daegu', name: '대구권', owner: 'neutral', troops: 50, supply: 70, neighbors: ['daejeon', 'busan'] },
  { id: 'gwangju', name: '광주권', owner: 'red', troops: 65, supply: 75, neighbors: ['daejeon', 'busan'] },
  { id: 'busan', name: '부산권', owner: 'blue', troops: 95, supply: 90, neighbors: ['daegu', 'gwangju'] },
]

export function createInitialState(): GameState {
  return {
    running: true,
    speed: 1,
    tick: 0,
    selectedDongId: 'seoul',
    dongs: Object.fromEntries(sampleDongs.map((dong) => [dong.id, dong])),
  }
}

export function advanceTick(state: GameState): GameState {
  const nextDongs = Object.fromEntries(
    Object.entries(state.dongs).map(([id, dong]) => {
      const growth = dong.owner === 'neutral' ? 0 : 1
      const supplyDelta = dong.owner === 'neutral' ? 0 : 0.25
      return [
        id,
        {
          ...dong,
          troops: Math.min(999, dong.troops + growth),
          supply: Math.min(100, dong.supply + supplyDelta),
        },
      ]
    }),
  )

  return { ...state, tick: state.tick + 1, dongs: nextDongs }
}

export function attack(state: GameState, fromId: string, toId: string): GameState {
  const from = state.dongs[fromId]
  const to = state.dongs[toId]

  if (!from || !to || !from.neighbors.includes(toId) || from.owner !== 'player' || from.troops < 20) {
    return state
  }

  const committed = Math.floor(from.troops * 0.45)
  const attackPower = committed * (0.75 + from.supply / 200)
  const defensePower = to.troops * (0.85 + to.supply / 250)
  const won = attackPower > defensePower

  const dongs = { ...state.dongs }
  dongs[fromId] = { ...from, troops: Math.max(10, from.troops - committed) }

  if (won) {
    dongs[toId] = {
      ...to,
      owner: 'player',
      troops: Math.max(10, Math.floor(committed - defensePower * 0.6)),
      supply: Math.max(25, Math.floor(to.supply * 0.6)),
    }
  } else {
    dongs[toId] = {
      ...to,
      troops: Math.max(5, Math.floor(to.troops - attackPower * 0.4)),
    }
  }

  return { ...state, dongs, selectedDongId: toId }
}