FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV QT_QPA_PLATFORM=offscreen

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libportaudio2 \
    libasound2 \
    build-essential \
    libxcb-cursor0 \
    libgl1-mesa-glx \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Run the web server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
