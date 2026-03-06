import { NextRequest, NextResponse } from 'next/server'

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL || 'http://nextcloud'
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER || 'admin'
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD || 'admin'
const CANTALOUPE_URL = process.env.CANTALOUPE_URL || 'http://cantaloupe:8182'

interface NextcloudFile {
  href: string
  propstat: {
    prop: {
      displayname: string
      getcontenttype?: string
      getcontentlength?: string
      getlastmodified?: string
    }
  }
}

interface ImageInfo {
  width: number
  height: number
}

async function getFilesInFolder(folderPath: string): Promise<NextcloudFile[]> {
  const url = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USER}${folderPath}`

  const response = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}`).toString('base64'),
      'Depth': '1',
      'Content-Type': 'application/xml',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
      <d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
        <d:prop>
          <d:displayname/>
          <d:getcontenttype/>
          <d:getcontentlength/>
          <d:getlastmodified/>
        </d:prop>
      </d:propfind>`,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch folder: ${response.status}`)
  }

  const text = await response.text()

  // Parse XML response (simplified parsing)
  const files: NextcloudFile[] = []
  const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/g
  let match

  while ((match = responseRegex.exec(text)) !== null) {
    const responseXml = match[1]

    const hrefMatch = /<d:href>(.*?)<\/d:href>/.exec(responseXml)
    const displaynameMatch = /<d:displayname>(.*?)<\/d:displayname>/.exec(responseXml)
    const contenttypeMatch = /<d:getcontenttype>(.*?)<\/d:getcontenttype>/.exec(responseXml)

    if (hrefMatch && displaynameMatch) {
      const contenttype = contenttypeMatch?.[1] || ''

      // Only include image files
      if (contenttype.startsWith('image/')) {
        files.push({
          href: hrefMatch[1],
          propstat: {
            prop: {
              displayname: displaynameMatch[1],
              getcontenttype: contenttype,
            }
          }
        })
      }
    }
  }

  return files
}

async function getImageInfo(identifier: string): Promise<ImageInfo> {
  try {
    const infoUrl = `${CANTALOUPE_URL}/iiif/3/${identifier}/info.json`
    const response = await fetch(infoUrl)

    if (!response.ok) {
      console.warn(`Failed to get image info for ${identifier}: ${response.status}`)
      return { width: 1000, height: 1000 }
    }

    const info = await response.json()
    return {
      width: info.width || 1000,
      height: info.height || 1000
    }
  } catch (error) {
    console.warn(`Error getting image info for ${identifier}:`, error)
    return { width: 1000, height: 1000 }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ folder: string }> }
) {
  try {
    const { folder } = await params
    const decodedFolder = decodeURIComponent(folder).replace(/^\/+/, '')
    const folderPath = '/' + decodedFolder

    const files = await getFilesInFolder(folderPath)

    // Use the Host header to build external-facing URLs
    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || request.nextUrl.host
    const baseUrl = `${proto}://${host}`
    // Use folder name without leading slash for URL paths
    const folderUrlParam = encodeURIComponent(decodedFolder)
    // Use external Cantaloupe URL for browser access
    const cantaloupeExternalUrl = 'http://localhost:8182'

    // Get image info for all files in parallel
    const imageInfoPromises = files.map(file => {
      const filename = file.propstat.prop.displayname
      const identifier = encodeURIComponent(`${folderPath}/${filename}`)
      return getImageInfo(identifier)
    })
    const imageInfos = await Promise.all(imageInfoPromises)

    // Build IIIF Manifest (Presentation API 3.0)
    const manifest = {
      '@context': 'http://iiif.io/api/presentation/3/context.json',
      'id': `${baseUrl}/api/iiif/${folderUrlParam}/manifest.json`,
      'type': 'Manifest',
      'label': {
        'ja': [folderPath.split('/').pop() || folderPath]
      },
      'items': files.map((file, index) => {
        const filename = file.propstat.prop.displayname
        // Use filename as canvas identifier for consistency with search
        const canvasId = encodeURIComponent(filename)
        // Cantaloupe identifier: file path relative to Nextcloud WebDAV root
        const identifier = encodeURIComponent(`${folderPath}/${filename}`)
        const iiifImageBaseUrl = `${cantaloupeExternalUrl}/iiif/3/${identifier}`
        const imageUrl = `${iiifImageBaseUrl}/full/max/0/default.jpg`
        const { width, height } = imageInfos[index]

        return {
          'id': `${baseUrl}/api/iiif/${folderUrlParam}/canvas/${canvasId}`,
          'type': 'Canvas',
          'label': {
            'none': [filename]
          },
          'width': width,
          'height': height,
          'items': [
            {
              'id': `${baseUrl}/api/iiif/${folderUrlParam}/canvas/${canvasId}/page`,
              'type': 'AnnotationPage',
              'items': [
                {
                  'id': `${baseUrl}/api/iiif/${folderUrlParam}/canvas/${canvasId}/painting`,
                  'type': 'Annotation',
                  'motivation': 'painting',
                  'body': {
                    'id': imageUrl,
                    'type': 'Image',
                    'format': 'image/jpeg',
                    'width': width,
                    'height': height,
                    'service': [
                      {
                        'id': iiifImageBaseUrl,
                        'type': 'ImageService3',
                        'profile': 'level2'
                      }
                    ]
                  },
                  'target': `${baseUrl}/api/iiif/${folderUrlParam}/canvas/${canvasId}`,
                }
              ]
            }
          ],
          // External annotation page reference
          'annotations': [
            {
              'id': `${baseUrl}/api/iiif/${folderUrlParam}/canvas/${canvasId}/annotations`,
              'type': 'AnnotationPage'
            }
          ]
        }
      }),
      'service': [
        {
          '@context': 'http://iiif.io/api/search/1/context.json',
          '@id': `${baseUrl}/api/iiif/${folderUrlParam}/search`,
          'profile': 'http://iiif.io/api/search/1/search',
          'label': 'Search within this manifest'
        }
      ]
    }

    return NextResponse.json(manifest, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('Error generating manifest:', error)
    return NextResponse.json(
      { error: 'Failed to generate manifest' },
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
