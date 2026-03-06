import { NextRequest, NextResponse } from 'next/server'

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200'

interface BoundingBox {
  text: string
  bbox: number[]
  confidence: number
}

interface IIIFDocument {
  title: string
  folder: string
  content: string
  bounding_boxes: BoundingBox[]
  image_width: number
  image_height: number
}

// Convert bbox to IIIF xywh format
function bboxToXywh(bbox: number[]): { x: number; y: number; w: number; h: number } {
  if (!bbox || bbox.length < 8) {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
  const xs = [bbox[0], bbox[2], bbox[4], bbox[6]]
  const ys = [bbox[1], bbox[3], bbox[5], bbox[7]]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    w: Math.round(maxX - minX),
    h: Math.round(maxY - minY)
  }
}

async function getAnnotationsForCanvas(folderPath: string, canvasFilename: string): Promise<IIIFDocument | null> {
  // Remove leading slash from folder path
  const folder = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath
  const fullPath = `${folder}/${canvasFilename}`

  const searchBody = {
    query: {
      bool: {
        must: [
          { term: { 'title.keyword': fullPath } }
        ]
      }
    },
    _source: ['title', 'folder', 'content', 'bounding_boxes', 'image_width', 'image_height'],
    size: 1
  }

  try {
    const response = await fetch(`${ELASTICSEARCH_URL}/nextcloud_iiif/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody),
    })

    if (!response.ok) {
      return null
    }

    const result = await response.json()
    if (result.hits.hits.length === 0) {
      return null
    }

    return result.hits.hits[0]._source as IIIFDocument
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ folder: string; canvas: string }> }
) {
  try {
    const { folder, canvas } = await params
    const folderPath = decodeURIComponent(folder).replace(/^\/+/, '')
    const canvasFilename = decodeURIComponent(canvas)

    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || request.nextUrl.host
    const baseUrl = `${proto}://${host}`
    const canvasId = encodeURIComponent(canvasFilename)

    // Get OCR data for this canvas
    const doc = await getAnnotationsForCanvas(folderPath, canvasFilename)

    const annotations: object[] = []

    if (doc && doc.bounding_boxes) {
      doc.bounding_boxes.forEach((box, index) => {
        const { x, y, w, h } = bboxToXywh(box.bbox)

        annotations.push({
          'id': `${baseUrl}/api/iiif/${encodeURIComponent(folderPath.replace(/^\/+/, ''))}/canvas/${canvasId}/annotations/${index}`,
          'type': 'Annotation',
          'motivation': 'commenting',
          'body': {
            'type': 'TextualBody',
            'value': box.text,
            'format': 'text/plain',
            'language': 'ja'
          },
          'target': `${baseUrl}/api/iiif/${encodeURIComponent(folderPath.replace(/^\/+/, ''))}/canvas/${canvasId}#xywh=${x},${y},${w},${h}`
        })
      })
    }

    // Return IIIF Annotation Page
    const annotationPage = {
      '@context': 'http://iiif.io/api/presentation/3/context.json',
      'id': `${baseUrl}/api/iiif/${encodeURIComponent(folderPath.replace(/^\/+/, ''))}/canvas/${canvasId}/annotations`,
      'type': 'AnnotationPage',
      'items': annotations
    }

    return NextResponse.json(annotationPage, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('Error generating annotations:', error)
    return NextResponse.json(
      { error: 'Failed to generate annotations' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
