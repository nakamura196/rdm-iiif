<?php

namespace OCA\IiifServer\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;

class PageController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function viewer(): TemplateResponse {
        $folder = $this->request->getParam('folder', '');
        $manifestParam = $this->request->getParam('manifest', '');

        $baseUrl = $this->request->getServerProtocol() . '://' . $this->request->getServerHost();
        $appUrl = $baseUrl . '/apps/iiifserver';

        $manifestUrl = '';
        $folderName = 'Viewer';

        // manifest パラメータが指定されていればそれを使用
        if (!empty($manifestParam)) {
            $manifestUrl = $manifestParam;
            // URLからフォルダ名を抽出
            $folderName = basename(dirname($manifestParam)) ?: 'Viewer';
        } elseif (!empty($folder)) {
            $folderParam = ltrim($folder, '/');
            $folderName = basename($folderParam) ?: 'Viewer';
            $manifestUrl = $appUrl . '/iiif/' . rawurlencode($folderParam) . '/manifest.json';
        }

        $response = new TemplateResponse(
            'iiifserver',
            'viewer',
            [
                'manifestUrl' => $manifestUrl,
                'folderName' => $folderName
            ],
            'blank'
        );

        // Set CSP to allow image loading from Cantaloupe and connections
        $csp = new ContentSecurityPolicy();
        $csp->addAllowedImageDomain('*');
        $csp->addAllowedConnectDomain('*');
        $response->setContentSecurityPolicy($csp);

        return $response;
    }
}
