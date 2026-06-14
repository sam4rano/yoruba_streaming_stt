import asyncio
import websockets
import json
import librosa
import numpy as np
import os
import argparse
import sys

async def stream_file(audio_path, uri):
    if not os.path.exists(audio_path):
        print(f"Error: {audio_path} not found.")
        return

    print(f"Loading and resampling {audio_path} to 16kHz...")
    y, sr = librosa.load(audio_path, sr=16000)
    audio_int16 = (y * 32767).astype(np.int16)
    audio_bytes = audio_int16.tobytes()

    print(f"Connecting to server at {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected successfully. Starting file stream...")
            
            chunk_samples = 1024
            chunk_bytes_size = chunk_samples * 2
            
            async def send_audio():
                for idx in range(0, len(audio_bytes), chunk_bytes_size):
                    chunk = audio_bytes[idx:idx + chunk_bytes_size]
                    await websocket.send(chunk)
                    await asyncio.sleep(chunk_samples / 16000)
                await websocket.send(b"")
                print("Finished streaming all audio bytes. Waiting for final transcript...")

            async def receive_transcripts():
                try:
                    async for message in websocket:
                        data = json.loads(message)
                        if "text" in data:
                            print(f"\n[ASR Stream Result]: {data['text']}")
                except websockets.exceptions.ConnectionClosed:
                    print("\nConnection closed by server.")

            await asyncio.gather(send_audio(), receive_transcripts())
    except Exception as e:
        print(f"Error: {e}")

async def stream_mic(uri):
    try:
        import sounddevice as sd
    except ImportError:
        print("Error: sounddevice library is required for live recording. Run: pip install sounddevice")
        return

    print(f"Connecting to server at {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected successfully!")
            print("Recording from microphone... SPEAK YORUBA NOW! Press Ctrl+C to stop.")
            
            audio_queue = asyncio.Queue()
            loop = asyncio.get_running_loop()

            def callback(indata, frames, time, status):
                if status:
                    print(f"Status check: {status}", file=sys.stderr)
                loop.call_soon_threadsafe(audio_queue.put_nowait, indata.copy())

            # Start the sounddevice InputStream (16kHz, mono, int16)
            stream = sd.InputStream(
                samplerate=16000, 
                channels=1, 
                dtype='int16', 
                blocksize=1024, 
                callback=callback
            )
            
            with stream:
                async def send_mic_audio():
                    try:
                        while True:
                            indata = await audio_queue.get()
                            await websocket.send(indata.tobytes())
                    except asyncio.CancelledError:
                        await websocket.send(b"")
                        print("Microphone recording stopped.")

                async def receive_transcripts():
                    try:
                        async for message in websocket:
                            data = json.loads(message)
                            if "text" in data:
                                print(f"\n[ASR Stream Result]: {data['text']}")
                    except websockets.exceptions.ConnectionClosed:
                        print("\nConnection closed by server.")

                send_task = asyncio.create_task(send_mic_audio())
                receive_task = asyncio.create_task(receive_transcripts())
                
                await asyncio.gather(send_task, receive_task, return_exceptions=True)
                
    except Exception as e:
        print(f"Microphone stream error: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Yoruba Streaming ASR Client")
    parser.add_argument("--mic", action="store_true", help="Use live microphone instead of a file")
    parser.add_argument("--file", type=str, default="test_unfinetuned_yo.wav", help="Audio file path to stream (default: test_unfinetuned_yo.wav)")
    parser.add_argument("--uri", type=str, default="ws://localhost:8000/stream", help="WebSocket URI (default: ws://localhost:8000/stream)")
    
    args = parser.parse_args()
    
    if args.mic:
        asyncio.run(stream_mic(args.uri))
    else:
        asyncio.run(stream_file(args.file, args.uri))
