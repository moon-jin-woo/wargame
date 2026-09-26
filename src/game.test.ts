import { describe, expect, it } from 'vitest'
import {
  advanceTick,
  assignDivisionToArmy,
  buildDivision,
  buildFactory,
  buildIndustry,
  cancelProduction,
  createArmy,
  createInitialState,
  DIVISION_COST,
  executeArmyPlan,
  FACTORY_COST,
  issueDivisionOrder,
  PRODUCTION_TICKS,
  researchTechnology,
  setArmyObjective,
  setDivisionRole,
} from './game'
import type { DivisionUnit, GameState, TerritoryState } from './types'

function territory(
  id: string,
  owner: TerritoryState['owner'],
  neighbors: string[],
  overrides: Partial<TerritoryState> = {},
): TerritoryState {
  return {
    id,
    name: id.toUpperCase(),
    fullName: `Test ${id.toUpperCase()}`,
    sidoName: '테스트도',
    sggName: '테스트시',
    owner,
    troops: 0,
    supply: 90,
    factories: 0,
    industry: {
      civilian: 0,
      military: 0,
      logistics: 0,
      infrastructure: 0,
      research: 0,
    },
    terrain: 'plains',
    divisions: 0,
    defense: 0,
    neighbors,
    centroid: [127 + id.charCodeAt(0) * 0.0001, 36],
    ...overrides,
  }
}

function division(
  id: string,
  owner: DivisionUnit['owner'],
  locationId: string,
  overrides: Partial<DivisionUnit> = {},
): DivisionUnit {
  return {
    id,
    owner,
    name: id,
    commander: '테스트 지휘관',
    role: 'line',
    armyId: null,
    locationId,
    strength: 100,
    organization: 90,
    experience: 0,
    entrenchment: 0,
    status: 'idle',
    order: null,
    createdTick: 0,
    ...overrides,
  }
}

function runningState(): GameState {
  const territories = {
    a: territory('a', 'player', ['b'], { divisions: 1 }),
    b: territory('b', 'player', ['a', 'c']),
    c: territory('c', 'player', ['b', 'd']),
    d: territory('d', 'neutral', ['c']),
  }

  const base = createInitialState(territories, 'test')
  const unit = division('p-1', 'player', 'a')

  return {
    ...base,
    phase: 'running',
    running: true,
    selectedId: 'a',
    selectedDivisionId: unit.id,
    aiCount: 1,
    divisionUnits: { [unit.id]: unit },
    territories,
  }
}

describe('division unit game loop', () => {
  it('queues a factory and completes it only after production time', () => {
    let state = runningState()
    const startingFunds = state.funds.player

    state = buildFactory(state, 'a')

    expect(state.productionQueue).toHaveLength(1)
    expect(state.territories.a.factories).toBe(0)
    expect(state.funds.player).toBe(startingFunds - FACTORY_COST)

    for (let tick = 0; tick < PRODUCTION_TICKS.factory - 1; tick += 1) {
      state = advanceTick(state)
    }

    expect(state.territories.a.factories).toBe(0)
    state = advanceTick(state)
    expect(state.territories.a.factories).toBe(1)
    expect(state.productionQueue).toHaveLength(0)
  })

  it('creates a real division unit when division production finishes', () => {
    let state = runningState()
    const before = Object.keys(state.divisionUnits).length

    state = buildDivision(state, 'a')
    expect(state.funds.player).toBe(320 - DIVISION_COST)

    for (let tick = 0; tick < PRODUCTION_TICKS.division; tick += 1) {
      state = advanceTick(state)
    }

    expect(Object.keys(state.divisionUnits)).toHaveLength(before + 1)
    expect(
      Object.values(state.divisionUnits).some(
        (unit) =>
          unit.id !== 'p-1' &&
          unit.owner === 'player' &&
          unit.locationId === 'a',
      ),
    ).toBe(true)
  })

  it('refunds 75 percent when a production order is cancelled', () => {
    let state = runningState()
    const startingFunds = state.funds.player

    state = buildDivision(state, 'a')
    const order = state.productionQueue[0]

    state = cancelProduction(state, order.id)

    expect(state.productionQueue).toHaveLength(0)
    expect(state.funds.player).toBe(
      startingFunds - DIVISION_COST + Math.floor(DIVISION_COST * 0.75),
    )
  })

  it('routes an individual division across multiple friendly territories', () => {
    let state = runningState()

    state = issueDivisionOrder(state, 'p-1', 'c')

    expect(state.divisionUnits['p-1'].status).toBe('moving')
    expect(state.divisionUnits['p-1'].order?.path).toEqual(['b', 'c'])

    for (let tick = 0; tick < 20; tick += 1) {
      state = advanceTick(state)
      if (state.divisionUnits['p-1'].locationId === 'c') break
    }

    expect(state.divisionUnits['p-1'].locationId).toBe('c')
    expect(state.divisionUnits['p-1'].status).toBe('idle')
  })

  it('captures territory only after a division arrives and wins the battle', () => {
    let state = runningState()
    state = {
      ...state,
      territories: {
        ...state.territories,
        b: territory('b', 'red', ['a', 'c'], {
          divisions: 1,
          defense: 0,
          supply: 55,
        }),
      },
      divisionUnits: {
        ...state.divisionUnits,
        r1: division('r1', 'red', 'b', {
          strength: 22,
          organization: 25,
        }),
      },
    }

    state = issueDivisionOrder(state, 'p-1', 'b')

    expect(state.territories.b.owner).toBe('red')
    expect(state.divisionUnits['p-1'].status).toBe('moving')

    for (let tick = 0; tick < 40; tick += 1) {
      state = advanceTick(state)
      if (state.territories.b.owner === 'player') break
    }

    expect(state.territories.b.owner).toBe('player')
    expect(state.divisionUnits['p-1']?.locationId).toBe('b')
  })

  it('creates an army, assigns a division and builds planning preparation', () => {
    let state = runningState()

    state = createArmy(state)
    const armyId = state.selectedArmyId
    expect(armyId).not.toBeNull()

    state = assignDivisionToArmy(state, 'p-1', armyId)
    state = setArmyObjective(state, armyId!, 'd')

    expect(state.divisionUnits['p-1'].armyId).toBe(armyId)
    expect(state.armies[armyId!].planStatus).toBe('planning')

    for (let tick = 0; tick < 6; tick += 1) {
      state = advanceTick(state)
    }

    expect(state.armies[armyId!].preparation).toBeGreaterThan(0)
  })

  it('executes an army plan by issuing orders to assigned idle divisions', () => {
    let state = runningState()
    state = createArmy(state)
    const armyId = state.selectedArmyId!

    state = assignDivisionToArmy(state, 'p-1', armyId)
    state = setArmyObjective(state, armyId, 'd')
    state = executeArmyPlan(state, armyId)

    expect(state.armies[armyId].planStatus).toBe('executing')
    expect(state.divisionUnits['p-1'].status).toBe('moving')
    expect(state.divisionUnits['p-1'].order?.targetId).toBe('d')
  })

  it('builds entrenchment while an idle division remains supplied', () => {
    let state = runningState()
    expect(state.divisionUnits['p-1'].entrenchment).toBe(0)

    state = advanceTick(state)
    state = advanceTick(state)

    expect(state.divisionUnits['p-1'].entrenchment).toBeGreaterThan(0)
  })

  it('changes a division role while idle and clears entrenchment', () => {
    let state = runningState()
    state = {
      ...state,
      divisionUnits: {
        ...state.divisionUnits,
        'p-1': {
          ...state.divisionUnits['p-1'],
          entrenchment: 40,
        },
      },
    }

    state = setDivisionRole(state, 'p-1', 'mobile')

    expect(state.divisionUnits['p-1'].role).toBe('mobile')
    expect(state.divisionUnits['p-1'].entrenchment).toBe(0)
  })


  it('builds different industry types as separate regional capacity', () => {
    let state = runningState()

    state = buildIndustry(state, 'a', 'logistics')
    expect(state.productionQueue[0]?.kind).toBe('logistics')
    const totalTicks = state.productionQueue[0]?.totalTicks ?? 0

    for (let tick = 0; tick < totalTicks; tick += 1) {
      state = advanceTick(state)
    }

    expect(state.territories.a.industry.logistics).toBe(1)
    expect(state.territories.a.industry.civilian).toBe(0)
  })

  it('spends research points to advance an abstract technology level', () => {
    let state = runningState()
    state = {
      ...state,
      researchPoints: {
        ...state.researchPoints,
        player: 500,
      },
    }

    const before = state.researchPoints.player
    state = researchTechnology(state, 'player', 'logisticsPlanning')

    expect(state.technologies.player.logisticsPlanning).toBe(1)
    expect(state.researchPoints.player).toBeLessThan(before)
  })

  it('makes mountain movement slower than plains movement in the abstract map model', () => {
    const plains = runningState()
    const mountain = {
      ...runningState(),
      territories: {
        ...runningState().territories,
        b: {
          ...runningState().territories.b,
          terrain: 'mountain' as const,
        },
      },
    }

    const plainsOrdered = issueDivisionOrder(plains, 'p-1', 'b')
    const mountainOrdered = issueDivisionOrder(mountain, 'p-1', 'b')

    expect(
      mountainOrdered.divisionUnits['p-1'].order?.totalTicks ?? 0,
    ).toBeGreaterThan(
      plainsOrdered.divisionUnits['p-1'].order?.totalTicks ?? 0,
    )
  })

})
