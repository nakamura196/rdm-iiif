'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const MiradorViewer = dynamic(() => import('@/components/MiradorViewer'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen">Loading Mirador...</div>,
})

function ViewerContent() {
  const searchParams = useSearchParams()
  const folder = searchParams.get('folder')

  if (!folder) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">Error: No folder specified</p>
      </div>
    )
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const manifestUrl = `${baseUrl}/api/iiif/${encodeURIComponent(folder)}/manifest.json`
  const searchServiceUrl = `${baseUrl}/api/iiif/${encodeURIComponent(folder)}/search`

  return <MiradorViewer manifestUrl={manifestUrl} searchServiceUrl={searchServiceUrl} />
}

export default function ViewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <ViewerContent />
    </Suspense>
  )
}
