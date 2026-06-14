import numpy as np
import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from faster_whisper import WhisperModel
import os
import asyncio

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins, adjust for production Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = "whisper-small-yoruba-ct2"
if not os.path.exists(MODEL_PATH):
    raise RuntimeError(f"CTranslate2 model directory '{MODEL_PATH}' not found. Please run the converter first.")

# Detect device and compute type
device = "cuda" if torch.cuda.is_available() else "cpu"
# On CPU, int8 is highly optimized. On GPU, float16 is faster and uses less VRAM.
compute_type = "float16" if device == "cuda" else "int8"

print(f"Loading Whisper model from {MODEL_PATH} on {device} using {compute_type}...")
model = WhisperModel(MODEL_PATH, device=device, compute_type=compute_type)
print("ASR model loaded successfully.")

# Load Silero VAD model
print("Loading Silero VAD model...")
vad_model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad')
(get_speech_timestamps, _, _, VADIterator, collect_chunks) = utils
print("VAD model loaded successfully.")

@app.get("/")
def read_root():
    return {"message": "Yoruba Real-time Production ASR Server is running."}

@app.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected.")
    
    # Initialize VAD iterator with a sample rate of 16000
    vad_iterator = VADIterator(vad_model, sampling_rate=16000)
    speech_buffer = []
    
    try:
        while True:
            # Receive audio bytes (16 kHz PCM 16-bit mono)
            data = await websocket.receive_bytes()
            if not data:
                break
                
            # Convert bytes to numpy int16, then float32 scaled to [-1.0, 1.0]
            audio_chunk = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # The VADIterator expects a torch tensor and processes 512 samples at a time
            chunk_size = 512
            for i in range(0, len(audio_chunk), chunk_size):
                sub_chunk = audio_chunk[i:i+chunk_size]
                # Pad to 512 if it's the last tiny chunk
                if len(sub_chunk) < chunk_size:
                    sub_chunk = np.pad(sub_chunk, (0, chunk_size - len(sub_chunk)))
                
                tensor_chunk = torch.from_numpy(sub_chunk)
                speech_dict = vad_iterator(tensor_chunk, return_seconds=True)
                
                # If speech is detected, accumulate the frames
                if vad_iterator.triggered:
                    speech_buffer.append(sub_chunk)
                
                # When speech ends, transcribe the accumulated buffer
                if speech_dict and "end" in speech_dict:
                    if speech_buffer:
                        full_audio = np.concatenate(speech_buffer)
                        speech_buffer = []
                        
                        print(f"Transcribing {len(full_audio)/16000:.2f}s of speech...")
                        # Run inference using faster-whisper on background thread
                        segments, info = await asyncio.to_thread(
                            model.transcribe,
                            full_audio, 
                            beam_size=5, 
                            language="yo",
                            temperature=0.0
                        )
                        text = " ".join([segment.text for segment in segments]).strip()
                        
                        if text:
                            print(f"Result: {text}")
                            await websocket.send_json({
                                "status": "final",
                                "text": text
                            })
                            
                    vad_iterator.reset_states()
                    
    except WebSocketDisconnect:
        print("WebSocket client disconnected.")
    except Exception as e:
        print(f"Error in stream processing: {e}")
    finally:
        # Transcribe any remaining audio in the buffer at disconnection
        if speech_buffer:
            try:
                full_audio = np.concatenate(speech_buffer)
                print(f"Transcribing remaining {len(full_audio)/16000:.2f}s of speech...")
                segments, info = await asyncio.to_thread(
                    model.transcribe,
                    full_audio, 
                    beam_size=5, 
                    language="yo",
                    temperature=0.0
                )
                text = " ".join([segment.text for segment in segments]).strip()
                if text:
                    print(f"Final Result: {text}")
                    await websocket.send_json({
                        "status": "final",
                        "text": text
                    })
            except Exception as e:
                print(f"Error sending final transcript: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
        print("WebSocket connection cleaned up.")
