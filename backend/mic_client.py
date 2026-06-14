import asyncio
import websockets
import sounddevice as sd
import numpy as np
import json
import sys

# Audio recording settings
SAMPLING_RATE = 16000
CHANNELS = 1
BLOCK_SIZE = 1024 # 1024 samples at 16kHz = 64ms of audio

async def stream_mic():
    uri = "ws://localhost:8000/stream"
    print(f"Connecting to server at {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected successfully! Start speaking...")
            
            loop = asyncio.get_running_loop()
            audio_queue = asyncio.Queue()
            
            def callback(indata, frames, time, status):
                if status:
                    print(f"\n[Warning] Input status: {status}", file=sys.stderr, flush=True)
                # indata has shape (BLOCK_SIZE, CHANNELS)
                # Convert float32 array in [-1.0, 1.0] to 16-bit PCM bytes
                # Server expects 16-bit PCM (int16) scaled to float32
                audio_int16 = (indata.flatten() * 32767).astype(np.int16)
                audio_bytes = audio_int16.tobytes()
                # Put in queue in thread-safe manner
                loop.call_soon_threadsafe(audio_queue.put_nowait, audio_bytes)

            # Define the input stream
            stream = sd.InputStream(
                samplerate=SAMPLING_RATE,
                channels=CHANNELS,
                blocksize=BLOCK_SIZE,
                dtype='float32',
                callback=callback
            )
            
            async def send_audio():
                with stream:
                    print("Microphone stream is live. Press Ctrl+C to stop.")
                    while True:
                        data = await audio_queue.get()
                        await websocket.send(data)
            
            async def receive_transcripts():
                try:
                    async for message in websocket:
                        data = json.loads(message)
                        if "text" in data:
                            print(f"[Live Transcript]: {data['text']}", flush=True)
                except websockets.exceptions.ConnectionClosed:
                    print("\nConnection closed by server.")

            # Run sending and receiving concurrently
            await asyncio.gather(send_audio(), receive_transcripts())
            
    except Exception as e:
        print(f"\nError: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(stream_mic())
    except KeyboardInterrupt:
        print("\nStopped microphone stream.")
