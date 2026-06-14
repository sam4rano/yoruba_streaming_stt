# Use official lightweight Python image
FROM python:3.10-slim

# Set working directory inside container
WORKDIR /app

# Install system dependencies for audio reading (libsndfile1 is required by soundfile/librosa)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to utilize Docker build cache
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend source files and model weights into container
COPY . .

# Expose port 7860 (Hugging Face Spaces expects traffic on port 7860)
EXPOSE 7860

# Launch uvicorn production server
CMD ["uvicorn", "server_production:app", "--host", "0.0.0.0", "--port", "7860"]
