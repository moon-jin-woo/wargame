import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialState } from './game'
import { restoreGame, saveGame } from './persistence'
import type { DivisionUnit, TerritoryState } from './types'

const store = new Map<string, string>()

const localStorageMock = {
  getItem(key: string) {
    return store.get(key) ?? null
  },
  setItem(key: string, value: string) {
    store.set(key, value)
  },
  removeItem(key: string) {
    store.delete(key)
  },
  clear() {
    store.clear()
  },
  key(index: number) {
    return [...store.keys()][index] ?? null
  },
  get length() {
    return store.size
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

function territory(
  id: string,
  owner: TerritoryState['owner'],
): TerritoryState {
  return {
    id,
    name: id.toUpperCase(),
    fullName: `Test ${id.toUpperCase()}`,
    sidoName: '테스트도',
    sggName: '테스트시',
    owner,
    troops: 0,
    supply: 80,
    factories: 0,
    divisions: 0,
    defense: 0,
    neighbors: [],
    centroid: [127, 36],
  }
}

describe('division save migration', () => {
  beforeEach(() => store.clear())

  it('preserves division identity, commander, stats and routed order', () => {
    const base = createInitialState(
      { a: territory('a', 'player'), b: territory('b', 'player') },
      'test',
    )

    base.territories.a.neighbors = ['b']
    base.territories.b.neighbors = ['a']

    const unit: DivisionUnit = {
      id: 'division-test',
      owner: 'player',
      name: '제7기동사단',
      commander: '김도현',
      locationId: 'a',
      strength: 83,
      organization: 67,
      experience: 14,
      status: 'moving',
      order: {
        type: 'move',
        targetId: 'b',
        path: ['b'],
        totalTicks: 3,
        remainingTicks: 2,
        issuedTick: 4,
      },
      createdTick: 1,
    }

    const state = {
      ...base,
      phase: 'running' as const,
      tick: 5,
      selectedDivisionId: unit.id,
      divisionUnits: { [unit.id]: unit },
      territories: {
        ...base.territories,
        a: { ...base.territories.a, divisions: 1 },
      },
    }

    saveGame(state)
    const restored = restoreGame(base)

    expect(restored).not.toBeNull()
    expect(restored?.divisionUnits[unit.id].name).toBe('제7기동사단')
    expect(restored?.divisionUnits[unit.id].commander).toBe('김도현')
    expect(restored?.divisionUnits[unit.id].order?.path).toEqual(['b'])
    expect(restored?.selectedDivisionId).toBe(unit.id)
  })

  it('migrates legacy numeric division counts into real units', () => {
    const base = createInitialState(
      { a: territory('a', 'neutral') },
      'test',
    )

    localStorage.setItem(
      'wargame-save-v1',
      JSON.stringify({
        schema: 6,
        savedAt: 1,
        tick: 8,
        speed: 2,
        phase: 'running',
        selectedId: 'a',
        playerName: '',
        dataVersion: 'old',
        territories: {
          a: {
            owner: 'player',
            supply: 77,
            factories: 1,
            divisions: 3,
            defense: 1,
          },
        },
      }),
    )

    const restored = restoreGame(base)

    expect(restored).not.toBeNull()
    expect(Object.keys(restored?.divisionUnits ?? {})).toHaveLength(3)
    expect(restored?.territories.a.divisions).toBe(3)
    expect(
      Object.values(restored?.divisionUnits ?? {}).every(
        (unit) => unit.locationId === 'a' && unit.owner === 'player',
      ),
    ).toBe(true)
  })
})
