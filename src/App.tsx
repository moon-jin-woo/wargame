import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { loadLatestAdminDongs } from './adminData'
import {
  advanceTick,
  attackStanceLabels,
  buildDivision,
  buildFactory,
  cancelProduction,
  createInitialState,
  divisionMilitaryPower,
  defenseUpgradeCost,
  difficultyLabels,
  DIVISION_COST,
  ECONOMY_INTERVAL,
  FACTORY_COST,
  FACTORY_INCOME,
  factionIncomePerCycle,
  factions,
  MAX_DEFENSE,
  MAX_FACTORIES,
  issueDivisionMoveOrders,
  ownerCounts,
  productionDuration,
  renameCommander,
  renameDivision,
  startGame,
  stopDivisionOrders,
  territoryMilitaryPower,
  upgradeDefense,
} from './game'
import { getSavedAt, restoreGame, saveGame } from './persistence'
import {
  buildDivisionFeatureCollection,
  DIVISION_LAYER_ID,
  DIVISION_SHADOW_LAYER_ID,
  DIVISION_SOURCE_ID,
} from './divisionMap'
import { drawTerritoryCanvas, findTerritoryAtLngLat } from './territoryCanvas'
import type {
  AdminMapData,
  AiCount,
  AiFactionId,
  Difficulty,
  AttackStance,
  FactionId,
  GameSpeed,
  GameState,
  ProductionKind,
  TerritoryState,
} from './types'

const SOURCE_ID = 'admin-dongs'
const FILL_LAYER_ID = 'admin-dongs-fill'
const LINE_LAYER_ID = 'admin-dongs-line'
type MapMode = 'control' | 'supply' | 'industry'

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

  if (territory.factories >= 4) return '#d0b46e'
  if (territory.factories === 3) return '#aa915d'
  if (territory.factories === 2) return '#81724f'
  if (territory.factories === 1) return '#5e5947'
  return '#343a3a'
}

function formatStrategicTime(tick: number): string {
  const day = Math.floor(tick / 4) + 1
  const hour = (tick % 4) * 6
  return `DAY ${String(day).padStart(3, '0')} · ${String(hour).padStart(2, '0')}:00`
}

function productionLabel(kind: ProductionKind): string {
  if (kind === 'factory') return '산업 시설'
  if (kind === 'division') return '사단 편성'
  return '방어 공사'
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
  const gameRef = useRef<GameState | null>(null)
  const territoryCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previousOwners = useRef<Record<string, string>>({})
  const previousSelected = useRef<string | null>(null)
  const previousFrontlines = useRef<Record<string, boolean>>({})
  const previousBattleTerritories = useRef<Set<string>>(new Set())
  const selectedDivisionIdsRef = useRef<string[]>([])

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
  const [frontOpen, setFrontOpen] = useState(false)
  const [divisionsOpen, setDivisionsOpen] = useState(false)
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([])
  const [mapMode, setMapMode] = useState<MapMode>('control')

  useEffect(() => {
    selectedDivisionIdsRef.current = selectedDivisionIds
  }, [selectedDivisionIds])

  useEffect(() => {
    gameRef.current = game
  }, [game])

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

    if (!map.getSource(DIVISION_SOURCE_ID)) {
      map.addSource(DIVISION_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      })

      map.addLayer({
        id: DIVISION_SHADOW_LAYER_ID,
        type: 'circle',
        source: DIVISION_SOURCE_ID,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', 'selected'], false],
            11,
            8,
          ],
          'circle-color': '#080a0b',
          'circle-opacity': 0.72,
          'circle-blur': 0.15,
        },
      })

      map.addLayer({
        id: DIVISION_LAYER_ID,
        type: 'circle',
        source: DIVISION_SOURCE_ID,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', 'selected'], false],
            8,
            6,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'status'], 'battle'],
            '#ffd1c4',
            ['boolean', ['get', 'selected'], false],
            '#ffffff',
            '#15191a',
          ],
          'circle-stroke-width': [
            'case',
            ['boolean', ['get', 'selected'], false],
            3,
            2,
          ],
          'circle-opacity': 0.98,
        },
      })
    }

    const divisionClickHandler = (event: maplibregl.MapLayerMouseEvent) => {
      const divisionId = event.features?.[0]?.properties?.divisionId
      if (!divisionId) return

      const currentGame = gameRef.current
      const division = currentGame?.divisions[String(divisionId)]
      if (!division) return

      const additive = Boolean(event.originalEvent.shiftKey)

      setSelectedDivisionIds((previous) => {
        if (!additive) return [division.id]
        return previous.includes(division.id)
          ? previous.filter((id) => id !== division.id)
          : [...previous, division.id]
      })

      setGame((previous) =>
        previous
          ? { ...previous, selectedId: division.territoryId }
          : previous,
      )
    }

    const clickHandler = (event: maplibregl.MapLayerMouseEvent) => {
      const unitFeatures = map.queryRenderedFeatures(event.point, {
        layers: [DIVISION_LAYER_ID],
      })
      if (unitFeatures.length > 0) return

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

    map.on('click', DIVISION_LAYER_ID, divisionClickHandler)
    map.on('click', FILL_LAYER_ID, clickHandler)
    map.on('mouseenter', DIVISION_LAYER_ID, enterHandler)
    map.on('mouseleave', DIVISION_LAYER_ID, leaveHandler)
    map.on('mouseenter', FILL_LAYER_ID, enterHandler)
    map.on('mouseleave', FILL_LAYER_ID, leaveHandler)
    map.on('render', detectTerritories)

    previousOwners.current = {}
    previousFrontlines.current = {}
    previousSelected.current = null
    setLayerReady(true)

    return () => {
      map.off('click', DIVISION_LAYER_ID, divisionClickHandler)
      map.off('mouseenter', DIVISION_LAYER_ID, enterHandler)
      map.off('mouseleave', DIVISION_LAYER_ID, leaveHandler)
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
      const ownerKey =
        mapMode === 'control'
          ? `${territory.owner}|${visualColor}`
          : mapMode === 'supply'
            ? `${mapMode}|${Math.round(territory.supply / 5)}|${visualColor}`
            : `${mapMode}|${territory.factories}|${visualColor}`

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
      current.add(battle.toId)
      for (const divisionId of battle.attackerDivisionIds) {
        const division = game.divisions[divisionId]
        if (division) current.add(division.territoryId)
      }
    }

    for (const id of current) {
      map.setFeatureState(
        { source: SOURCE_ID, id },
        { battle: true },
      )
    }

    previousBattleTerritories.current = current
  }, [game?.battles, game?.divisions, layerReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady || !game) return

    const source = map.getSource(DIVISION_SOURCE_ID)
    if (!source || source.type !== 'geojson') return

    source.setData(
      buildDivisionFeatureCollection(game, selectedDivisionIds) as never,
    )
  }, [
    game?.divisions,
    game?.factionColors,
    selectedDivisionIds,
    layerReady,
  ])

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

    let playerFactories = 0
    let playerSupply = 0
    let playerFrontlines = 0

    for (const territory of Object.values(game.territories)) {
      if (territory.owner !== 'player') continue
      playerFactories += territory.factories
      playerSupply += territory.supply

      if (
        territory.neighbors.some(
          (neighborId) => game.territories[neighborId]?.owner !== 'player',
        )
      ) {
        playerFrontlines += 1
      }
    }

    const playerUnits = Object.values(game.divisions).filter(
      (division) => division.owner === 'player',
    )
    const playerOwned = counts.player

    return {
      playerOwned,
      share: (playerOwned / total) * 100,
      playerDivisions: playerUnits.length,
      playerFactories,
      playerMilitaryPower: playerUnits.reduce(
        (sum, division) => sum + divisionMilitaryPower(division),
        0,
      ),
      income: factionIncomePerCycle(game, 'player'),
      averageSupply:
        playerOwned > 0 ? Math.round(playerSupply / playerOwned) : 0,
      playerFrontlines,
    }
  }, [game?.territories, game?.divisions, counts, total])

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

  const playerDivisions = useMemo(
    () =>
      game
        ? Object.values(game.divisions)
            .filter((division) => division.owner === 'player')
            .sort(
              (a, b) =>
                a.name.localeCompare(b.name, 'ko') ||
                a.id.localeCompare(b.id),
            )
        : [],
    [game?.divisions],
  )

  const selectedDivisions = useMemo(
    () =>
      selectedDivisionIds
        .map((id) => game?.divisions[id])
        .filter((division): division is NonNullable<typeof division> =>
          Boolean(division),
        ),
    [selectedDivisionIds, game?.divisions],
  )

  const primaryDivision = selectedDivisions[0] ?? null

  const selectedTerritoryDivisions = useMemo(
    () =>
      selected && game
        ? Object.values(game.divisions)
            .filter((division) => division.territoryId === selected.id)
            .sort(
              (a, b) =>
                a.owner.localeCompare(b.owner) ||
                a.name.localeCompare(b.name, 'ko'),
            )
        : [],
    [selected?.id, game?.divisions],
  )

  const selectedBattle = useMemo(
    () =>
      selected && game
        ? game.battles.find((battle) => {
            if (battle.toId === selected.id) return true
            return battle.attackerDivisionIds.some(
              (divisionId) =>
                game.divisions[divisionId]?.territoryId === selected.id,
            )
          }) ?? null
        : null,
    [game?.battles, game?.divisions, selected?.id],
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
      current.divisions += Object.values(game.divisions).filter(
        (division) =>
          division.owner === 'player' &&
          division.territoryId === territory.id,
      ).length
      current.pressure += hostileNeighbors
      groups.set(key, current)
    }

    return [...groups.values()].sort(
      (a, b) =>
        b.pressure - a.pressure ||
        b.territories - a.territories ||
        a.name.localeCompare(b.name, 'ko'),
    )
  }, [game?.territories, game?.divisions])

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

      const selectedUnits = selectedDivisionIdsRef.current
      if (previous.phase === 'running' && selectedUnits.length > 0) {
        const next = issueDivisionMoveOrders(
          previous,
          selectedUnits,
          targetId,
        )
        return { ...next, selectedId: targetId }
      }

      return { ...previous, selectedId: targetId }
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

  const focusDivision = (divisionId: string, additive = false) => {
    const division = gameRef.current?.divisions[divisionId]
    const territory = division
      ? gameRef.current?.territories[division.territoryId]
      : null
    if (!division || !territory) return

    setSelectedDivisionIds((previous) => {
      if (!additive) return [divisionId]
      return previous.includes(divisionId)
        ? previous.filter((id) => id !== divisionId)
        : [...previous, divisionId]
    })

    setGame((previous) =>
      previous
        ? { ...previous, selectedId: division.territoryId }
        : previous,
    )

    mapRef.current?.easeTo({
      center: territory.centroid,
      zoom: Math.max(mapRef.current?.getZoom() ?? 6, 9),
      duration: 420,
    })
  }

  const handleNewGame = () => {
    if (!adminData) return
    setSelectedDivisionIds([])
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
              </div>
              <div>
                <span>산업</span>
                <strong>{nationalStats.playerFactories}</strong>
                <small>+{nationalStats.income}/{ECONOMY_INTERVAL}T</small>
              </div>
              <div>
                <span>사단</span>
                <strong>{nationalStats.playerDivisions}</strong>
              </div>
              <div>
                <span>생산</span>
                <strong>{playerQueue.length}</strong>
              </div>
              <div>
                <span>전투</span>
                <strong>{playerBattles.length}</strong>
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

        {game?.phase === 'running' && divisionsOpen && (
          <section className="floating-panel divisions-panel">
            <div className="floating-panel-head">
              <div>
                <p className="eyebrow">육군 / 사단</p>
                <h2>사단 목록</h2>
              </div>
              <button onClick={() => setDivisionsOpen(false)}>닫기</button>
            </div>

            <div className="division-panel-summary">
              <span>보유 사단 {playerDivisions.length}</span>
              <span>선택 {selectedDivisionIds.length}</span>
            </div>

            <div className="division-list">
              {playerDivisions.length === 0 ? (
                <p className="panel-empty">
                  생산 메뉴에서 사단을 편성하면 이 목록과 지도에 개별 유닛으로 나타납니다.
                </p>
              ) : (
                playerDivisions.map((division) => {
                  const territory = game.territories[division.territoryId]
                  const selectedUnit = selectedDivisionIds.includes(division.id)

                  return (
                    <button
                      key={division.id}
                      className={`division-list-row ${selectedUnit ? 'selected' : ''}`}
                      onClick={(event) =>
                        focusDivision(
                          division.id,
                          event.shiftKey || event.metaKey || event.ctrlKey,
                        )
                      }
                    >
                      <div className="division-list-main">
                        <strong>{division.name || '이름 없는 사단'}</strong>
                        <span>
                          {division.commander || '지휘관 미지정'} · {territory?.name ?? '?'}
                        </span>
                      </div>
                      <div className="division-status-text">
                        <b>{division.status === 'idle'
                          ? '대기'
                          : division.status === 'moving'
                            ? '이동'
                            : division.status === 'battle'
                              ? '전투'
                              : '재정비'}</b>
                        <span>전투력 {divisionMilitaryPower(division)}</span>
                      </div>
                      <div className="division-mini-bars">
                        <i
                          className="strength"
                          style={{ width: `${division.strength}%` }}
                        />
                        <i
                          className="organization"
                          style={{ width: `${division.organization}%` }}
                        />
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>
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
                          <strong>{productionLabel(order.kind)}</strong>
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
                            {battle.committedDivisions}개 사단 · {attackStanceLabels[battle.stance]}
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
                  내 행정동을 선택한 다음 인접한 다른 세력 영토를 클릭하면 전투가 시작됩니다.
                  전선 패널에서 진행 게이지를 확인할 수 있습니다.
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
                  인접 아군 지역으로 1개 사단을 재배치할 수도 있습니다.
                </span>
              </div>
              <div>
                <strong>5. 작전 강도를 고릅니다</strong>
                <span>
                  신중·균형·공세는 한 번의 전투에 투입하는 사단 비율과 부담을 바꿉니다.
                  자동 공세는 원할 때만 켜는 선택 기능입니다.
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
            <strong>{mapMode === 'supply' ? '보급 지도' : '산업 지도'}</strong>
            <span>
              {mapMode === 'supply'
                ? '초록 = 안정 · 황색 = 주의 · 적갈색 = 취약'
                : '밝을수록 산업 시설이 많음'}
            </span>
          </div>
        )}

        {game?.phase === 'running' && selectedDivisions.length > 0 && (
          <div className="division-command-bar">
            <div>
              <strong>
                {selectedDivisions.length === 1
                  ? primaryDivision?.name || '사단'
                  : `${selectedDivisions.length}개 사단 선택`}
              </strong>
              <span>
                지도에서 목적지를 클릭하면 이동합니다. 적 영토라면 도착 후 전투가 시작됩니다.
              </span>
            </div>
            <button
              onClick={() =>
                setGame((previous) =>
                  previous
                    ? stopDivisionOrders(previous, selectedDivisionIds)
                    : previous,
                )
              }
            >
              정지
            </button>
            <button onClick={() => setSelectedDivisionIds([])}>선택 해제</button>
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
            className={divisionsOpen ? 'active' : ''}
            disabled={game?.phase !== 'running'}
            onClick={() => setDivisionsOpen((open) => !open)}
          >
            사단
            {playerDivisions.length > 0 && <b>{playerDivisions.length}</b>}
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
                    : 'control',
              )
            }
          >
            지도 {mapMode === 'control' ? '영토' : mapMode === 'supply' ? '보급' : '산업'}
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
              <span>공장 수익</span>
              <strong>+{nationalStats.income.toLocaleString()} / {ECONOMY_INTERVAL}틱</strong>
            </div>
            <div>
              <span>공장</span>
              <strong>{nationalStats.playerFactories.toLocaleString()}</strong>
            </div>
            <div>
              <span>사단</span>
              <strong>{nationalStats.playerDivisions.toLocaleString()}</strong>
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
                <span>공장</span>
                <strong>{selected.factories}</strong>
              </div>
              <div>
                <span>사단</span>
                <strong>{selected.divisions}</strong>
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

            <div className="military-power-row">
              <span>지역 군사력</span>
              <strong>{territoryMilitaryPower(selected).toLocaleString()}</strong>
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
                  {selectedBattle.committedDivisions}개 사단
                </small>
              </div>
            )}

            {selectedOrder && (
              <div className="territory-production-card">
                <div>
                  <strong>{productionLabel(selectedOrder.kind)}</strong>
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

                <div className="build-grid">
                  <button
                    disabled={
                      Boolean(selectedOrder) ||
                      selected.factories >= MAX_FACTORIES ||
                      game.funds.player < FACTORY_COST
                    }
                    onClick={() =>
                      setGame((previous) =>
                        previous ? buildFactory(previous, selected.id) : previous,
                      )
                    }
                  >
                    <strong>산업 시설 대기열</strong>
                    <span>
                      비용 {FACTORY_COST} · {productionDuration('factory', selected)}틱 · 수익 +{FACTORY_INCOME}/{ECONOMY_INTERVAL}틱
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
                    <strong>사단 편성 대기열</strong>
                    <span>
                      비용 {DIVISION_COST} · {productionDuration('division', selected)}틱 · 완료 시 사단 +1
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
                    <strong>방어 강화</strong>
                    <span>
                      {selected.defense >= MAX_DEFENSE
                        ? '최대 단계'
                        : `비용 ${defenseUpgradeCost(selected.defense)} · ${productionDuration('defense', selected)}틱 · 방어 +1`}
                    </span>
                  </button>
                </div>
              </div>
            )}

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
                const canCapture =
                  game.phase === 'running' &&
                  selected.owner === 'player' &&
                  neighbor.owner !== 'player' &&
                  selected.divisions > 0 &&
                  !selectedBattle &&
                  !neighborBattle
                const canSupport =
                  game.phase === 'running' &&
                  selected.owner === 'player' &&
                  neighbor.owner === 'player' &&
                  selected.divisions > 1 &&
                  !selectedBattle &&
                  !neighborBattle

                return (
                  <div key={neighbor.id} className="neighbor-item">
                    <button
                      className={`neighbor-main ${canCapture ? 'capture' : ''} ${neighborBattle ? 'engaged' : ''}`}
                      onClick={() => {
                        if (canCapture) {
                          setGame((previous) =>
                            previous
                              ? captureTerritory(previous, selected.id, neighbor.id)
                              : previous,
                          )
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
                          : canCapture
                            ? ' · 작전 개시'
                            : ''}
                      </small>
                    </button>

                    {canSupport && (
                      <button
                        className="support-button"
                        title="현재 지역에서 1개 사단을 인접 아군 영토로 이동"
                        onClick={() =>
                          setGame((previous) =>
                            previous
                              ? transferTroops(previous, selected.id, neighbor.id)
                              : previous,
                          )
                        }
                      >
                        1사단 재배치
                      </button>
                    )}
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
