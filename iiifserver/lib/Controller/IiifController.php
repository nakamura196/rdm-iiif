<?php

namespace OCA\IiifServer\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IConfig;
use OCP\IUserSession;

class IiifController extends Controller {
    private ?string $userId;
    private IUserSession $userSession;
    private string $elasticsearchUrl;
    private string $cantaloupeUrl;

    public function __construct(
        string $appName,
        IRequest $request,
        ?string $userId,
        IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
        $this->userId = $userId;
        $this->userSession = $userSession;
        $this->elasticsearchUrl = getenv('ELASTICSEARCH_URL') ?: 'http://elasticsearch:9200';
        $this->cantaloupeUrl = 'http://localhost:8182'; // External URL for browser
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function manifest(string $folder): JSONResponse {
        $folderParam = urldecode($folder);
        $folderPath = '/' . ltrim($folderParam, '/');

        // Get files from the folder using WebDAV internally
        $files = $this->getFilesInFolder($folderPath);

        $baseUrl = $this->request->getServerProtocol() . '://' . $this->request->getServerHost();
        $appUrl = $baseUrl . '/apps/iiifserver';
        $folderUrlPart = rawurlencode($folderParam);

        $items = [];
        foreach ($files as $index => $file) {
            $filename = $file['name'];
            $canvasId = rawurlencode($filename);
            $identifier = rawurlencode($folderPath . '/' . $filename);
            $iiifImageBaseUrl = $this->cantaloupeUrl . '/iiif/3/' . $identifier;
            $imageUrl = $iiifImageBaseUrl . '/full/max/0/default.jpg';

            // Get image dimensions from Cantaloupe
            $imageInfo = $this->getImageInfo($identifier);
            $width = $imageInfo['width'];
            $height = $imageInfo['height'];

            $items[] = [
                'id' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId,
                'type' => 'Canvas',
                'label' => ['none' => [$filename]],
                'width' => $width,
                'height' => $height,
                'items' => [
                    [
                        'id' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '/page',
                        'type' => 'AnnotationPage',
                        'items' => [
                            [
                                'id' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '/painting',
                                'type' => 'Annotation',
                                'motivation' => 'painting',
                                'body' => [
                                    'id' => $imageUrl,
                                    'type' => 'Image',
                                    'format' => 'image/jpeg',
                                    'width' => $width,
                                    'height' => $height,
                                    'service' => [
                                        [
                                            'id' => $iiifImageBaseUrl,
                                            'type' => 'ImageService3',
                                            'profile' => 'level2'
                                        ]
                                    ]
                                ],
                                'target' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId
                            ]
                        ]
                    ]
                ],
                'annotations' => [
                    [
                        'id' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '/annotations',
                        'type' => 'AnnotationPage'
                    ]
                ]
            ];
        }

        $manifest = [
            '@context' => 'http://iiif.io/api/presentation/3/context.json',
            'id' => $appUrl . '/iiif/' . $folderUrlPart . '/manifest',
            'type' => 'Manifest',
            'label' => ['ja' => [basename($folderPath)]],
            'items' => $items,
            'service' => [
                [
                    '@context' => 'http://iiif.io/api/search/1/context.json',
                    '@id' => $appUrl . '/iiif/' . $folderUrlPart . '/search',
                    'profile' => 'http://iiif.io/api/search/1/search',
                    'label' => 'Search within this manifest'
                ]
            ]
        ];

        $response = new JSONResponse($manifest);
        $response->addHeader('Access-Control-Allow-Origin', '*');
        return $response;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function search(string $folder): JSONResponse {
        $folderParam = urldecode($folder);
        $folderPath = '/' . ltrim($folderParam, '/');
        $query = $this->request->getParam('q', '');

        $baseUrl = $this->request->getServerProtocol() . '://' . $this->request->getServerHost();
        $appUrl = $baseUrl . '/apps/iiifserver';
        $folderUrlPart = rawurlencode($folderParam);

        if (empty($query)) {
            return new JSONResponse([
                '@context' => 'http://iiif.io/api/search/1/context.json',
                '@id' => $this->request->getRequestUri(),
                '@type' => 'sc:AnnotationList',
                'resources' => [],
                'hits' => []
            ]);
        }

        // Search in Elasticsearch
        $results = $this->searchElasticsearch($query, $folderPath);

        $resources = [];
        $hits = [];
        $annotationIndex = 0;

        foreach ($results as $hit) {
            $fullPath = $hit['_source']['title'] ?? '';
            $filename = basename($fullPath);
            $canvasId = rawurlencode($filename);
            $bboxes = $hit['_source']['bounding_boxes'] ?? [];
            $queryLower = mb_strtolower($query);

            // Find matching bounding boxes
            $matchingBoxes = array_filter($bboxes, function($box) use ($queryLower) {
                return mb_strpos(mb_strtolower($box['text']), $queryLower) !== false;
            });

            if (!empty($matchingBoxes)) {
                foreach ($matchingBoxes as $box) {
                    $xywh = $this->bboxToXywh($box['bbox']);
                    $annotationId = $appUrl . '/iiif/' . $folderUrlPart . '/annotation/' . $annotationIndex;

                    $resources[] = [
                        '@id' => $annotationId,
                        '@type' => 'oa:Annotation',
                        'motivation' => 'sc:painting',
                        'resource' => [
                            '@type' => 'cnt:ContentAsText',
                            'chars' => $box['text']
                        ],
                        'on' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '#xywh=' . $xywh
                    ];

                    $hits[] = [
                        '@type' => 'search:Hit',
                        'annotations' => [$annotationId],
                        'match' => $query
                    ];

                    $annotationIndex++;
                }
            } else {
                // Fallback: document-level match
                $content = $hit['_source']['content'] ?? '';
                $annotationId = $appUrl . '/iiif/' . $folderUrlPart . '/annotation/' . $annotationIndex;

                $resources[] = [
                    '@id' => $annotationId,
                    '@type' => 'oa:Annotation',
                    'motivation' => 'sc:painting',
                    'resource' => [
                        '@type' => 'cnt:ContentAsText',
                        'chars' => mb_substr($content, 0, 100)
                    ],
                    'on' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '#xywh=0,0,100,100'
                ];

                $hits[] = [
                    '@type' => 'search:Hit',
                    'annotations' => [$annotationId],
                    'match' => $query
                ];

                $annotationIndex++;
            }
        }

        $response = new JSONResponse([
            '@context' => 'http://iiif.io/api/search/1/context.json',
            '@id' => $this->request->getRequestUri(),
            '@type' => 'sc:AnnotationList',
            'within' => [
                '@type' => 'sc:Layer',
                'total' => count($results)
            ],
            'resources' => $resources,
            'hits' => $hits
        ]);
        $response->addHeader('Access-Control-Allow-Origin', '*');
        return $response;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function annotations(string $folder, string $canvas): JSONResponse {
        $folderParam = urldecode($folder);
        $folderPath = '/' . ltrim($folderParam, '/');
        $canvasFilename = urldecode($canvas);

        $baseUrl = $this->request->getServerProtocol() . '://' . $this->request->getServerHost();
        $appUrl = $baseUrl . '/apps/iiifserver';
        $folderUrlPart = rawurlencode($folderParam);
        $canvasId = rawurlencode($canvasFilename);

        // Get OCR data from Elasticsearch
        $doc = $this->getAnnotationsForCanvas($folderPath, $canvasFilename);

        $items = [];
        if ($doc && isset($doc['bounding_boxes'])) {
            foreach ($doc['bounding_boxes'] as $index => $box) {
                $xywh = $this->bboxToXywh($box['bbox']);
                $items[] = [
                    'id' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '/annotations/' . $index,
                    'type' => 'Annotation',
                    'motivation' => 'commenting',
                    'body' => [
                        'type' => 'TextualBody',
                        'value' => $box['text'],
                        'format' => 'text/plain',
                        'language' => 'ja'
                    ],
                    'target' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '#xywh=' . $xywh
                ];
            }
        }

        $response = new JSONResponse([
            '@context' => 'http://iiif.io/api/presentation/3/context.json',
            'id' => $appUrl . '/iiif/' . $folderUrlPart . '/canvas/' . $canvasId . '/annotations',
            'type' => 'AnnotationPage',
            'items' => $items
        ]);
        $response->addHeader('Access-Control-Allow-Origin', '*');
        return $response;
    }

    private function getFilesInFolder(string $folderPath): array {
        // Use Nextcloud's file system API with current logged-in user
        $userId = $this->userId;

        // If userId is not set via DI (e.g., @PublicPage), try to get from session
        if (!$userId) {
            $user = $this->userSession->getUser();
            if ($user) {
                $userId = $user->getUID();
            }
        }

        if (!$userId) {
            return [];
        }
        $userFolder = \OC::$server->getUserFolder($userId);

        try {
            $folder = $userFolder->get($folderPath);
            if (!$folder instanceof \OCP\Files\Folder) {
                return [];
            }

            $files = [];
            foreach ($folder->getDirectoryListing() as $node) {
                if ($node instanceof \OCP\Files\File) {
                    $mimeType = $node->getMimeType();
                    if (strpos($mimeType, 'image/') === 0) {
                        $files[] = [
                            'name' => $node->getName(),
                            'mimeType' => $mimeType
                        ];
                    }
                }
            }

            // Sort by name
            usort($files, fn($a, $b) => strcmp($a['name'], $b['name']));

            return $files;
        } catch (\Exception $e) {
            return [];
        }
    }

    private function getImageInfo(string $identifier): array {
        $url = 'http://cantaloupe:8182/iiif/3/' . $identifier . '/info.json';

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $info = json_decode($response, true);
            return [
                'width' => $info['width'] ?? 1000,
                'height' => $info['height'] ?? 1000
            ];
        }

        return ['width' => 1000, 'height' => 1000];
    }

    private function searchElasticsearch(string $query, string $folderPath): array {
        $folder = ltrim($folderPath, '/');

        $searchBody = [
            'query' => [
                'bool' => [
                    'must' => [
                        [
                            'bool' => [
                                'should' => [
                                    ['match' => ['content' => $query]],
                                    ['match' => ['content_ja' => $query]]
                                ]
                            ]
                        ],
                        ['term' => ['folder' => $folder]]
                    ]
                ]
            ],
            '_source' => ['title', 'folder', 'content', 'image_width', 'image_height', 'bounding_boxes'],
            'size' => 100
        ];

        $ch = curl_init($this->elasticsearchUrl . '/nextcloud_iiif/_search');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($searchBody));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $result = json_decode($response, true);
            return $result['hits']['hits'] ?? [];
        }

        return [];
    }

    private function getAnnotationsForCanvas(string $folderPath, string $canvasFilename): ?array {
        $folder = ltrim($folderPath, '/');
        $fullPath = $folder . '/' . $canvasFilename;

        $searchBody = [
            'query' => [
                'bool' => [
                    'must' => [
                        ['term' => ['title.keyword' => $fullPath]]
                    ]
                ]
            ],
            '_source' => ['title', 'folder', 'content', 'bounding_boxes', 'image_width', 'image_height'],
            'size' => 1
        ];

        $ch = curl_init($this->elasticsearchUrl . '/nextcloud_iiif/_search');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($searchBody));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $result = json_decode($response, true);
            if (!empty($result['hits']['hits'])) {
                return $result['hits']['hits'][0]['_source'];
            }
        }

        return null;
    }

    private function bboxToXywh(array $bbox): string {
        if (count($bbox) < 8) {
            return '0,0,100,100';
        }

        $xs = [$bbox[0], $bbox[2], $bbox[4], $bbox[6]];
        $ys = [$bbox[1], $bbox[3], $bbox[5], $bbox[7]];

        $minX = (int)min($xs);
        $maxX = (int)max($xs);
        $minY = (int)min($ys);
        $maxY = (int)max($ys);

        return $minX . ',' . $minY . ',' . ($maxX - $minX) . ',' . ($maxY - $minY);
    }

}
