<?php

namespace OCA\IiifServer\Listener;

use OCA\IiifServer\Service\OcrService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\File;
use Psr\Log\LoggerInterface;

/**
 * @template-implements IEventListener<NodeCreatedEvent|NodeWrittenEvent>
 */
class FileUploadListener implements IEventListener {
    private OcrService $ocrService;
    private LoggerInterface $logger;

    public function __construct(OcrService $ocrService, LoggerInterface $logger) {
        $this->ocrService = $ocrService;
        $this->logger = $logger;
    }

    public function handle(Event $event): void {
        if (!($event instanceof NodeCreatedEvent) && !($event instanceof NodeWrittenEvent)) {
            return;
        }

        $node = $event->getNode();

        // Only process files
        if (!($node instanceof File)) {
            return;
        }

        // Only process image files
        if (!$this->ocrService->isImageFile($node)) {
            return;
        }

        // Get the file path and ID
        $path = $node->getPath();
        $fileId = $node->getId();

        // Remove /userId/files/ prefix to get relative path
        $relativePath = preg_replace('#^/[^/]+/files/#', '', $path);

        $this->logger->info('Image file uploaded: ' . $relativePath . ' (ID: ' . $fileId . ')');

        // Trigger OCR processing using file ID
        $this->ocrService->processFileById($fileId, $relativePath);
    }
}
