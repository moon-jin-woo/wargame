import { describe, expect, it } from 'vitest'
import {
  advanceTick,
  buildDivision,
  buildFactory,
  cancelProduction,
  createInitialState,
  DIVISION_COST,
  DIVISION_MOVE_TICKS,
  FACTORY_COST,
  issueDivisionMoveOrders,
  PRODUCTION_TICKS,
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
    supply: 85,
    factories: 0,
    divisions: 0,
    defense: 0,
    neighbors,
    centroid: [127, 36],
    ...overrides,
  }
}

function division(
  id: string,
  owner: DivisionUnit['owner'],
  territoryId: string,
): DivisionUnit {
  return {
    id,
    owner,
    name: id,
    commander: `${id}-지휘관`,
    territoryId,
    strength: 100,
    organization: 90,
    supply: 90,
    experience: 0,
    status: 'idle',
    order: null,
    createdTick: 0,
  }
}

function runningState(): GameState {
  const territories = {
    a: territory('a', 'player', ['b'], { divisions: 1 }),
    b: territory('b', 'player', ['a', 'c']),
    c: territory('c', 'neutral', ['b']),
  }

  const base = createInitialState(territories, 'test')
  const divisions = {
    'div:player:test:1': division('div:player:test:1', 'player', 'a'),
  }

  return {
    ...base,
    phase: 'running',
    running: true,
    selectedId: 'a',
    aiCount: 1,
    territories,
    divisions,
  }
}

describe('individual division game loop', () => {
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

  it('moves an individual division through friendly territory over time', () => {
    let state = runningState()
    const id = 'div:player:test:1'

    state = issueDivisionMoveOrders(state, [id], 'b')

    expect(state.divisions[id].status).toBe('moving')
    expect(state.divisions[id].territoryId).toBe('a')

    for (let tick = 0; tick < DIVISION_MOVE_TICKS; tick += 1) {
      state = advanceTick(state)
    }

    expect(state.divisions[id].territoryId).toBe('b')
    expect(state.divisions[id].status).toBe('idle')
  })

  it('enters battle only after the division reaches a hostile border', () => {
    let state = runningState()
    const id = 'div:player:test:1'

    state = issueDivisionMoveOrders(state, [id], 'c')

    expect(state.battles).toHaveLength(0)
    expect(state.territories.c.owner).toBe('neutral')

    for (let tick = 0; tick < DIVISION_MOVE_TICKS; tick += 1) {
      state = advanceTick(state)
    }

    expect(state.divisions[id].territoryId).toBe('b')
    expect(state.battles).toHaveLength(0)

    for (let tick = 0; tick < DIVISION_MOVE_TICKS; tick += 1) {
      state = advanceTick(state)
    }

    expect(state.battles).toHaveLength(1)
    expect(state.territories.c.owner).toBe('neutral')
    expect(state.divisions[id].status).toBe('battle')
  })

  it('captures territory by moving surviving divisions into it', () => {
    let state = runningState()
    const id = 'div:player:test:1'

    state = issueDivisionMoveOrders(state, [id], 'c')

    for (
      let tick = 0;
      tick < 60 && state.territories.c.owner !== 'player';
      tick += 1
    ) {
      state = advanceTick(state)
    }

    expect(state.territories.c.owner).toBe('player')
    expect(state.divisions[id]?.territoryId).toBe('c')
    expect(state.battles).toHaveLength(0)
  })

  it('division production creates a named individual unit at the production territory', () => {
    let state = runningState()
    const before = Object.keys(state.divisions).length

    state = buildDivision(state, 'a')

    for (let tick = 0; tick < PRODUCTION_TICKS.division; tick += 1) {
      state = advanceTick(state)
    }

    const playerDivisions = Object.values(state.divisions).filter(
      (unit) => unit.owner === 'player',
    )

    expect(playerDivisions).toHaveLength(before + 1)
    expect(
      playerDivisions.some(
        (unit) =>
          unit.territoryId === 'a' &&
          unit.name.length > 0 &&
          unit.commander.length > 0,
      ),
    ).toBe(true)
  })
})
