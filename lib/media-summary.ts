// Resumo determinístico do que foi enviado — só tipo/contagem a partir da
// extensão do ficheiro, nunca conteúdo. Mesmo critério já usado em
// app/pedir/page.tsx e app/leads/[id]/page.tsx para distinguir vídeo de foto.

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(url)
}

export type MediaSummary = { photoCount: number; videoCount: number; total: number }

export function summarizeMedia(mediaUrls: string[]): MediaSummary {
  const videoCount = mediaUrls.filter(isVideoUrl).length
  return { photoCount: mediaUrls.length - videoCount, videoCount, total: mediaUrls.length }
}
