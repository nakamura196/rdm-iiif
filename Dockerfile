FROM nextcloud:latest

# Tesseract OCRと日本語言語パックをインストール
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-jpn \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*
