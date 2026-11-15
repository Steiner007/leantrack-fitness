/**
 * Downscale large photos to at most `maxEdge` px on the long edge and re-encode
 * as JPEG. Aspect ratio is always preserved and nothing else about the image is
 * altered (no filters, no retouching, no cropping).
 */
export const MAX_EDGE = 1600
export const JPEG_QUALITY = 0.85

export function fitWithin(w: number, h: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export async function compressImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  let bmp: ImageBitmap | HTMLImageElement
  try {
    // from-image applies the EXIF rotation phones store, so portraits stay upright.
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bmp = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = () => rej(new Error('This file could not be read as an image.'))
      img.src = URL.createObjectURL(file)
    })
  }
  const { width, height } = fitWithin(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image on this device.')
  ctx.drawImage(bmp, 0, 0, width, height)
  if ('close' in bmp) bmp.close()
  else URL.revokeObjectURL(bmp.src)
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Could not compress the image.')
  return { blob, width, height }
}
