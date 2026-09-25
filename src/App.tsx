import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { loadLatestAdminDongs } from './adminData'
import {
  advanceTick,
  captureTerritory,
  createInitialState,
  factions,
  ownerCounts,
  startGame,
} from './game'
import { getSavedAt, restoreGame, saveGame } from './persistence'
import type { AdminMapData, FactionId, GameState, TerritoryState } from './types'

const SOURCE_ID = 'admin-dongs'
const FILL_LAYER_ID = 'admin-dongs-fill'
const LINE_LAYER_ID = 'admin-dongs-line'

function ownerName(owner: FactionId, game: GameState): string {
  return owner === 'player' ? game.playerName : factions[owner].name
}

function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const previousTerritories = useRef<Record<string, TerritoryState>>({})
  const previousSelected = useRef<string | null>(null)

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
          '#26313d',
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          2.8,
          0.65,
        ],
        'line-opacity': 0.9,
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
      if (previousTerritories.current[id] === territory) continue

      map.setFeatureState(
        { source: SOURCE_ID, id },
        {
          owner: territory.owner,
          troops: territory.troops,
          supply: territory.supply,
        },
      )
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

  const focusSelected = () => {
    if (!selected || !mapRef.current) return
    mapRef.current.easeTo({
      center: selected.centroid,
      zoom: Math.max(mapRef.current.getZoom(), 9),
      duration: 500,
    })
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
        </div>

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
            <p className="muted">
              지도에서 원하는 행정동을 고른 뒤 시작하세요. AI 세력은 선택한 지역과 서로 멀리 떨어진 곳에 자동 배치됩니다.
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
          </div>
        )}

        {game?.phase === 'defeat' && (
          <div className="result-card defeat">
            <strong>세력 소멸</strong>
            <span>플레이어가 보유한 행정동이 없습니다.</span>
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
