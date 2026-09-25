import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { advanceTick, attack, createInitialState, factions } from './game'
import type { GameState } from './types'

const points: Record<string, [number, number]> = {
  seoul: [126.978, 37.5665],
  incheon: [126.7052, 37.4563],
  suwon: [127.0286, 37.2636],
  daejeon: [127.3845, 36.3504],
  daegu: [128.6014, 35.8714],
  gwangju: [126.8526, 35.1595],
  busan: [129.0756, 35.1796],
}

function App() {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Record<string, maplibregl.Marker>>({})
  const [game, setGame] = useState<GameState>(() => createInitialState())

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [127.7, 36.25],
      zoom: 6.25,
      minZoom: 5.6,
      maxZoom: 12,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    mapRef.current = map

    return () => {
      Object.values(markersRef.current).forEach((marker) => marker.remove())
      markersRef.current = {}
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    Object.values(markersRef.current).forEach((marker) => marker.remove())
    markersRef.current = {}

    for (const [id, dong] of Object.entries(game.dongs)) {
      const coords = points[id]
      if (!coords) continue

      const el = document.createElement('button')
      el.className = 'territory-marker'
      el.style.setProperty('--faction-color', factions[dong.owner].color)
      el.textContent = String(Math.round(dong.troops))
      el.title = dong.name
      el.onclick = () => setGame((prev) => ({ ...prev, selectedDongId: id }))

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map)

      markersRef.current[id] = marker
    }
  }, [game.dongs])

  useEffect(() => {
    if (!game.running) return

    const interval = window.setInterval(() => {
      setGame((prev) => advanceTick(prev))
    }, 1000 / game.speed)

    return () => window.clearInterval(interval)
  }, [game.running, game.speed])

  const selected = game.selectedDongId ? game.dongs[game.selectedDongId] : null
  const playerNeighbors = useMemo(() => {
    if (!selected) return []
    return selected.neighbors
      .map((id) => game.dongs[id])
      .filter(Boolean)
  }, [selected, game.dongs])

  const playerOwned = Object.values(game.dongs).filter((dong) => dong.owner === 'player').length
  const victory = playerOwned === Object.keys(game.dongs).length

  return (
    <main className="app-shell">
      <section className="map-panel">
        <div ref={mapContainer} className="map" />
        <div className="topbar">
          <strong>WARGAME / KOREA</strong>
          <span>Tick {game.tick}</span>
          <button onClick={() => setGame((prev) => ({ ...prev, running: !prev.running }))}>
            {game.running ? '일시정지' : '재개'}
          </button>
          {[1, 2, 4].map((speed) => (
            <button
              key={speed}
              className={game.speed === speed ? 'active' : ''}
              onClick={() => setGame((prev) => ({ ...prev, speed: speed as 1 | 2 | 4 }))}
            >
              ×{speed}
            </button>
          ))}
        </div>
      </section>

      <aside className="sidebar">
        <header>
          <p className="eyebrow">전국전선 통제</p>
          <h1>행정동 RTS 프로토타입</h1>
          <p className="muted">
            현재는 행정동 GeoJSON 연결 전 단계입니다. 지도/게임 루프를 먼저 검증하기 위해 주요 권역을 임시 노드로 사용합니다.
          </p>
        </header>

        <div className="status-grid">
          <div><span>점령</span><strong>{playerOwned}/{Object.keys(game.dongs).length}</strong></div>
          <div><span>게임 속도</span><strong>×{game.speed}</strong></div>
        </div>

        {victory && <div className="victory">전국 점령 완료</div>}

        {selected ? (
          <section className="card">
            <div className="row">
              <h2>{selected.name}</h2>
              <span className="badge" style={{ borderColor: factions[selected.owner].color }}>
                {factions[selected.owner].name}
              </span>
            </div>
            <dl>
              <div><dt>병력</dt><dd>{Math.round(selected.troops)}</dd></div>
              <div><dt>보급</dt><dd>{Math.round(selected.supply)}%</dd></div>
            </dl>

            <h3>인접 지역</h3>
            <div className="neighbor-list">
              {playerNeighbors.map((neighbor) => (
                <button
                  key={neighbor.id}
                  onClick={() => {
                    if (selected.owner === 'player' && neighbor.owner !== 'player') {
                      setGame((prev) => attack(prev, selected.id, neighbor.id))
                    } else {
                      setGame((prev) => ({ ...prev, selectedDongId: neighbor.id }))
                    }
                  }}
                >
                  <span>{neighbor.name}</span>
                  <small>{factions[neighbor.owner].name} · {Math.round(neighbor.troops)}</small>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <p>지도에서 지역을 선택하세요.</p>
        )}

        <section className="card">
          <h3>다음 구현</h3>
          <p className="muted">
            실제 전국 행정동 경계 GeoJSON, 경계 기반 인접성 계산, 행정동별 점령 색상, AI 공격 루프, 도로 기반 보급 시스템을 연결할 예정입니다.
          </p>
        </section>
      </aside>
    </main>
  )
}

export default App