---
title: Yoruba Real-time ASR
emoji: 🎙️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Yoruba Real-time Streaming ASR Backend

This is the backend server for the Yoruba Real-time Speech-to-Text (ASR) system. It uses FastAPI and `faster-whisper` (CTranslate2) to perform real-time speech transcription from audio streams sent via WebSockets.

## Running Locally

To run this backend locally:
```bash
python3 server_production.py
```
