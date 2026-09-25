import type { AdminMapData, TerritoryState } from './types'

type Position = [number, number]
type LinearRing = Position[]
type PolygonCoordinates = LinearRing[]
type MultiPolygonCoordinates = PolygonCoordinates[]

type AdmFeature = {
  type: 'Feature'
  id?: string | number
  properties: Record<string, unknown>
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: PolygonCoordinates | MultiPolygonCoordinates
  }
}

type AdmFeatureCollection = {
  type: 'FeatureCollection'
  features: AdmFeature[]
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function territoryId(feature: AdmFeature, index: number): string {
  const p = feature.properties
  return (
    stringValue(p.emdcd) ||
    stringValue(p.emd8) ||
    stringValue(p.emd7) ||
    `${stringValue(p.sggcd)}:${stringValue(p.emdnm)}:${index}`
  )
}

function rings(feature: AdmFeature): LinearRing[] {
  if (feature.geometry.type === 'Polygon') {
    return feature.geometry.coordinates as PolygonCoordinates
  }

  return (feature.geometry.coordinates as MultiPolygonCoordinates).flat()
}

function roundedPoint(point: Position): string {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`
}

function segmentKey(a: Position, b: Position): string {
  const aa = roundedPoint(a)
  const bb = roundedPoint(b)
  return aa < bb ? `${aa}|${bb}` : `${bb}|${aa}`
}

function approximateCentroid(feature: AdmFeature): Position {
  let x = 0
  let y = 0
  let count = 0

  for (const ring of rings(feature)) {
    for (const point of ring) {
      x += point[0]
      y += point[1]
      count += 1
    }
  }

  if (count === 0) return [127.7, 36.25]
  return [x / count, y / count]
}

function distanceSquared(a: Position, b: Position): number {
  const latScale = Math.cos(((a[1] + b[1]) * Math.PI) / 360)
  const dx = (a[0] - b[0]) * latScale
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function connectedComponents(adjacency: Map<string, Set<string>>): string[][] {
  const seen = new Set<string>()
  const result: string[][] = []

  for (const id of adjacency.keys()) {
    if (seen.has(id)) continue

    const stack = [id]
    const component: string[] = []
    seen.add(id)

    while (stack.length > 0) {
      const current = stack.pop()!
      component.push(current)

      for (const neighbor of adjacency.get(current) ?? []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        stack.push(neighbor)
      }
    }

    result.push(component)
  }

  return result.sort((a, b) => b.length - a.length)
}

function stitchDisconnectedAreas(
  adjacency: Map<string, Set<string>>,
  centroids: Map<string, Position>,
): void {
  const components = connectedComponents(adjacency)
  if (components.length <= 1) return

  const mainland = components[0]

  for (const component of components.slice(1)) {
    let bestA = component[0]
    let bestB = mainland[0]
    let bestDistance = Number.POSITIVE_INFINITY

    for (const a of component) {
      const ca = centroids.get(a)
      if (!ca) continue

      for (const b of mainland) {
        const cb = centroids.get(b)
        if (!cb) continue

        const distance = distanceSquared(ca, cb)
        if (distance < bestDistance) {
          bestDistance = distance
          bestA = a
          bestB = b
        }
      }
    }

    adjacency.get(bestA)?.add(bestB)
    adjacency.get(bestB)?.add(bestA)
    mainland.push(...component)
  }
}

function buildAdjacency(
  features: AdmFeature[],
  ids: string[],
  centroids: Map<string, Position>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  const firstSegmentOwner = new Map<string, string>()

  ids.forEach((id) => adjacency.set(id, new Set()))

  features.forEach((feature, index) => {
    const id = ids[index]

    for (const ring of rings(feature)) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const key = segmentKey(ring[i], ring[i + 1])
        const other = firstSegmentOwner.get(key)

        if (other && other !== id) {
          adjacency.get(id)?.add(other)
          adjacency.get(other)?.add(id)
        } else if (!other) {
          firstSegmentOwner.set(key, id)
        }
      }
    }
  })

  stitchDisconnectedAreas(adjacency, centroids)
  return adjacency
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export async function loadLatestAdminDongs(): Promise<AdminMapData> {
  const base = import.meta.env.BASE_URL
  const [dataResponse, metaResponse] = await Promise.all([
    fetch(`${base}data/admin-dongs.geojson`, { cache: 'no-cache' }),
    fetch(`${base}data/admin-dongs-meta.json`, { cache: 'no-cache' }),
  ])

  if (!dataResponse.ok) {
    throw new Error(
      `행정동 지도 데이터 로딩 실패: ${dataResponse.status} ${dataResponse.statusText}`,
    )
  }

  if (!metaResponse.ok) {
    throw new Error(
      `행정동 메타데이터 로딩 실패: ${metaResponse.status} ${metaResponse.statusText}`,
    )
  }

  const raw = (await dataResponse.json()) as AdmFeatureCollection
  const meta = (await metaResponse.json()) as {
    version?: string
    featureCount?: number
  }
  const version = meta.version || 'unknown'

  if (!raw || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    throw new Error('행정동 GeoJSON 형식이 올바르지 않습니다.')
  }

  const usable = raw.features.filter(
    (feature) =>
      feature.geometry &&
      (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'),
  )

  const ids = usable.map(territoryId)
  const centroids = new Map<string, Position>()

  usable.forEach((feature, index) => {
    centroids.set(ids[index], approximateCentroid(feature))
  })

  const adjacency = buildAdjacency(usable, ids, centroids)
  const territories: Record<string, TerritoryState> = {}

  const features = usable.map((feature, index) => {
    const id = ids[index]
    const p = feature.properties
    const emdnm = stringValue(p.emdnm) || '이름 없는 행정동'
    const sggnm = stringValue(p.sggnm)
    const sidonm = stringValue(p.sidonm)
    const baseTroops = 18 + (hashString(id) % 18)

    territories[id] = {
      id,
      name: emdnm,
      fullName: [sidonm, sggnm, emdnm].filter(Boolean).join(' '),
      sidoName: sidonm,
      sggName: sggnm,
      owner: 'neutral',
      troops: baseTroops,
      supply: 55,
      neighbors: Array.from(adjacency.get(id) ?? []).sort(),
      centroid: centroids.get(id) ?? [127.7, 36.25],
    }

    return {
      ...feature,
      id,
      properties: {
        ...feature.properties,
        gameId: id,
      },
    }
  })

  return {
    version,
    collection: {
      type: 'FeatureCollection',
      features,
    },
    territories,
  }
}
