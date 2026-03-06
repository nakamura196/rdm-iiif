import { NextRequest, NextResponse } from 'next/server'

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200'

interface BoundingBox {
  text: string
  bbox: number[]  // [x1, y1, x2, y2, x3, y3, x4, y4] polygon corners
}

interface ElasticsearchHit {
  _id: string
  _source: {
    title?: string
    filename?: string
    folder: string
    content: string
    image_width?: number
    image_height?: number
    bounding_boxes?: BoundingBox[]
  }
  inner_hits?: {
    bounding_boxes?: {
      hits: {
        hits: Array<{
          _source: BoundingBox
        }>
      }
    }
  }
}

interface SearchResult {
  hits: {
    total: { value: number }
    hits: ElasticsearchHit[]
  }
}

// Convert Azure OCR polygon bbox to IIIF xywh format
function bboxToXywh(bbox: number[]): { x: number; y: number; w: number; h: number } {
  if (!bbox || bbox.length < 8) {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
  // Azure OCR returns 8 values: [x1,y1, x2,y2, x3,y3, x4,y4] for 4 corners
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

async function searchIIIFIndex(query: string, folderPath: string): Promise<SearchResult> {
  // Search in nextcloud_iiif index with bounding_boxes
  // Remove leading slash from folder path
  const folder = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath

  const searchBody = {
    query: {
      bool: {
        must: [
          {
            bool: {
              should: [
                { match: { content: query } },
                { match: { content_ja: query } }
              ]
            }
          },
          {
            prefix: {
              folder: folder
            }
          }
        ]
      }
    },
    _source: ['title', 'folder', 'content', 'image_width', 'image_height', 'bounding_boxes'],
    size: 100
  }

  try {
    const response = await fetch(`${ELASTICSEARCH_URL}/nextcloud_iiif/_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody),
    })

    if (!response.ok) {
      // Fallback to nextcloud index if OCR index doesn't exist
      return searchNextcloudIndex(query, folderPath)
    }

    const result = await response.json()

    // If no results from OCR index, fallback to nextcloud index
    if (result.hits.total.value === 0) {
      return searchNextcloudIndex(query, folderPath)
    }

    return result
  } catch {
    return searchNextcloudIndex(query, folderPath)
  }
}

async function searchNextcloudIndex(query: string, folderPath: string): Promise<SearchResult> {
  // Fallback: search in Nextcloud's full-text search index
  const searchBody = {
    query: {
      bool: {
        must: [
          { match: { content: query } },
          { prefix: { title: folderPath.startsWith('/') ? folderPath.slice(1) : folderPath } }
        ]
      }
    },
    _source: ['title', 'content', 'owner'],
    size: 100
  }

  const response = await fetch(`${ELASTICSEARCH_URL}/nextcloud/_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(searchBody),
  })

  if (!response.ok) {
    throw new Error(`Elasticsearch search failed: ${response.status}`)
  }

  const result = await response.json()
  // Transform to match OCR index format
  return {
    hits: {
      total: result.hits.total,
      hits: result.hits.hits.map((hit: { _id: string; _source: { title: string; content: string } }) => ({
        _id: hit._id,
        _source: {
          filename: hit._source.title,
          folder: '/',
          content: hit._source.content
        }
      }))
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ folder: string }> }
) {
  try {
    const { folder } = await params
    const folderPath = decodeURIComponent(folder).replace(/^\/+/, '')

    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || request.nextUrl.host
    const baseUrl = `${proto}://${host}`

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json({
        '@context': 'http://iiif.io/api/search/1/context.json',
        '@id': `${baseUrl}/api/iiif/${encodeURIComponent(folderPath)}/search`,
        '@type': 'sc:AnnotationList',
        'resources': [],
        'hits': []
      })
    }

    const results = await searchIIIFIndex(query, folderPath)

    // Build IIIF Search Response (Content Search API 1.0)
    const resources: object[] = []
    const hits: object[] = []
    let annotationIndex = 0

    for (const hit of results.hits.hits) {
      const fullPath = hit._source.title || hit._source.filename || ''
      // Extract just the filename from path (e.g., "old/default.jpg" -> "default.jpg")
      const filename = fullPath.split('/').pop() || fullPath
      const canvasId = encodeURIComponent(filename)
      const bboxes = hit._source.bounding_boxes || []
      const queryLower = query.toLowerCase()

      // Find bounding boxes that contain the search query
      const matchingBoxes = bboxes.filter(box =>
        box.text.toLowerCase().includes(queryLower)
      )

      if (matchingBoxes.length > 0) {
        // Create annotation for each matching bounding box
        for (const box of matchingBoxes) {
          const { x, y, w, h } = bboxToXywh(box.bbox)
          const annotationId = `${baseUrl}/api/iiif/${encodeURIComponent(folderPath)}/annotation/${annotationIndex}`

          resources.push({
            '@id': annotationId,
            '@type': 'oa:Annotation',
            'motivation': 'sc:painting',
            'resource': {
              '@type': 'cnt:ContentAsText',
              'chars': box.text
            },
            'on': `${baseUrl}/api/iiif/${encodeURIComponent(folderPath)}/canvas/${canvasId}#xywh=${x},${y},${w},${h}`
          })

          hits.push({
            '@type': 'search:Hit',
            'annotations': [annotationId],
            'match': query
          })

          annotationIndex++
        }
      } else {
        // Fallback: no bounding box info, use document-level match
        const content = hit._source.content || ''
        const lowerContent = content.toLowerCase()
        const matchIndex = lowerContent.indexOf(queryLower)

        let matchText = query
        if (matchIndex >= 0) {
          const start = Math.max(0, matchIndex - 50)
          const end = Math.min(content.length, matchIndex + query.length + 50)
          matchText = content.substring(start, end)
        }

        const annotationId = `${baseUrl}/api/iiif/${encodeURIComponent(folderPath)}/annotation/${annotationIndex}`

        resources.push({
          '@id': annotationId,
          '@type': 'oa:Annotation',
          'motivation': 'sc:painting',
          'resource': {
            '@type': 'cnt:ContentAsText',
            'chars': matchText
          },
          'on': `${baseUrl}/api/iiif/${encodeURIComponent(folderPath)}/canvas/${canvasId}#xywh=0,0,100,100`
        })

        hits.push({
          '@type': 'search:Hit',
          'annotations': [annotationId],
          'match': query
        })

        annotationIndex++
      }
    }

    const searchResponse = {
      '@context': 'http://iiif.io/api/search/1/context.json',
      '@id': `${baseUrl}/api/iiif/${encodeURIComponent(folderPath)}/search?q=${encodeURIComponent(query)}`,
      '@type': 'sc:AnnotationList',
      'within': {
        '@type': 'sc:Layer',
        'total': results.hits.total.value
      },
      'resources': resources,
      'hits': hits
    }

    return NextResponse.json(searchResponse, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('Error searching:', error)
    return NextResponse.json(
      { error: 'Search failed' },
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
