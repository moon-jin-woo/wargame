export type FactionId = 'player' | 'red' | 'blue' | 'neutral'

export interface Faction {
  id: FactionId
  name: string
  color: string
}

export interface DongState {
  id: string
  name: string
  owner: FactionId
  troops: number
  supply: number
  neighbors: string[]
}

export interface GameState {
  running: boolean
  speed: 1 | 2 | 4
  tick: number
  selectedDongId: string | null
  dongs: Record<string, DongState>
}