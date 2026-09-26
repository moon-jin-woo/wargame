import type {
  AiCount,
  AiFactionId,
  ArmyGroup,
  AttackStance,
  BattleState,
  Difficulty,
  DivisionRole,
  DivisionUnit,
  Faction,
  FactionId,
  GameEventKind,
  GameState,
  IndustryType,
  PlayableFactionId,
  ProductionKind,
  ProductionOrder,
  StrategyDoctrine,
  TechnologyCategory,
  TechnologyId,
  TerrainType,
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

export const attackStanceLabels: Record<AttackStance, string> = {
  cautious: '신중',
  balanced: '균형',
  aggressive: '공세',
}

export const FACTORY_COST = 120
export const DIVISION_COST = 80
export const FACTORY_INCOME = 12
export const ECONOMY_INTERVAL = 5
export const MAX_FACTORIES = 6
export const MAX_DEFENSE = 4
export const MAX_RAILWAY = 3
export const RAILWAY_COST = 100

export const industryLabels: Record<IndustryType, string> = {
  civilian: '민수산업',
  military: '군수산업',
  logistics: '물류센터',
  infrastructure: '인프라',
  research: '연구시설',
}

export const INDUSTRY_COSTS: Record<IndustryType, number> = {
  civilian: 120,
  military: 140,
  logistics: 110,
  infrastructure: 90,
  research: 180,
}

export const INDUSTRY_MAX: Record<IndustryType, number> = {
  civilian: 6,
  military: 6,
  logistics: 4,
  infrastructure: 5,
  research: 3,
}

export const PRODUCTION_TICKS: Record<ProductionKind, number> = {
  factory: 30,
  civilian: 30,
  military: 34,
  logistics: 24,
  infrastructure: 20,
  research: 40,
  division: 12,
  defense: 16,
  railway: 18,
}

export const terrainLabels: Record<TerrainType, string> = {
  urban: '도시',
  plains: '평야',
  hills: '구릉',
  mountain: '산악',
  forest: '산림',
  coastal: '해안',
  island: '도서',
}

const terrainMove: Record<TerrainType, number> = {
  urban: 1.1,
  plains: 0.92,
  hills: 1.14,
  mountain: 1.42,
  forest: 1.22,
  coastal: 1.04,
  island: 1.36,
}

const terrainAttack: Record<TerrainType, number> = {
  urban: 0.9,
  plains: 1.05,
  hills: 0.94,
  mountain: 0.82,
  forest: 0.9,
  coastal: 1,
  island: 0.86,
}

const terrainDefense: Record<TerrainType, number> = {
  urban: 1.18,
  plains: 0.98,
  hills: 1.08,
  mountain: 1.24,
  forest: 1.12,
  coastal: 1.04,
  island: 1.16,
}

const terrainSupply: Record<TerrainType, number> = {
  urban: 1.08,
  plains: 1.05,
  hills: 0.96,
  mountain: 0.8,
  forest: 0.9,
  coastal: 1,
  island: 0.76,
}

export interface TechnologyDefinition {
  id: TechnologyId
  label: string
  category: TechnologyCategory
  description: string
  maxLevel: number
  baseCost: number
  costGrowth: number
  prerequisites: Partial<Record<TechnologyId, number>>
}

export const technologyDefinitions: Record<TechnologyId, TechnologyDefinition> = {
  industrialMethods: {
    id: 'industrialMethods',
    label: '산업 공정',
    category: 'industry',
    description: '민수 산업 수익과 전반적인 생산 효율을 향상합니다.',
    maxLevel: 3,
    baseCost: 90,
    costGrowth: 55,
    prerequisites: {},
  },
  constructionEngineering: {
    id: 'constructionEngineering',
    label: '건설 공학',
    category: 'industry',
    description: '산업 시설·방어 공사·철도 건설 시간을 단축합니다.',
    maxLevel: 3,
    baseCost: 115,
    costGrowth: 65,
    prerequisites: { industrialMethods: 1 },
  },
  massProduction: {
    id: 'massProduction',
    label: '대량 생산',
    category: 'industry',
    description: '사단 편성 속도와 군사산업 기반 회복 효율을 높입니다.',
    maxLevel: 2,
    baseCost: 155,
    costGrowth: 80,
    prerequisites: { industrialMethods: 2, constructionEngineering: 1 },
  },
  logisticsPlanning: {
    id: 'logisticsPlanning',
    label: '물류 계획',
    category: 'logistics',
    description: '보급 회복과 고립 지역의 보급 손실을 완화합니다.',
    maxLevel: 3,
    baseCost: 85,
    costGrowth: 55,
    prerequisites: {},
  },
  railOperations: {
    id: 'railOperations',
    label: '철도 운영',
    category: 'logistics',
    description: '철도 단계가 이동과 보급에 주는 효과를 강화합니다.',
    maxLevel: 3,
    baseCost: 120,
    costGrowth: 65,
    prerequisites: { logisticsPlanning: 1 },
  },
  supplyOptimization: {
    id: 'supplyOptimization',
    label: '보급 최적화',
    category: 'logistics',
    description: '물류센터·철도·인프라의 복합 보급 효율을 높입니다.',
    maxLevel: 2,
    baseCost: 165,
    costGrowth: 85,
    prerequisites: { logisticsPlanning: 2, railOperations: 1 },
  },
  commandNetwork: {
    id: 'commandNetwork',
    label: '지휘 통신',
    category: 'command',
    description: '군단의 작전 준비도 축적 속도를 향상합니다.',
    maxLevel: 3,
    baseCost: 95,
    costGrowth: 60,
    prerequisites: {},
  },
  operationalPlanning: {
    id: 'operationalPlanning',
    label: '작전 계획',
    category: 'command',
    description: '준비된 군단의 추상 공세 효율을 강화합니다.',
    maxLevel: 3,
    baseCost: 125,
    costGrowth: 70,
    prerequisites: { commandNetwork: 1 },
  },
  staffCoordination: {
    id: 'staffCoordination',
    label: '참모 조정',
    category: 'command',
    description: '군단 지휘관 보정과 다수 사단 운용 효율을 높입니다.',
    maxLevel: 2,
    baseCost: 170,
    costGrowth: 90,
    prerequisites: { commandNetwork: 2, operationalPlanning: 1 },
  },
  fieldEngineering: {
    id: 'fieldEngineering',
    label: '야전 공학',
    category: 'engineering',
    description: '참호화 축적과 지역 방어 준비를 향상합니다.',
    maxLevel: 3,
    baseCost: 80,
    costGrowth: 55,
    prerequisites: {},
  },
  defensiveWorks: {
    id: 'defensiveWorks',
    label: '방어 시설 공학',
    category: 'engineering',
    description: '방어 시설과 수비 사단의 추상 방어 보정을 강화합니다.',
    maxLevel: 3,
    baseCost: 115,
    costGrowth: 65,
    prerequisites: { fieldEngineering: 1 },
  },
  mobilityEngineering: {
    id: 'mobilityEngineering',
    label: '기동 공학',
    category: 'engineering',
    description: '기동 사단과 인프라·철도 이동 효율을 개선합니다.',
    maxLevel: 2,
    baseCost: 160,
    costGrowth: 85,
    prerequisites: { fieldEngineering: 1, railOperations: 1 },
  },
}

export const technologyLabels: Record<TechnologyId, string> = Object.fromEntries(
  Object.values(technologyDefinitions).map((definition) => [
    definition.id,
    definition.label,
  ]),
) as Record<TechnologyId, string>

export const TECHNOLOGY_MAX_LEVEL = 3

export const technologyCategories: Record<
  TechnologyCategory,
  { label: string; description: string }
> = {
  industry: {
    label: '산업',
    description: '건설·수익·생산 체계를 확장합니다.',
  },
  logistics: {
    label: '물류',
    description: '보급망과 철도 효율을 강화합니다.',
  },
  command: {
    label: '지휘',
    description: '군단 계획과 참모 체계를 개선합니다.',
  },
  engineering: {
    label: '공병',
    description: '방어·참호·기동 기반을 강화합니다.',
  },
}

export function technologyCost(
  technology: TechnologyId,
  level: number,
): number {
  const definition = technologyDefinitions[technology]
  return definition.baseCost + level * definition.costGrowth
}

export function technologyAvailable(
  state: GameState,
  owner: PlayableFactionId,
  technology: TechnologyId,
): boolean {
  const definition = technologyDefinitions[technology]
  const current = state.technologies[owner][technology] ?? 0
  if (current >= definition.maxLevel) return false

  return Object.entries(definition.prerequisites).every(
    ([requiredId, requiredLevel]) =>
      (state.technologies[owner][requiredId as TechnologyId] ?? 0) >=
      Number(requiredLevel ?? 0),
  )
}

export const strategyLabels: Record<StrategyDoctrine, string> = {
  balanced: '균형 전략',
  maneuver: '기동 전략',
  concentrated: '집중 전략',
  defensive: '방어 전략',
  logistics: '보급 전략',
}

export const strategyDescriptions: Record<StrategyDoctrine, string> = {
  balanced: '공격·방어·준비도의 균형형 운용입니다.',
  maneuver: '이동과 목표 전환이 빠르지만 방어 보정이 낮습니다.',
  concentrated: '준비된 공세 효율을 높이는 대신 조직력 소모가 큽니다.',
  defensive: '방어·참호 효율이 높지만 공세 효율이 낮습니다.',
  logistics: '보급 상태와 철도 효과를 우선하는 안정형 전략입니다.',
}

const strategyAttack: Record<StrategyDoctrine, number> = {
  balanced: 1,
  maneuver: 1.02,
  concentrated: 1.08,
  defensive: 0.94,
  logistics: 1,
}

const strategyDefense: Record<StrategyDoctrine, number> = {
  balanced: 1,
  maneuver: 0.95,
  concentrated: 0.98,
  defensive: 1.1,
  logistics: 1.02,
}

const strategyMove: Record<StrategyDoctrine, number> = {
  balanced: 1,
  maneuver: 0.9,
  concentrated: 1.05,
  defensive: 1.08,
  logistics: 0.96,
}

const strategyPreparation: Record<StrategyDoctrine, number> = {
  balanced: 1,
  maneuver: 0.95,
  concentrated: 1.08,
  defensive: 1.04,
  logistics: 1.02,
}

export const TECHNOLOGY_IDS = Object.keys(
  technologyDefinitions,
) as TechnologyId[]

function zeroTechnologyLevels(): Record<TechnologyId, number> {
  return Object.fromEntries(
    TECHNOLOGY_IDS.map((technology) => [technology, 0]),
  ) as Record<TechnologyId, number>
}

const STARTING_FUNDS = 320
const DIVISION_POWER = 100
const DEFENSE_POWER = 60
const aiFactions: AiFactionId[] = ['red', 'blue', 'green']

const commanderSurnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
const commanderGiven = [
  '도현',
  '민재',
  '서준',
  '지훈',
  '현우',
  '준혁',
  '태윤',
  '시우',
  '건우',
  '승민',
  '하준',
  '재현',
]

const stancePower: Record<AttackStance, number> = {
  cautious: 0.94,
  balanced: 1,
  aggressive: 1.08,
}

const stanceOrganizationCost: Record<AttackStance, number> = {
  cautious: 1.7,
  balanced: 2.4,
  aggressive: 3.2,
}

export const divisionRoleLabels: Record<DivisionRole, string> = {
  line: '전열',
  mobile: '기동',
  guard: '경비',
}

const rolePower: Record<DivisionRole, number> = {
  line: 1,
  mobile: 0.94,
  guard: 0.9,
}

const roleDefense: Record<DivisionRole, number> = {
  line: 1,
  mobile: 0.92,
  guard: 1.18,
}

const roleMoveMultiplier: Record<DivisionRole, number> = {
  line: 1,
  mobile: 0.72,
  guard: 1.18,
}

function activeAiFactions(count: AiCount): AiFactionId[] {
  return aiFactions.slice(0, count)
}

function actorName(state: GameState, owner: FactionId): string {
  if (owner === 'player') return state.playerName.trim() || '플레이어'
  if (owner === 'neutral') return factions.neutral.name
  return state.aiNames[owner].trim() || factions[owner].name
}

function withEvent(
  state: GameState,
  kind: GameEventKind,
  message: string,
): GameState {
  const event = {
    id: `${state.tick}:${kind}:${state.events.length}:${message.slice(0, 20)}`,
    tick: state.tick,
    kind,
    message,
  }

  return {
    ...state,
    events: [event, ...state.events].slice(0, 80),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

function commanderName(seed: string): string {
  const hash = hashString(seed)
  return `${commanderSurnames[hash % commanderSurnames.length]}${
    commanderGiven[Math.floor(hash / 13) % commanderGiven.length]
  }`
}

function divisionDisplayName(owner: PlayableFactionId, ordinal: number): string {
  const prefix =
    owner === 'player'
      ? '제'
      : owner === 'red'
        ? 'R-'
        : owner === 'blue'
          ? 'B-'
          : 'G-'

  return owner === 'player'
    ? `${prefix}${ordinal}보병사단`
    : `${prefix}${ordinal} 사단`
}

function makeDivision(
  owner: PlayableFactionId,
  locationId: string,
  ordinal: number,
  createdTick: number,
  seedSuffix = '',
): DivisionUnit {
  const id = `${owner}-division-${createdTick}-${ordinal}-${hashString(
    `${locationId}:${seedSuffix}`,
  ).toString(36)}`

  const role: DivisionRole =
    ordinal % 5 === 0 ? 'mobile' : ordinal % 4 === 0 ? 'guard' : 'line'

  return {
    id,
    owner,
    name: divisionDisplayName(owner, ordinal),
    commander: commanderName(`${owner}:${locationId}:${ordinal}:${seedSuffix}`),
    role,
    armyId: null,
    locationId,
    strength: 100,
    organization: 85,
    experience: 0,
    entrenchment: 0,
    status: 'idle',
    order: null,
    createdTick,
  }
}

function syncTerritoryDivisionCounts(state: GameState): GameState {
  const counts: Record<string, number> = {}

  for (const division of Object.values(state.divisionUnits)) {
    counts[division.locationId] = (counts[division.locationId] ?? 0) + 1
  }

  let changed = false
  const territories: Record<string, TerritoryState> = {}

  for (const [id, territory] of Object.entries(state.territories)) {
    const divisions = counts[id] ?? 0
    if (territory.divisions !== divisions) changed = true
    territories[id] =
      territory.divisions === divisions ? territory : { ...territory, divisions }
  }

  return changed ? { ...state, territories } : state
}

export function divisionsAt(
  state: GameState,
  territoryId: string,
  owner?: PlayableFactionId,
): DivisionUnit[] {
  return Object.values(state.divisionUnits).filter(
    (division) =>
      division.locationId === territoryId &&
      (owner === undefined || division.owner === owner),
  )
}

export function playerDivisions(state: GameState): DivisionUnit[] {
  return Object.values(state.divisionUnits)
    .filter((division) => division.owner === 'player')
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'ko') ||
        a.id.localeCompare(b.id),
    )
}

export function armiesForOwner(
  state: GameState,
  owner: PlayableFactionId,
): ArmyGroup[] {
  return Object.values(state.armies)
    .filter((army) => army.owner === owner)
    .sort(
      (a, b) =>
        a.createdTick - b.createdTick ||
        a.name.localeCompare(b.name, 'ko'),
    )
}

export function playerArmies(state: GameState): ArmyGroup[] {
  return armiesForOwner(state, 'player')
}

function nextArmyOrdinal(
  state: GameState,
  owner: PlayableFactionId,
): number {
  return armiesForOwner(state, owner).length + 1
}

function createArmyGroup(
  state: GameState,
  owner: PlayableFactionId,
  name?: string,
  strategy: StrategyDoctrine = 'balanced',
): { state: GameState; army: ArmyGroup } {
  const ordinal = nextArmyOrdinal(state, owner)
  const id = `${owner}-army-${state.tick}-${ordinal}`
  const army: ArmyGroup = {
    id,
    owner,
    name:
      name ??
      (owner === 'player'
        ? `제${ordinal}군단`
        : `${actorName(state, owner)} 제${ordinal}군단`),
    commander: commanderName(`army:${id}`),
    divisionIds: [],
    objectiveId: null,
    planStatus: 'idle',
    strategy,
    preparation: 0,
    createdTick: state.tick,
  }

  return {
    army,
    state: {
      ...state,
      selectedArmyId:
        owner === 'player' ? id : state.selectedArmyId,
      armies: {
        ...state.armies,
        [id]: army,
      },
    },
  }
}

export function createArmy(state: GameState): GameState {
  if (state.phase !== 'running') return state

  const created = createArmyGroup(state, 'player')
  return withEvent(
    created.state,
    'military',
    `${created.army.name} 창설 · 지휘관 ${created.army.commander}`,
  )
}

export function setArmyStrategy(
  state: GameState,
  armyId: string,
  strategy: StrategyDoctrine,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state

  return {
    ...state,
    armies: {
      ...state.armies,
      [armyId]: {
        ...army,
        strategy,
      },
    },
  }
}

export function renameArmy(
  state: GameState,
  armyId: string,
  name: string,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state

  return {
    ...state,
    armies: {
      ...state.armies,
      [armyId]: { ...army, name: name.slice(0, 28) },
    },
  }
}

export function renameArmyCommander(
  state: GameState,
  armyId: string,
  commander: string,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state

  return {
    ...state,
    armies: {
      ...state.armies,
      [armyId]: { ...army, commander: commander.slice(0, 24) },
    },
  }
}

export function assignDivisionToArmy(
  state: GameState,
  divisionId: string,
  armyId: string | null,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player') return state
  if (armyId !== null && state.armies[armyId]?.owner !== 'player') return state

  const armies = Object.fromEntries(
    Object.entries(state.armies).map(([id, army]) => [
      id,
      {
        ...army,
        divisionIds: army.divisionIds.filter(
          (candidateId) => candidateId !== divisionId,
        ),
      },
    ]),
  ) as Record<string, ArmyGroup>

  if (armyId) {
    armies[armyId] = {
      ...armies[armyId],
      divisionIds: [...armies[armyId].divisionIds, divisionId],
    }
  }

  return {
    ...state,
    armies,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        armyId,
      },
    },
  }
}

export function setDivisionRole(
  state: GameState,
  divisionId: string,
  role: DivisionRole,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (
    !division ||
    division.owner !== 'player' ||
    division.status !== 'idle'
  ) {
    return state
  }

  return {
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        role,
        entrenchment: 0,
      },
    },
  }
}

export function setArmyObjective(
  state: GameState,
  armyId: string,
  territoryId: string | null,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state
  if (territoryId !== null && !state.territories[territoryId]) return state

  return {
    ...state,
    armies: {
      ...state.armies,
      [armyId]: {
        ...army,
        objectiveId: territoryId,
        planStatus: territoryId ? 'planning' : 'idle',
        preparation: territoryId ? 0 : army.preparation,
      },
    },
  }
}

export function executeArmyPlan(
  state: GameState,
  armyId: string,
): GameState {
  const army = state.armies[armyId]
  if (
    !army ||
    army.owner !== 'player' ||
    !army.objectiveId ||
    !state.territories[army.objectiveId]
  ) {
    return state
  }

  let next = state
  let issued = 0

  for (const divisionId of army.divisionIds) {
    const division = next.divisionUnits[divisionId]
    if (
      !division ||
      division.owner !== 'player' ||
      division.status !== 'idle'
    ) {
      continue
    }

    const ordered = issueDivisionOrder(
      next,
      division.id,
      army.objectiveId,
    )
    if (ordered !== next) {
      next = ordered
      issued += 1
    }
  }

  if (issued === 0) return state

  const currentArmy = next.armies[armyId] ?? army
  return withEvent(
    {
      ...next,
      armies: {
        ...next.armies,
        [armyId]: {
          ...currentArmy,
          planStatus: 'executing',
        },
      },
    },
    'military',
    `${army.name} · 작전 실행 · ${issued}개 사단 명령`,
  )
}

export function haltArmyPlan(
  state: GameState,
  armyId: string,
): GameState {
  const army = state.armies[armyId]
  if (!army || army.owner !== 'player') return state

  let next = state
  for (const divisionId of army.divisionIds) {
    const division = next.divisionUnits[divisionId]
    if (!division || division.owner !== 'player') continue
    if (division.status !== 'idle') {
      next = cancelDivisionOrder(next, division.id)
    }
  }

  const currentArmy = next.armies[armyId] ?? army
  return withEvent(
    {
      ...next,
      armies: {
        ...next.armies,
        [armyId]: {
          ...currentArmy,
          planStatus: currentArmy.objectiveId ? 'planning' : 'idle',
        },
      },
    },
    'military',
    `${army.name} · 작전 중지`,
  )
}

function nextDivisionOrdinal(state: GameState, owner: PlayableFactionId): number {
  return (
    Object.values(state.divisionUnits).filter(
      (division) => division.owner === owner,
    ).length + 1
  )
}

export function defenseUpgradeCost(level: number): number {
  if (level >= MAX_DEFENSE) return 0
  return 70 + level * 50
}

function isIndustryKind(kind: ProductionKind): kind is IndustryType {
  return (
    kind === 'civilian' ||
    kind === 'military' ||
    kind === 'logistics' ||
    kind === 'infrastructure' ||
    kind === 'research'
  )
}

function normalizedIndustryKind(
  kind: ProductionKind,
): IndustryType | null {
  if (kind === 'factory') return 'civilian'
  return isIndustryKind(kind) ? kind : null
}

export function productionKindLabel(kind: ProductionKind): string {
  const industryKind = normalizedIndustryKind(kind)
  if (industryKind) return industryLabels[industryKind]
  if (kind === 'division') return '사단 편성'
  return '방어 공사'
}

export function productionCost(
  kind: ProductionKind,
  territory: TerritoryState,
): number {
  const industryKind = normalizedIndustryKind(kind)
  if (industryKind) return INDUSTRY_COSTS[industryKind]
  if (kind === 'division') return DIVISION_COST
  return defenseUpgradeCost(territory.defense)
}

export function productionDuration(
  kind: ProductionKind,
  territory: TerritoryState,
): number {
  if (kind === 'defense') {
    return Math.max(
      6,
      PRODUCTION_TICKS.defense +
        territory.defense * 4 -
        territory.industry.infrastructure * 2,
    )
  }

  if (kind === 'division') {
    return Math.max(
      5,
      PRODUCTION_TICKS.division -
        Math.min(5, territory.industry.military),
    )
  }

  const infrastructureReduction =
    territory.industry.infrastructure * 1.25

  return Math.max(
    6,
    Math.ceil(PRODUCTION_TICKS[kind] - infrastructureReduction),
  )
}

function productionDurationForOwner(
  state: GameState,
  kind: ProductionKind,
  territory: TerritoryState,
  owner: PlayableFactionId,
): number {
  const base = productionDuration(kind, territory)
  const technologyLevel =
    state.technologies[owner]?.industrialMethods ?? 0
  return Math.max(
    4,
    Math.ceil(base * (1 - technologyLevel * 0.06)),
  )
}

export function territoryMilitaryPower(
  territory: TerritoryState,
  state?: GameState,
): number {
  const divisionPower = state
    ? divisionsAt(state, territory.id).reduce(
        (sum, division) =>
          sum +
          DIVISION_POWER *
            (division.strength / 100) *
            (0.55 + division.organization / 220),
        0,
      )
    : territory.divisions * DIVISION_POWER

  return Math.round(divisionPower + territory.defense * DEFENSE_POWER)
}

export function factionIncomePerCycle(
  state: GameState,
  owner: PlayableFactionId,
): number {
  let civilianIndustry = 0
  let urbanBonus = 0

  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== owner) continue
    civilianIndustry += territory.industry.civilian
    if (territory.terrain === 'urban') {
      urbanBonus += territory.industry.civilian
    }
  }

  const technologyLevel =
    state.technologies[owner]?.industrialMethods ?? 0
  const modifier = 1 + technologyLevel * 0.08
  const base =
    civilianIndustry * FACTORY_INCOME +
    Math.floor(urbanBonus * 1.5)

  return Math.floor(base * modifier)
}

export function factionResearchPerCycle(
  state: GameState,
  owner: PlayableFactionId,
): number {
  let facilities = 0

  for (const territory of Object.values(state.territories)) {
    if (territory.owner === owner) {
      facilities += territory.industry.research
    }
  }

  return facilities * 8
}

export function researchTechnology(
  state: GameState,
  owner: PlayableFactionId,
  technology: TechnologyId,
): GameState {
  const currentLevel = state.technologies[owner][technology]
  if (currentLevel >= TECHNOLOGY_MAX_LEVEL) return state

  const cost = technologyCost(technology, currentLevel)
  if (state.researchPoints[owner] < cost) return state

  const next: GameState = {
    ...state,
    researchPoints: {
      ...state.researchPoints,
      [owner]: state.researchPoints[owner] - cost,
    },
    technologies: {
      ...state.technologies,
      [owner]: {
        ...state.technologies[owner],
        [technology]: currentLevel + 1,
      },
    },
  }

  if (owner !== 'player') return next

  return withEvent(
    next,
    'system',
    `${technologyLabels[technology]} 연구 완료 · Lv.${currentLevel + 1}`,
  )
}

function normalizeTerritories(
  territories: Record<string, TerritoryState>,
): Record<string, TerritoryState> {
  return Object.fromEntries(
    Object.entries(territories).map(([id, territory]) => {
      const legacyFactories = Number.isFinite(territory.factories)
        ? Math.max(0, Math.floor(territory.factories))
        : 0
      const industry = {
        civilian: Math.max(
          0,
          Math.floor(territory.industry?.civilian ?? legacyFactories),
        ),
        military: Math.max(
          0,
          Math.floor(territory.industry?.military ?? 0),
        ),
        logistics: Math.max(
          0,
          Math.floor(territory.industry?.logistics ?? 0),
        ),
        infrastructure: Math.max(
          0,
          Math.floor(territory.industry?.infrastructure ?? 0),
        ),
        research: Math.max(
          0,
          Math.floor(territory.industry?.research ?? 0),
        ),
      }

      return [
        id,
        {
          ...territory,
          factories: industry.civilian,
          industry,
          terrain: territory.terrain ?? 'plains',
          divisions: 0,
          defense: Number.isFinite(territory.defense)
            ? Math.max(0, Math.floor(territory.defense))
            : 0,
        },
      ]
    }),
  )
}

export function createInitialState(
  territories: Record<string, TerritoryState>,
  dataVersion: string,
): GameState {
  const normalized = normalizeTerritories(territories)
  const firstId = Object.keys(normalized)[0] ?? null

  return {
    phase: 'setup',
    running: false,
    speed: 1,
    tick: 0,
    selectedId: firstId,
    selectedDivisionId: null,
    selectedArmyId: null,
    playerName: '플레이어 세력',
    aiNames: {
      red: '적색 세력',
      blue: '청색 세력',
      green: '녹색 세력',
    },
    factionColors: {
      player: '#2f7df6',
      red: '#d65757',
      blue: '#7066dc',
      green: '#3f9b73',
    },
    funds: {
      player: STARTING_FUNDS,
      red: STARTING_FUNDS,
      blue: STARTING_FUNDS,
      green: STARTING_FUNDS,
    },
    researchPoints: {
      player: 0,
      red: 0,
      blue: 0,
      green: 0,
    },
    technologies: {
      player: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
      red: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
      blue: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
      green: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
    },
    aiCount: 3,
    difficulty: 'normal',
    attackStance: 'balanced',
    autoOffensive: false,
    dataVersion,
    events: [],
    productionQueue: [],
    battles: [],
    divisionUnits: {},
    armies: {},
    territories: normalized,
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
      minDistance = Math.min(
        minDistance,
        distanceSquared(territory.centroid, anchor.centroid),
      )
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
): { territories: Record<string, TerritoryState>; claimed: string[] } {
  const next = { ...territories }
  const seed = next[seedId]
  if (!seed) return { territories: next, claimed: [] }

  const cluster = [seedId, ...seed.neighbors.slice(0, 4)]
  const claimed: string[] = []

  cluster.forEach((id, index) => {
    const territory = next[id]
    if (!territory || (reserved.has(id) && id !== seedId)) return

    reserved.add(id)
    claimed.push(id)
    next[id] = {
      ...territory,
      owner,
      troops: 0,
      factories: index === 0 ? 2 : 0,
      industry:
        index === 0
          ? {
              civilian: 2,
              military: 1,
              logistics: 1,
              infrastructure: 2,
              research: 0,
            }
          : {
              civilian: 0,
              military: 0,
              logistics: 0,
              infrastructure: 1,
              research: 0,
            },
      divisions: 0,
      defense: index === 0 ? 1 : 0,
      supply: index === 0 ? 92 : 78,
    }
  })

  return { territories: next, claimed }
}

function spawnStartingDivisions(
  state: GameState,
  owner: PlayableFactionId,
  claimed: string[],
): GameState {
  const divisionUnits = { ...state.divisionUnits }
  let ordinal = nextDivisionOrdinal(state, owner)

  claimed.forEach((territoryId, index) => {
    const amount = index === 0 ? 3 : 1

    for (let i = 0; i < amount; i += 1) {
      const division = makeDivision(
        owner,
        territoryId,
        ordinal,
        state.tick,
        `start:${i}`,
      )
      divisionUnits[division.id] = division
      ordinal += 1
    }
  })

  return syncTerritoryDivisionCounts({ ...state, divisionUnits })
}

export function startGame(state: GameState, startId: string): GameState {
  const start = state.territories[startId]
  if (!start) return state

  let territories = Object.fromEntries(
    Object.entries(state.territories).map(([id, territory]) => [
      id,
      {
        ...territory,
        owner: 'neutral' as FactionId,
        troops: 0,
        factories: 0,
        industry: {
          civilian: 0,
          military: 0,
          logistics: 0,
          infrastructure: 0,
          research: 0,
        },
        divisions: 0,
        defense: 0,
        supply: 55,
      },
    ]),
  )

  const reserved = new Set<string>()
  const seeds = [startId]
  const claimedByOwner: Partial<Record<PlayableFactionId, string[]>> = {}

  const playerClaim = claimCluster(territories, startId, 'player', reserved)
  territories = playerClaim.territories
  claimedByOwner.player = playerClaim.claimed

  for (const faction of activeAiFactions(state.aiCount)) {
    const seed = chooseFarthestSeed(territories, seeds, reserved)
    if (!seed) continue
    seeds.push(seed)
    const result = claimCluster(territories, seed, faction, reserved)
    territories = result.territories
    claimedByOwner[faction] = result.claimed
  }

  let next: GameState = {
    ...state,
    phase: 'running',
    running: true,
    tick: 0,
    selectedId: startId,
    selectedDivisionId: null,
    selectedArmyId: null,
    funds: {
      player: STARTING_FUNDS,
      red: STARTING_FUNDS,
      blue: STARTING_FUNDS,
      green: STARTING_FUNDS,
    },
    researchPoints: {
      player: 0,
      red: 0,
      blue: 0,
      green: 0,
    },
    technologies: {
      player: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
      red: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
      blue: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
      green: {
        industrialMethods: 0,
        logisticsPlanning: 0,
        commandNetwork: 0,
        fieldEngineering: 0,
      },
    },
    productionQueue: [],
    battles: [],
    divisionUnits: {},
    armies: {},
    events: [],
    territories,
  }

  next = spawnStartingDivisions(next, 'player', claimedByOwner.player ?? [])
  for (const faction of activeAiFactions(state.aiCount)) {
    next = spawnStartingDivisions(
      next,
      faction,
      claimedByOwner[faction] ?? [],
    )
  }

  const firstPlayerDivision = playerDivisions(next)[0]?.id ?? null

  return withEvent(
    { ...next, selectedDivisionId: firstPlayerDivision },
    'system',
    `작전 개시 · ${start.fullName} · 사단 단위 지휘 체계 가동`,
  )
}

function hasProductionAt(
  state: GameState,
  owner: PlayableFactionId,
  territoryId: string,
): boolean {
  return state.productionQueue.some(
    (order) => order.owner === owner && order.territoryId === territoryId,
  )
}

function queueProductionForOwner(
  state: GameState,
  territoryId: string,
  kind: ProductionKind,
  owner: PlayableFactionId,
): GameState {
  if (state.phase !== 'running') return state

  const territory = state.territories[territoryId]
  if (!territory || territory.owner !== owner) return state
  if (hasProductionAt(state, owner, territoryId)) return state

  const industryKind = normalizedIndustryKind(kind)
  if (
    industryKind &&
    territory.industry[industryKind] >= INDUSTRY_MAX[industryKind]
  ) {
    return state
  }
  if (kind === 'defense' && territory.defense >= MAX_DEFENSE) return state

  const cost = productionCost(kind, territory)
  if (cost <= 0 || state.funds[owner] < cost) return state

  const duration = productionDurationForOwner(
    state,
    kind,
    territory,
    owner,
  )
  const order: ProductionOrder = {
    id: `${owner}:${territoryId}:${kind}:${state.tick}:${state.productionQueue.length}`,
    owner,
    territoryId,
    kind,
    cost,
    totalTicks: duration,
    remainingTicks: duration,
    queuedTick: state.tick,
  }

  const next: GameState = {
    ...state,
    funds: {
      ...state.funds,
      [owner]: state.funds[owner] - cost,
    },
    productionQueue: [...state.productionQueue, order],
  }

  if (owner !== 'player') return next

  return withEvent(
    next,
    'production',
    `${territory.fullName} · ${productionKindLabel(kind)} 생산 시작 · ${duration}틱`,
  )
}

export function queueProduction(
  state: GameState,
  territoryId: string,
  kind: ProductionKind,
): GameState {
  return queueProductionForOwner(state, territoryId, kind, 'player')
}

export function buildFactory(state: GameState, territoryId: string): GameState {
  return queueProduction(state, territoryId, 'civilian')
}

export function buildIndustry(
  state: GameState,
  territoryId: string,
  kind: IndustryType,
): GameState {
  return queueProduction(state, territoryId, kind)
}

export function buildDivision(state: GameState, territoryId: string): GameState {
  return queueProduction(state, territoryId, 'division')
}

export function upgradeDefense(state: GameState, territoryId: string): GameState {
  return queueProduction(state, territoryId, 'defense')
}

export function cancelProduction(
  state: GameState,
  orderId: string,
): GameState {
  const order = state.productionQueue.find(
    (candidate) => candidate.id === orderId && candidate.owner === 'player',
  )
  if (!order) return state

  const refund = Math.floor(order.cost * 0.75)
  return withEvent(
    {
      ...state,
      funds: {
        ...state.funds,
        player: state.funds.player + refund,
      },
      productionQueue: state.productionQueue.filter(
        (candidate) => candidate.id !== orderId,
      ),
    },
    'production',
    `생산 취소 · 자금 ${refund} 환급`,
  )
}

function completeProduction(
  state: GameState,
  order: ProductionOrder,
): GameState {
  const territory = state.territories[order.territoryId]
  if (!territory || territory.owner !== order.owner) return state

  let next = state
  const industryKind = normalizedIndustryKind(order.kind)

  if (industryKind) {
    const industry = {
      ...territory.industry,
      [industryKind]: Math.min(
        INDUSTRY_MAX[industryKind],
        territory.industry[industryKind] + 1,
      ),
    }

    next = {
      ...next,
      territories: {
        ...next.territories,
        [territory.id]: {
          ...territory,
          industry,
          factories: industry.civilian,
        },
      },
    }
  } else if (order.kind === 'defense') {
    next = {
      ...next,
      territories: {
        ...next.territories,
        [territory.id]: {
          ...territory,
          defense: Math.min(MAX_DEFENSE, territory.defense + 1),
        },
      },
    }
  } else {
    const ordinal = nextDivisionOrdinal(next, order.owner)
    const division = makeDivision(
      order.owner,
      territory.id,
      ordinal,
      next.tick,
      `production:${order.id}`,
    )

    next = syncTerritoryDivisionCounts({
      ...next,
      divisionUnits: {
        ...next.divisionUnits,
        [division.id]: division,
      },
      selectedDivisionId:
        order.owner === 'player' && !next.selectedDivisionId
          ? division.id
          : next.selectedDivisionId,
    })
  }

  if (order.owner === 'player') {
    next = withEvent(
      next,
      'production',
      `${territory.fullName} · ${productionKindLabel(order.kind)} 완료`,
    )
  }

  return next
}

function processProduction(state: GameState): GameState {
  if (state.productionQueue.length === 0) return state

  let next = state
  const remaining: ProductionOrder[] = []

  for (const order of state.productionQueue) {
    const territory = next.territories[order.territoryId]
    if (!territory || territory.owner !== order.owner) continue

    const progressed = {
      ...order,
      remainingTicks: order.remainingTicks - 1,
    }

    if (progressed.remainingTicks <= 0) {
      next = completeProduction(next, progressed)
    } else {
      remaining.push(progressed)
    }
  }

  return { ...next, productionQueue: remaining }
}

function movementTicks(
  source: TerritoryState,
  target: TerritoryState,
  role: DivisionRole = 'line',
): number {
  const supplyPenalty = Math.round((100 - source.supply) / 35)
  const distancePenalty = Math.min(
    2,
    Math.floor(Math.sqrt(distanceSquared(source.centroid, target.centroid)) * 5),
  )
  const infrastructureModifier = Math.max(
    0.68,
    1 - source.industry.infrastructure * 0.055,
  )
  const logisticsModifier = Math.max(
    0.82,
    1 - source.industry.logistics * 0.035,
  )

  return clamp(
    Math.ceil(
      (2 + supplyPenalty + distancePenalty) *
        roleMoveMultiplier[role] *
        terrainMove[target.terrain] *
        infrastructureModifier *
        logisticsModifier,
    ),
    1,
    10,
  )
}

function findDivisionRoute(
  state: GameState,
  owner: PlayableFactionId,
  fromId: string,
  targetId: string,
): string[] {
  if (fromId === targetId) return []

  const queue: string[] = [fromId]
  const previous = new Map<string, string | null>([[fromId, null]])

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const current = state.territories[currentId]
    if (!current) continue

    for (const neighborId of current.neighbors) {
      if (previous.has(neighborId)) continue
      const neighbor = state.territories[neighborId]
      if (!neighbor) continue

      const allowed =
        neighborId === targetId || neighbor.owner === owner
      if (!allowed) continue

      previous.set(neighborId, currentId)

      if (neighborId === targetId) {
        const path: string[] = []
        let cursor: string | null = targetId

        while (cursor && cursor !== fromId) {
          path.unshift(cursor)
          cursor = previous.get(cursor) ?? null
        }

        return path
      }

      queue.push(neighborId)
    }
  }

  return []
}

function defenderIdsAt(
  state: GameState,
  territoryId: string,
  defender: FactionId,
): string[] {
  if (defender === 'neutral') return []
  return Object.values(state.divisionUnits)
    .filter(
      (division) =>
        division.locationId === territoryId &&
        division.owner === defender &&
        division.status !== 'attacking',
    )
    .map((division) => division.id)
}

function setDivision(
  state: GameState,
  division: DivisionUnit,
): GameState {
  return {
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [division.id]: division,
    },
  }
}

export function issueDivisionOrder(
  state: GameState,
  divisionId: string,
  targetId: string,
): GameState {
  if (state.phase !== 'running') return state

  const division = state.divisionUnits[divisionId]
  const source = division ? state.territories[division.locationId] : null
  const target = state.territories[targetId]

  if (
    !division ||
    !source ||
    !target ||
    division.owner !== 'player' ||
    division.status !== 'idle' ||
    targetId === source.id
  ) {
    return state
  }

  const path = findDivisionRoute(
    state,
    division.owner,
    source.id,
    targetId,
  )

  if (path.length === 0) return state

  const firstStep = state.territories[path[0]]
  if (!firstStep) return state

  const totalTicks = movementTicks(source, firstStep, division.role)
  const orderType =
    target.owner === division.owner ? 'move' : 'attack'

  const nextDivision: DivisionUnit = {
    ...division,
    entrenchment: 0,
    status: 'moving',
    order: {
      type: orderType,
      targetId,
      path,
      totalTicks,
      remainingTicks: totalTicks,
      issuedTick: state.tick,
    },
  }

  return withEvent(
    setDivision(state, nextDivision),
    'movement',
    `${division.name} · ${source.name} → ${target.name} ${orderType === 'attack' ? '공격 이동' : '이동'} 명령`,
  )
}

function startDivisionBattle(
  state: GameState,
  divisionId: string,
  targetId: string,
  owner: PlayableFactionId,
  stance: AttackStance,
): GameState {
  const division = state.divisionUnits[divisionId]
  const source = division ? state.territories[division.locationId] : null
  const target = state.territories[targetId]

  if (
    !division ||
    !source ||
    !target ||
    division.owner !== owner ||
    division.status !== 'idle' ||
    target.owner === owner ||
    !source.neighbors.includes(targetId)
  ) {
    return state
  }

  const conflicting = state.battles.some(
    (battle) =>
      battle.toId === targetId &&
      battle.attacker !== owner,
  )
  if (conflicting) return state

  const existing = state.battles.find(
    (battle) =>
      battle.attacker === owner &&
      battle.toId === targetId,
  )

  if (existing) {
    const nextDivision: DivisionUnit = {
      ...division,
      entrenchment: 0,
      status: 'attacking',
      order: {
        type: 'attack',
        targetId,
        path: [targetId],
        totalTicks: 0,
        remainingTicks: 0,
        issuedTick: state.tick,
      },
    }

    return withEvent(
      {
        ...state,
        divisionUnits: {
          ...state.divisionUnits,
          [division.id]: nextDivision,
        },
        battles: state.battles.map((battle) =>
          battle.id === existing.id
            ? {
                ...battle,
                attackerDivisionIds: [
                  ...battle.attackerDivisionIds,
                  division.id,
                ],
              }
            : battle,
        ),
      },
      'battle',
      `${division.name} · ${target.name} 전투에 증원`,
    )
  }

  const defenders = defenderIdsAt(state, targetId, target.owner)

  if (defenders.length === 0 && target.defense === 0) {
    const totalTicks = movementTicks(source, target, division.role)
    const nextDivision: DivisionUnit = {
      ...division,
      entrenchment: 0,
      status: 'moving',
      order: {
        type: 'move',
        targetId,
        path: [targetId],
        totalTicks,
        remainingTicks: totalTicks,
        issuedTick: state.tick,
      },
    }

    return withEvent(
      setDivision(state, nextDivision),
      'movement',
      `${division.name} · ${target.name} 무저항 진입 시작`,
    )
  }

  const battle: BattleState = {
    id: `${owner}:${source.id}:${target.id}:${state.tick}`,
    attacker: owner,
    defender: target.owner,
    fromId: source.id,
    toId: target.id,
    attackerDivisionIds: [division.id],
    defenderDivisionIds: defenders,
    progress: 0,
    stance,
    startedTick: state.tick,
  }

  const divisionUnits = { ...state.divisionUnits }
  divisionUnits[division.id] = {
    ...division,
    entrenchment: 0,
    status: 'attacking',
    order: {
      type: 'attack',
      targetId,
      path: [targetId],
      totalTicks: 0,
      remainingTicks: 0,
      issuedTick: state.tick,
    },
  }

  for (const defenderId of defenders) {
    const defender = divisionUnits[defenderId]
    if (!defender) continue
    divisionUnits[defenderId] = {
      ...defender,
      status: 'defending',
    }
  }

  return withEvent(
    {
      ...state,
      divisionUnits,
      battles: [...state.battles, battle],
    },
    'battle',
    `${division.name} · ${source.name} → ${target.name} 공격 개시`,
  )
}

export function cancelDivisionOrder(
  state: GameState,
  divisionId: string,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player' || division.status === 'idle') {
    return state
  }

  let battles = state.battles
  let divisionUnits = { ...state.divisionUnits }

  if (division.status === 'attacking') {
    battles = battles
      .map((battle) =>
        battle.attackerDivisionIds.includes(divisionId)
          ? {
              ...battle,
              attackerDivisionIds: battle.attackerDivisionIds.filter(
                (id) => id !== divisionId,
              ),
            }
          : battle,
      )
      .filter((battle) => battle.attackerDivisionIds.length > 0)
  }

  divisionUnits[divisionId] = {
    ...division,
    status: 'idle',
    order: null,
  }

  return withEvent(
    { ...state, battles, divisionUnits },
    'movement',
    `${division.name} · 명령 취소`,
  )
}

export function renameDivision(
  state: GameState,
  divisionId: string,
  name: string,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player') return state

  return {
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        name: name.slice(0, 32),
      },
    },
  }
}

export function renameCommander(
  state: GameState,
  divisionId: string,
  commander: string,
): GameState {
  const division = state.divisionUnits[divisionId]
  if (!division || division.owner !== 'player') return state

  return {
    ...state,
    divisionUnits: {
      ...state.divisionUnits,
      [divisionId]: {
        ...division,
        commander: commander.slice(0, 24),
      },
    },
  }
}

function processMovement(state: GameState): GameState {
  let next = state
  let divisionUnits = { ...state.divisionUnits }
  let territories = state.territories
  let positionChanged = false
  const captured: Array<{ territoryId: string; divisionId: string }> = []
  const battleStarts: Array<{
    divisionId: string
    targetId: string
    owner: PlayableFactionId
  }> = []

  for (const original of Object.values(state.divisionUnits)) {
    const division = divisionUnits[original.id]
    if (!division || division.status !== 'moving' || !division.order) continue

    const order = division.order
    const remainingTicks = order.remainingTicks - 1

    if (remainingTicks > 0) {
      divisionUnits[division.id] = {
        ...division,
        order: { ...order, remainingTicks },
      }
      continue
    }

    const nextStepId = order.path[0]
    const nextStep = territories[nextStepId]
    const source = territories[division.locationId]

    if (!nextStep || !source || !source.neighbors.includes(nextStep.id)) {
      divisionUnits[division.id] = {
        ...division,
        status: 'idle',
        order: null,
      }
      continue
    }

    const finalStep = order.path.length === 1

    if (
      finalStep &&
      order.type === 'attack' &&
      nextStep.owner !== division.owner
    ) {
      divisionUnits[division.id] = {
        ...division,
        status: 'idle',
        order: null,
      }
      battleStarts.push({
        divisionId: division.id,
        targetId: nextStep.id,
        owner: division.owner,
      })
      continue
    }

    if (nextStep.owner !== division.owner) {
      const hostileUnits = Object.values(divisionUnits).filter(
        (unit) =>
          unit.locationId === nextStep.id &&
          unit.owner !== division.owner,
      )

      if (hostileUnits.length > 0 || nextStep.defense > 0) {
        divisionUnits[division.id] = {
          ...division,
          status: 'idle',
          order: null,
        }
        continue
      }
    }

    const remainingPath = order.path.slice(1)
    const arrivedAtFinal = remainingPath.length === 0
    let nextOrder = null

    if (!arrivedAtFinal) {
      const following = territories[remainingPath[0]]
      if (!following) {
        divisionUnits[division.id] = {
          ...division,
          status: 'idle',
          order: null,
        }
        continue
      }

      const legTicks = movementTicks(nextStep, following, division.role)
      nextOrder = {
        ...order,
        path: remainingPath,
        totalTicks: legTicks,
        remainingTicks: legTicks,
      }
    }

    divisionUnits[division.id] = {
      ...division,
      locationId: nextStep.id,
      entrenchment: 0,
      status: arrivedAtFinal ? 'idle' : 'moving',
      order: nextOrder,
      organization: Math.max(30, division.organization - 2.5),
    }
    positionChanged = true

    if (nextStep.owner !== division.owner) {
      territories = {
        ...territories,
        [nextStep.id]: {
          ...nextStep,
          owner: division.owner,
          supply: Math.max(35, nextStep.supply),
        },
      }
      captured.push({
        territoryId: nextStep.id,
        divisionId: division.id,
      })
    }
  }

  next = {
    ...next,
    divisionUnits,
    territories,
  }
  if (positionChanged) {
    next = syncTerritoryDivisionCounts(next)
  }

  for (const battle of battleStarts) {
    next = startDivisionBattle(
      next,
      battle.divisionId,
      battle.targetId,
      battle.owner,
      battle.owner === 'player'
        ? next.attackStance
        : next.difficulty === 'hard'
          ? 'aggressive'
          : next.difficulty === 'easy'
            ? 'cautious'
            : 'balanced',
    )
  }

  for (const capture of captured) {
    const territory = next.territories[capture.territoryId]
    const occupier = next.divisionUnits[capture.divisionId]
    next = withEvent(
      next,
      'capture',
      `${occupier?.name ?? '사단'} · ${territory.fullName} 점령`,
    )
  }

  return next
}

function divisionCombatPower(
  division: DivisionUnit,
  defending = false,
): number {
  const roleModifier = defending
    ? roleDefense[division.role]
    : rolePower[division.role]
  const entrenchmentModifier = defending
    ? 1 + division.entrenchment * 0.002
    : 1

  return (
    DIVISION_POWER *
    roleModifier *
    entrenchmentModifier *
    (division.strength / 100) *
    (0.35 + division.organization / 150) *
    (1 + division.experience / 300)
  )
}

function armyCommandModifier(
  state: GameState,
  division: DivisionUnit,
  attacking: boolean,
): number {
  if (!division.armyId) return 1
  const army = state.armies[division.armyId]
  if (!army) return 1

  const commanderBonus = army.commander.trim() ? 1.03 : 1
  const planningBonus = attacking
    ? 1 + clamp(army.preparation, 0, 100) / 600
    : 1

  return commanderBonus * planningBonus
}

function chooseRetreatTerritory(
  state: GameState,
  owner: PlayableFactionId,
  fromId: string,
): string | null {
  const territory = state.territories[fromId]
  if (!territory) return null

  return (
    territory.neighbors
      .map((id) => state.territories[id])
      .filter(
        (candidate): candidate is TerritoryState =>
          Boolean(candidate && candidate.owner === owner),
      )
      .sort(
        (a, b) =>
          b.supply - a.supply ||
          a.id.localeCompare(b.id),
      )[0]?.id ?? null
  )
}

function applyCombatWear(
  division: DivisionUnit,
  strengthLoss: number,
  organizationLoss: number,
  experienceGain: number,
): DivisionUnit {
  return {
    ...division,
    strength: clamp(division.strength - strengthLoss, 0, 100),
    organization: clamp(
      division.organization - organizationLoss,
      0,
      100,
    ),
    experience: clamp(division.experience + experienceGain, 0, 100),
  }
}

function processBattles(state: GameState): GameState {
  if (state.battles.length === 0) return state

  let next = state
  let divisionUnits = { ...state.divisionUnits }
  let territories = state.territories
  const active: BattleState[] = []

  for (const battle of state.battles) {
    const source = territories[battle.fromId]
    const target = territories[battle.toId]

    if (
      !source ||
      !target ||
      source.owner !== battle.attacker ||
      target.owner !== battle.defender
    ) {
      for (const divisionId of battle.attackerDivisionIds) {
        const division = divisionUnits[divisionId]
        if (!division) continue
        divisionUnits[divisionId] = {
          ...division,
          status: 'idle',
          order: null,
        }
      }
      continue
    }

    const attackers = battle.attackerDivisionIds
      .map((id) => divisionUnits[id])
      .filter(
        (division): division is DivisionUnit =>
          Boolean(
            division &&
              division.owner === battle.attacker &&
              division.status === 'attacking',
          ),
      )

    const defenders = battle.defenderDivisionIds
      .map((id) => divisionUnits[id])
      .filter(
        (division): division is DivisionUnit =>
          Boolean(
            division &&
              division.locationId === target.id &&
              division.owner === target.owner,
          ),
      )

    if (attackers.length === 0) continue

    const averageAttackerSupply =
      attackers.reduce(
        (sum, division) =>
          sum +
          (territories[division.locationId]?.supply ?? source.supply),
        0,
      ) / Math.max(1, attackers.length)

    const attackerLogisticsTech =
      next.technologies[battle.attacker]?.logisticsPlanning ?? 0
    const defenderEngineeringTech =
      target.owner === 'neutral'
        ? 0
        : next.technologies[target.owner]?.fieldEngineering ?? 0

    const attackerPower =
      attackers.reduce(
        (sum, division) =>
          sum +
          divisionCombatPower(division, false) *
            armyCommandModifier(next, division, true),
        0,
      ) *
      (0.62 + averageAttackerSupply / 210) *
      stancePower[battle.stance] *
      terrainAttack[target.terrain] *
      (1 + attackerLogisticsTech * 0.025)

    const defenderPower =
      (defenders.reduce(
        (sum, division) =>
          sum +
          divisionCombatPower(division, true) *
            armyCommandModifier(next, division, false),
        0,
      ) *
        (0.68 + target.supply / 220) +
        target.defense * DEFENSE_POWER +
        (target.owner === 'neutral' ? 20 : 35)) *
      terrainDefense[target.terrain] *
      (1 + defenderEngineeringTech * 0.045)

    const ratio = attackerPower / Math.max(45, defenderPower)
    const jitter =
      ((hashString(`${battle.id}:${next.tick}`) % 9) - 4) * 0.28
    const delta = clamp((ratio - 1) * 11 + jitter, -11, 13)
    const progress = battle.progress + delta

    const attackerStrengthLoss = clamp(
      0.45 + defenderPower / Math.max(220, attackerPower) * 0.55,
      0.35,
      2.1,
    )
    const defenderStrengthLoss = clamp(
      0.35 + attackerPower / Math.max(220, defenderPower) * 0.5,
      0.3,
      2.2,
    )

    for (const division of attackers) {
      divisionUnits[division.id] = applyCombatWear(
        division,
        attackerStrengthLoss,
        stanceOrganizationCost[battle.stance],
        0.35,
      )
    }

    for (const division of defenders) {
      divisionUnits[division.id] = applyCombatWear(
        division,
        defenderStrengthLoss,
        2.1,
        0.3,
      )
    }

    const survivingAttackers = attackers.filter(
      (division) => (divisionUnits[division.id]?.strength ?? 0) > 12,
    )
    const survivingDefenders = defenders.filter(
      (division) => (divisionUnits[division.id]?.strength ?? 0) > 12,
    )

    for (const division of attackers) {
      if ((divisionUnits[division.id]?.strength ?? 0) <= 12) {
        delete divisionUnits[division.id]
      }
    }

    for (const division of defenders) {
      if ((divisionUnits[division.id]?.strength ?? 0) <= 12) {
        delete divisionUnits[division.id]
      }
    }

    const attackerVictory =
      progress >= 100 || survivingDefenders.length === 0 && target.defense === 0
    const defenderVictory =
      progress <= -100 || survivingAttackers.length === 0

    if (attackerVictory) {
      const defenderOwner = target.owner

      for (const defender of survivingDefenders) {
        const current = divisionUnits[defender.id]
        if (!current) continue
        const retreat =
          defenderOwner === 'neutral'
            ? null
            : chooseRetreatTerritory(
                { ...next, territories, divisionUnits },
                defenderOwner as PlayableFactionId,
                target.id,
              )

        if (retreat) {
          divisionUnits[defender.id] = {
            ...current,
            locationId: retreat,
            status: 'idle',
            order: null,
            organization: Math.min(current.organization, 35),
          }
        } else {
          delete divisionUnits[defender.id]
        }
      }

      for (const attacker of survivingAttackers) {
        const current = divisionUnits[attacker.id]
        if (!current) continue
        divisionUnits[attacker.id] = {
          ...current,
          locationId: target.id,
          status: 'idle',
          order: null,
          organization: Math.min(70, current.organization + 5),
        }
      }

      territories = {
        ...territories,
        [target.id]: {
          ...target,
          owner: battle.attacker,
          defense: Math.max(0, target.defense - 1),
          supply: Math.max(30, Math.floor((source.supply + target.supply) / 2)),
        },
      }

      next = withEvent(
        { ...next, territories, divisionUnits },
        'capture',
        `${actorName(next, battle.attacker)} · ${target.fullName} 점령 · ${survivingAttackers.length}개 사단 진입`,
      )
      continue
    }

    if (defenderVictory) {
      for (const attacker of survivingAttackers) {
        const current = divisionUnits[attacker.id]
        if (!current) continue
        divisionUnits[attacker.id] = {
          ...current,
          status: 'idle',
          order: null,
          organization: Math.min(current.organization, 35),
        }
      }

      for (const defender of survivingDefenders) {
        const current = divisionUnits[defender.id]
        if (!current) continue
        divisionUnits[defender.id] = {
          ...current,
          status: 'idle',
          order: null,
        }
      }

      next = withEvent(
        { ...next, territories, divisionUnits },
        'defense',
        `${actorName(next, battle.attacker)} · ${target.fullName} 공격 실패`,
      )
      continue
    }

    active.push({
      ...battle,
      progress,
      attackerDivisionIds: survivingAttackers.map((division) => division.id),
      defenderDivisionIds: survivingDefenders.map((division) => division.id),
    })
  }

  next = {
    ...next,
    divisionUnits,
    territories,
    battles: active,
  }

  if (
    next.selectedDivisionId &&
    !next.divisionUnits[next.selectedDivisionId]
  ) {
    next = { ...next, selectedDivisionId: null }
  }

  return syncTerritoryDivisionCounts(next)
}

export function transferTroops(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const division = divisionsAt(state, fromId, 'player').find(
    (candidate) => candidate.status === 'idle',
  )
  if (!division) return state
  return issueDivisionOrder(state, division.id, toId)
}

function aiBuild(state: GameState, owner: AiFactionId): GameState {
  const owned = Object.values(state.territories).filter(
    (territory) => territory.owner === owner,
  )
  if (owned.length === 0) return state

  const queueCap =
    state.difficulty === 'easy' ? 1 : state.difficulty === 'hard' ? 4 : 3
  if (
    state.productionQueue.filter((order) => order.owner === owner).length >=
    queueCap
  ) {
    return state
  }

  const available = owned.filter(
    (territory) => !hasProductionAt(state, owner, territory.id),
  )
  if (available.length === 0) return state

  const totals = owned.reduce(
    (acc, territory) => {
      acc.civilian += territory.industry.civilian
      acc.military += territory.industry.military
      acc.logistics += territory.industry.logistics
      acc.infrastructure += territory.industry.infrastructure
      acc.research += territory.industry.research
      acc.supply += territory.supply
      return acc
    },
    {
      civilian: 0,
      military: 0,
      logistics: 0,
      infrastructure: 0,
      research: 0,
      supply: 0,
    },
  )
  const averageSupply = totals.supply / owned.length

  const chooseIndustryTarget = (kind: IndustryType) =>
    [...available]
      .filter(
        (territory) =>
          territory.industry[kind] < INDUSTRY_MAX[kind],
      )
      .sort(
        (a, b) =>
          a.industry[kind] - b.industry[kind] ||
          b.industry.infrastructure - a.industry.infrastructure ||
          b.supply - a.supply ||
          a.id.localeCompare(b.id),
      )[0]

  const desiredCivilian = Math.max(2, Math.ceil(owned.length / 5))
  const desiredMilitary = Math.max(1, Math.ceil(owned.length / 7))
  const desiredLogistics = Math.max(1, Math.ceil(owned.length / 10))
  const desiredResearch = Math.max(1, Math.ceil(owned.length / 14))

  const priority: IndustryType | null =
    averageSupply < 58 || totals.logistics < desiredLogistics
      ? 'logistics'
      : totals.civilian < desiredCivilian
        ? 'civilian'
        : totals.military < desiredMilitary
          ? 'military'
          : totals.research < desiredResearch
            ? 'research'
            : totals.infrastructure < owned.length
              ? 'infrastructure'
              : null

  if (priority) {
    const target = chooseIndustryTarget(priority)
    if (
      target &&
      state.funds[owner] >= INDUSTRY_COSTS[priority]
    ) {
      return queueProductionForOwner(
        state,
        target.id,
        priority,
        owner,
      )
    }
  }

  const frontlines = owned.filter((territory) =>
    territory.neighbors.some(
      (id) => state.territories[id]?.owner !== owner,
    ),
  )
  const divisionTarget = [...(frontlines.length > 0 ? frontlines : owned)]
    .filter((territory) => !hasProductionAt(state, owner, territory.id))
    .sort(
      (a, b) =>
        a.divisions - b.divisions ||
        b.industry.military - a.industry.military ||
        b.supply - a.supply ||
        a.id.localeCompare(b.id),
    )[0]

  if (divisionTarget && state.funds[owner] >= DIVISION_COST) {
    return queueProductionForOwner(
      state,
      divisionTarget.id,
      'division',
      owner,
    )
  }

  return state
}

function aiIssueOrders(state: GameState, owner: AiFactionId): GameState {
  const candidates = Object.values(state.divisionUnits)
    .filter(
      (division) =>
        division.owner === owner &&
        division.status === 'idle' &&
        division.organization >= 35,
    )
    .sort((a, b) => b.organization - a.organization)

  if (candidates.length === 0) return state

  const maxOrders =
    state.difficulty === 'easy' ? 1 : state.difficulty === 'hard' ? 3 : 2
  let next = state
  let issued = 0

  for (const division of candidates) {
    if (issued >= maxOrders) break

    const current = next.divisionUnits[division.id]
    if (!current || current.status !== 'idle') continue
    const territory = next.territories[current.locationId]
    if (!territory) continue

    const hostileTargets = territory.neighbors
      .map((id) => next.territories[id])
      .filter(
        (target): target is TerritoryState =>
          Boolean(target && target.owner !== owner),
      )
      .sort(
        (a, b) =>
          territoryMilitaryPower(a, next) -
            territoryMilitaryPower(b, next) ||
          a.id.localeCompare(b.id),
      )

    const target = hostileTargets[0]
    if (target) {
      next = startDivisionBattle(
        next,
        current.id,
        target.id,
        owner,
        state.difficulty === 'hard'
          ? 'aggressive'
          : state.difficulty === 'easy'
            ? 'cautious'
            : 'balanced',
      )
      issued += 1
      continue
    }

    const friendlyFront = territory.neighbors
      .map((id) => next.territories[id])
      .find(
        (candidate) =>
          candidate?.owner === owner &&
          candidate.neighbors.some(
            (neighborId) =>
              next.territories[neighborId]?.owner !== owner,
          ),
      )

    if (friendlyFront) {
      const totalTicks = movementTicks(territory, friendlyFront, current.role)
      next = setDivision(next, {
        ...current,
        status: 'moving',
        order: {
          type: 'move',
          targetId: friendlyFront.id,
          path: [friendlyFront.id],
          totalTicks,
          remainingTicks: totalTicks,
          issuedTick: next.tick,
        },
      })
      issued += 1
    }
  }

  return next
}

function runAutoOffensive(state: GameState): GameState {
  if (!state.autoOffensive) return state

  const candidate = playerDivisions(state)
    .filter(
      (division) =>
        division.status === 'idle' &&
        division.organization >= 55 &&
        division.strength >= 55,
    )
    .map((division) => ({
      division,
      territory: state.territories[division.locationId],
    }))
    .filter(
      (
        item,
      ): item is { division: DivisionUnit; territory: TerritoryState } =>
        Boolean(
          item.territory &&
            item.territory.neighbors.some(
              (id) => state.territories[id]?.owner !== 'player',
            ),
        ),
    )
    .sort(
      (a, b) =>
        b.division.organization - a.division.organization ||
        b.division.strength - a.division.strength,
    )[0]

  if (!candidate) return state

  const target = candidate.territory.neighbors
    .map((id) => state.territories[id])
    .filter(
      (territory): territory is TerritoryState =>
        Boolean(territory && territory.owner !== 'player'),
    )
    .sort(
      (a, b) =>
        territoryMilitaryPower(a, state) -
          territoryMilitaryPower(b, state) ||
        a.id.localeCompare(b.id),
    )[0]

  if (!target) return state

  return startDivisionBattle(
    state,
    candidate.division.id,
    target.id,
    'player',
    state.attackStance,
  )
}

function recoverDivisions(state: GameState): GameState {
  const divisionUnits = { ...state.divisionUnits }
  let changed = false

  for (const [id, division] of Object.entries(divisionUnits)) {
    if (division.status !== 'idle') continue

    const territory = state.territories[division.locationId]
    if (!territory || territory.owner !== division.owner) continue

    const organization = Math.min(
      100,
      division.organization + (territory.supply >= 55 ? 2.2 : 0.6),
    )
    const militaryCapacity = territory.industry.military
    const strength = Math.min(
      100,
      division.strength +
        (territory.supply >= 70 ? 0.25 : 0.05) +
        militaryCapacity * 0.08,
    )
    const engineeringLevel =
      state.technologies[division.owner]?.fieldEngineering ?? 0
    const entrenchGain =
      (division.role === 'guard'
        ? 4
        : division.role === 'mobile'
          ? 1.8
          : 3) *
      (1 + engineeringLevel * 0.1)
    const entrenchment = Math.min(
      100,
      division.entrenchment + entrenchGain,
    )

    if (
      organization !== division.organization ||
      strength !== division.strength ||
      entrenchment !== division.entrenchment
    ) {
      divisionUnits[id] = {
        ...division,
        organization,
        strength,
        entrenchment,
      }
      changed = true
    }
  }

  return changed ? { ...state, divisionUnits } : state
}

function processArmyPlanning(state: GameState): GameState {
  if (Object.keys(state.armies).length === 0) return state

  const armies: Record<string, ArmyGroup> = {}
  let changed = false

  for (const [id, army] of Object.entries(state.armies)) {
    const divisionIds = army.divisionIds.filter(
      (divisionId) => state.divisionUnits[divisionId]?.armyId === id,
    )
    const objective = army.objectiveId
      ? state.territories[army.objectiveId]
      : null
    const assigned = divisionIds
      .map((divisionId) => state.divisionUnits[divisionId])
      .filter((division): division is DivisionUnit => Boolean(division))
    const activeCount = assigned.filter(
      (division) => division.status !== 'idle',
    ).length

    let planStatus = army.planStatus
    let preparation = army.preparation
    let objectiveId = army.objectiveId

    if (objectiveId && objective?.owner === army.owner) {
      objectiveId = null
      planStatus = 'idle'
      preparation = Math.max(0, preparation - 20)
    } else if (planStatus === 'planning' && objectiveId) {
      const readiness =
        assigned.length === 0
          ? 0
          : assigned.reduce(
              (sum, division) =>
                sum +
                division.organization * 0.6 +
                division.strength * 0.4,
              0,
            ) /
            assigned.length /
            100
      const commandLevel =
        state.technologies[army.owner]?.commandNetwork ?? 0
      preparation = Math.min(
        100,
        preparation +
          1.2 +
          readiness * 1.8 +
          commandLevel * 0.45,
      )
    } else if (planStatus === 'executing') {
      preparation = Math.max(0, preparation - 1.5)
      if (activeCount === 0) {
        planStatus = objectiveId ? 'planning' : 'idle'
      }
    }

    if (
      divisionIds.length !== army.divisionIds.length ||
      planStatus !== army.planStatus ||
      preparation !== army.preparation ||
      objectiveId !== army.objectiveId
    ) {
      changed = true
    }

    armies[id] = {
      ...army,
      divisionIds,
      objectiveId,
      planStatus,
      preparation,
    }
  }

  return changed ? { ...state, armies } : state
}

function maybeAiResearch(
  state: GameState,
  owner: AiFactionId,
): GameState {
  const technologies = (
    Object.keys(state.technologies[owner]) as TechnologyId[]
  ).sort(
    (a, b) =>
      state.technologies[owner][a] -
        state.technologies[owner][b] ||
      technologyCost(a, state.technologies[owner][a]) -
        technologyCost(b, state.technologies[owner][b]),
  )

  const candidate = technologies.find((technology) => {
    const level = state.technologies[owner][technology]
    return (
      level < TECHNOLOGY_MAX_LEVEL &&
      state.researchPoints[owner] >= technologyCost(technology, level)
    )
  })

  return candidate
    ? researchTechnology(state, owner, candidate)
    : state
}

function applyIncome(state: GameState): GameState {
  const active: PlayableFactionId[] = [
    'player',
    ...activeAiFactions(state.aiCount),
  ]

  const funds = { ...state.funds }
  const researchPoints = { ...state.researchPoints }

  for (const owner of active) {
    funds[owner] += factionIncomePerCycle(state, owner)
    researchPoints[owner] += factionResearchPerCycle(state, owner)
  }

  let next: GameState = { ...state, funds, researchPoints }
  const playerIncome = factionIncomePerCycle(state, 'player')
  const playerResearch = factionResearchPerCycle(state, 'player')

  if (playerIncome > 0 || playerResearch > 0) {
    next = withEvent(
      next,
      'economy',
      `산업 수익 +${playerIncome} · 연구 +${playerResearch} · 자금 ${funds.player}`,
    )
  }

  for (const owner of activeAiFactions(state.aiCount)) {
    next = maybeAiResearch(next, owner)
    next = aiBuild(next, owner)
  }

  return next
}

function updatePhase(state: GameState): GameState {
  const values = Object.values(state.territories)
  const playerOwned = values.filter(
    (territory) => territory.owner === 'player',
  ).length

  if (
    playerOwned === values.length &&
    values.length > 0 &&
    state.phase === 'running'
  ) {
    return withEvent(
      { ...state, phase: 'victory', running: false },
      'system',
      '전국 통제 완료',
    )
  }

  if (playerOwned === 0 && state.phase === 'running') {
    return withEvent(
      { ...state, phase: 'defeat', running: false },
      'system',
      '플레이어 세력 소멸',
    )
  }

  return state
}

export function advanceTick(state: GameState): GameState {
  if (!state.running || state.phase !== 'running') return state

  const nextTick = state.tick + 1
  let territories = state.territories

  if (nextTick % 4 === 0) {
    let updated: Record<string, TerritoryState> | null = null

    for (const [id, territory] of Object.entries(territories)) {
      if (territory.owner === 'neutral') continue

      const owner = territory.owner as PlayableFactionId
      const connected = territory.neighbors.some(
        (neighborId) =>
          territories[neighborId]?.owner === territory.owner,
      )
      const logisticsLevel = territory.industry.logistics
      const infrastructureLevel = territory.industry.infrastructure
      const technologyLevel =
        state.technologies[owner]?.logisticsPlanning ?? 0

      const supplyDelta = connected
        ? (0.65 +
            logisticsLevel * 0.72 +
            infrastructureLevel * 0.28 +
            technologyLevel * 0.3) *
          terrainSupply[territory.terrain]
        : -Math.max(
            0.75,
            (3.2 -
              logisticsLevel * 0.42 -
              infrastructureLevel * 0.18 -
              technologyLevel * 0.16) /
              Math.max(0.65, terrainSupply[territory.terrain]),
          )

      const supply = clamp(territory.supply + supplyDelta, 0, 100)
      if (Math.abs(supply - territory.supply) < 0.001) continue

      if (!updated) updated = { ...territories }
      updated[id] = { ...territory, supply }
    }

    if (updated) territories = updated
  }

  let next: GameState = {
    ...state,
    tick: nextTick,
    territories,
  }

  next = processArmyPlanning(next)
  next = processProduction(next)
  next = processMovement(next)
  next = processBattles(next)

  if (nextTick % 2 === 0) {
    next = recoverDivisions(next)
  }

  if (nextTick % ECONOMY_INTERVAL === 0) {
    next = applyIncome(next)
  }

  const aiInterval =
    state.difficulty === 'easy'
      ? 7
      : state.difficulty === 'hard'
        ? 2
        : 4

  if (nextTick % aiInterval === 0) {
    for (const faction of activeAiFactions(state.aiCount)) {
      next = aiIssueOrders(next, faction)
    }
  }

  if (nextTick % 5 === 0) {
    next = runAutoOffensive(next)
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

export function captureTerritory(
  state: GameState,
  fromId: string,
  toId: string,
): GameState {
  const division = divisionsAt(state, fromId, 'player').find(
    (candidate) => candidate.status === 'idle',
  )
  if (!division) return state
  return issueDivisionOrder(state, division.id, toId)
}
