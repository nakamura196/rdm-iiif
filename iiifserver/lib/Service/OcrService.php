<?php

namespace OCA\IiifServer\Service;

use OCP\Files\File;
use OCP\Files\Node;
use Psr\Log\LoggerInterface;

class OcrService {
    private string $ocrWorkerUrl;
    private LoggerInterface $logger;

    public function __construct(LoggerInterface $logger) {
        $this->logger = $logger;
        $this->ocrWorkerUrl = getenv('OCR_WORKER_URL') ?: 'http://ocr-worker:5000';
    }

    public function processFile(File $file, string $userId): bool {
        $filePath = $file->getPath();
        // Remove /userId/files/ prefix to get relative path
        $relativePath = preg_replace('#^/[^/]+/files/#', '', $filePath);

        $this->logger->info('OCR request for file: ' . $relativePath . ' (user: ' . $userId . ')');

        try {
            $ch = curl_init($this->ocrWorkerUrl . '/process');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
                'file_path' => $relativePath,
                'user_id' => $userId
            ]));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);  // Don't wait for OCR to complete

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $this->logger->info('OCR request accepted: ' . $relativePath);
                return true;
            } else {
                $this->logger->warning('OCR request failed for ' . $relativePath . ': HTTP ' . $httpCode . ' - ' . $response);
                return false;
            }
        } catch (\Exception $e) {
            $this->logger->error('OCR request error for ' . $relativePath . ': ' . $e->getMessage());
            return false;
        }
    }

    public function processFileById(int $fileId, string $filePath = ''): bool {
        $this->logger->info('OCR request for file ID: ' . $fileId . ' (path: ' . $filePath . ')');

        try {
            $ch = curl_init($this->ocrWorkerUrl . '/process-by-id');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
                'file_id' => (string) $fileId,
                'file_path' => $filePath
            ]));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $this->logger->info('OCR request accepted for file ID: ' . $fileId);
                return true;
            } else {
                $this->logger->warning('OCR request failed for file ID ' . $fileId . ': HTTP ' . $httpCode . ' - ' . $response);
                return false;
            }
        } catch (\Exception $e) {
            $this->logger->error('OCR request error for file ID ' . $fileId . ': ' . $e->getMessage());
            return false;
        }
    }

    public function isImageFile(File $file): bool {
        $mimeType = $file->getMimeType();
        return strpos($mimeType, 'image/') === 0;
    }

    public function deleteFile(string $filePath): bool {
        $this->logger->info('OCR delete request for file: ' . $filePath);

        try {
            $ch = curl_init($this->ocrWorkerUrl . '/delete');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
                'file_path' => $filePath
            ]));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $this->logger->info('OCR delete request completed: ' . $filePath);
                return true;
            } else {
                $this->logger->warning('OCR delete request failed for ' . $filePath . ': HTTP ' . $httpCode);
                return false;
            }
        } catch (\Exception $e) {
            $this->logger->error('OCR delete request error for ' . $filePath . ': ' . $e->getMessage());
            return false;
        }
    }

    public function deleteFileById(int $fileId): bool {
        $this->logger->info('OCR delete request for file ID: ' . $fileId);

        try {
            $ch = curl_init($this->ocrWorkerUrl . '/delete-by-id');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
                'file_id' => (string) $fileId
            ]));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $this->logger->info('OCR delete request completed for file ID: ' . $fileId);
                return true;
            } else {
                $this->logger->warning('OCR delete request failed for file ID ' . $fileId . ': HTTP ' . $httpCode);
                return false;
            }
        } catch (\Exception $e) {
            $this->logger->error('OCR delete request error for file ID ' . $fileId . ': ' . $e->getMessage());
            return false;
        }
    }

    public function deleteFolder(string $folderPath): bool {
        $this->logger->info('OCR delete request for folder: ' . $folderPath);

        try {
            $ch = curl_init($this->ocrWorkerUrl . '/delete-folder');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
                'folder_path' => $folderPath
            ]));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $this->logger->info('OCR delete folder request completed: ' . $folderPath);
                return true;
            } else {
                $this->logger->warning('OCR delete folder request failed for ' . $folderPath . ': HTTP ' . $httpCode);
                return false;
            }
        } catch (\Exception $e) {
            $this->logger->error('OCR delete folder request error for ' . $folderPath . ': ' . $e->getMessage());
            return false;
        }
    }
}
