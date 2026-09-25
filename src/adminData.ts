import type { AdminMapData, TerritoryState } from './types'

interface PreparedTerritories {
  version: string
  territories: Record<string, TerritoryState>
}

export async function loadLatestAdminDongs(): Promise<AdminMapData> {
  const base = import.meta.env.BASE_URL
  const geojsonUrl = `${base}data/admin-dongs.geojson`
  const gameResponse = await fetch(
    `${base}data/admin-territories.json`,
    { cache: 'no-cache' },
  )

  if (!gameResponse.ok) {
    throw new Error(
      `행정동 게임 데이터 로딩 실패: ${gameResponse.status} ${gameResponse.statusText}`,
    )
  }

  const prepared = (await gameResponse.json()) as PreparedTerritories

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
    geojsonUrl,
    territories: prepared.territories,
  }
}
