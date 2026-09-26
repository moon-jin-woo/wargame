import { describe, expect, it } from 'vitest'
import {
  advanceTick,
  buildDivision,
  buildFactory,
  cancelProduction,
  captureTerritory,
  createInitialState,
  DIVISION_COST,
  FACTORY_COST,
  PRODUCTION_TICKS,
} from './game'
import type { GameState, TerritoryState } from './types'

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
    supply: 80,
    factories: 0,
    divisions: 0,
    defense: 0,
    neighbors,
    centroid: [127, 36],
    ...overrides,
  }
}

function runningState(): GameState {
  const territories = {
    a: territory('a', 'player', ['b'], { divisions: 4 }),
    b: territory('b', 'neutral', ['a', 'c']),
    c: territory('c', 'neutral', ['b']),
  }

  const base = createInitialState(territories, 'test')
  return {
    ...base,
    phase: 'running',
    running: true,
    selectedId: 'a',
    aiCount: 1,
    territories,
  }
}

describe('grand strategy game loop', () => {
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
    expect(state.productionQueue).toHaveLength(1)

    state = advanceTick(state)

    expect(state.territories.a.factories).toBe(1)
    expect(state.productionQueue).toHaveLength(0)
  })

  it('refunds 75 percent when a player production order is cancelled', () => {
    let state = runningState()
    const startingFunds = state.funds.player

    state = buildDivision(state, 'a')
    const order = state.productionQueue[0]

    expect(order).toBeDefined()
    expect(state.funds.player).toBe(startingFunds - DIVISION_COST)

    state = cancelProduction(state, order.id)

    expect(state.productionQueue).toHaveLength(0)
    expect(state.funds.player).toBe(
      startingFunds - DIVISION_COST + Math.floor(DIVISION_COST * 0.75),
    )
  })

  it('starts a battle first and resolves ownership over later ticks', () => {
    let state = runningState()

    state = captureTerritory(state, 'a', 'b')

    expect(state.battles).toHaveLength(1)
    expect(state.territories.b.owner).toBe('neutral')
    expect(state.territories.a.divisions).toBeLessThan(4)

    for (let tick = 0; tick < 20 && state.territories.b.owner !== 'player'; tick += 1) {
      state = advanceTick(state)
    }

    expect(state.territories.b.owner).toBe('player')
    expect(state.battles).toHaveLength(0)
  })
})
