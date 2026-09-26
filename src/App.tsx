import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { loadLatestAdminDongs } from './adminData'
import {
  advanceTick,
  buildDivision,
  buildFactory,
  captureTerritory,
  createInitialState,
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
  ownerCounts,
  startGame,
  territoryMilitaryPower,
  transferTroops,
  upgradeDefense,
} from './game'
import { getSavedAt, restoreGame, saveGame } from './persistence'
import { drawTerritoryCanvas, findTerritoryAtLngLat } from './territoryCanvas'
import type {
  AdminMapData,
  AiCount,
  AiFactionId,
  Difficulty,
  FactionId,
  GameState,
  TerritoryState,
} from './types'

const SOURCE_ID = 'admin-dongs'
const FILL_LAYER_ID = 'admin-dongs-fill'
const LINE_LAYER_ID = 'admin-dongs-line'

function ownerName(owner: FactionId, game: GameState): string {
  if (owner === 'player') return game.playerName
  if (owner === 'neutral') return factions.neutral.name
  return game.aiNames[owner]
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
          ['boolean', ['feature-state', 'frontline'], false],
          '#ffb65c',
          '#d6dee7',
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          3.6,
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
      const ownerKey = `${territory.owner}|${ownerColor(territory.owner, game)}`

      if (previousOwners.current[id] !== ownerKey) {
        map.setFeatureState(
          { source: SOURCE_ID, id },
          {
            owner: territory.owner,
            color: ownerColor(territory.owner, game),
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
  }, [game?.territories, game?.factionColors, layerReady])

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

    const interval = window.setInterval(() => {
      setGame((previous) => (previous ? advanceTick(previous) : previous))
    }, 1000 / game.speed)

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

    let playerDivisions = 0
    let playerFactories = 0
    let playerMilitaryPower = 0
    let playerSupply = 0
    let playerFrontlines = 0

    for (const territory of Object.values(game.territories)) {
      if (territory.owner !== 'player') continue
      playerDivisions += territory.divisions
      playerFactories += territory.factories
      playerMilitaryPower += territoryMilitaryPower(territory)
      playerSupply += territory.supply

      if (
        territory.neighbors.some(
          (neighborId) => game.territories[neighborId]?.owner !== 'player',
        )
      ) {
        playerFrontlines += 1
      }
    }

    const playerOwned = counts.player
    return {
      playerOwned,
      share: (playerOwned / total) * 100,
      playerDivisions,
      playerFactories,
      playerMilitaryPower,
      income: factionIncomePerCycle(game, 'player'),
      averageSupply:
        playerOwned > 0 ? Math.round(playerSupply / playerOwned) : 0,
      playerFrontlines,
    }
  }, [game?.territories, counts, total])

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

      const sourceId = previous.selectedId
      const source = sourceId ? previous.territories[sourceId] : null
      const target = previous.territories[targetId]

      if (
        previous.phase === 'running' &&
        source &&
        source.owner === 'player' &&
        target.owner !== 'player' &&
        source.neighbors.includes(targetId)
      ) {
        return captureTerritory(previous, source.id, targetId)
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
        (event.key === '1' || event.key === '2' || event.key === '4')
      ) {
        setGame((previous) =>
          previous
            ? { ...previous, speed: Number(event.key) as 1 | 2 | 4 }
            : previous,
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

        <div className="topbar">
          <div className="brand-block">
            <strong>WARGAME / KOREA</strong>
            <small>
              {game
                ? `행정동 ${total.toLocaleString()}개 · Tick ${game.tick}`
                : '데이터 준비 중'}
            </small>
          </div>

          <div className="map-toolbar">
            <button
              className={commandOpen ? 'active' : ''}
              onClick={() => setCommandOpen((open) => !open)}
            >
              지휘
            </button>
            {game?.phase === 'running' && (
              <button
                className={speedOpen ? 'active' : ''}
                onClick={() => setSpeedOpen((open) => !open)}
              >
                속도 ×{game.speed}
              </button>
            )}
            <button
              className={rulesOpen ? 'active' : ''}
              onClick={() => setRulesOpen((open) => !open)}
            >
              규칙
            </button>
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
                  previous ? { ...previous, running: !previous.running } : previous,
                )
              }
            >
              {game.running ? '일시정지' : '재개'}
            </button>
            {([1, 2, 4] as const).map((speed) => (
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

        {rulesOpen && (
          <section className="rules-panel">
            <div className="rules-head">
              <div>
                <p className="eyebrow">게임 규칙</p>
                <h2>지도에서 영토를 넓히면 됩니다.</h2>
              </div>
              <button onClick={() => setRulesOpen(false)}>닫기</button>
            </div>

            <div className="rules-steps">
              <div>
                <strong>1. 경제</strong>
                <span>
                  공장 1개는 {ECONOMY_INTERVAL}틱마다 자금 {FACTORY_INCOME}을 생산합니다.
                  자금으로 공장({FACTORY_COST}), 사단({DIVISION_COST}), 방어시설을 건설합니다.
                </span>
              </div>
              <div>
                <strong>2. 사단</strong>
                <span>
                  사단이 실제 공격력의 핵심입니다. 내 영토를 선택한 뒤 인접한 중립/적 영토를 클릭하면
                  보유 사단의 절반(올림)이 공격에 투입됩니다.
                </span>
              </div>
              <div>
                <strong>3. 방어</strong>
                <span>
                  방어 단계는 수비 전투력만 올립니다. 단계가 높아질수록 다음 강화 비용도 올라가며,
                  점령당하면 방어시설 일부가 손상됩니다.
                </span>
              </div>
              <div>
                <strong>4. 보급과 지원</strong>
                <span>
                  연결된 영토는 보급이 회복되고, 고립된 영토는 보급이 감소합니다.
                  인접 아군 영토끼리는 1개 사단씩 지원 이동할 수 있습니다.
                </span>
              </div>
              <div>
                <strong>5. 승리</strong>
                <span>
                  공장으로 경제를 키우고 사단과 방어를 배치해 전국 행정동을 모두 점령하면 승리합니다.
                  내 영토가 0개가 되면 패배합니다.
                </span>
              </div>
            </div>

            <p className="rules-tip">
              기본 조작: 지도 클릭 = 선택/공격 · Space = 정지/재개 · 1/2/4 = 배속 · F = 선택 지역 확대
            </p>
          </section>
        )}

        {game && counts && game.phase !== 'setup' && total > 0 && (
          <div className="situation-panel">
            <div className="situation-meta">
              <strong>전국 전황</strong>
              <span>
                {difficultyLabels[game.difficulty]} · AI {game.aiCount}개 · Tick {game.tick}
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
              <span>Space 일시정지 · 1/2/4 배속 · F 선택지역</span>
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
                            playerName: event.target.value || '플레이어 세력',
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
                                [id]: event.target.value || factions[id].name,
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
                      selected.factories >= MAX_FACTORIES ||
                      game.funds.player < FACTORY_COST
                    }
                    onClick={() =>
                      setGame((previous) =>
                        previous ? buildFactory(previous, selected.id) : previous,
                      )
                    }
                  >
                    <strong>공장 건설</strong>
                    <span>
                      비용 {FACTORY_COST} · 수익 +{FACTORY_INCOME}/{ECONOMY_INTERVAL}틱
                    </span>
                  </button>

                  <button
                    disabled={game.funds.player < DIVISION_COST}
                    onClick={() =>
                      setGame((previous) =>
                        previous ? buildDivision(previous, selected.id) : previous,
                      )
                    }
                  >
                    <strong>사단 편성</strong>
                    <span>비용 {DIVISION_COST} · 지역 사단 +1</span>
                  </button>

                  <button
                    disabled={
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
                        : `비용 ${defenseUpgradeCost(selected.defense)} · 방어 +1`}
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
                const canCapture =
                  game.phase === 'running' &&
                  selected.owner === 'player' &&
                  neighbor.owner !== 'player'
                const canSupport =
                  game.phase === 'running' &&
                  selected.owner === 'player' &&
                  neighbor.owner === 'player' &&
                  selected.divisions > 1

                return (
                  <div key={neighbor.id} className="neighbor-item">
                    <button
                      className={`neighbor-main ${canCapture ? 'capture' : ''}`}
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
                        {canCapture ? ' · 공격 가능' : ''}
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
                        1사단 지원
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
