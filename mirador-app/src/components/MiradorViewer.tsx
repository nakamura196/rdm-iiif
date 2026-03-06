'use client'

import { useEffect, useRef } from 'react'
import Mirador from 'mirador'

interface MiradorViewerProps {
  manifestUrl: string
  searchServiceUrl?: string
}

export default function MiradorViewer({ manifestUrl, searchServiceUrl }: MiradorViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const miradorInstance = useRef<any>(null)

  useEffect(() => {
    if (!viewerRef.current || miradorInstance.current) return

    const config: any = {
      id: viewerRef.current.id,
      windows: [
        {
          manifestId: manifestUrl,
        },
      ],
      window: {
        allowClose: false,
        allowFullscreen: true,
        allowMaximize: false,
        allowTopMenuButton: true,
        allowWindowSideBar: true,
        sideBarOpen: false,
        panels: {
          info: true,
          attribution: true,
          canvas: true,
          annotations: true,
          search: !!searchServiceUrl,
        },
      },
      workspace: {
        showZoomControls: true,
      },
      workspaceControlPanel: {
        enabled: true,
      },
    }

    miradorInstance.current = Mirador.viewer(config)

    return () => {
      if (miradorInstance.current) {
        miradorInstance.current = null
      }
    }
  }, [manifestUrl, searchServiceUrl])

  return (
    <div
      ref={viewerRef}
      id="mirador-viewer"
      style={{ width: '100%', height: '100vh', position: 'relative' }}
    />
  )
}
