import { useEffect, useRef, useState } from 'react';

interface UseAudioStreamProps {
  wsUrl: string;
  onTranscriptReceived: (text: string) => void;
  onError: (error: string) => void;
}

export function useAudioStream({ wsUrl, onTranscriptReceived, onError }: UseAudioStreamProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Connects to the WebSocket server
  const connectWebSocket = () => {
    return new Promise<WebSocket>((resolve, reject) => {
      console.log(`Connecting to ASR server at ${wsUrl}...`);
      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        console.log('ASR server connection established.');
        setIsConnected(true);
        resolve(socket);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.text) {
            onTranscriptReceived(data.text);
          }
        } catch (err) {
          console.error('Failed to parse socket message:', err);
        }
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        onError('WebSocket error connecting to server.');
        reject(err);
      };

      socket.onclose = () => {
        console.log('ASR server connection closed.');
        setIsConnected(false);
      };

      socketRef.current = socket;
    });
  };

  const startStream = async () => {
    try {
      // 1. Establish socket connection first
      const socket = await connectWebSocket();

      // 2. Request mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      audioStreamRef.current = stream;

      // 3. Create AudioContext (match hardware sample rate)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create AnalyserNode for visualizer support
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // 4. Create inline AudioWorklet code to bypass bundle issues
      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input[0]) {
              const channelData = input[0];
              this.port.postMessage(channelData);
            }
            return true;
          }
        }
        registerProcessor('pcm-processor', PCMProcessor);
      `;

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl); // Clean up memory

      const node = new AudioWorkletNode(audioContext, 'pcm-processor');
      nodeRef.current = node;

      const fromRate = audioContext.sampleRate;
      const toRate = 16000;

      // Handle raw float32 audio chunks from the worklet thread
      node.port.onmessage = (event) => {
        const inputData = event.data as Float32Array;
        
        // Downsample to 16kHz
        const downsampled = downsample(inputData, fromRate, toRate);
        
        // Convert float32 to int16 PCM
        const pcmData = float32ToInt16(downsampled);
        
        // Stream over WebSocket if open
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(pcmData.buffer);
        }
      };

      source.connect(analyser);
      analyser.connect(node);
      node.connect(audioContext.destination);

      setIsRecording(true);
      console.log('Microphone recording and streaming live.');
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      onError(err.message || 'Microphone access denied or connection failed.');
      stopStream();
    }
  };

  const stopStream = () => {
    console.log('Stopping stream and cleaning up resources...');
    
    // Stop mic stream tracks
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    // Disconnect web audio nodes
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (nodeRef.current) {
      nodeRef.current.disconnect();
      nodeRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Signal end of stream to server and close socket
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        // Send empty byte buffer to signal end of stream (flush VAD buffer)
        socketRef.current.send(new ArrayBuffer(0));
      }
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsRecording(false);
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return {
    isRecording,
    isConnected,
    startStream,
    stopStream,
    analyserRef,
  };
}

// Linear downsampling helper
function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  if (fromRate < toRate) throw new Error('Cannot downsample from lower to higher sample rate');

  const sampleRatio = fromRate / toRate;
  const newLength = Math.round(buffer.length / sampleRatio);
  const result = new Float32Array(newLength);
  
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRatio);
    let accum = 0;
    let count = 0;
    
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// Convert float32 [-1.0, 1.0] samples to 16-bit integer PCM array
function float32ToInt16(buffer: Float32Array): Int16Array {
  const buf = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf;
}
