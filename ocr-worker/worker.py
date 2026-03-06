import os
import sys
import time
import json
import hashlib
import logging
import tempfile
import subprocess
import threading
from datetime import datetime
from io import BytesIO
from pathlib import Path

import boto3
import requests
from elasticsearch import Elasticsearch
from PIL import Image
from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Environment variables
S3_BUCKET = os.getenv('S3_BUCKET')
S3_REGION = os.getenv('S3_REGION', 'us-east-1')
S3_ACCESS_KEY = os.getenv('S3_ACCESS_KEY')
S3_SECRET_KEY = os.getenv('S3_SECRET_KEY')
ELASTICSEARCH_URL = os.getenv('ELASTICSEARCH_URL', 'http://elasticsearch:9200')
NEXTCLOUD_URL = os.getenv('NEXTCLOUD_URL', 'http://nextcloud')
NEXTCLOUD_USER = os.getenv('NEXTCLOUD_USER', 'admin')
NEXTCLOUD_PASSWORD = os.getenv('NEXTCLOUD_PASSWORD', 'admin')

# Check interval (seconds)
CHECK_INTERVAL = int(os.getenv('CHECK_INTERVAL', '300'))

# Index names
NEXTCLOUD_INDEX = 'nextcloud'  # Nextcloud's index (read-only for us)
IIIF_INDEX = 'nextcloud_iiif'  # Our IIIF index (separate)

# NDL OCR paths
NDL_OCR_DIR = '/app/ndlkotenocr-lite/src'
NDL_OCR_SCRIPT = os.path.join(NDL_OCR_DIR, 'ocr.py')


class OCRWorker:
    def __init__(self):
        # Initialize S3 client
        self.s3 = boto3.client(
            's3',
            region_name=S3_REGION,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY
        )

        # Initialize Elasticsearch client
        self.es = Elasticsearch([ELASTICSEARCH_URL])

        # Ensure IIIF index exists
        self._ensure_index()

        # Track processed files (by hash)
        self.processed_hashes = self._load_processed_hashes()

        logger.info("NDL Kotenseki OCR Lite worker initialized (separate IIIF index)")

    def _ensure_index(self):
        """Create IIIF index if it doesn't exist"""
        if not self.es.indices.exists(index=IIIF_INDEX):
            self.es.indices.create(
                index=IIIF_INDEX,
                body={
                    'mappings': {
                        'properties': {
                            'file_id': {'type': 'keyword'},
                            'title': {'type': 'text', 'fields': {'keyword': {'type': 'keyword'}}},
                            'folder': {'type': 'keyword'},
                            'content': {'type': 'text', 'analyzer': 'standard'},
                            'content_ja': {'type': 'text', 'analyzer': 'cjk'},
                            'bounding_boxes': {
                                'type': 'nested',
                                'properties': {
                                    'text': {'type': 'text'},
                                    'bbox': {'type': 'integer'},
                                    'confidence': {'type': 'float'}
                                }
                            },
                            'image_width': {'type': 'integer'},
                            'image_height': {'type': 'integer'},
                            'ocr_hash': {'type': 'keyword'},
                            'ocr_timestamp': {'type': 'date'},
                            'ocr_engine': {'type': 'keyword'}
                        }
                    }
                }
            )
            logger.info(f"Created index: {IIIF_INDEX}")

    def _load_processed_hashes(self):
        """Load list of processed file hashes from Elasticsearch"""
        processed = {}
        try:
            result = self.es.search(
                index=IIIF_INDEX,
                body={
                    'query': {'match_all': {}},
                    '_source': ['ocr_hash'],
                    'size': 10000
                }
            )
            for hit in result['hits']['hits']:
                doc_id = hit['_id']
                ocr_hash = hit['_source'].get('ocr_hash', '')
                if ocr_hash:
                    processed[doc_id] = ocr_hash
        except Exception as e:
            logger.warning(f"Could not load processed hashes: {e}")
        return processed

    def _get_file_hash(self, data):
        """Calculate MD5 hash of file data"""
        return hashlib.md5(data).hexdigest()

    def _extract_file_id(self, s3_key):
        """Extract Nextcloud file ID from S3 key (urn:oid:xxx format)"""
        if s3_key.startswith('urn:oid:'):
            return s3_key.replace('urn:oid:', '')
        return None

    def _get_nextcloud_doc(self, file_id):
        """Get existing document from Nextcloud index to get file path"""
        doc_id = f"files:{file_id}"
        try:
            result = self.es.get(index=NEXTCLOUD_INDEX, id=doc_id)
            title = result['_source'].get('title', '')
            # Extract folder from title (e.g., "test/image.png" -> "test")
            folder = str(Path(title).parent) if title else ''
            if folder == '.':
                folder = ''
            return {
                'doc_id': doc_id,
                'title': title,
                'folder': folder,
                'exists': True
            }
        except Exception as e:
            logger.debug(f"Document not found in Nextcloud index: {doc_id} - {e}")
            return {
                'doc_id': doc_id,
                'title': '',
                'folder': '',
                'exists': False
            }

    def _is_image_file(self, key):
        """Check if the S3 object is an image file"""
        try:
            response = self.s3.head_object(Bucket=S3_BUCKET, Key=key)
            content_type = response.get('ContentType', '')
            return content_type.startswith('image/')
        except Exception:
            return False

    def _perform_ocr(self, image_data, filename):
        """Perform OCR using NDL Kotenseki OCR Lite"""
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                # Save image to temp file
                input_path = os.path.join(tmpdir, filename)
                output_dir = os.path.join(tmpdir, 'output')
                os.makedirs(output_dir, exist_ok=True)

                with open(input_path, 'wb') as f:
                    f.write(image_data)

                # Run NDL OCR
                cmd = [
                    sys.executable,
                    NDL_OCR_SCRIPT,
                    '--sourceimg', input_path,
                    '--output', output_dir,
                    '--device', 'cpu'
                ]

                logger.info(f"Running NDL OCR: {' '.join(cmd)}")

                result = subprocess.run(
                    cmd,
                    cwd=NDL_OCR_DIR,
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minutes timeout
                )

                if result.returncode != 0:
                    logger.error(f"NDL OCR failed: {result.stderr}")
                    return None

                # Read JSON output
                json_filename = Path(filename).stem + '.json'
                json_path = os.path.join(output_dir, json_filename)

                if not os.path.exists(json_path):
                    logger.error(f"JSON output not found: {json_path}")
                    return None

                with open(json_path, 'r', encoding='utf-8') as f:
                    ocr_result = json.load(f)

                # Parse NDL OCR output format
                text_lines = []
                bounding_boxes = []

                for content in ocr_result.get('contents', []):
                    for item in content:
                        text = item.get('text', '')
                        bbox = item.get('boundingBox', [])
                        confidence = item.get('confidence', 0)

                        text_lines.append(text)

                        # Convert NDL bbox format to flat format
                        # NDL: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
                        # Flat: [x1,y1,x2,y2,x3,y3,x4,y4]
                        if bbox and len(bbox) == 4:
                            flat_bbox = []
                            for point in bbox:
                                flat_bbox.extend(point)
                            bounding_boxes.append({
                                'text': text,
                                'bbox': flat_bbox,
                                'confidence': confidence
                            })

                img_info = ocr_result.get('imginfo', {})

                return {
                    'text': '\n'.join(text_lines),
                    'lines': text_lines,
                    'bounding_boxes': bounding_boxes,
                    'width': img_info.get('img_width'),
                    'height': img_info.get('img_height')
                }

        except subprocess.TimeoutExpired:
            logger.error("NDL OCR timed out")
            return None
        except Exception as e:
            logger.error(f"OCR error: {e}")
            return None

    def _get_image_dimensions(self, image_data):
        """Get image dimensions"""
        try:
            img = Image.open(BytesIO(image_data))
            return img.width, img.height
        except Exception:
            return None, None

    def process_file(self, s3_key):
        """Process a single file"""
        try:
            # Extract file ID from S3 key
            file_id = self._extract_file_id(s3_key)
            if not file_id:
                logger.debug(f"Skipping non-standard S3 key: {s3_key}")
                return

            # Get file info from Nextcloud index
            nc_doc = self._get_nextcloud_doc(file_id)
            if not nc_doc['exists']:
                logger.debug(f"No Nextcloud document found for file ID: {file_id}")
                return

            doc_id = nc_doc['doc_id']  # Use same ID pattern: files:xxx
            file_path = nc_doc['title']
            folder = nc_doc['folder']

            # Download file from S3
            response = self.s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            image_data = response['Body'].read()

            # Calculate hash
            file_hash = self._get_file_hash(image_data)

            # Check if already processed with same hash
            if doc_id in self.processed_hashes:
                if self.processed_hashes[doc_id] == file_hash:
                    logger.debug(f"Skipping {file_path} - already processed")
                    return

            # Get image dimensions
            width, height = self._get_image_dimensions(image_data)

            # Determine filename for OCR
            filename = Path(file_path).name if file_path else f"{file_id}.jpg"
            if not filename.lower().endswith(('.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.jp2')):
                filename = filename + '.jpg'

            # Perform OCR
            ocr_result = self._perform_ocr(image_data, filename)

            if ocr_result:
                # Use dimensions from OCR result if available
                if ocr_result.get('width'):
                    width = ocr_result['width']
                if ocr_result.get('height'):
                    height = ocr_result['height']

                # 1. Update Nextcloud index (content only, for Nextcloud search)
                try:
                    self.es.update(
                        index=NEXTCLOUD_INDEX,
                        id=doc_id,
                        body={
                            'doc': {
                                'content': ocr_result['text']
                            }
                        }
                    )
                    logger.info(f"Updated Nextcloud index: {doc_id}")
                except Exception as e:
                    logger.warning(f"Failed to update Nextcloud index: {e}")

                # 2. Create/update document in IIIF index (full data with bounding boxes)
                iiif_doc = {
                    'file_id': file_id,
                    'title': file_path,
                    'folder': folder,
                    'content': ocr_result['text'],
                    'content_ja': ocr_result['text'],
                    'bounding_boxes': ocr_result['bounding_boxes'],
                    'image_width': width,
                    'image_height': height,
                    'ocr_hash': file_hash,
                    'ocr_timestamp': datetime.utcnow().isoformat(),
                    'ocr_engine': 'ndl-kotenocr-lite'
                }

                self.es.index(index=IIIF_INDEX, id=doc_id, body=iiif_doc)
                self.processed_hashes[doc_id] = file_hash

                logger.info(f"Processed: {file_path} ({doc_id}) - {len(ocr_result['text'])} chars, {len(ocr_result['bounding_boxes'])} regions")
            else:
                logger.warning(f"No OCR result for: {file_path}")

        except Exception as e:
            logger.error(f"Error processing {s3_key}: {e}")

    def process_file_direct(self, s3_key, file_id, file_path):
        """Process a file directly with known file_id and file_path"""
        try:
            doc_id = f'files:{file_id}'

            # Extract folder from file_path
            folder = str(Path(file_path).parent) if file_path else ''
            if folder == '.':
                folder = ''

            # Download file from S3
            response = self.s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            image_data = response['Body'].read()

            # Calculate hash
            file_hash = self._get_file_hash(image_data)

            # Check if already processed with same hash
            if doc_id in self.processed_hashes:
                if self.processed_hashes[doc_id] == file_hash:
                    logger.info(f"Skipping {file_path} - already processed with same hash")
                    return

            # Get image dimensions
            width, height = self._get_image_dimensions(image_data)

            # Determine filename for OCR
            filename = Path(file_path).name if file_path else f"{file_id}.jpg"
            if not filename.lower().endswith(('.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.jp2')):
                filename = filename + '.jpg'

            # Perform OCR
            ocr_result = self._perform_ocr(image_data, filename)

            if ocr_result:
                # Use dimensions from OCR result if available
                if ocr_result.get('width'):
                    width = ocr_result['width']
                if ocr_result.get('height'):
                    height = ocr_result['height']

                # 1. Update Nextcloud index (content only, for Nextcloud search)
                try:
                    self.es.update(
                        index=NEXTCLOUD_INDEX,
                        id=doc_id,
                        body={
                            'doc': {
                                'content': ocr_result['text']
                            }
                        }
                    )
                    logger.info(f"Updated Nextcloud index: {doc_id}")
                except Exception as e:
                    logger.warning(f"Failed to update Nextcloud index (may not exist yet): {e}")

                # 2. Create/update document in IIIF index (full data with bounding boxes)
                iiif_doc = {
                    'file_id': file_id,
                    'title': file_path,
                    'folder': folder,
                    'content': ocr_result['text'],
                    'content_ja': ocr_result['text'],
                    'bounding_boxes': ocr_result['bounding_boxes'],
                    'image_width': width,
                    'image_height': height,
                    'ocr_hash': file_hash,
                    'ocr_timestamp': datetime.utcnow().isoformat(),
                    'ocr_engine': 'ndl-kotenocr-lite'
                }

                self.es.index(index=IIIF_INDEX, id=doc_id, body=iiif_doc)
                self.processed_hashes[doc_id] = file_hash

                logger.info(f"Processed (direct): {file_path} ({doc_id}) - {len(ocr_result['text'])} chars, {len(ocr_result['bounding_boxes'])} regions")
            else:
                logger.warning(f"No OCR result for: {file_path}")

        except Exception as e:
            logger.error(f"Error processing {s3_key} (direct): {e}")
            raise

    def scan_s3(self):
        """Scan S3 bucket for new/modified files"""
        logger.info(f"Scanning S3 bucket: {S3_BUCKET}")

        paginator = self.s3.get_paginator('list_objects_v2')

        for page in paginator.paginate(Bucket=S3_BUCKET):
            for obj in page.get('Contents', []):
                key = obj['Key']

                # Check if it's an image file
                if self._is_image_file(key):
                    self.process_file(key)

    def run(self):
        """Main loop"""
        logger.info("NDL Kotenseki OCR Lite Worker started")
        logger.info(f"S3 Bucket: {S3_BUCKET}")
        logger.info(f"Elasticsearch: {ELASTICSEARCH_URL}")
        logger.info(f"IIIF index: {IIIF_INDEX}")
        logger.info(f"Check interval: {CHECK_INTERVAL} seconds")

        while True:
            try:
                self.scan_s3()
            except Exception as e:
                logger.error(f"Error in scan loop: {e}")

            logger.info(f"Sleeping for {CHECK_INTERVAL} seconds...")
            time.sleep(CHECK_INTERVAL)


def create_app(worker):
    """Create Flask app for API"""
    app = Flask(__name__)

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({'status': 'ok'})

    @app.route('/process', methods=['POST'])
    def process_file():
        """Process a specific file immediately"""
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        file_path = data.get('file_path')
        user_id = data.get('user_id')

        if not file_path:
            return jsonify({'error': 'file_path is required'}), 400

        logger.info(f"API request to process: {file_path} (user: {user_id})")

        # Find the S3 key for this file
        # We need to search in Nextcloud index to find the file_id
        try:
            # Search by title in Nextcloud index
            result = worker.es.search(
                index=NEXTCLOUD_INDEX,
                body={
                    'query': {
                        'term': {'title.keyword': file_path}
                    },
                    '_source': ['title'],
                    'size': 1
                }
            )

            if not result['hits']['hits']:
                # Try without leading slash
                file_path_alt = file_path.lstrip('/')
                result = worker.es.search(
                    index=NEXTCLOUD_INDEX,
                    body={
                        'query': {
                            'term': {'title.keyword': file_path_alt}
                        },
                        '_source': ['title'],
                        'size': 1
                    }
                )

            if not result['hits']['hits']:
                return jsonify({'error': f'File not found in index: {file_path}'}), 404

            # Extract file_id from doc_id (format: files:xxx)
            doc_id = result['hits']['hits'][0]['_id']
            if doc_id.startswith('files:'):
                file_id = doc_id.replace('files:', '')
            else:
                return jsonify({'error': f'Invalid doc_id format: {doc_id}'}), 500

            # Construct S3 key
            s3_key = f'urn:oid:{file_id}'

            # Process the file
            worker.process_file(s3_key)

            return jsonify({
                'status': 'processed',
                'file_path': file_path,
                'file_id': file_id
            })

        except Exception as e:
            logger.error(f"API error processing {file_path}: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/process-by-id', methods=['POST'])
    def process_file_by_id():
        """Process a file by its Nextcloud file ID"""
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        file_id = data.get('file_id')
        file_path = data.get('file_path', '')

        if not file_id:
            return jsonify({'error': 'file_id is required'}), 400

        logger.info(f"API request to process file ID: {file_id} (path: {file_path})")

        try:
            s3_key = f'urn:oid:{file_id}'
            worker.process_file_direct(s3_key, file_id, file_path)

            return jsonify({
                'status': 'processed',
                'file_id': file_id,
                'file_path': file_path
            })

        except Exception as e:
            logger.error(f"API error processing file ID {file_id}: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/delete', methods=['POST'])
    def delete_file():
        """Delete a file's OCR data from IIIF index"""
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        file_path = data.get('file_path')

        if not file_path:
            return jsonify({'error': 'file_path is required'}), 400

        logger.info(f"API request to delete: {file_path}")

        try:
            # Search for the document by title
            result = worker.es.search(
                index=IIIF_INDEX,
                body={
                    'query': {
                        'term': {'title.keyword': file_path}
                    },
                    '_source': False,
                    'size': 1
                }
            )

            if not result['hits']['hits']:
                # Try without leading slash
                file_path_alt = file_path.lstrip('/')
                result = worker.es.search(
                    index=IIIF_INDEX,
                    body={
                        'query': {
                            'term': {'title.keyword': file_path_alt}
                        },
                        '_source': False,
                        'size': 1
                    }
                )

            if result['hits']['hits']:
                doc_id = result['hits']['hits'][0]['_id']
                worker.es.delete(index=IIIF_INDEX, id=doc_id)
                # Remove from processed hashes
                if doc_id in worker.processed_hashes:
                    del worker.processed_hashes[doc_id]
                logger.info(f"Deleted from IIIF index: {file_path} (doc_id: {doc_id})")
                return jsonify({'status': 'deleted', 'file_path': file_path, 'doc_id': doc_id})
            else:
                logger.info(f"File not found in IIIF index: {file_path}")
                return jsonify({'status': 'not_found', 'file_path': file_path})

        except Exception as e:
            logger.error(f"API error deleting {file_path}: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/delete-by-id', methods=['POST'])
    def delete_file_by_id():
        """Delete a file's OCR data by Nextcloud file ID"""
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        file_id = data.get('file_id')

        if not file_id:
            return jsonify({'error': 'file_id is required'}), 400

        logger.info(f"API request to delete file ID: {file_id}")

        try:
            doc_id = f'files:{file_id}'
            try:
                worker.es.delete(index=IIIF_INDEX, id=doc_id)
                if doc_id in worker.processed_hashes:
                    del worker.processed_hashes[doc_id]
                logger.info(f"Deleted from IIIF index: file_id={file_id}")
                return jsonify({'status': 'deleted', 'file_id': file_id})
            except Exception as e:
                if 'not_found' in str(e).lower():
                    return jsonify({'status': 'not_found', 'file_id': file_id})
                raise

        except Exception as e:
            logger.error(f"API error deleting file ID {file_id}: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/delete-folder', methods=['POST'])
    def delete_folder():
        """Delete all OCR data for files in a folder"""
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        folder_path = data.get('folder_path')

        if not folder_path:
            return jsonify({'error': 'folder_path is required'}), 400

        logger.info(f"API request to delete folder: {folder_path}")

        try:
            # Search for all documents in this folder
            folder = folder_path.lstrip('/')

            result = worker.es.search(
                index=IIIF_INDEX,
                body={
                    'query': {
                        'bool': {
                            'should': [
                                {'prefix': {'folder': folder}},
                                {'prefix': {'title': folder}}
                            ]
                        }
                    },
                    '_source': False,
                    'size': 10000
                }
            )

            deleted_count = 0
            for hit in result['hits']['hits']:
                doc_id = hit['_id']
                try:
                    worker.es.delete(index=IIIF_INDEX, id=doc_id)
                    if doc_id in worker.processed_hashes:
                        del worker.processed_hashes[doc_id]
                    deleted_count += 1
                except Exception as e:
                    logger.warning(f"Failed to delete {doc_id}: {e}")

            logger.info(f"Deleted {deleted_count} documents from folder: {folder_path}")
            return jsonify({
                'status': 'deleted',
                'folder_path': folder_path,
                'deleted_count': deleted_count
            })

        except Exception as e:
            logger.error(f"API error deleting folder {folder_path}: {e}")
            return jsonify({'error': str(e)}), 500

    return app


if __name__ == '__main__':
    worker = OCRWorker()

    # Run Flask API on port 5000
    app = create_app(worker)
    logger.info("Starting API server on port 5000...")
    app.run(host='0.0.0.0', port=5000, threaded=True)
