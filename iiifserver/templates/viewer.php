<?php
/** @var array $_ */
/** @var \OCP\IL10N $l */
style('iiifserver', 'viewer');
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>IIIF Viewer - <?php p($_['folderName'] ?: 'Viewer'); ?></title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
            background: #1e1e1e;
        }
        #mirador-container {
            width: 100%;
            height: 100vh;
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            color: #fff;
            font-family: sans-serif;
        }
    </style>
</head>
<body>
    <div id="mirador-container">
        <div class="loading">Loading Mirador...</div>
    </div>

    <script id="mirador-config" type="application/json"><?php echo json_encode(['manifestUrl' => $_['manifestUrl']]); ?></script>
    <script nonce="<?php p(\OC::$server->getContentSecurityPolicyNonceManager()->getNonce()); ?>" src="<?php p(\OC::$server->getURLGenerator()->linkTo('iiifserver', 'js/mirador.min.js')); ?>"></script>
    <script nonce="<?php p(\OC::$server->getContentSecurityPolicyNonceManager()->getNonce()); ?>">
        (function() {
            var config = JSON.parse(document.getElementById('mirador-config').textContent);
            var manifestUrl = config.manifestUrl;

            if (manifestUrl) {
                Mirador.viewer({
                    id: 'mirador-container',
                    windows: [{ manifestId: manifestUrl }],
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
                            search: true
                        }
                    },
                    workspace: { showZoomControls: true },
                    workspaceControlPanel: { enabled: true }
                });
            } else {
                document.getElementById('mirador-container').innerHTML = '<div class="loading">フォルダが指定されていません。</div>';
            }
        })();
    </script>
</body>
</html>
