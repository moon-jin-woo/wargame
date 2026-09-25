import type { AdminMapData, TerritoryState } from './types'

type AdmFeatureCollection = AdminMapData['collection']

interface PreparedTerritories {
  version: string
  territories: Record<string, TerritoryState>
}

export async function loadLatestAdminDongs(): Promise<AdminMapData> {
  const base = import.meta.env.BASE_URL
  const [mapResponse, gameResponse] = await Promise.all([
    fetch(`${base}data/admin-dongs.geojson`, { cache: 'no-cache' }),
    fetch(`${base}data/admin-territories.json`, { cache: 'no-cache' }),
  ])

  if (!mapResponse.ok) {
    throw new Error(
      `행정동 지도 데이터 로딩 실패: ${mapResponse.status} ${mapResponse.statusText}`,
    )
  }

  if (!gameResponse.ok) {
    throw new Error(
      `행정동 게임 데이터 로딩 실패: ${gameResponse.status} ${gameResponse.statusText}`,
    )
  }

  const collection = (await mapResponse.json()) as AdmFeatureCollection
  const prepared = (await gameResponse.json()) as PreparedTerritories

  if (
    !collection ||
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    collection.features.length < 1000
  ) {
    throw new Error('행정동 GeoJSON 형식이 올바르지 않습니다.')
  }

  if (
    !prepared ||
    typeof prepared.version !== 'string' ||
    !prepared.territories ||
    Object.keys(prepared.territories).length < 1000
  ) {
    throw new Error('행정동 게임 데이터 형식이 올바르지 않습니다.')
  }

  return {
    version: prepared.version,
    collection,
    territories: prepared.territories,
  }
}
