"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAudioStream } from '@/hooks/useAudioStream';
import { getTranscripts, saveTranscript, deleteTranscript } from './actions';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mic, 
  MicOff, 
  Database, 
  Trash2, 
  Clock, 
  FileText, 
  AlertCircle, 
  CheckCircle,
  FolderOpen
} from 'lucide-react';

interface TranscriptEntry {
  id: string;
  createdAt: string;
  text: string;
  duration: number;
  title: string | null;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [sessionTitle, setSessionTitle] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // Timer state to track speaking duration
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Prevent SSR hydration issues
  useEffect(() => {
    setMounted(true);
    fetchHistory();
  }, []);

  // Set up audio stream hook
  const { isRecording, isConnected, startStream, stopStream, analyserRef } = useAudioStream({
    wsUrl: 'ws://localhost:8000/stream',
    onTranscriptReceived: (text) => {
      setTranscripts((prev) => [...prev, text]);
      showStatus(null);
    },
    onError: (err) => {
      showStatus({ type: 'error', text: err });
    }
  });

  // Track recording duration
  useEffect(() => {
    if (isRecording) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Helper to show status banner
  const showStatus = (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => {
    setStatusMessage(msg);
    if (msg && msg.type !== 'error') {
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Fetch past recordings from DB via Server Action
  const fetchHistory = async () => {
    try {
      const data = await getTranscripts();
      setHistory(data as TranscriptEntry[]);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  // Save the current translation to DB via Server Action
  const saveToDatabase = async () => {
    const fullText = transcripts.join(' ').trim();
    if (!fullText) {
      showStatus({ type: 'error', text: 'Nothing to save. Please speak to generate text.' });
      return;
    }

    const title = sessionTitle.trim() || `Yoruba Session (${new Date().toLocaleDateString()})`;

    try {
      showStatus({ type: 'info', text: 'Saving transcript to PostgreSQL...' });
      await saveTranscript(fullText, duration || 1, title);

      showStatus({ type: 'success', text: 'Successfully saved to database!' });
      setSessionTitle('');
      fetchHistory(); // Refresh sidebar list
    } catch (err: any) {
      console.error('Error inserting row:', err);
      showStatus({ type: 'error', text: `Failed to save: ${err.message || 'Check your DATABASE_URL configurations.'}` });
    }
  };

  // Delete a transcript record via Server Action
  const deleteRecord = async (id: string) => {
    try {
      await deleteTranscript(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      showStatus({ type: 'success', text: 'Transcript deleted.' });
    } catch (err: any) {
      console.error('Error deleting row:', err);
      showStatus({ type: 'error', text: `Delete failed: ${err.message}` });
    }
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      stopStream();
    } else {
      setTranscripts([]);
      setDuration(0);
      startStream();
    }
  };

  const loadHistoryItem = (item: TranscriptEntry) => {
    setTranscripts(item.text.split('. ').map(s => s.trim()).filter(Boolean));
    setDuration(Math.round(item.duration));
    setSessionTitle(item.title || '');
    showStatus({ type: 'success', text: `Loaded: ${item.title || 'Session'}` });
  };

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading Yoruba ASR System...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Premium Glassmorphic Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Mic className="h-5 w-5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Yorùbá STT Live
              </h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">
                Real-Time Speech-to-Text
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {isConnected ? 'ASR WebSocket Connected' : 'ASR Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Controls & Live Transcript */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Status Display Banner */}
          {statusMessage && (
            <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm animate-fade-in ${
              statusMessage.type === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' :
              statusMessage.type === 'error' ? 'bg-rose-950/40 border-rose-800/60 text-rose-300' :
              'bg-blue-950/40 border-blue-800/60 text-blue-300'
            }`}>
              {statusMessage.type === 'success' && <CheckCircle className="h-5 w-5 shrink-0" />}
              {statusMessage.type === 'error' && <AlertCircle className="h-5 w-5 shrink-0" />}
              {statusMessage.type === 'info' && <Database className="h-5 w-5 shrink-0 animate-bounce" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-xl flex flex-col h-[520px]">
            <CardHeader className="border-b border-slate-800/60 bg-slate-900/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-semibold text-slate-100">Live Recording Console</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Click the microphone to start streaming speech to the ASR engine
                  </CardDescription>
                </div>
                
                {/* Duration indicator */}
                {isRecording && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/15 border border-rose-500/30 rounded-full text-rose-400 text-xs font-bold font-mono tracking-wider animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col gap-4 p-6 overflow-hidden">
              {/* Responsive Live Visualizer */}
              <AudioVisualizer analyserRef={analyserRef} isRecording={isRecording} />

              {/* Scrollable Live Text Log */}
              <div className="flex-1 rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 relative overflow-hidden flex flex-col">
                <ScrollArea className="flex-1">
                  {transcripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-12 text-slate-600 gap-2">
                      <FileText className="h-10 w-10 opacity-40" />
                      <p className="text-sm font-medium">No live transcript segment yet</p>
                      <p className="text-[11px] opacity-70">Your spoken words will appear here in real time</p>
                    </div>
                  ) : (
                    <div className="space-y-4 pr-3">
                      {transcripts.map((segment, index) => (
                        <div 
                          key={index}
                          className="text-base text-slate-100 leading-relaxed font-medium bg-slate-900/50 border border-slate-800/40 px-4 py-3 rounded-xl hover:border-slate-700/50 transition-colors duration-150 animate-fade-in"
                        >
                          <span className="text-xs font-bold text-emerald-400 font-mono select-none block mb-1">
                            Segment {index + 1}
                          </span>
                          {segment}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </CardContent>

            <CardFooter className="border-t border-slate-800/60 bg-slate-900/10 p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
              {/* Record Action button */}
              <Button 
                onClick={handleRecordToggle}
                className={`w-full md:w-auto h-12 px-6 rounded-full font-bold flex items-center justify-center gap-3 transition-all duration-300 shadow-md ${
                  isRecording 
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 animate-pulse'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-5 w-5" />
                    Stop Streaming
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    Start Live Stream
                  </>
                )}
              </Button>

              {/* Title & Database Save controls */}
              <div className="w-full md:flex-1 flex gap-3">
                <input 
                  type="text" 
                  placeholder="Session Title (e.g., Introduction)"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="flex-1 h-12 bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-4 text-sm focus:outline-none transition-colors duration-200"
                  disabled={transcripts.length === 0}
                />
                <Button 
                  onClick={saveToDatabase}
                  disabled={transcripts.length === 0}
                  className="h-12 px-5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl text-white font-bold transition-all duration-200 flex items-center gap-2 shadow-lg shadow-blue-500/10"
                >
                  <Database className="h-4 w-4" />
                  Save
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>

        {/* Right column: Database History */}
        <div className="flex flex-col gap-6">
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-xl flex flex-col h-[520px]">
            <CardHeader className="border-b border-slate-800/60 bg-slate-900/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-emerald-400" />
                  <CardTitle className="text-lg font-semibold text-slate-100">Saved History</CardTitle>
                </div>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-full font-mono">
                  {history.length} Saved
                </span>
              </div>
              <CardDescription className="text-xs text-slate-400">
                Session history stored in PostgreSQL database
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-6">
              <ScrollArea className="h-full">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-slate-600 gap-2">
                    <Database className="h-10 w-10 opacity-35" />
                    <p className="text-sm font-medium">No saved recordings</p>
                    <p className="text-[11px] opacity-70">Save sessions to see history logs</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-2">
                    {history.map((record) => (
                      <div 
                        key={record.id}
                        onClick={() => loadHistoryItem(record)}
                        className="group relative bg-slate-950/50 hover:bg-slate-900/70 border border-slate-800/60 hover:border-slate-700/80 p-3.5 rounded-xl transition-all duration-200 cursor-pointer flex flex-col gap-1.5"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <h4 className="text-sm font-semibold text-slate-200 tracking-tight line-clamp-1 group-hover:text-emerald-400 transition-colors duration-150">
                            {record.title || 'Untitled Session'}
                          </h4>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRecord(record.id);
                            }}
                            className="text-slate-600 hover:text-rose-400 p-1 rounded-md transition-colors duration-150 shrink-0"
                            title="Delete transcript"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {record.text}
                        </p>
                        
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium font-mono pt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.round(record.duration)}s
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(record.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-600 font-medium">
        Yoruba Speech-to-Text System © 2026. Made with Next.js, FastAPI, and Prisma ORM.
      </footer>
    </div>
  );
}
