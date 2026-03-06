import { registerFileAction, FileAction, FileType } from '@nextcloud/files'
import { generateUrl } from '@nextcloud/router'

// IIIF icon for the action
const iiifIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h2v-4h4v-2h-4V7h-2v4H8v2h4z"/>
</svg>`

const action = new FileAction({
    id: 'open-in-iiif-viewer',
    displayName: () => 'IIIF Viewerで開く',
    iconSvgInline: () => iiifIcon,

    // Only show for folders
    enabled: (nodes) => {
        return nodes.length === 1 && nodes[0].type === FileType.Folder
    },

    // Execute action
    exec: async (node) => {
        const folderPath = node.path.replace(/^\//, '')  // Remove leading slash
        const manifestUrl = window.location.origin + generateUrl('/apps/iiifserver/iiif/' + encodeURIComponent(folderPath) + '/manifest')
        const viewerUrl = generateUrl('/apps/iiifserver/viewer') + '?manifest=' + encodeURIComponent(manifestUrl)

        window.open(viewerUrl, '_blank')
        return true
    },

    // Order in the menu
    order: 100,
})

registerFileAction(action)

console.log('IIIF Server action registered')
