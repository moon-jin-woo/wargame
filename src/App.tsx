import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { loadLatestAdminDongs } from './adminData'
import {
  advanceTick,
  armiesForOwner,
  attackStanceLabels,
  buildDivision,
  buildIndustry,
  buildRailway,
  cancelDivisionOrder,
  cancelProduction,
  createArmy,
  createInitialState,
  defenseUpgradeCost,
  difficultyLabels,
  DIVISION_COST,
  ECONOMY_INTERVAL,
  FACTORY_INCOME,
  divisionsAt,
  factionResearchPerCycle,
  divisionRoleLabels,
  executeArmyPlan,
  factionIncomePerCycle,
  factions,
  haltArmyPlan,
  INDUSTRY_COSTS,
  INDUSTRY_MAX,
  industryLabels,
  issueDivisionOrder,
  MAX_DEFENSE,
  MAX_FACTORIES,
  MAX_RAILWAY,
  RAILWAY_COST,
  ownerCounts,
  playerArmies,
  playerDivisions,
  productionDuration,
  productionKindLabel,
  renameArmy,
  renameArmyCommander,
  renameCommander,
  renameDivision,
  setArmyObjective,
  setArmyStrategy,
  setDivisionRole,
  assignDivisionToArmy,
  startGame,
  researchTechnology,
  technologyAvailable,
  technologyCategories,
  technologyCost,
  technologyDefinitions,
  TECHNOLOGY_IDS,
  technologyLabels,
  strategyDescriptions,
  strategyLabels,
  terrainLabels,
  territoryMilitaryPower,
  upgradeDefense,
} from './game'
import { getSavedAt, restoreGame, saveGame } from './persistence'
import { drawTerritoryCanvas, findTerritoryAtLngLat } from './territoryCanvas'
import type {
  AdminMapData,
  AiCount,
  AiFactionId,
  Difficulty,
  AttackStance,
  DivisionRole,
  DivisionUnit,
  FactionId,
  GameSpeed,
  GameState,
  IndustryType,
  PlayableFactionId,
  ProductionKind,
  StrategyDoctrine,
  TechnologyCategory,
  TechnologyId,
  TerritoryState,
} from './types'

const SOURCE_ID = 'admin-dongs'
const FILL_LAYER_ID = 'admin-dongs-fill'
const LINE_LAYER_ID = 'admin-dongs-line'
const DIVISION_ROUTE_SOURCE_ID = 'division-route'
const DIVISION_ROUTE_LAYER_ID = 'division-route-line'
const DIVISION_SOURCE_ID = 'division-stacks'
const DIVISION_COUNTER_LAYER_ID = 'division-counter'
const DIVISION_LABEL_LAYER_ID = 'division-counter-label'
const RAILWAY_SOURCE_ID = 'railway-network'
const RAILWAY_LAYER_ID = 'railway-network-line'
type MapMode = 'control' | 'supply' | 'industry' | 'terrain' | 'railway'

const INDUSTRY_TYPES: IndustryType[] = [
  'civilian',
  'military',
  'logistics',
  'infrastructure',
  'research',
]

const TERRAIN_COLORS: Record<TerritoryState['terrain'], string> = {
  urban: '#7f7067',
  plains: '#71835f',
  hills: '#8b7b59',
  mountain: '#696d70',
  forest: '#506b54',
  coastal: '#66808a',
  island: '#6d718d',
}

function territoryMapColor(
  territory: TerritoryState,
  game: GameState,
  mode: MapMode,
): string {
  if (mode === 'control') return ownerColor(territory.owner, game)

  if (mode === 'supply') {
    if (territory.supply >= 80) return '#6f8f73'
    if (territory.supply >= 55) return '#a38b57'
    if (territory.supply >= 30) return '#9b654d'
    return '#70433f'
  }

  if (mode === 'terrain') {
    return TERRAIN_COLORS[territory.terrain]
  }

  if (mode === 'railway') {
    if (territory.railway >= 3) return '#d7c182'
    if (territory.railway === 2) return '#9e8c65'
    if (territory.railway === 1) return '#655f4f'
    return '#303737'
  }

  const industryLevel =
    territory.industry.civilian +
    territory.industry.military +
    territory.industry.logistics +
    territory.industry.infrastructure +
    territory.industry.research

  if (industryLevel >= 10) return '#d6b96f'
  if (industryLevel >= 7) return '#b29a62'
  if (industryLevel >= 4) return '#877a57'
  if (industryLevel >= 2) return '#625f4d'
  if (industryLevel >= 1) return '#4b4f45'
  return '#343a3a'
}

function formatStrategicTime(tick: number): string {
  const day = Math.floor(tick / 4) + 1
  const hour = (tick % 4) * 6
  return `DAY ${String(day).padStart(3, '0')} · ${String(hour).padStart(2, '0')}:00`
}

function industryDescription(kind: IndustryType): string {
  if (kind === 'civilian') return '자금 수익 증가'
  if (kind === 'military') return '사단 편성·회복 가속'
  if (kind === 'logistics') return '지역 보급 회복 증가'
  if (kind === 'infrastructure') return '건설·이동 시간 감소'
  return '연구점수 생산'
}

function technologyDescription(technology: TechnologyId): string {
  return technologyDefinitions[technology].description
}

function divisionStatusLabel(division: DivisionUnit): string {
  if (division.status === 'moving') return '이동 중'
  if (division.status === 'attacking') return '공격 중'
  if (division.status === 'defending') return '방어 중'
  return '대기'
}

function ownerName(owner: FactionId, game: GameState): string {
  if (owner === 'player') return game.playerName || '—'
  if (owner === 'neutral') return factions.neutral.name
  return game.aiNames[owner] || '—'
}

function ownerColor(owner: FactionId, game: GameState): string {
  if (owner === 'neutral') return factions.neutral.color
  return game.factionColors[owner]
}

function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const territoryCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previousOwners = useRef<Record<string, string>>({})
  const previousSelected = useRef<string | null>(null)
  const previousFrontlines = useRef<Record<string, boolean>>({})
  const previousBattleTerritories = useRef<Set<string>>(new Set())

  const [mapLoaded, setMapLoaded] = useState(false)
  const [layerReady, setLayerReady] = useState(false)
  const [adminData, setAdminData] = useState<AdminMapData | null>(null)
  const [game, setGame] = useState<GameState | null>(null)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(() => getSavedAt())
  const [territoryRenderCount, setTerritoryRenderCount] = useState<number | null>(null)
  const [canvasFallbackActive, setCanvasFallbackActive] = useState(false)
  const [commandOpen, setCommandOpen] = useState(true)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(true)
  const [productionOpen, setProductionOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const [frontOpen, setFrontOpen] = useState(false)
  const [armyOpen, setArmyOpen] = useState(false)
  const [hqFaction, setHqFaction] = useState<PlayableFactionId>('player')
  const [objectiveMode, setObjectiveMode] = useState(false)
  const [mapMode, setMapMode] = useState<MapMode>('control')

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#17212b',
            },
          },
        ],
      },
      center: [127.65, 36.25],
      zoom: 6.2,
      minZoom: 5.4,
      maxZoom: 13,
      attributionControl: { compact: true },
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-left')

    const markStyleReady = () => setMapLoaded(true)
    map.once('style.load', markStyleReady)

    if (map.isStyleLoaded()) {
      setMapLoaded(true)
    }

    mapRef.current = map

    return () => {
      map.off('style.load', markStyleReady)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadLatestAdminDongs()
      .then((data) => {
        if (cancelled) return
        setAdminData(data)
        setGame(createInitialState(data.territories, data.version))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadingError(error instanceof Error ? error.message : '행정동 데이터를 불러오지 못했습니다.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !adminData || map.getSource(SOURCE_ID)) return

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: adminData.collection as never,
      promoteId: 'gameId',
      maxzoom: 12,
      buffer: 64,
      tolerance: 0.75,
    })

    map.addLayer({
      id: FILL_LAYER_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': [
          'coalesce',
          ['feature-state', 'color'],
          '#7f8b98',
        ],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          0.88,
          ['==', ['feature-state', 'owner'], 'neutral'],
          0.5,
          0.72,
        ],
      },
    })

    map.addLayer({
      id: LINE_LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#ffffff',
          ['boolean', ['feature-state', 'battle'], false],
          '#ff6f4e',
          ['boolean', ['feature-state', 'frontline'], false],
          '#ffb65c',
          '#d6dee7',
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          3.6,
          ['boolean', ['feature-state', 'battle'], false],
          3,
          ['boolean', ['feature-state', 'frontline'], false],
          2.2,
          [
            'interpolate',
            ['linear'],
            ['zoom'],
            5.4,
            0.9,
            8,
            1.2,
            11,
            1.6,
          ],
        ],
        'line-opacity': 0.98,
      },
    })

    map.addSource(DIVISION_ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    })

    map.addLayer({
      id: DIVISION_ROUTE_LAYER_ID,
      type: 'line',
      source: DIVISION_ROUTE_SOURCE_ID,
      paint: {
        'line-color': '#f0d48a',
        'line-width': 2.4,
        'line-opacity': 0.9,
        'line-dasharray': [2, 1.5],
      },
    })

    map.addSource(RAILWAY_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    })

    map.addLayer({
      id: RAILWAY_LAYER_ID,
      type: 'line',
      source: RAILWAY_SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'interpolate',
          ['linear'],
          ['get', 'level'],
          1,
          1.2,
          2,
          2.2,
          3,
          3.2,
        ],
        'line-opacity': 0.32,
      },
    })

    map.addSource(DIVISION_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    })

    map.addLayer({
      id: DIVISION_COUNTER_LAYER_ID,
      type: 'circle',
      source: DIVISION_SOURCE_ID,
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['get', 'selected'], false],
          ['interpolate', ['linear'], ['zoom'], 5.4, 10, 9, 13, 13, 17],
          ['interpolate', ['linear'], ['zoom'], 5.4, 8, 9, 11, 13, 15],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.96,
        'circle-stroke-color': [
          'case',
          ['boolean', ['get', 'fighting'], false],
          '#f06f55',
          ['boolean', ['get', 'selected'], false],
          '#f1e2b3',
          ['boolean', ['get', 'moving'], false],
          '#cfb46d',
          '#1a1c1c',
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['get', 'selected'], false],
          3,
          2,
        ],
      },
    })

    map.addLayer({
      id: DIVISION_LABEL_LAYER_ID,
      type: 'symbol',
      source: DIVISION_SOURCE_ID,
      layout: {
        'text-field': [
          'format',
          ['get', 'symbol'],
          { 'font-scale': 0.82 },
          '\n',
          {},
          ['to-string', ['get', 'count']],
          { 'font-scale': 1.05 },
        ],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5.4,
          8,
          9,
          10,
          13,
          12,
        ],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#f6f2e6',
        'text-halo-color': '#161818',
        'text-halo-width': 1.1,
      },
    })

    if (!map.getSource('osm')) {
      map.addSource('osm', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      })

      map.addLayer(
        {
          id: 'osm-base',
          type: 'raster',
          source: 'osm',
          paint: {
            'raster-saturation': -0.72,
            'raster-brightness-min': 0.08,
            'raster-brightness-max': 0.58,
            'raster-contrast': 0.12,
            'raster-opacity': 0.72,
          },
        },
        FILL_LAYER_ID,
      )
    }

    const clickHandler = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.gameId
      if (!id) return
      handleTerritoryCommand(String(id))
    }

    const enterHandler = () => {
      map.getCanvas().style.cursor = 'pointer'
    }

    const leaveHandler = () => {
      map.getCanvas().style.cursor = ''
    }

    const detectTerritories = () => {
      if (!map.getLayer(FILL_LAYER_ID)) return

      const visible = map.queryRenderedFeatures({
        layers: [FILL_LAYER_ID],
      })

      if (visible.length > 0) {
        setTerritoryRenderCount(visible.length)
        map.off('render', detectTerritories)
      }
    }

    map.on('click', FILL_LAYER_ID, clickHandler)
    map.on('mouseenter', FILL_LAYER_ID, enterHandler)
    map.on('mouseleave', FILL_LAYER_ID, leaveHandler)
    map.on('render', detectTerritories)

    previousOwners.current = {}
    previousFrontlines.current = {}
    previousSelected.current = null
    setLayerReady(true)

    return () => {
      map.off('click', FILL_LAYER_ID, clickHandler)
      map.off('mouseenter', FILL_LAYER_ID, enterHandler)
      map.off('mouseleave', FILL_LAYER_ID, leaveHandler)
      map.off('render', detectTerritories)
    }
  }, [adminData, mapLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady || !game) return

    const firstSync = Object.keys(previousOwners.current).length === 0
    const affected = new Set<string>()

    for (const [id, territory] of Object.entries(game.territories)) {
      const visualColor = territoryMapColor(territory, game, mapMode)
      const industryKey =
        territory.industry.civilian +
        territory.industry.military * 2 +
        territory.industry.logistics * 3 +
        territory.industry.infrastructure * 5 +
        territory.industry.research * 7
      const ownerKey =
        mapMode === 'control'
          ? `${territory.owner}|${visualColor}`
          : mapMode === 'supply'
            ? `${mapMode}|${Math.round(territory.supply / 5)}|${visualColor}`
            : mapMode === 'terrain'
              ? `${mapMode}|${territory.terrain}|${visualColor}`
              : mapMode === 'railway'
                ? `${mapMode}|${territory.railway}|${visualColor}`
                : `${mapMode}|${industryKey}|${visualColor}`

      if (previousOwners.current[id] !== ownerKey) {
        map.setFeatureState(
          { source: SOURCE_ID, id },
          {
            owner: territory.owner,
            color: visualColor,
          },
        )

        previousOwners.current[id] = ownerKey
        affected.add(id)

        for (const neighborId of territory.neighbors) {
          affected.add(neighborId)
        }
      }
    }

    if (firstSync) {
      for (const id of Object.keys(game.territories)) {
        affected.add(id)
      }
    }

    for (const id of affected) {
      const territory = game.territories[id]
      if (!territory) continue

      const frontline =
        territory.owner !== 'neutral' &&
        territory.neighbors.some(
          (neighborId) =>
            game.territories[neighborId] &&
            game.territories[neighborId].owner !== territory.owner,
        )

      if (previousFrontlines.current[id] !== frontline) {
        map.setFeatureState(
          { source: SOURCE_ID, id },
          { frontline },
        )
        previousFrontlines.current[id] = frontline
      }
    }
  }, [game?.territories, game?.factionColors, layerReady, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady || !game) return

    if (previousSelected.current) {
      map.setFeatureState(
        { source: SOURCE_ID, id: previousSelected.current },
        { selected: false },
      )
    }

    if (game.selectedId) {
      map.setFeatureState(
        { source: SOURCE_ID, id: game.selectedId },
        { selected: true },
      )
    }

    previousSelected.current = game.selectedId
  }, [game?.selectedId, layerReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady || !game) return

    for (const id of previousBattleTerritories.current) {
      map.setFeatureState(
        { source: SOURCE_ID, id },
        { battle: false },
      )
    }

    const current = new Set<string>()
    for (const battle of game.battles) {
      current.add(battle.fromId)
      current.add(battle.toId)
      map.setFeatureState(
        { source: SOURCE_ID, id: battle.fromId },
        { battle: true },
      )
      map.setFeatureState(
        { source: SOURCE_ID, id: battle.toId },
        { battle: true },
      )
    }

    previousBattleTerritories.current = current
  }, [game?.battles, layerReady])

  useEffect(() => {
    if (!game || territoryRenderCount) {
      setCanvasFallbackActive(false)
      return
    }

    const timer = window.setTimeout(() => {
      setCanvasFallbackActive(true)
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [Boolean(game), territoryRenderCount])

  useEffect(() => {
    const map = mapRef.current
    const canvas = territoryCanvasRef.current
    if (!map || !canvas || !mapLoaded || !adminData || !game) return

    if (!canvasFallbackActive) {
      canvas.style.opacity = '0'
      return
    }

    let frame = 0

    const draw = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        drawTerritoryCanvas(canvas, map, adminData, game)
        canvas.style.opacity = '1'
      })
    }

    const hide = () => {
      canvas.style.opacity = '0'
    }

    const fallbackClick = (event: maplibregl.MapMouseEvent) => {
      const id = findTerritoryAtLngLat(
        adminData,
        event.lngLat.lng,
        event.lngLat.lat,
      )

      if (!id) return
      handleTerritoryCommand(id)
    }

    map.on('movestart', hide)
    map.on('moveend', draw)
    map.on('resize', draw)
    map.on('click', fallbackClick)
    draw()

    return () => {
      window.cancelAnimationFrame(frame)
      map.off('movestart', hide)
      map.off('moveend', draw)
      map.off('resize', draw)
      map.off('click', fallbackClick)
    }
  }, [
    adminData,
    game?.territories,
    game?.selectedId,
    mapLoaded,
    canvasFallbackActive,
  ])

  useEffect(() => {
    if (!game || !game.running || game.phase !== 'running') return

    const ticksPerPulse = game.speed === 10 ? 2 : 1
    const intervalMs = (1000 * ticksPerPulse) / game.speed

    const interval = window.setInterval(() => {
      setGame((previous) => {
        if (!previous) return previous
        let next = previous
        for (let index = 0; index < ticksPerPulse; index += 1) {
          next = advanceTick(next)
        }
        return next
      })
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [game?.running, game?.speed, game?.phase])

  useEffect(() => {
    if (!game || game.phase !== 'running' || game.tick === 0 || game.tick % 10 !== 0) return
    const timestamp = saveGame(game)
    setSavedAt(timestamp)
  }, [game?.tick])

  const selected = game?.selectedId ? game.territories[game.selectedId] : null
  const selectedDivision =
    game?.selectedDivisionId
      ? game.divisionUnits[game.selectedDivisionId] ?? null
      : null
  const selectedArmy =
    game?.selectedArmyId
      ? game.armies[game.selectedArmyId] ?? null
      : null

  const playerArmyList = useMemo(
    () => (game ? playerArmies(game) : []),
    [game?.armies],
  )
  const hqArmyList = useMemo(
    () => (game ? armiesForOwner(game, hqFaction) : []),
    [game?.armies, hqFaction],
  )

  const hqDivisionList = useMemo(
    () =>
      game
        ? Object.values(game.divisionUnits).filter(
            (division) => division.owner === hqFaction,
          )
        : [],
    [game?.divisionUnits, hqFaction],
  )

  const playerDivisionList = useMemo(
    () => (game ? playerDivisions(game) : []),
    [game?.divisionUnits],
  )

  const divisionsHere = useMemo(
    () => (game && selected ? divisionsAt(game, selected.id) : []),
    [game?.divisionUnits, selected?.id],
  )

  const divisionStacks = useMemo(() => {
    if (!game) return []

    const grouped = new Map<
      string,
      {
        key: string
        territoryId: string
        owner: DivisionUnit['owner']
        ids: string[]
        moving: number
        fighting: number
      }
    >()

    for (const division of Object.values(game.divisionUnits)) {
      const key = `${division.locationId}:${division.owner}`
      const current = grouped.get(key) ?? {
        key,
        territoryId: division.locationId,
        owner: division.owner,
        ids: [],
        moving: 0,
        fighting: 0,
      }

      current.ids.push(division.id)
      if (division.status === 'moving') current.moving += 1
      if (
        division.status === 'attacking' ||
        division.status === 'defending'
      ) {
        current.fighting += 1
      }
      grouped.set(key, current)
    }

    return [...grouped.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    )
  }, [game?.divisionUnits])

  const divisionStackSignature = useMemo(
    () =>
      divisionStacks
        .map(
          (stack) =>
            `${stack.key}:${stack.ids
              .map((id) => `${id}:${game?.divisionUnits[id]?.role ?? 'line'}`)
              .join(',')}:${stack.moving}:${stack.fighting}`,
        )
        .join('|'),
    [divisionStacks],
  )
  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady || !game) return

    const source = map.getSource(
      DIVISION_SOURCE_ID,
    ) as maplibregl.GeoJSONSource | undefined
    if (!source) return

    const features = divisionStacks
      .map((stack) => {
        const territory = game.territories[stack.territoryId]
        if (!territory) return null

        const roles = stack.ids
          .map((id) => game.divisionUnits[id]?.role)
          .filter((role): role is DivisionRole => Boolean(role))
        const mobileCount = roles.filter((role) => role === 'mobile').length
        const guardCount = roles.filter((role) => role === 'guard').length
        const symbol =
          mobileCount > roles.length / 2
            ? '◇'
            : guardCount > roles.length / 2
              ? '■'
              : '◆'

        return {
          type: 'Feature' as const,
          id: stack.key,
          properties: {
            key: stack.key,
            territoryId: stack.territoryId,
            owner: stack.owner,
            ids: stack.ids.join(','),
            count: stack.ids.length,
            symbol,
            moving: stack.moving > 0,
            fighting: stack.fighting > 0,
            selected: stack.ids.includes(game.selectedDivisionId ?? ''),
            color: ownerColor(stack.owner, game),
          },
          geometry: {
            type: 'Point' as const,
            coordinates: territory.centroid,
          },
        }
      })
      .filter((feature): feature is NonNullable<typeof feature> =>
        Boolean(feature),
      )

    source.setData({
      type: 'FeatureCollection',
      features,
    })
  }, [
    layerReady,
    divisionStackSignature,
    game?.selectedDivisionId,
    game?.factionColors,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady) return

    const clickHandler = (
      event: maplibregl.MapLayerMouseEvent,
    ) => {
      const properties = event.features?.[0]?.properties
      if (!properties) return

      const territoryId = String(properties.territoryId ?? '')
      const owner = String(properties.owner ?? '')
      const ids = String(properties.ids ?? '')
        .split(',')
        .filter(Boolean)
      if (!territoryId || ids.length === 0) return

      setGame((previous) => {
        if (!previous) return previous

        const selectedUnit = previous.selectedDivisionId
          ? previous.divisionUnits[previous.selectedDivisionId]
          : null

        if (
          owner !== 'player' &&
          selectedUnit?.owner === 'player' &&
          selectedUnit.status === 'idle' &&
          selectedUnit.locationId !== territoryId
        ) {
          const ordered = issueDivisionOrder(
            previous,
            selectedUnit.id,
            territoryId,
          )

          if (ordered !== previous) {
            return {
              ...ordered,
              selectedId: territoryId,
              selectedDivisionId: selectedUnit.id,
            }
          }
        }

        const playerUnit = ids
          .map((id) => previous.divisionUnits[id])
          .find((division) => division?.owner === 'player')

        return {
          ...previous,
          selectedId: territoryId,
          selectedDivisionId:
            playerUnit?.id ??
            (owner === 'player'
              ? previous.selectedDivisionId
              : null),
        }
      })

      if (
        owner === 'player' ||
        owner === 'red' ||
        owner === 'blue' ||
        owner === 'green'
      ) {
        setHqFaction(owner as PlayableFactionId)
        setArmyOpen(true)
      }
    }

    const enterHandler = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const leaveHandler = () => {
      map.getCanvas().style.cursor = ''
    }

    map.on('click', DIVISION_COUNTER_LAYER_ID, clickHandler)
    map.on('mouseenter', DIVISION_COUNTER_LAYER_ID, enterHandler)
    map.on('mouseleave', DIVISION_COUNTER_LAYER_ID, leaveHandler)

    return () => {
      map.off('click', DIVISION_COUNTER_LAYER_ID, clickHandler)
      map.off('mouseenter', DIVISION_COUNTER_LAYER_ID, enterHandler)
      map.off('mouseleave', DIVISION_COUNTER_LAYER_ID, leaveHandler)
    }
  }, [layerReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady || !game) return

    const source = map.getSource(
      RAILWAY_SOURCE_ID,
    ) as maplibregl.GeoJSONSource | undefined
    if (!source) return

    const features: Array<{
      type: 'Feature'
      properties: { level: number; color: string }
      geometry: {
        type: 'LineString'
        coordinates: [number, number][]
      }
    }> = []

    for (const territory of Object.values(game.territories)) {
      if (territory.railway <= 0) continue

      for (const neighborId of territory.neighbors) {
        if (territory.id >= neighborId) continue
        const neighbor = game.territories[neighborId]
        if (!neighbor || neighbor.railway <= 0) continue

        const level = Math.min(territory.railway, neighbor.railway)
        const sameOwner = territory.owner === neighbor.owner
        features.push({
          type: 'Feature',
          properties: {
            level,
            color:
              sameOwner && territory.owner !== 'neutral'
                ? ownerColor(territory.owner, game)
                : '#8b8069',
          },
          geometry: {
            type: 'LineString',
            coordinates: [territory.centroid, neighbor.centroid],
          },
        })
      }
    }

    source.setData({
      type: 'FeatureCollection',
      features,
    })

    map.setPaintProperty(
      RAILWAY_LAYER_ID,
      'line-opacity',
      mapMode === 'railway' ? 0.95 : 0.3,
    )
  }, [game?.territories, game?.factionColors, layerReady, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady) return

    const source = map.getSource(
      DIVISION_ROUTE_SOURCE_ID,
    ) as maplibregl.GeoJSONSource | undefined
    if (!source) return

    if (!selectedDivision?.order || !game) {
      source.setData({
        type: 'FeatureCollection',
        features: [],
      })
      return
    }

    const current = game.territories[selectedDivision.locationId]
    const path = selectedDivision.order.path
      .map((id) => game.territories[id])
      .filter((territory): territory is TerritoryState => Boolean(territory))

    if (!current || path.length === 0) {
      source.setData({
        type: 'FeatureCollection',
        features: [],
      })
      return
    }

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              current.centroid,
              ...path.map((territory) => territory.centroid),
            ],
          },
        },
      ],
    })
  }, [
    selectedDivision?.id,
    selectedDivision?.locationId,
    selectedDivision?.order?.targetId,
    selectedDivision?.order?.remainingTicks,
    layerReady,
  ])

  const selectedIsIsolated = Boolean(
    selected &&
      selected.owner !== 'neutral' &&
      !selected.neighbors.some(
        (neighborId) => game?.territories[neighborId]?.owner === selected.owner,
      ),
  )

  const neighbors = useMemo(() => {
    if (!selected || !game) return []
    return selected.neighbors
      .map((id) => game.territories[id])
      .filter((territory): territory is TerritoryState => Boolean(territory))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [selected, game])

  const searchResults = useMemo(() => {
    if (!game) return []
    const query = searchQuery.trim().toLocaleLowerCase('ko-KR')
    if (query.length < 2) return []

    return Object.values(game.territories)
      .filter((territory) => territory.fullName.toLocaleLowerCase('ko-KR').includes(query))
      .slice(0, 24)
  }, [game, searchQuery])

  const counts = useMemo(
    () => (game ? ownerCounts(game) : null),
    [game?.territories],
  )
  const total = game ? Object.keys(game.territories).length : 0

  const nationalStats = useMemo(() => {
    if (!game || !counts || total === 0) return null

    let playerDivisions = 0
    let playerMilitaryPower = 0
    let playerSupply = 0
    let playerFrontlines = 0
    const industry = {
      civilian: 0,
      military: 0,
      logistics: 0,
      infrastructure: 0,
      research: 0,
    }

    for (const territory of Object.values(game.territories)) {
      if (territory.owner !== 'player') continue
      playerDivisions += territory.divisions
      playerMilitaryPower += territoryMilitaryPower(territory, game)
      playerSupply += territory.supply

      for (const kind of INDUSTRY_TYPES) {
        industry[kind] += territory.industry[kind]
      }

      if (
        territory.neighbors.some(
          (neighborId) => game.territories[neighborId]?.owner !== 'player',
        )
      ) {
        playerFrontlines += 1
      }
    }

    const playerOwned = counts.player
    const industryTotal = INDUSTRY_TYPES.reduce(
      (sum, kind) => sum + industry[kind],
      0,
    )

    return {
      playerOwned,
      share: (playerOwned / total) * 100,
      playerDivisions,
      playerFactories: industry.civilian + industry.military,
      playerIndustryTotal: industryTotal,
      industry,
      playerMilitaryPower,
      income: factionIncomePerCycle(game, 'player'),
      researchIncome: factionResearchPerCycle(game, 'player'),
      averageSupply:
        playerOwned > 0 ? Math.round(playerSupply / playerOwned) : 0,
      playerFrontlines,
    }
  }, [game?.territories, game?.technologies, counts, total])

  const playerQueue = useMemo(
    () => game?.productionQueue.filter((order) => order.owner === 'player') ?? [],
    [game?.productionQueue],
  )

  const selectedOrder = useMemo(
    () =>
      selected
        ? playerQueue.find((order) => order.territoryId === selected.id) ?? null
        : null,
    [playerQueue, selected?.id],
  )

  const playerBattles = useMemo(
    () =>
      game?.battles.filter(
        (battle) =>
          battle.attacker === 'player' ||
          game.territories[battle.toId]?.owner === 'player',
      ) ?? [],
    [game?.battles, game?.territories],
  )

  const selectedBattle = useMemo(
    () =>
      selected && game
        ? game.battles.find(
            (battle) =>
              battle.fromId === selected.id || battle.toId === selected.id,
          ) ?? null
        : null,
    [game?.battles, selected?.id],
  )

  const frontlineGroups = useMemo(() => {
    if (!game) return []

    const groups = new Map<
      string,
      { name: string; territories: number; divisions: number; pressure: number }
    >()

    for (const territory of Object.values(game.territories)) {
      if (territory.owner !== 'player') continue

      const hostileNeighbors = territory.neighbors.filter(
        (id) => game.territories[id]?.owner !== 'player',
      ).length

      if (hostileNeighbors === 0) continue

      const key = territory.sidoName || '기타'
      const current = groups.get(key) ?? {
        name: key,
        territories: 0,
        divisions: 0,
        pressure: 0,
      }

      current.territories += 1
      current.divisions += territory.divisions
      current.pressure += hostileNeighbors
      groups.set(key, current)
    }

    return [...groups.values()].sort(
      (a, b) =>
        b.pressure - a.pressure ||
        b.territories - a.territories ||
        a.name.localeCompare(b.name, 'ko'),
    )
  }, [game?.territories])

  const regionalStats = useMemo(() => {
    if (!game || !selected) return null

    const summarize = (territories: TerritoryState[]) => {
      const totalCount = territories.length
      const playerCount = territories.filter(
        (territory) => territory.owner === 'player',
      ).length

      return {
        total: totalCount,
        player: playerCount,
        share: totalCount > 0 ? (playerCount / totalCount) * 100 : 0,
      }
    }

    const provinceTerritories = Object.values(game.territories).filter(
      (territory) => territory.sidoName === selected.sidoName,
    )
    const districtTerritories = Object.values(game.territories).filter(
      (territory) =>
        territory.sidoName === selected.sidoName &&
        territory.sggName === selected.sggName,
    )

    return {
      province: {
        name: selected.sidoName,
        ...summarize(provinceTerritories),
      },
      district: {
        name: selected.sggName,
        ...summarize(districtTerritories),
      },
    }
  }, [game?.territories, selected?.id])

  const handleTerritoryCommand = (targetId: string) => {
    setGame((previous) => {
      if (!previous || !previous.territories[targetId]) return previous

      if (
        objectiveMode &&
        previous.selectedArmyId &&
        previous.armies[previous.selectedArmyId]?.owner === 'player'
      ) {
        const next = setArmyObjective(
          previous,
          previous.selectedArmyId,
          targetId,
        )
        return {
          ...next,
          selectedId: targetId,
        }
      }

      const divisionId = previous.selectedDivisionId
      const division = divisionId
        ? previous.divisionUnits[divisionId]
        : null

      if (
        previous.phase === 'running' &&
        division &&
        division.owner === 'player' &&
        division.status === 'idle' &&
        targetId !== division.locationId
      ) {
        const ordered = issueDivisionOrder(
          previous,
          division.id,
          targetId,
        )

        if (ordered !== previous) {
          return {
            ...ordered,
            selectedId: targetId,
            selectedDivisionId: division.id,
          }
        }
      }

      return { ...previous, selectedId: targetId }
    })

    if (objectiveMode) {
      setObjectiveMode(false)
    }
  }

  const selectDivision = (divisionId: string) => {
    setGame((previous) => {
      if (!previous) return previous
      const division = previous.divisionUnits[divisionId]
      if (!division || division.owner !== 'player') return previous

      return {
        ...previous,
        selectedDivisionId: division.id,
        selectedId: division.locationId,
      }
    })

    const division = game?.divisionUnits[divisionId]
    const territory = division
      ? game?.territories[division.locationId]
      : null

    if (territory && mapRef.current) {
      mapRef.current.easeTo({
        center: territory.centroid,
        zoom: Math.max(mapRef.current.getZoom(), 8),
        duration: 420,
      })
    }
  }

  const selectArmy = (armyId: string) => {
    setGame((previous) => {
      if (!previous) return previous
      const army = previous.armies[armyId]
      if (!army || army.owner !== 'player') return previous

      const leadDivision = army.divisionIds
        .map((id) => previous.divisionUnits[id])
        .find(Boolean)

      return {
        ...previous,
        selectedArmyId: army.id,
        selectedDivisionId:
          leadDivision?.id ?? previous.selectedDivisionId,
        selectedId:
          leadDivision?.locationId ?? previous.selectedId,
      }
    })
  }

  const focusSelected = () => {
    if (!selected || !mapRef.current) return
    mapRef.current.easeTo({
      center: selected.centroid,
      zoom: Math.max(mapRef.current.getZoom(), 9),
      duration: 500,
    })
  }

  const handleNewGame = () => {
    if (!adminData) return
    const next = createInitialState(adminData.territories, adminData.version)
    setGame((previous) => ({
      ...next,
      playerName: previous?.playerName ?? next.playerName,
      aiNames: previous?.aiNames ?? next.aiNames,
      factionColors: previous?.factionColors ?? next.factionColors,
      aiCount: previous?.aiCount ?? next.aiCount,
      difficulty: previous?.difficulty ?? next.difficulty,
      selectedId: previous?.selectedId && next.territories[previous.selectedId]
        ? previous.selectedId
        : next.selectedId,
    }))
  }

  const selectTerritory = (territory: TerritoryState) => {
    setGame((previous) => (previous ? { ...previous, selectedId: territory.id } : previous))
    mapRef.current?.easeTo({
      center: territory.centroid,
      zoom: Math.max(mapRef.current?.getZoom() ?? 6, 9),
      duration: 450,
    })
  }

  const handleSave = () => {
    if (!game || game.phase === 'setup') return
    setSavedAt(saveGame(game))
  }

  const handleLoad = () => {
    if (!game) return
    const restored = restoreGame(game)
    if (!restored) return
    setGame(restored)
    setSavedAt(getSavedAt())
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return
      }

      if (!game) return

      if (event.code === 'Space' && game.phase === 'running') {
        event.preventDefault()
        setGame((previous) =>
          previous ? { ...previous, running: !previous.running } : previous,
        )
        return
      }

      if (
        game.phase === 'running' &&
        (event.key === '1' ||
          event.key === '2' ||
          event.key === '4' ||
          event.key === '0')
      ) {
        const speed = (event.key === '0' ? 10 : Number(event.key)) as GameSpeed
        setGame((previous) =>
          previous ? { ...previous, speed } : previous,
        )
        return
      }

      if (event.key.toLowerCase() === 'f' && selected && mapRef.current) {
        mapRef.current.easeTo({
          center: selected.centroid,
          zoom: Math.max(mapRef.current.getZoom(), 9),
          duration: 400,
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [game?.phase, selected?.id])

  return (
    <main className="app-shell">
      <section className="map-panel">
        <div ref={mapContainer} className="map" />
        {canvasFallbackActive && (
          <div className="territory-health checking">
            호환 렌더링 사용 중
          </div>
        )}
        <canvas
          ref={territoryCanvasRef}
          className="territory-canvas"
          aria-hidden="true"
        />

        <div className="topbar strategic-topbar">
          <div className="brand-block strategic-brand">
            <span className="brand-kicker">STRATEGIC COMMAND / KOREA</span>
            <strong>{game ? ownerName('player', game) : 'WARGAME'}</strong>
            <small>
              {game
                ? `${formatStrategicTime(game.tick)} · 행정동 ${total.toLocaleString()}개`
                : '전국 전략 지도 준비 중'}
            </small>
          </div>

          {game?.phase === 'running' && nationalStats && (
            <div className="resource-strip">
              <div>
                <span>자금</span>
                <strong>{game.funds.player.toLocaleString()}</strong>
                <small>+{nationalStats.income}/{ECONOMY_INTERVAL}T</small>
              </div>
              <div>
                <span>산업</span>
                <strong>{nationalStats.playerIndustryTotal}</strong>
                <small>민 {nationalStats.industry.civilian} · 군 {nationalStats.industry.military}</small>
              </div>
              <div>
                <span>연구</span>
                <strong>{game.researchPoints.player.toLocaleString()}</strong>
                <small>+{nationalStats.researchIncome}/{ECONOMY_INTERVAL}T</small>
              </div>
              <div>
                <span>사단</span>
                <strong>{nationalStats.playerDivisions}</strong>
              </div>
              <div>
                <span>군</span>
                <strong>{playerArmyList.length}</strong>
              </div>
            </div>
          )}

          <div className="time-control-summary">
            {game?.phase === 'running' ? (
              <>
                <button
                  className={game.running ? '' : 'paused'}
                  onClick={() =>
                    setGame((previous) =>
                      previous
                        ? { ...previous, running: !previous.running }
                        : previous,
                    )
                  }
                >
                  {game.running ? 'Ⅱ' : '▶'}
                </button>
                <strong>×{game.speed}</strong>
              </>
            ) : (
              <strong>SETUP</strong>
            )}
          </div>
        </div>

        {game?.phase === 'running' && speedOpen && (
          <div className="speed-panel">
            <div className="speed-panel-head">
              <strong>시간 제어</strong>
              <button onClick={() => setSpeedOpen(false)}>닫기</button>
            </div>
            <button
              className={!game.running ? 'active' : ''}
              onClick={() =>
                setGame((previous) =>
                  previous
                    ? { ...previous, running: !previous.running }
                    : previous,
                )
              }
            >
              {game.running ? '일시정지' : '재개'}
            </button>
            {([1, 2, 4, 10] as const).map((speed) => (
              <button
                key={speed}
                className={game.speed === speed ? 'active' : ''}
                onClick={() =>
                  setGame((previous) =>
                    previous ? { ...previous, speed } : previous,
                  )
                }
              >
                ×{speed}
              </button>
            ))}
          </div>
        )}

        {game?.phase === 'running' && productionOpen && (
          <section className="floating-panel production-panel">
            <div className="floating-panel-head">
              <div>
                <p className="eyebrow">산업 / 생산</p>
                <h2>생산 대기열</h2>
              </div>
              <button onClick={() => setProductionOpen(false)}>닫기</button>
            </div>

            <div className="production-summary">
              <span>보유 자금 {game.funds.player.toLocaleString()}</span>
              <span>활성 대기열 {playerQueue.length}</span>
            </div>

            {nationalStats && (
              <div className="industry-overview">
                {INDUSTRY_TYPES.map((kind) => (
                  <div key={kind}>
                    <span>{industryLabels[kind]}</span>
                    <strong>{nationalStats.industry[kind]}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className="production-list">
              {playerQueue.length === 0 ? (
                <p className="panel-empty">
                  지휘 패널에서 내 행정동을 선택해 산업 시설, 사단, 방어 공사를 대기열에 추가하세요.
                </p>
              ) : (
                playerQueue.map((order) => {
                  const territory = game.territories[order.territoryId]
                  const progress =
                    ((order.totalTicks - order.remainingTicks) /
                      order.totalTicks) *
                    100

                  return (
                    <div key={order.id} className="production-row">
                      <div className="production-row-top">
                        <div>
                          <strong>{productionKindLabel(order.kind)}</strong>
                          <span>{territory?.name ?? '지역 없음'}</span>
                        </div>
                        <button
                          onClick={() =>
                            setGame((previous) =>
                              previous
                                ? cancelProduction(previous, order.id)
                                : previous,
                            )
                          }
                        >
                          취소
                        </button>
                      </div>
                      <div className="progress-track">
                        <i style={{ width: `${progress}%` }} />
                      </div>
                      <small>{order.remainingTicks}틱 남음</small>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        )}

        {game?.phase === 'running' && researchOpen && (
          <section className="floating-panel research-panel deep-tech-panel">
            <div className="floating-panel-head">
              <div>
                <p className="eyebrow">국가 연구</p>
                <h2>기술 트리</h2>
              </div>
              <button onClick={() => setResearchOpen(false)}>닫기</button>
            </div>

            <div className="research-summary">
              <div>
                <span>연구점수</span>
                <strong>{game.researchPoints.player.toLocaleString()}</strong>
              </div>
              <div>
                <span>주기 수입</span>
                <strong>
                  +{nationalStats?.researchIncome ?? 0} / {ECONOMY_INTERVAL}틱
                </strong>
              </div>
            </div>

            <div className="technology-tree">
              {(
                ['industry', 'logistics', 'command', 'engineering'] as TechnologyCategory[]
              ).map((category) => (
                <section key={category} className="technology-branch">
                  <header>
                    <strong>{technologyCategories[category].label}</strong>
                    <span>{technologyCategories[category].description}</span>
                  </header>
                  <div className="technology-list">
                    {TECHNOLOGY_IDS.filter(
                      (technology) =>
                        technologyDefinitions[technology].category === category,
                    ).map((technology) => {
                      const definition = technologyDefinitions[technology]
                      const level = game.technologies.player[technology] ?? 0
                      const maxed = level >= definition.maxLevel
                      const available = technologyAvailable(
                        game,
                        'player',
                        technology,
                      )
                      const cost = maxed
                        ? 0
                        : technologyCost(technology, level)
                      const prerequisites = Object.entries(
                        definition.prerequisites,
                      )

                      return (
                        <div
                          key={technology}
                          className={`technology-row ${available || maxed ? '' : 'locked'}`}
                        >
                          <div className="technology-row-head">
                            <div>
                              <strong>{technologyLabels[technology]}</strong>
                              <span>{technologyDescription(technology)}</span>
                            </div>
                            <b>
                              Lv.{level}/{definition.maxLevel}
                            </b>
                          </div>

                          {prerequisites.length > 0 && (
                            <small className="technology-prereq">
                              선행:{' '}
                              {prerequisites
                                .map(
                                  ([required, requiredLevel]) =>
                                    `${technologyLabels[required as TechnologyId]} Lv.${requiredLevel}`,
                                )
                                .join(' · ')}
                            </small>
                          )}

                          <div className="technology-pips">
                            {Array.from({ length: definition.maxLevel }).map(
                              (_, index) => (
                                <i
                                  key={index}
                                  className={index < level ? 'active' : ''}
                                />
                              ),
                            )}
                          </div>
                          <button
                            disabled={
                              maxed ||
                              !available ||
                              game.researchPoints.player < cost
                            }
                            onClick={() =>
                              setGame((previous) =>
                                previous
                                  ? researchTechnology(
                                      previous,
                                      'player',
                                      technology,
                                    )
                                  : previous,
                              )
                            }
                          >
                            {maxed
                              ? '완료'
                              : !available
                                ? '선행 연구 필요'
                                : `연구 ${cost}점`}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}

                {game?.phase === 'running' && frontOpen && (
          <section className="floating-panel front-panel">
            <div className="floating-panel-head">
              <div>
                <p className="eyebrow">작전 본부</p>
                <h2>전선 / 진행 중 전투</h2>
              </div>
              <button onClick={() => setFrontOpen(false)}>닫기</button>
            </div>

            <div className="stance-section">
              <span>작전 강도</span>
              <div className="stance-buttons">
                {(['cautious', 'balanced', 'aggressive'] as AttackStance[]).map(
                  (stance) => (
                    <button
                      key={stance}
                      className={game.attackStance === stance ? 'active' : ''}
                      onClick={() =>
                        setGame((previous) =>
                          previous
                            ? { ...previous, attackStance: stance }
                            : previous,
                        )
                      }
                    >
                      {attackStanceLabels[stance]}
                    </button>
                  ),
                )}
              </div>
              <small>
                신중은 적은 사단, 균형은 절반, 공세는 더 많은 사단을 한 전투에 투입합니다.
              </small>
            </div>

            <button
              className={`auto-offensive ${game.autoOffensive ? 'active' : ''}`}
              onClick={() =>
                setGame((previous) =>
                  previous
                    ? {
                        ...previous,
                        autoOffensive: !previous.autoOffensive,
                      }
                    : previous,
                )
              }
            >
              자동 공세 {game.autoOffensive ? 'ON' : 'OFF'}
            </button>

            <div className="panel-section">
              <div className="panel-section-title">
                <strong>진행 중 전투</strong>
                <span>{playerBattles.length}</span>
              </div>
              <div className="battle-list">
                {playerBattles.length === 0 ? (
                  <p className="panel-empty">현재 관련 전투가 없습니다.</p>
                ) : (
                  playerBattles.map((battle) => {
                    const from = game.territories[battle.fromId]
                    const to = game.territories[battle.toId]
                    const progress = (battle.progress + 100) / 2

                    return (
                      <button
                        key={battle.id}
                        className="battle-row"
                        onClick={() => {
                          const target = to ?? from
                          if (target) selectTerritory(target)
                        }}
                      >
                        <div>
                          <strong>
                            {from?.name ?? '?'} → {to?.name ?? '?'}
                          </strong>
                          <span>
                            {battle.attackerDivisionIds.length}개 사단 · {attackStanceLabels[battle.stance]}
                          </span>
                        </div>
                        <div className="battle-progress">
                          <i style={{ width: `${progress}%` }} />
                        </div>
                        <small>
                          {battle.progress >= 0 ? '공세 진행' : '수비 우세'} ·{' '}
                          {Math.round(Math.abs(battle.progress))}%
                        </small>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="panel-section">
              <div className="panel-section-title">
                <strong>전선 요약</strong>
                <span>{frontlineGroups.length}개 권역</span>
              </div>
              <div className="frontline-list">
                {frontlineGroups.slice(0, 8).map((front) => (
                  <div key={front.name}>
                    <strong>{front.name}</strong>
                    <span>
                      접경 {front.territories} · 사단 {front.divisions} · 압력 {front.pressure}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {game?.phase === 'running' && armyOpen && (
          <section className="floating-panel army-panel">
            <div className="floating-panel-head">
              <div>
                <p className="eyebrow">통합 지휘부</p>
                <h2>
                  {ownerName(hqFaction, game)} · {hqDivisionList.length}개 사단
                </h2>
              </div>
              <button onClick={() => setArmyOpen(false)}>닫기</button>
            </div>

            <div className="hq-faction-tabs">
              {(
                [
                  'player',
                  ...(['red', 'blue', 'green'] as AiFactionId[]).slice(
                    0,
                    game.aiCount,
                  ),
                ] as PlayableFactionId[]
              ).map((owner) => (
                <button
                  key={owner}
                  className={hqFaction === owner ? 'active' : ''}
                  onClick={() => setHqFaction(owner)}
                >
                  <i style={{ background: ownerColor(owner, game) }} />
                  {ownerName(owner, game)}
                  <b>{armiesForOwner(game, owner).length}</b>
                </button>
              ))}
            </div>

            {hqFaction !== 'player' && (
              <div className="foreign-hq-overview">
                <div className="foreign-hq-summary">
                  <span>열람 중</span>
                  <strong>{ownerName(hqFaction, game)}</strong>
                  <small>
                    군단 {hqArmyList.length} · 사단 {hqDivisionList.length}
                  </small>
                </div>

                <div className="foreign-corps-list">
                  {hqArmyList.length === 0 ? (
                    <p className="panel-empty">
                      아직 편성된 군단 정보가 없습니다.
                    </p>
                  ) : (
                    hqArmyList.map((army) => (
                      <article key={army.id} className="foreign-corps-card">
                        <header>
                          <div>
                            <strong>{army.name}</strong>
                            <span>{army.commander || '지휘관 미지정'}</span>
                          </div>
                          <b>{strategyLabels[army.strategy]}</b>
                        </header>
                        <div className="foreign-corps-meta">
                          <span>사단 {army.divisionIds.length}</span>
                          <span>
                            {army.planStatus === 'executing'
                              ? '작전 실행'
                              : army.planStatus === 'planning'
                                ? '계획 수립'
                                : '대기'}
                          </span>
                          <span>준비 {Math.round(army.preparation)}%</span>
                        </div>
                        <div className="foreign-corps-objective">
                          <span>작전 목표</span>
                          <strong>
                            {army.objectiveId
                              ? game.territories[army.objectiveId]?.fullName ??
                                '정보 없음'
                              : '미지정'}
                          </strong>
                        </div>
                        <div className="army-preparation-track">
                          <i style={{ width: `${army.preparation}%` }} />
                        </div>
                        <small>{strategyDescriptions[army.strategy]}</small>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className={`army-hq-section ${hqFaction === 'player' ? '' : 'hq-player-hidden'}`}>
              <div className="army-hq-title">
                <div>
                  <span>군 본부</span>
                  <strong>{playerArmyList.length}개 군</strong>
                </div>
                <button
                  onClick={() =>
                    setGame((previous) =>
                      previous ? createArmy(previous) : previous,
                    )
                  }
                >
                  + 군 창설
                </button>
              </div>

              <div className="army-tabs">
                {playerArmyList.length === 0 ? (
                  <p className="panel-empty">
                    군을 창설하면 여러 사단을 묶어 하나의 작전 목표를 줄 수 있습니다.
                  </p>
                ) : (
                  playerArmyList.map((army) => (
                    <button
                      key={army.id}
                      className={
                        game.selectedArmyId === army.id ? 'selected' : ''
                      }
                      onClick={() => selectArmy(army.id)}
                    >
                      <strong>{army.name || '이름 없는 군'}</strong>
                      <span>{army.divisionIds.length}개 사단</span>
                    </button>
                  ))
                )}
              </div>

              {selectedArmy?.owner === 'player' && (
                <div className="army-inspector">
                  <div className="army-edit-grid">
                    <label>
                      <span>군 명칭</span>
                      <input
                        value={selectedArmy.name}
                        maxLength={28}
                        onChange={(event) =>
                          setGame((previous) =>
                            previous
                              ? renameArmy(
                                  previous,
                                  selectedArmy.id,
                                  event.target.value,
                                )
                              : previous,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>군 지휘관</span>
                      <input
                        value={selectedArmy.commander}
                        maxLength={24}
                        onChange={(event) =>
                          setGame((previous) =>
                            previous
                              ? renameArmyCommander(
                                  previous,
                                  selectedArmy.id,
                                  event.target.value,
                                )
                              : previous,
                          )
                        }
                      />
                    </label>
                  </div>

                  <label className="army-strategy-field">
                    <span>군단 전략</span>
                    <select
                      value={selectedArmy.strategy}
                      onChange={(event) =>
                        setGame((previous) =>
                          previous
                            ? setArmyStrategy(
                                previous,
                                selectedArmy.id,
                                event.target.value as StrategyDoctrine,
                              )
                            : previous,
                        )
                      }
                    >
                      {(
                        [
                          'balanced',
                          'maneuver',
                          'concentrated',
                          'defensive',
                          'logistics',
                        ] as StrategyDoctrine[]
                      ).map((strategy) => (
                        <option key={strategy} value={strategy}>
                          {strategyLabels[strategy]}
                        </option>
                      ))}
                    </select>
                    <small>
                      {strategyDescriptions[selectedArmy.strategy]}
                    </small>
                  </label>

                  <div className="army-plan-card">
                    <div className="army-plan-meta">
                      <div>
                        <span>작전 상태</span>
                        <strong>
                          {selectedArmy.planStatus === 'executing'
                            ? '실행 중'
                            : selectedArmy.planStatus === 'planning'
                              ? '계획 수립'
                              : '대기'}
                        </strong>
                      </div>
                      <div>
                        <span>목표</span>
                        <strong>
                          {selectedArmy.objectiveId
                            ? game.territories[selectedArmy.objectiveId]?.name ??
                              '목표 없음'
                            : '미지정'}
                        </strong>
                      </div>
                      <div>
                        <span>준비도</span>
                        <strong>{Math.round(selectedArmy.preparation)}%</strong>
                      </div>
                    </div>

                    <div className="army-preparation-track">
                      <i
                        style={{
                          width: `${selectedArmy.preparation}%`,
                        }}
                      />
                    </div>

                    <div className="army-plan-actions">
                      <button
                        className={objectiveMode ? 'active' : ''}
                        onClick={() => setObjectiveMode((value) => !value)}
                      >
                        {objectiveMode ? '지도에서 목표 선택 중' : '지도에서 목표 지정'}
                      </button>
                      <button
                        disabled={
                          !selectedArmy.objectiveId ||
                          selectedArmy.divisionIds.length === 0 ||
                          selectedArmy.planStatus === 'executing'
                        }
                        onClick={() =>
                          setGame((previous) =>
                            previous
                              ? executeArmyPlan(previous, selectedArmy.id)
                              : previous,
                          )
                        }
                      >
                        작전 실행
                      </button>
                      <button
                        disabled={selectedArmy.planStatus !== 'executing'}
                        onClick={() =>
                          setGame((previous) =>
                            previous
                              ? haltArmyPlan(previous, selectedArmy.id)
                              : previous,
                          )
                        }
                      >
                        작전 중지
                      </button>
                    </div>

                    <small>
                      목표를 지정한 뒤 시간이 흐르면 준비도가 올라갑니다. 실행하면 이 군에 배속된 대기 사단들이 목표를 향해 이동합니다.
                    </small>
                  </div>
                </div>
              )}
            </div>

            {hqFaction === 'player' && selectedDivision?.owner === 'player' && (
              <div className="division-inspector">
                <div className="division-inspector-title">
                  <span className="division-counter-icon">◆</span>
                  <div>
                    <strong>{selectedDivision.name || '이름 없는 사단'}</strong>
                    <span>
                      {game.territories[selectedDivision.locationId]?.fullName ?? '위치 없음'}
                    </span>
                  </div>
                  <b>{divisionStatusLabel(selectedDivision)}</b>
                </div>

                <label className="division-edit-field">
                  <span>사단 명칭</span>
                  <input
                    value={selectedDivision.name}
                    maxLength={32}
                    onChange={(event) =>
                      setGame((previous) =>
                        previous
                          ? renameDivision(
                              previous,
                              selectedDivision.id,
                              event.target.value,
                            )
                          : previous,
                      )
                    }
                  />
                </label>

                <label className="division-edit-field">
                  <span>지휘관</span>
                  <input
                    value={selectedDivision.commander}
                    maxLength={24}
                    onChange={(event) =>
                      setGame((previous) =>
                        previous
                          ? renameCommander(
                              previous,
                              selectedDivision.id,
                              event.target.value,
                            )
                          : previous,
                      )
                    }
                  />
                </label>

                <div className="division-command-grid">
                  <label>
                    <span>사단 역할</span>
                    <select
                      value={selectedDivision.role}
                      disabled={selectedDivision.status !== 'idle'}
                      onChange={(event) =>
                        setGame((previous) =>
                          previous
                            ? setDivisionRole(
                                previous,
                                selectedDivision.id,
                                event.target.value as DivisionRole,
                              )
                            : previous,
                        )
                      }
                    >
                      {(['line', 'mobile', 'guard'] as DivisionRole[]).map(
                        (role) => (
                          <option key={role} value={role}>
                            {divisionRoleLabels[role]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label>
                    <span>배속 군</span>
                    <select
                      value={selectedDivision.armyId ?? ''}
                      onChange={(event) =>
                        setGame((previous) =>
                          previous
                            ? assignDivisionToArmy(
                                previous,
                                selectedDivision.id,
                                event.target.value || null,
                              )
                            : previous,
                        )
                      }
                    >
                      <option value="">미배속</option>
                      {playerArmyList.map((army) => (
                        <option key={army.id} value={army.id}>
                          {army.name || '이름 없는 군'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="division-stat-grid">
                  <div>
                    <span>전투력</span>
                    <strong>{Math.round(selectedDivision.strength)}%</strong>
                    <i>
                      <b style={{ width: `${selectedDivision.strength}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>조직력</span>
                    <strong>{Math.round(selectedDivision.organization)}%</strong>
                    <i>
                      <b style={{ width: `${selectedDivision.organization}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>경험</span>
                    <strong>{Math.round(selectedDivision.experience)}%</strong>
                    <i>
                      <b style={{ width: `${selectedDivision.experience}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>참호화</span>
                    <strong>{Math.round(selectedDivision.entrenchment)}%</strong>
                    <i>
                      <b style={{ width: `${selectedDivision.entrenchment}%` }} />
                    </i>
                  </div>
                </div>

                {selectedDivision.order ? (
                  <div className="division-order-card">
                    <div>
                      <strong>
                        {selectedDivision.order.type === 'attack'
                          ? '공격 이동'
                          : '이동'}
                      </strong>
                      <span>
                        → {game.territories[selectedDivision.order.targetId]?.fullName ?? '목적지 없음'}
                      </span>
                    </div>
                    <small>
                      경로 {selectedDivision.order.path.length}구간
                      {selectedDivision.status === 'moving'
                        ? ` · 현재 구간 ${selectedDivision.order.remainingTicks}틱`
                        : ''}
                    </small>
                    <button
                      onClick={() =>
                        setGame((previous) =>
                          previous
                            ? cancelDivisionOrder(
                                previous,
                                selectedDivision.id,
                              )
                            : previous,
                        )
                      }
                    >
                      현재 명령 취소
                    </button>
                  </div>
                ) : (
                  <div className="division-order-hint">
                    지도에서 목적지를 클릭하세요. 아군 지역이면 이동, 다른 세력 지역이면 전선까지 이동 후 공격합니다.
                  </div>
                )}
              </div>
            )}

            <div
              className={`division-list ${hqFaction === 'player' ? '' : 'hq-player-hidden'}`}
            >
              {playerDivisionList.map((division) => {
                const territory = game.territories[division.locationId]
                const selectedUnit = game.selectedDivisionId === division.id

                return (
                  <button
                    key={division.id}
                    className={selectedUnit ? 'selected' : ''}
                    onClick={() => selectDivision(division.id)}
                  >
                    <span className="division-list-symbol">◆</span>
                    <div>
                      <strong>{division.name || '이름 없는 사단'}</strong>
                      <span>
                        {division.commander || '지휘관 미지정'} · {territory?.name ?? '위치 없음'}
                      </span>
                    </div>
                    <div className="division-list-state">
                      <b>{divisionStatusLabel(division)}</b>
                      <small>
                        {Math.round(division.strength)}/{Math.round(division.organization)}
                      </small>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {rulesOpen && (
          <section className="rules-panel">
            <div className="rules-head">
              <div>
                <p className="eyebrow">첫 플레이 가이드</p>
                <h2>산업을 돌리고, 사단을 준비하고, 전선을 밀어냅니다.</h2>
              </div>
              <button onClick={() => setRulesOpen(false)}>닫기</button>
            </div>

            <div className="rules-steps">
              <div>
                <strong>1. 생산은 즉시 끝나지 않습니다</strong>
                <span>
                  산업 시설·사단·방어 공사를 주문하면 자금이 먼저 사용되고 생산 대기열에 들어갑니다.
                  시간이 흐르면 완성됩니다.
                </span>
              </div>
              <div>
                <strong>2. 전투도 즉시 끝나지 않습니다</strong>
                <span>
                  먼저 사단 패널이나 지도 위 부대 카운터에서 사단을 선택합니다.
                  그 다음 지도에서 목적지를 클릭하면 사단이 실제 경로를 따라 이동하며, 적 지역이면 전선에 도착한 뒤 전투를 시작합니다.
                </span>
              </div>
              <div>
                <strong>3. 경제가 군사력을 만듭니다</strong>
                <span>
                  산업 시설은 {ECONOMY_INTERVAL}틱마다 자금 {FACTORY_INCOME}을 생산합니다.
                  그 자금으로 새 생산 주문을 넣습니다.
                </span>
              </div>
              <div>
                <strong>4. 연결과 보급을 유지합니다</strong>
                <span>
                  같은 세력 영토와 연결된 지역은 보급이 회복되고, 고립된 지역은 보급이 떨어집니다.
                  사단은 자기 영토를 따라 여러 행정동을 이동할 수 있으며, 이동 중에는 지도에 경로가 표시됩니다.
                </span>
              </div>
              <div>
                <strong>5. 사단 역할과 군 작전을 사용합니다</strong>
                <span>
                  전열·기동·경비 역할로 사단 성격을 나누고, 여러 사단을 군에 배속할 수 있습니다.
                  군에 목표를 지정하면 준비도가 쌓이며 작전 실행 시 배속 사단들이 함께 이동합니다.
                </span>
              </div>
            </div>

            <p className="rules-tip">
              Space = 정지/재개 · 1/2/4 = 배속 · 0 = ×10 · F = 선택 지역 확대
            </p>
          </section>
        )}

        {game && counts && game.phase !== 'setup' && total > 0 && (
          <div className="situation-panel">
            <div className="situation-meta">
              <strong>전국 통제 현황</strong>
              <span>
                {difficultyLabels[game.difficulty]} · {formatStrategicTime(game.tick)}
              </span>
            </div>
            <div className="situation-bar">
              {(Object.keys(factions) as FactionId[]).map((id) => {
                const width = (counts[id] / total) * 100
                if (width <= 0) return null
                return (
                  <span
                    key={id}
                    title={`${ownerName(id, game)}: ${counts[id].toLocaleString()}개`}
                    style={{
                      width: `${width}%`,
                      background: ownerColor(id, game),
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {game && mapMode !== 'control' && (
          <div className="map-mode-legend">
            <strong>
              {mapMode === 'supply'
                ? '보급 지도'
                : mapMode === 'industry'
                  ? '산업 지도'
                  : mapMode === 'terrain'
                    ? '근사 지형 지도'
                    : '철도망 지도'}
            </strong>
            <span>
              {mapMode === 'supply'
                ? '초록 = 안정 · 황색 = 주의 · 적갈색 = 취약'
                : mapMode === 'industry'
                  ? '밝을수록 산업·인프라 시설 총량이 많음'
                  : mapMode === 'terrain'
                    ? '도시·평야·구릉·산악·산림·해안·도서의 게임용 근사 분류'
                    : '밝은 선로일수록 철도 단계가 높음 · 철도는 보급과 이동에 영향'}
            </span>
          </div>
        )}

        <nav className="operations-dock">
          <button
            className={commandOpen ? 'active' : ''}
            onClick={() => setCommandOpen((open) => !open)}
          >
            지휘
          </button>
          <button
            className={armyOpen ? 'active' : ''}
            disabled={game?.phase !== 'running'}
            onClick={() => setArmyOpen((open) => !open)}
          >
            사단
            {playerDivisionList.length > 0 && <b>{playerDivisionList.length}</b>}
          </button>
          <button
            className={productionOpen ? 'active' : ''}
            disabled={game?.phase !== 'running'}
            onClick={() => setProductionOpen((open) => !open)}
          >
            생산
            {playerQueue.length > 0 && <b>{playerQueue.length}</b>}
          </button>
          <button
            className={researchOpen ? 'active' : ''}
            disabled={game?.phase !== 'running'}
            onClick={() => setResearchOpen((open) => !open)}
          >
            연구
          </button>
          <button
            className={frontOpen ? 'active' : ''}
            disabled={game?.phase !== 'running'}
            onClick={() => setFrontOpen((open) => !open)}
          >
            전선
            {playerBattles.length > 0 && <b>{playerBattles.length}</b>}
          </button>
          <button
            className={speedOpen ? 'active' : ''}
            disabled={game?.phase !== 'running'}
            onClick={() => setSpeedOpen((open) => !open)}
          >
            시간
          </button>
          <button
            disabled={!game}
            onClick={() =>
              setMapMode((mode) =>
                mode === 'control'
                  ? 'supply'
                  : mode === 'supply'
                    ? 'industry'
                    : mode === 'industry'
                      ? 'terrain'
                      : mode === 'terrain'
                        ? 'railway'
                        : 'control',
              )
            }
          >
            지도{' '}
            {mapMode === 'control'
              ? '영토'
              : mapMode === 'supply'
                ? '보급'
                : mapMode === 'industry'
                  ? '산업'
                  : mapMode === 'terrain'
                    ? '지형'
                    : '철도'}
          </button>
          <button
            className={rulesOpen ? 'active' : ''}
            onClick={() => setRulesOpen((open) => !open)}
          >
            도움말
          </button>
        </nav>

        {!game && !loadingError && (
          <div className="loading-card">
            <strong>행정동 게임 데이터 불러오는 중</strong>
            <span>전국 행정동 3,558개 영토 데이터를 준비하고 있습니다.</span>
          </div>
        )}

        {loadingError && (
          <div className="loading-card error">
            <strong>데이터 로딩 실패</strong>
            <span>{loadingError}</span>
          </div>
        )}
      </section>

      {!commandOpen && (
        <button className="command-tab" onClick={() => setCommandOpen(true)}>
          지휘 열기
        </button>
      )}

      <aside className={`sidebar ${commandOpen ? 'open' : 'closed'}`}>
        <header className="command-header">
          <div>
            <p className="eyebrow">지휘 패널</p>
            <h1>행정동 RTS</h1>
          </div>
          <button className="drawer-close" onClick={() => setCommandOpen(false)}>
            닫기
          </button>
        </header>

        {game && (
          <div className="command-actions">
            <button disabled={game.phase === 'setup'} onClick={handleSave}>저장</button>
            <button disabled={!savedAt} onClick={handleLoad}>불러오기</button>
            {game.phase !== 'setup' && (
              <button onClick={handleNewGame}>새 게임</button>
            )}
          </div>
        )}

        {game && game.phase !== 'setup' && nationalStats && (
          <section className="economy-hud">
            <div>
              <span>보유 자금</span>
              <strong>{game.funds.player.toLocaleString()}</strong>
            </div>
            <div>
              <span>산업 수익</span>
              <strong>+{nationalStats.income.toLocaleString()} / {ECONOMY_INTERVAL}틱</strong>
            </div>
            <div>
              <span>산업 시설</span>
              <strong>{nationalStats.playerIndustryTotal.toLocaleString()}</strong>
            </div>
            <div>
              <span>연구점수</span>
              <strong>{game.researchPoints.player.toLocaleString()}</strong>
            </div>
          </section>
        )}

        {game && counts && (
          <div className="faction-grid">
            {(Object.keys(factions) as FactionId[]).map((id) => (
              <div key={id}>
                <i style={{ background: ownerColor(id, game) }} />
                <span>{ownerName(id, game)}</span>
                <strong>{counts[id].toLocaleString()}</strong>
              </div>
            ))}
          </div>
        )}

        {game && nationalStats && game.phase !== 'setup' && (
          <section className="card national-stats-card">
            <div className="stats-heading">
              <p className="section-label">플레이어 현황</p>
              <span>Space 일시정지 · 1/2/4/10 배속 · F 선택지역</span>
            </div>
            <div className="national-stats-grid">
              <div>
                <span>점령률</span>
                <strong>{nationalStats.share.toFixed(1)}%</strong>
              </div>
              <div>
                <span>총 군사력</span>
                <strong>{nationalStats.playerMilitaryPower.toLocaleString()}</strong>
              </div>
              <div>
                <span>평균 보급</span>
                <strong>{nationalStats.averageSupply}%</strong>
              </div>
              <div>
                <span>접경 행정동</span>
                <strong>{nationalStats.playerFrontlines.toLocaleString()}</strong>
              </div>
            </div>
          </section>
        )}

        {game && game.events.length > 0 && game.phase !== 'setup' && (
          <section className="card event-card">
            <div className="event-heading">
              <p className="section-label">최근 상황</p>
              <span>{game.events.length}건 기록</span>
            </div>
            <div className="event-list">
              {game.events.slice(0, 12).map((event) => (
                <div key={event.id} className={`event-row ${event.kind}`}>
                  <span>T{event.tick}</span>
                  <p>{event.message}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {game && (
          <section className="card search-card">
            <div className="search-heading">
              <div>
                <p className="section-label">행정동 검색</p>
                <span className="save-state">
                  {savedAt
                    ? `마지막 저장 ${new Date(savedAt).toLocaleString('ko-KR')}`
                    : '저장된 게임 없음'}
                </span>
              </div>
            </div>
            <input
              value={searchQuery}
              placeholder="예: 사직동, 수원시, 제주"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery.trim().length >= 2 && (
              <div className="search-results">
                {searchResults.length > 0 ? (
                  searchResults.map((territory) => (
                    <button key={territory.id} onClick={() => selectTerritory(territory)}>
                      <strong>{territory.name}</strong>
                      <span>{territory.fullName}</span>
                    </button>
                  ))
                ) : (
                  <p>검색 결과가 없습니다.</p>
                )}
              </div>
            )}
          </section>
        )}

        {game?.phase === 'setup' && (
          <section className="card setup-card">
            <p className="section-label">게임 설정</p>
            <div className="faction-customization">
              <p className="setup-subtitle">세력 설정</p>
              <div className="faction-setting-row">
                <span>내 세력</span>
                <input
                  value={game.playerName}
                  maxLength={24}
                  onChange={(event) =>
                    setGame((previous) =>
                      previous
                        ? {
                            ...previous,
                            playerName: event.target.value,
                          }
                        : previous,
                    )
                  }
                />
                <input
                  className="color-input"
                  type="color"
                  value={game.factionColors.player}
                  aria-label="플레이어 세력 색상"
                  onChange={(event) =>
                    setGame((previous) =>
                      previous
                        ? {
                            ...previous,
                            factionColors: {
                              ...previous.factionColors,
                              player: event.target.value,
                            },
                          }
                        : previous,
                    )
                  }
                />
              </div>

              {(['red', 'blue', 'green'] as AiFactionId[]).map((id, index) => (
                <div
                  key={id}
                  className={`faction-setting-row ${index >= game.aiCount ? 'inactive' : ''}`}
                >
                  <span>AI {index + 1}</span>
                  <input
                    value={game.aiNames[id]}
                    maxLength={24}
                    onChange={(event) =>
                      setGame((previous) =>
                        previous
                          ? {
                              ...previous,
                              aiNames: {
                                ...previous.aiNames,
                                [id]: event.target.value,
                              },
                            }
                          : previous,
                      )
                    }
                  />
                  <input
                    className="color-input"
                    type="color"
                    value={game.factionColors[id]}
                    aria-label={`AI ${index + 1} 세력 색상`}
                    onChange={(event) =>
                      setGame((previous) =>
                        previous
                          ? {
                              ...previous,
                              factionColors: {
                                ...previous.factionColors,
                                [id]: event.target.value,
                              },
                            }
                          : previous,
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <div className="setup-options">
              <label>
                상대 AI
                <select
                  value={game.aiCount}
                  onChange={(event) =>
                    setGame((previous) =>
                      previous
                        ? { ...previous, aiCount: Number(event.target.value) as AiCount }
                        : previous,
                    )
                  }
                >
                  <option value={1}>1개 세력</option>
                  <option value={2}>2개 세력</option>
                  <option value={3}>3개 세력</option>
                </select>
              </label>

              <label>
                난이도
                <select
                  value={game.difficulty}
                  onChange={(event) =>
                    setGame((previous) =>
                      previous
                        ? { ...previous, difficulty: event.target.value as Difficulty }
                        : previous,
                    )
                  }
                >
                  <option value="easy">쉬움</option>
                  <option value="normal">보통</option>
                  <option value="hard">어려움</option>
                </select>
              </label>
            </div>

            <p className="muted">
              지도에서 원하는 행정동을 고른 뒤 시작하세요. AI 세력은 시작 지역과 서로 멀리 떨어진 곳에 자동 배치되며, 난이도는 AI의 공격 빈도와 목표 선택에 영향을 줍니다.
            </p>
            <button
              className="primary"
              disabled={!selected}
              onClick={() => {
                if (!selected) return
                setGame((previous) =>
                  previous ? startGame(previous, selected.id) : previous,
                )
                setCommandOpen(false)
                setRulesOpen(false)
              }}
            >
              {selected ? `${selected.name}에서 시작` : '시작 지역 선택'}
            </button>
          </section>
        )}

        {game?.phase === 'victory' && (
          <div className="result-card">
            <strong>전국 점령 완료</strong>
            <span>{game.tick.toLocaleString()}틱 만에 모든 행정동을 확보했습니다.</span>
            <button className="secondary" onClick={handleNewGame}>새 게임 시작</button>
          </div>
        )}

        {game?.phase === 'defeat' && (
          <div className="result-card defeat">
            <strong>세력 소멸</strong>
            <span>플레이어가 보유한 행정동이 없습니다.</span>
            <button className="secondary" onClick={handleNewGame}>다시 시작</button>
          </div>
        )}

        {selected && game ? (
          <section className="card territory-card">
            <div className="row">
              <div>
                <p className="section-label">선택 지역</p>
                <h2>{selected.name}</h2>
              </div>
              <span
                className="badge"
                style={{ borderColor: ownerColor(selected.owner, game) }}
              >
                {ownerName(selected.owner, game)}
              </span>
            </div>

            <p className="full-name">{selected.fullName}</p>
            {game.phase === 'running' &&
              selected.owner !== 'neutral' &&
              selected.neighbors.some(
                (neighborId) =>
                  game.territories[neighborId]?.owner !== selected.owner,
              ) && <span className="frontline-chip">접경 지역</span>}
            {game.phase === 'running' && selectedIsIsolated && (
              <span className="isolation-chip">고립 · 보급 감소</span>
            )}

            <div className="metric-grid economy-metrics">
              <div>
                <span>근사 지형</span>
                <strong>{terrainLabels[selected.terrain]}</strong>
              </div>
              <div>
                <span>철도</span>
                <strong>Lv.{selected.railway} / {MAX_RAILWAY}</strong>
              </div>
              <div>
                <span>방어</span>
                <strong>{selected.defense} / {MAX_DEFENSE}</strong>
              </div>
              <div>
                <span>보급</span>
                <strong>{Math.round(selected.supply)}%</strong>
              </div>
            </div>

            <div className="industry-mini-grid">
              {INDUSTRY_TYPES.map((kind) => (
                <div key={kind}>
                  <span>{industryLabels[kind]}</span>
                  <strong>
                    {selected.industry[kind]} / {INDUSTRY_MAX[kind]}
                  </strong>
                </div>
              ))}
            </div>

            <div className="military-power-row">
              <span>지역 군사력</span>
              <strong>{territoryMilitaryPower(selected, game).toLocaleString()}</strong>
            </div>

            {selectedBattle && (
              <div className="territory-battle-card">
                <div className="territory-battle-head">
                  <strong>전투 진행 중</strong>
                  <span>{Math.round(Math.abs(selectedBattle.progress))}%</span>
                </div>
                <div className="battle-progress">
                  <i
                    style={{
                      width: `${(selectedBattle.progress + 100) / 2}%`,
                    }}
                  />
                </div>
                <small>
                  {game.territories[selectedBattle.fromId]?.name ?? '?'} →{' '}
                  {game.territories[selectedBattle.toId]?.name ?? '?'} ·{' '}
                  {selectedBattle.attackerDivisionIds.length}개 사단
                </small>
              </div>
            )}

            {selectedOrder && (
              <div className="territory-production-card">
                <div>
                  <strong>{productionKindLabel(selectedOrder.kind)}</strong>
                  <span>{selectedOrder.remainingTicks}틱 남음</span>
                </div>
                <div className="progress-track">
                  <i
                    style={{
                      width: `${
                        ((selectedOrder.totalTicks - selectedOrder.remainingTicks) /
                          selectedOrder.totalTicks) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <button
                  onClick={() =>
                    setGame((previous) =>
                      previous
                        ? cancelProduction(previous, selectedOrder.id)
                        : previous,
                    )
                  }
                >
                  생산 취소
                </button>
              </div>
            )}

            {game.phase === 'running' && selected.owner === 'player' && (
              <div className="build-panel">
                <div className="build-panel-head">
                  <div>
                    <p className="section-label">경제 / 군사 건설</p>
                    <span>현재 자금 {game.funds.player.toLocaleString()}</span>
                  </div>
                </div>

                <div className="build-grid expanded-industry-grid">
                  {INDUSTRY_TYPES.map((kind) => (
                    <button
                      key={kind}
                      disabled={
                        Boolean(selectedOrder) ||
                        selected.industry[kind] >= INDUSTRY_MAX[kind] ||
                        game.funds.player < INDUSTRY_COSTS[kind]
                      }
                      onClick={() =>
                        setGame((previous) =>
                          previous
                            ? buildIndustry(previous, selected.id, kind)
                            : previous,
                        )
                      }
                    >
                      <strong>{industryLabels[kind]}</strong>
                      <span>
                        비용 {INDUSTRY_COSTS[kind]} ·{' '}
                        {productionDuration(kind, selected)}틱 ·{' '}
                        {industryDescription(kind)}
                      </span>
                    </button>
                  ))}

                  <button
                    disabled={
                      Boolean(selectedOrder) ||
                      selected.railway >= MAX_RAILWAY ||
                      game.funds.player <
                        RAILWAY_COST + selected.railway * 55
                    }
                    onClick={() =>
                      setGame((previous) =>
                        previous
                          ? buildRailway(previous, selected.id)
                          : previous,
                      )
                    }
                  >
                    <strong>철도 확장</strong>
                    <span>
                      {selected.railway >= MAX_RAILWAY
                        ? '최대 단계'
                        : `Lv.${selected.railway} → Lv.${selected.railway + 1} · 비용 ${RAILWAY_COST + selected.railway * 55} · 보급/이동 효율 증가`}
                    </span>
                  </button>

                  <button
                    disabled={Boolean(selectedOrder) || game.funds.player < DIVISION_COST}
                    onClick={() =>
                      setGame((previous) =>
                        previous ? buildDivision(previous, selected.id) : previous,
                      )
                    }
                  >
                    <strong>사단 편성</strong>
                    <span>
                      비용 {DIVISION_COST} · {productionDuration('division', selected)}틱 · 해당 지역에 신규 사단 배치
                    </span>
                  </button>

                  <button
                    disabled={
                      Boolean(selectedOrder) ||
                      selected.defense >= MAX_DEFENSE ||
                      game.funds.player < defenseUpgradeCost(selected.defense)
                    }
                    onClick={() =>
                      setGame((previous) =>
                        previous ? upgradeDefense(previous, selected.id) : previous,
                      )
                    }
                  >
                    <strong>방어 공사</strong>
                    <span>
                      {selected.defense >= MAX_DEFENSE
                        ? '최대 단계'
                        : `비용 ${defenseUpgradeCost(selected.defense)} · ${productionDuration('defense', selected)}틱 · 지역 방어 +1`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div className="territory-unit-roster">
              <div className="neighbor-heading">
                <h3>주둔 사단</h3>
                <span>{divisionsHere.length}개</span>
              </div>
              {divisionsHere.length === 0 ? (
                <p className="panel-empty">이 지역에 배치된 사단이 없습니다.</p>
              ) : (
                <div className="territory-division-list">
                  {divisionsHere.map((division) => (
                    <button
                      key={division.id}
                      className={
                        game.selectedDivisionId === division.id
                          ? 'selected'
                          : ''
                      }
                      disabled={division.owner !== 'player'}
                      onClick={() => {
                        if (division.owner === 'player') {
                          selectDivision(division.id)
                          setArmyOpen(true)
                        }
                      }}
                    >
                      <span
                        className="mini-unit-counter"
                        style={{
                          borderColor: ownerColor(division.owner, game),
                        }}
                      >
                        ◆
                      </span>
                      <div>
                        <strong>{division.name || '이름 없는 사단'}</strong>
                        <span>
                          {division.commander || '지휘관 미지정'} ·{' '}
                          {divisionStatusLabel(division)}
                        </span>
                      </div>
                      <small>
                        {Math.round(division.strength)} /{' '}
                        {Math.round(division.organization)}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {regionalStats && (
              <div className="regional-stats">
                {[regionalStats.province, regionalStats.district].map((region) => (
                  <div key={region.name || '미지정'} className="regional-stat-row">
                    <div className="regional-stat-meta">
                      <span>{region.name || '구역 미지정'}</span>
                      <strong>
                        {region.player.toLocaleString()} / {region.total.toLocaleString()}
                        {' '}({region.share.toFixed(1)}%)
                      </strong>
                    </div>
                    <div className="regional-progress">
                      <i
                        style={{
                          width: `${region.share}%`,
                          background: ownerColor('player', game),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button className="secondary" onClick={focusSelected}>
              지도에서 확대
            </button>

            <div className="neighbor-heading">
              <h3>인접 행정동</h3>
              <span>{neighbors.length}개</span>
            </div>

            <div className="neighbor-list">
              {neighbors.map((neighbor) => {
                const neighborBattle = game.battles.find(
                  (battle) =>
                    battle.fromId === neighbor.id ||
                    battle.toId === neighbor.id,
                )
                const canOrder =
                  game.phase === 'running' &&
                  selectedDivision?.owner === 'player' &&
                  selectedDivision.status === 'idle' &&
                  selectedDivision.locationId !== neighbor.id

                return (
                  <div key={neighbor.id} className="neighbor-item">
                    <button
                      className={`neighbor-main ${canOrder ? 'capture' : ''} ${neighborBattle ? 'engaged' : ''}`}
                      onClick={() => {
                        if (canOrder) {
                          handleTerritoryCommand(neighbor.id)
                        } else {
                          setGame((previous) =>
                            previous
                              ? { ...previous, selectedId: neighbor.id }
                              : previous,
                          )
                        }
                      }}
                    >
                      <span>{neighbor.name}</span>
                      <small>
                        {ownerName(neighbor.owner, game)} · 사단 {neighbor.divisions} · 방어 {neighbor.defense}
                        {neighborBattle
                          ? ' · 전투 중'
                          : canOrder
                            ? neighbor.owner === 'player'
                              ? ' · 선택 사단 이동'
                              : ' · 선택 사단 공격'
                            : ''}
                      </small>
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          <section className="card">
            <p className="muted">지도에서 행정동을 선택하세요.</p>
          </section>
        )}

        <section className="card source-card">
          <p className="section-label">데이터</p>
          <p className="muted">
            배경은 OpenStreetMap, 행정동 경계는 SGIS 기반 admdongkor light 데이터를 사용합니다.
            섬처럼 육지 경계가 이어지지 않는 권역은 게임 진행을 위해 가장 가까운 권역과 추상 연결됩니다.
          </p>
        </section>
      </aside>
    </main>
  )
}

export default App
