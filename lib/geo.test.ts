import { describe, it, expect } from 'vitest'
import { geocodeZone, haversineDistanceKm, computeDistanceKm, formatDistanceKm } from './geo'

describe('geocodeZone', () => {
  it('resolves known Portuguese localities, case/accent-insensitive', () => {
    expect(geocodeZone('Lisboa')).toEqual({ lat: 38.7223, lng: -9.1393 })
    expect(geocodeZone('LISBOA')).toEqual({ lat: 38.7223, lng: -9.1393 })
    expect(geocodeZone('lisboa')).toEqual({ lat: 38.7223, lng: -9.1393 })
    expect(geocodeZone('Évora')).toEqual({ lat: 38.5667, lng: -7.9000 })
  })

  it('matches by inclusion for free-text zones like "Lisboa e arredores"', () => {
    expect(geocodeZone('Lisboa e arredores')).toEqual({ lat: 38.7223, lng: -9.1393 })
    expect(geocodeZone('Grande Porto')).toEqual({ lat: 41.1579, lng: -8.6291 })
  })

  it('returns null for unrecognized zones, never guesses', () => {
    expect(geocodeZone('Outra / Toda Portugal')).toBeNull()
    expect(geocodeZone('Nárnia')).toBeNull()
    expect(geocodeZone('')).toBeNull()
    expect(geocodeZone(null)).toBeNull()
    expect(geocodeZone(undefined)).toBeNull()
  })

  it('prefers the more specific (longer) match to avoid false positives', () => {
    // "Porto" não deve capturar "Vila Nova de Gaia" nem vice-versa
    expect(geocodeZone('Vila Nova de Gaia')).toEqual({ lat: 41.1239, lng: -8.6118 })
  })

  it('resolves real-world multi-area free text (várias zonas separadas por vírgula)', () => {
    // Formato real de produção — confirma que "zona" como texto livre já
    // representa várias áreas servidas sem precisar de estrutura nova.
    expect(geocodeZone('Lisboa, Margem Sul e Arredores')).toEqual({ lat: 38.7223, lng: -9.1393 })
    expect(geocodeZone('Cascais, Sintra e Oeiras')).not.toBeNull()
  })
})

describe('haversineDistanceKm', () => {
  it('is zero for the same point', () => {
    const point = { lat: 38.7223, lng: -9.1393 }
    expect(haversineDistanceKm(point, point)).toBeCloseTo(0, 5)
  })

  it('is symmetric', () => {
    const a = { lat: 38.7223, lng: -9.1393 }
    const b = { lat: 41.1579, lng: -8.6291 }
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 8)
  })

  it('matches the expected distance for 1 degree of latitude (~111.19km)', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 1, lng: 0 }
    expect(haversineDistanceKm(a, b)).toBeCloseTo(111.19, 0)
  })
})

describe('computeDistanceKm', () => {
  it('returns null when either point is missing — never invents a distance', () => {
    const point = { lat: 38.7223, lng: -9.1393 }
    expect(computeDistanceKm(null, point)).toBeNull()
    expect(computeDistanceKm(point, null)).toBeNull()
    expect(computeDistanceKm(null, null)).toBeNull()
  })

  it('returns the distance when both points are present', () => {
    const a = { lat: 38.7223, lng: -9.1393 }
    const b = { lat: 38.7223, lng: -9.1393 }
    expect(computeDistanceKm(a, b)).toBeCloseTo(0, 5)
  })
})

describe('formatDistanceKm', () => {
  it('rounds and labels the distance in Portuguese', () => {
    expect(formatDistanceKm(18.4)).toBe('aproximadamente 18 km')
    expect(formatDistanceKm(18.6)).toBe('aproximadamente 19 km')
    expect(formatDistanceKm(0)).toBe('aproximadamente 0 km')
  })
})
