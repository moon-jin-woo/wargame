import { mkdir, writeFile } from 'node:fs/promises'
import * as adk from 'admdongkor'

const outDir = new URL('../public/data/', import.meta.url)

function asString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function jsonReplacer(_key, value) {
  return typeof value === 'bigint' ? String(value) : value
}

function rings(feature) {
  return feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat()
}

function roundedPoint(point) {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`
}

function segmentKey(a, b) {
  const aa = roundedPoint(a)
  const bb = roundedPoint(b)
  return aa < bb ? `${aa}|${bb}` : `${bb}|${aa}`
}

function centroid(feature) {
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

  return count > 0 ? [x / count, y / count] : [127.7, 36.25]
}

function distanceSquared(a, b) {
  const latScale = Math.cos(((a[1] + b[1]) * Math.PI) / 360)
  const dx = (a[0] - b[0]) * latScale
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function connectedComponents(adjacency) {
  const seen = new Set()
  const result = []

  for (const id of adjacency.keys()) {
    if (seen.has(id)) continue

    const stack = [id]
    const component = []
    seen.add(id)

    while (stack.length > 0) {
      const current = stack.pop()
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

function stitchDisconnectedAreas(adjacency, centroids) {
  const components = connectedComponents(adjacency)
  if (components.length <= 1) return components.length

  const mainland = [...components[0]]

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

  return components.length
}

function hashString(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const versions = adk.versions()
const version = versions.at(-1)

if (!version) {
  throw new Error('admdongkor returned no versions')
}

console.log(`Preparing administrative dong data: ${version}`)

const raw = await adk.get(version, 'emd', { detail: false })

if (!raw || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
  throw new Error('Invalid administrative FeatureCollection')
}

const sourceFeatures = raw.features.filter(
  (feature) =>
    feature?.geometry &&
    (feature.geometry.type === 'Polygon' ||
      feature.geometry.type === 'MultiPolygon') &&
    Array.isArray(feature.geometry.coordinates),
)

if (sourceFeatures.length < 1000) {
  throw new Error(
    `Administrative data validation failed: only ${sourceFeatures.length} polygon features`,
  )
}

const ids = sourceFeatures.map((feature, index) => {
  const p = feature.properties ?? {}
  return (
    asString(p.emdcd) ||
    asString(p.emd8) ||
    asString(p.emd7) ||
    `${asString(p.sggcd)}:${asString(p.emdnm)}:${index}`
  )
})

const centroids = new Map()
sourceFeatures.forEach((feature, index) => {
  centroids.set(ids[index], centroid(feature))
})

const adjacency = new Map()
const segmentOwners = new Map()
ids.forEach((id) => adjacency.set(id, new Set()))

let segmentCount = 0
let sharedSegmentCount = 0

sourceFeatures.forEach((feature, index) => {
  const id = ids[index]

  for (const ring of rings(feature)) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      segmentCount += 1
      const key = segmentKey(ring[i], ring[i + 1])
      const other = segmentOwners.get(key)

      if (other && other !== id) {
        adjacency.get(id)?.add(other)
        adjacency.get(other)?.add(id)
        sharedSegmentCount += 1
      } else if (!other) {
        segmentOwners.set(key, id)
      }
    }
  }
})

const componentsBeforeStitch = stitchDisconnectedAreas(adjacency, centroids)
const territories = {}

const features = sourceFeatures.map((feature, index) => {
  const p = feature.properties ?? {}
  const id = ids[index]
  const emdnm = asString(p.emdnm) || '이름 없는 행정동'
  const sggnm = asString(p.sggnm)
  const sidonm = asString(p.sidonm)
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
    type: 'Feature',
    id,
    properties: {
      gameId: id,
      emdcd: asString(p.emdcd),
      emd8: asString(p.emd8),
      emd7: asString(p.emd7),
      emdnm,
      sggcd: asString(p.sggcd),
      sggnm,
      sidonm,
    },
    geometry: feature.geometry,
  }
})

function firstPosition(coordinates) {
  let current = coordinates

  while (Array.isArray(current) && Array.isArray(current[0])) {
    current = current[0]
  }

  return current
}

const sample = features[0]
const firstCoordinate = sample
  ? firstPosition(sample.geometry.coordinates)
  : null

if (
  !sample ||
  !sample.id ||
  !Array.isArray(firstCoordinate) ||
  typeof firstCoordinate[0] !== 'number' ||
  typeof firstCoordinate[1] !== 'number'
) {
  throw new Error('Prepared administrative GeoJSON validation failed')
}

await mkdir(outDir, { recursive: true })

await Promise.all([
  writeFile(
    new URL('admin-dongs.geojson', outDir),
    JSON.stringify(
      {
        type: 'FeatureCollection',
        features,
      },
      jsonReplacer,
    ),
  ),
  writeFile(
    new URL('admin-territories.json', outDir),
    JSON.stringify({ version, territories }, jsonReplacer),
  ),
  writeFile(
    new URL('admin-dongs-meta.json', outDir),
    JSON.stringify({
      version,
      featureCount: features.length,
      segmentCount,
      sharedSegmentCount,
      componentsBeforeStitch,
    }),
  ),
])

console.log(
  `Prepared ${features.length} territories, ${segmentCount} segments, ${componentsBeforeStitch} components`,
)
