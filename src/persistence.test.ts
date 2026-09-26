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
    industry: {
      civilian: 0,
      military: 0,
      logistics: 0,
      infrastructure: 0,
      research: 0,
    },
    terrain: 'plains',
    railway: 0,
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
      role: 'mobile',
      armyId: 'army-test',
      locationId: 'a',
      strength: 83,
      organization: 67,
      experience: 14,
      entrenchment: 12,
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
      selectedArmyId: 'army-test',
      researchPoints: {
        ...base.researchPoints,
        player: 123,
      },
      technologies: {
        ...base.technologies,
        player: {
          ...base.technologies.player,
          industrialMethods: 1,
          logisticsPlanning: 2,
        },
      },
      divisionUnits: { [unit.id]: unit },
      armies: {
        'army-test': {
          id: 'army-test',
          owner: 'player' as const,
          name: '제1군',
          commander: '박준혁',
          divisionIds: [unit.id],
          objectiveId: 'b',
          planStatus: 'planning' as const,
          strategy: 'logistics' as const,
          preparation: 48,
          createdTick: 2,
        },
      },
      territories: {
        ...base.territories,
        a: {
          ...base.territories.a,
          divisions: 1,
          terrain: 'mountain' as const,
          railway: 2,
          industry: {
            civilian: 2,
            military: 1,
            logistics: 2,
            infrastructure: 3,
            research: 1,
          },
          factories: 2,
        },
      },
    }

    saveGame(state)
    const restored = restoreGame(base)

    expect(restored).not.toBeNull()
    expect(restored?.divisionUnits[unit.id].name).toBe('제7기동사단')
    expect(restored?.divisionUnits[unit.id].commander).toBe('김도현')
    expect(restored?.divisionUnits[unit.id].order?.path).toEqual(['b'])
    expect(restored?.divisionUnits[unit.id].role).toBe('mobile')
    expect(restored?.divisionUnits[unit.id].entrenchment).toBe(12)
    expect(restored?.divisionUnits[unit.id].armyId).toBe('army-test')
    expect(restored?.armies['army-test'].commander).toBe('박준혁')
    expect(restored?.armies['army-test'].preparation).toBe(48)
    expect(restored?.armies['army-test'].strategy).toBe('logistics')
    expect(restored?.selectedDivisionId).toBe(unit.id)
    expect(restored?.selectedArmyId).toBe('army-test')
    expect(restored?.territories.a.terrain).toBe('mountain')
    expect(restored?.territories.a.railway).toBe(2)
    expect(restored?.territories.a.industry.logistics).toBe(2)
    expect(restored?.territories.a.industry.infrastructure).toBe(3)
    expect(restored?.researchPoints.player).toBe(123)
    expect(restored?.technologies.player.industrialMethods).toBe(1)
    expect(restored?.technologies.player.logisticsPlanning).toBe(2)
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
    expect(restored?.territories.a.industry.civilian).toBe(1)
    expect(restored?.territories.a.industry.military).toBe(0)
    expect(restored?.territories.a.terrain).toBe('plains')
    expect(
      Object.values(restored?.divisionUnits ?? {}).every(
        (unit) =>
          unit.locationId === 'a' &&
          unit.owner === 'player' &&
          unit.role === 'line' &&
          unit.armyId === null &&
          unit.entrenchment === 0,
      ),
    ).toBe(true)
  })
})
