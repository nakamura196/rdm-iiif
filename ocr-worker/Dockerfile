FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    gcc \
    g++ \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Clone NDL Kotenseki OCR Lite
RUN git clone https://github.com/ndl-lab/ndlkotenocr-lite.git /app/ndlkotenocr-lite

# Install NDL OCR dependencies
RUN pip install --no-cache-dir -r /app/ndlkotenocr-lite/requirements.txt

# Install additional dependencies for worker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY worker.py .

# Set PYTHONPATH to include NDL OCR src directory
ENV PYTHONPATH=/app/ndlkotenocr-lite/src:$PYTHONPATH

CMD ["python", "worker.py"]
