<?php

namespace OCA\IiifServer\Listener;

use OCA\IiifServer\Service\OcrService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\File;
use OCP\Files\Folder;
use Psr\Log\LoggerInterface;

/**
 * @template-implements IEventListener<NodeDeletedEvent>
 */
class FileDeleteListener implements IEventListener {
    private OcrService $ocrService;
    private LoggerInterface $logger;

    public function __construct(OcrService $ocrService, LoggerInterface $logger) {
        $this->ocrService = $ocrService;
        $this->logger = $logger;
    }

    public function handle(Event $event): void {
        if (!($event instanceof NodeDeletedEvent)) {
            return;
        }

        $node = $event->getNode();
        $path = $node->getPath();

        // Remove /userId/files/ prefix to get relative path
        $relativePath = preg_replace('#^/[^/]+/files/#', '', $path);

        // Handle folder deletion
        if ($node instanceof Folder) {
            $this->logger->info('Folder deleted: ' . $relativePath);
            $this->ocrService->deleteFolder($relativePath);
            return;
        }

        // Handle file deletion
        if ($node instanceof File) {
            $this->logger->info('File deleted: ' . $relativePath);
            $this->ocrService->deleteFile($relativePath);
        }
    }
}
