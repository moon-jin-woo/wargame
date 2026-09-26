import type { AdminMapData, TerritoryState } from './types'

interface PreparedTerritories {
  version: string
  territories: Record<string, TerritoryState>
}

type AdminFeatureCollection = AdminMapData['collection']

function firstCoordinate(coordinates: unknown): [number, number] | null {
  let current: unknown = coordinates

  while (Array.isArray(current) && Array.isArray(current[0])) {
    current = current[0]
  }

  if (
    Array.isArray(current) &&
    typeof current[0] === 'number' &&
    typeof current[1] === 'number'
  ) {
    return [current[0], current[1]]
  }

  return null
}

export async function loadLatestAdminDongs(): Promise<AdminMapData> {
  const base = import.meta.env.BASE_URL

  const [geoResponse, gameResponse] = await Promise.all([
    fetch(`${base}data/admin-dongs.geojson`, { cache: 'no-cache' }),
    fetch(`${base}data/admin-territories.json`, { cache: 'no-cache' }),
  ])

  if (!geoResponse.ok) {
    throw new Error(
      `행정동 지도 데이터 로딩 실패: ${geoResponse.status} ${geoResponse.statusText}`,
    )
  }

  if (!gameResponse.ok) {
    throw new Error(
      `행정동 게임 데이터 로딩 실패: ${gameResponse.status} ${gameResponse.statusText}`,
    )
  }

  const [collection, prepared] = (await Promise.all([
    geoResponse.json(),
    gameResponse.json(),
  ])) as [AdminFeatureCollection, PreparedTerritories]

  if (
    !prepared ||
    typeof prepared.version !== 'string' ||
    !prepared.territories ||
    Object.keys(prepared.territories).length < 1000
  ) {
    throw new Error('행정동 게임 데이터 형식이 올바르지 않습니다.')
  }

  if (
    !collection ||
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    collection.features.length < 1000
  ) {
    throw new Error('행정동 지도 GeoJSON 형식이 올바르지 않습니다.')
  }

  const sample = collection.features[0]
  const sampleId = String(sample?.properties?.gameId ?? sample?.id ?? '')
  const coordinate = sample ? firstCoordinate(sample.geometry.coordinates) : null

  if (
    !sample ||
    !sampleId ||
    !prepared.territories[sampleId] ||
    !coordinate ||
    coordinate[0] < 123 ||
    coordinate[0] > 132 ||
    coordinate[1] < 31 ||
    coordinate[1] > 40
  ) {
    throw new Error(
      '행정동 지도 ID 또는 좌표 검증에 실패했습니다. 새로고침 후 다시 시도해 주세요.',
    )
  }

  if (
    Math.abs(
      collection.features.length - Object.keys(prepared.territories).length,
    ) > 5
  ) {
    throw new Error('행정동 지도와 게임 데이터 개수가 일치하지 않습니다.')
  }

  return {
    version: prepared.version,
    collection,
    territories: prepared.territories,
  }
}
