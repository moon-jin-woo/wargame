import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { loadLatestAdminDongs } from './adminData'
import {
  advanceTick,
  captureTerritory,
  createInitialState,
  difficultyLabels,
  factions,
  ownerCounts,
  startGame,
} from './game'
import { getSavedAt, restoreGame, saveGame } from './persistence'
import type {
  AdminMapData,
  AiCount,
  Difficulty,
  FactionId,
  GameState,
  TerritoryState,
} from './types'

const SOURCE_ID = 'admin-dongs'
const FILL_LAYER_ID = 'admin-dongs-fill'
const LINE_LAYER_ID = 'admin-dongs-line'
const LABEL_LAYER_ID = 'admin-dongs-label'

function ownerName(owner: FactionId, game: GameState): string {
  return owner === 'player' ? game.playerName : factions[owner].name
}

function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const previousTerritories = useRef<Record<string, TerritoryState>>({})
  const previousSelected = useRef<string | null>(null)
  const previousFrontlines = useRef<Record<string, boolean>>({})

  const [mapLoaded, setMapLoaded] = useState(false)
  const [layerReady, setLayerReady] = useState(false)
  const [adminData, setAdminData] = useState<AdminMapData | null>(null)
  const [game, setGame] = useState<GameState | null>(null)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(() => getSavedAt())

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-base',
            type: 'raster',
            source: 'osm',
            paint: {
              'raster-saturation': -0.55,
              'raster-brightness-min': 0.12,
              'raster-brightness-max': 0.72,
              'raster-contrast': 0.18,
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
    map.once('load', () => setMapLoaded(true))
    mapRef.current = map

    return () => {
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
    })

    map.addLayer({
      id: FILL_LAYER_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': [
          'match',
          ['feature-state', 'owner'],
          'player',
          factions.player.color,
          'red',
          factions.red.color,
          'blue',
          factions.blue.color,
          'green',
          factions.green.color,
          factions.neutral.color,
        ],
        'fill-opacity': [
          'case',
          ['==', ['feature-state', 'owner'], 'neutral'],
          0.2,
          0.48,
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
          '#d9a05a',
          '#26313d',
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          2.8,
          ['boolean', ['feature-state', 'frontline'], false],
          1.35,
          0.65,
        ],
        'line-opacity': 0.9,
      },
    })

    map.addLayer({
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      minzoom: 8.7,
      layout: {
        'text-field': ['get', 'emdnm'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8.7,
          9,
          11,
          12,
        ],
        'text-font': ['Open Sans Regular'],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#e8eef5',
        'text-halo-color': '#111820',
        'text-halo-width': 1.2,
        'text-halo-blur': 0.4,
      },
    })

    const clickHandler = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.gameId
      if (!id) return
      setGame((previous) => (previous ? { ...previous, selectedId: String(id) } : previous))
    }

    const enterHandler = () => {
      map.getCanvas().style.cursor = 'pointer'
    }

    const leaveHandler = () => {
      map.getCanvas().style.cursor = ''
    }

    map.on('click', FILL_LAYER_ID, clickHandler)
    map.on('mouseenter', FILL_LAYER_ID, enterHandler)
    map.on('mouseleave', FILL_LAYER_ID, leaveHandler)

    previousTerritories.current = {}
    previousFrontlines.current = {}
    previousSelected.current = null
    setLayerReady(true)

    return () => {
      map.off('click', FILL_LAYER_ID, clickHandler)
      map.off('mouseenter', FILL_LAYER_ID, enterHandler)
      map.off('mouseleave', FILL_LAYER_ID, leaveHandler)
    }
  }, [adminData, mapLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady || !game) return

    for (const [id, territory] of Object.entries(game.territories)) {
      if (previousTerritories.current[id] !== territory) {
        map.setFeatureState(
          { source: SOURCE_ID, id },
          {
            owner: territory.owner,
            troops: territory.troops,
            supply: territory.supply,
          },
        )
      }

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

    previousTerritories.current = game.territories
  }, [game?.territories, layerReady])

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

  const counts = useMemo(() => (game ? ownerCounts(game) : null), [game])
  const total = game ? Object.keys(game.territories).length : 0

  const nationalStats = useMemo(() => {
    if (!game || !counts || total === 0) return null

    let playerTroops = 0
    let playerSupply = 0
    let playerFrontlines = 0

    for (const territory of Object.values(game.territories)) {
      if (territory.owner !== 'player') continue
      playerTroops += territory.troops
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
      playerTroops: Math.round(playerTroops),
      averageSupply:
        playerOwned > 0 ? Math.round(playerSupply / playerOwned) : 0,
      playerFrontlines,
    }
  }, [game, counts, total])

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

        <div className="topbar">
          <div className="brand-block">
            <strong>WARGAME / KOREA</strong>
            <small>
              {game ? `행정동 ${total.toLocaleString()}개 · 데이터 ${game.dataVersion}` : '데이터 준비 중'}
            </small>
          </div>

          {game?.phase === 'running' && (
            <>
              <span className="tick">Tick {game.tick}</span>
              <button
                title="일시정지/재개 · Space"
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
                  title={`게임 속도 ×${speed} · 숫자 ${speed}`}
                  className={game.speed === speed ? 'active' : ''}
                  onClick={() =>
                    setGame((previous) => (previous ? { ...previous, speed } : previous))
                  }
                >
                  ×{speed}
                </button>
              ))}
            </>
          )}

          {game && (
            <>
              <button disabled={game.phase === 'setup'} onClick={handleSave}>
                저장
              </button>
              <button disabled={!savedAt} onClick={handleLoad}>
                불러오기
              </button>
            </>
          )}

          {game && game.phase !== 'setup' && (
            <button onClick={handleNewGame}>새 게임</button>
          )}
        </div>

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
                      background: factions[id].color,
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {!game && !loadingError && (
          <div className="loading-card">
            <strong>전국 행정동 경계 불러오는 중</strong>
            <span>첫 로딩에서는 경계 데이터 다운로드와 인접성 계산이 진행됩니다.</span>
          </div>
        )}

        {loadingError && (
          <div className="loading-card error">
            <strong>데이터 로딩 실패</strong>
            <span>{loadingError}</span>
          </div>
        )}
      </section>

      <aside className="sidebar">
        <header>
          <p className="eyebrow">전국 영역 통제</p>
          <h1>행정동 RTS</h1>
          <p className="muted">
            실제 행정동 경계를 게임 영토로 사용합니다. 게임 수치는 현실의 군사 자료가 아닌 추상화된 값입니다.
          </p>
        </header>

        {game && counts && (
          <div className="faction-grid">
            {(Object.keys(factions) as FactionId[]).map((id) => (
              <div key={id}>
                <i style={{ background: factions[id].color }} />
                <span>{id === 'player' ? game.playerName : factions[id].name}</span>
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
                <span>병력 지수 합계</span>
                <strong>{nationalStats.playerTroops.toLocaleString()}</strong>
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
            <label>
              세력명
              <input
                value={game.playerName}
                maxLength={24}
                onChange={(event) =>
                  setGame((previous) =>
                    previous ? { ...previous, playerName: event.target.value || '플레이어 세력' } : previous,
                  )
                }
              />
            </label>

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
                setGame((previous) => (previous ? startGame(previous, selected.id) : previous))
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
                style={{ borderColor: factions[selected.owner].color }}
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

            <div className="metric-grid">
              <div>
                <span>병력 지수</span>
                <strong>{Math.round(selected.troops)}</strong>
              </div>
              <div>
                <span>보급 지수</span>
                <strong>{Math.round(selected.supply)}%</strong>
              </div>
              <div>
                <span>인접 지역</span>
                <strong>{selected.neighbors.length}</strong>
              </div>
            </div>

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

                return (
                  <button
                    key={neighbor.id}
                    className={canCapture ? 'capture' : ''}
                    onClick={() => {
                      if (canCapture) {
                        setGame((previous) =>
                          previous
                            ? captureTerritory(previous, selected.id, neighbor.id)
                            : previous,
                        )
                      } else {
                        setGame((previous) =>
                          previous ? { ...previous, selectedId: neighbor.id } : previous,
                        )
                      }
                    }}
                  >
                    <span>{neighbor.name}</span>
                    <small>
                      {ownerName(neighbor.owner, game)} · {Math.round(neighbor.troops)}
                      {canCapture ? ' · 점령 시도' : ''}
                    </small>
                  </button>
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
