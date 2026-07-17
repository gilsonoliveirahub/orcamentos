// Geocodificação aproximada (nível de distrito/cidade, nunca morada exata) e
// cálculo de distância — tudo determinístico, sem chamadas a serviços
// externos (sem chave de API, sem custo, sem latência de rede).
//
// "Aproximada" é uma decisão deliberada: o pedido é para mostrar distâncias
// aproximadas ("aproximadamente 18 km"), nunca a morada exata — uma tabela
// de coordenadas ao nível de cidade/distrito serve exatamente esse
// propósito, e evita depender de um serviço de geocodificação externo.

export type Coordinates = { lat: number; lng: number }

// Capitais de distrito de Portugal Continental + Açores/Madeira + grandes
// concelhos frequentemente usados como "zona". Coordenadas aproximadas do
// centro da cidade.
const PT_LOCALITIES: Record<string, Coordinates> = {
  'aveiro': { lat: 40.6405, lng: -8.6538 },
  'beja': { lat: 38.0150, lng: -7.8632 },
  'braga': { lat: 41.5454, lng: -8.4265 },
  'braganca': { lat: 41.8073, lng: -6.7575 },
  'castelo branco': { lat: 39.8222, lng: -7.4909 },
  'coimbra': { lat: 40.2033, lng: -8.4103 },
  'evora': { lat: 38.5667, lng: -7.9000 },
  'faro': { lat: 37.0194, lng: -7.9304 },
  'guarda': { lat: 40.5364, lng: -7.2683 },
  'leiria': { lat: 39.7436, lng: -8.8071 },
  'lisboa': { lat: 38.7223, lng: -9.1393 },
  'portalegre': { lat: 39.2967, lng: -7.4281 },
  'porto': { lat: 41.1579, lng: -8.6291 },
  'santarem': { lat: 39.2362, lng: -8.6857 },
  'setubal': { lat: 38.5244, lng: -8.8882 },
  'viana do castelo': { lat: 41.6932, lng: -8.8320 },
  'vila real': { lat: 41.3006, lng: -7.7441 },
  'viseu': { lat: 40.6566, lng: -7.9122 },
  'ponta delgada': { lat: 37.7412, lng: -25.6756 },
  'funchal': { lat: 32.6669, lng: -16.9241 },
  // Concelhos grandes que aparecem frequentemente como "zona" e não são
  // capital de distrito, mas têm coordenadas claramente distintas da capital.
  'cascais': { lat: 38.6979, lng: -9.4215 },
  'sintra': { lat: 38.8029, lng: -9.3817 },
  'oeiras': { lat: 38.6979, lng: -9.3078 },
  'amadora': { lat: 38.7536, lng: -9.2302 },
  'almada': { lat: 38.6790, lng: -9.1569 },
  'loures': { lat: 38.8298, lng: -9.1685 },
  'matosinhos': { lat: 41.1839, lng: -8.6912 },
  'vila nova de gaia': { lat: 41.1239, lng: -8.6118 },
  'gaia': { lat: 41.1239, lng: -8.6118 },
  'guimaraes': { lat: 41.4425, lng: -8.2918 },
  'barcelos': { lat: 41.5388, lng: -8.6151 },
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos (acentos) após normalização NFD
    .trim()
}

/**
 * Devolve coordenadas aproximadas para uma zona/localidade em texto livre,
 * ou null se a zona não for reconhecida (ex: "Outra / Toda Portugal", texto
 * vazio, ou uma localidade fora da tabela). Correspondência por inclusão em
 * qualquer direção, para aceitar "Lisboa e arredores" ou "Grande Porto".
 */
export function geocodeZone(zone: string | null | undefined): Coordinates | null {
  if (!zone) return null
  const normalized = normalize(zone)
  if (!normalized) return null

  if (PT_LOCALITIES[normalized]) return PT_LOCALITIES[normalized]

  // Correspondência por inclusão — a chave mais longa que aparecer primeiro
  // (evita que "porto" capture "vila nova de gaia" indevidamente, por exemplo)
  const matches = Object.keys(PT_LOCALITIES)
    .filter(key => normalized.includes(key) || key.includes(normalized))
    .sort((a, b) => b.length - a.length)

  return matches.length > 0 ? PT_LOCALITIES[matches[0]] : null
}

const EARTH_RADIUS_KM = 6371

/** Distância em linha reta (Haversine), em quilómetros. */
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Distância entre dois pontos, ou null se qualquer um dos dois não tiver
 * coordenadas — nunca inventa uma distância quando falta informação.
 */
export function computeDistanceKm(a: Coordinates | null, b: Coordinates | null): number | null {
  if (!a || !b) return null
  return haversineDistanceKm(a, b)
}

/** Arredonda para apresentação: "aproximadamente 18 km". */
export function formatDistanceKm(km: number): string {
  return `aproximadamente ${Math.round(km)} km`
}
