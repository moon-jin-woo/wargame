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

const features = raw.features
  .filter(
    (feature) =>
      feature?.geometry &&
      (feature.geometry.type === 'Polygon' ||
        feature.geometry.type === 'MultiPolygon') &&
      Array.isArray(feature.geometry.coordinates),
  )
  .map((feature) => {
    const p = feature.properties ?? {}

    return {
      type: 'Feature',
      properties: {
        emdcd: asString(p.emdcd),
        emd8: asString(p.emd8),
        emd7: asString(p.emd7),
        emdnm: asString(p.emdnm),
        sggcd: asString(p.sggcd),
        sggnm: asString(p.sggnm),
        sidonm: asString(p.sidonm),
      },
      geometry: feature.geometry,
    }
  })

if (features.length < 1000) {
  throw new Error(
    `Administrative data validation failed: only ${features.length} polygon features`,
  )
}

const sample = features[0]?.geometry?.coordinates
if (!Array.isArray(sample)) {
  throw new Error('Administrative geometry validation failed')
}

await mkdir(outDir, { recursive: true })
await writeFile(
  new URL('admin-dongs.geojson', outDir),
  JSON.stringify(
    {
      type: 'FeatureCollection',
      features,
    },
    jsonReplacer,
  ),
)
await writeFile(
  new URL('admin-dongs-meta.json', outDir),
  JSON.stringify({ version, featureCount: features.length }),
)

console.log(`Prepared ${features.length} administrative territories`)
