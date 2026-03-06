<?php

declare(strict_types=1);

namespace OCA\IiifServer\AppInfo;

use OCA\IiifServer\Listener\FileDeleteListener;
use OCA\IiifServer\Listener\FileUploadListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Util;

class Application extends App implements IBootstrap {
    public const APP_ID = 'iiifserver';

    public function __construct() {
        parent::__construct(self::APP_ID);
    }

    public function register(IRegistrationContext $context): void {
        // Register event listeners for file uploads
        $context->registerEventListener(NodeCreatedEvent::class, FileUploadListener::class);
        $context->registerEventListener(NodeWrittenEvent::class, FileUploadListener::class);

        // Register event listener for file deletions
        $context->registerEventListener(NodeDeletedEvent::class, FileDeleteListener::class);
    }

    public function boot(IBootContext $context): void {
        Util::addScript(self::APP_ID, 'iiifserver-main');
    }
}
