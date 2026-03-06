<?php

return [
    'routes' => [
        // Viewer page
        ['name' => 'page#viewer', 'url' => '/viewer', 'verb' => 'GET'],

        // IIIF Manifest
        ['name' => 'iiif#manifest', 'url' => '/iiif/{folder}/manifest', 'verb' => 'GET', 'requirements' => ['folder' => '.+']],

        // IIIF Search
        ['name' => 'iiif#search', 'url' => '/iiif/{folder}/search', 'verb' => 'GET', 'requirements' => ['folder' => '.+']],

        // IIIF Annotations
        ['name' => 'iiif#annotations', 'url' => '/iiif/{folder}/canvas/{canvas}/annotations', 'verb' => 'GET', 'requirements' => ['folder' => '.+', 'canvas' => '.+']],
    ]
];
