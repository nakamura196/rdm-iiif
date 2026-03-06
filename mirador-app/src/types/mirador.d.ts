declare module 'mirador' {
  interface MiradorConfig {
    id: string
    windows?: Array<{
      manifestId: string
      canvasIndex?: number
    }>
    window?: {
      allowClose?: boolean
      allowFullscreen?: boolean
      allowMaximize?: boolean
      allowTopMenuButton?: boolean
      allowWindowSideBar?: boolean
      sideBarOpen?: boolean
      panels?: {
        info?: boolean
        attribution?: boolean
        canvas?: boolean
        annotations?: boolean
        search?: boolean
      }
    }
    workspace?: {
      showZoomControls?: boolean
    }
    workspaceControlPanel?: {
      enabled?: boolean
    }
  }

  interface MiradorInstance {
    store: any
    unmount: () => void
  }

  function viewer(config: MiradorConfig): MiradorInstance

  export default {
    viewer,
  }
}
