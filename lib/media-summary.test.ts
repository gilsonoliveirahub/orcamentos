import { describe, it, expect } from 'vitest'
import { isVideoUrl, summarizeMedia } from './media-summary'

describe('isVideoUrl', () => {
  it('reconhece extensões de vídeo comuns, ignorando maiúsculas/minúsculas', () => {
    expect(isVideoUrl('https://x/clip.mp4')).toBe(true)
    expect(isVideoUrl('https://x/clip.MOV')).toBe(true)
    expect(isVideoUrl('https://x/clip.webm')).toBe(true)
  })

  it('trata imagens como não-vídeo', () => {
    expect(isVideoUrl('https://x/foto.jpg')).toBe(false)
    expect(isVideoUrl('https://x/foto.png')).toBe(false)
  })
})

describe('summarizeMedia', () => {
  it('sem media: tudo a zero', () => {
    expect(summarizeMedia([])).toEqual({ photoCount: 0, videoCount: 0, total: 0 })
  })

  it('conta fotos e vídeos separadamente', () => {
    const urls = ['a.jpg', 'b.png', 'c.mp4', 'd.jpg']
    expect(summarizeMedia(urls)).toEqual({ photoCount: 3, videoCount: 1, total: 4 })
  })
})
