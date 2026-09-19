// frontend/src/hooks/useVoiceAgent.js
//
// Browser client for the voice-agent service (see /voice-agent). Mirrors the
// proven logic in voice-agent/clients/web/index.html (raw PCM capture via
// AudioWorklet, streamed playback via Web Audio API) but wired to React
// state and to OUR auth — the caller supplies getSystemPrompt(), which
// fetches the grounded, per-victim prompt from
// GET /api/v1/intake/chatbot/voice-context (see backend chatbot_routes.py)
// instead of using the voice-agent's generic .env fallback.
//
// Connects through the /voice-ws Vite proxy (see vite.config.js) rather
// than hardcoding the voice-agent's host:port, so this works the same in
// dev and once actually deployed behind a real reverse proxy.

import { useCallback, useRef, useState } from 'react';

const IN_RATE = 16000;

const WORKLET_SOURCE = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) {
      const pcm = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        pcm[i] = s * 32767;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('capture', Capture);
`;

export function useVoiceAgent({ getSystemPrompt, onUserTranscript, onAssistantStart, onAssistantToken, onAssistantEnd, onError }) {
  const [status, setStatus] = useState('idle'); // idle | connecting | listening | thinking | speaking | error

  const wsRef = useRef(null);
  const micCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const playCtxRef = useRef(null);
  const playHeadRef = useRef(0);
  const playSourcesRef = useRef([]);
  const ttsRateRef = useRef(22050);
  const assistantTextRef = useRef('');

  const stopPlayback = useCallback(() => {
    playSourcesRef.current.forEach((s) => {
      try { s.stop(); } catch (_) { /* already stopped */ }
    });
    playSourcesRef.current = [];
    if (playCtxRef.current) playHeadRef.current = playCtxRef.current.currentTime;
  }, []);

  const enqueueAudio = useCallback((buffer) => {
    const rate = ttsRateRef.current;
    if (!playCtxRef.current || playCtxRef.current.sampleRate !== rate) {
      if (playCtxRef.current) playCtxRef.current.close();
      playCtxRef.current = new AudioContext({ sampleRate: rate });
      playHeadRef.current = 0;
    }
    const ctx = playCtxRef.current;
    const pcm = new Int16Array(buffer);
    const audioBuf = ctx.createBuffer(1, pcm.length, rate);
    const channel = audioBuf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (playHeadRef.current < now) playHeadRef.current = now + 0.03;
    src.start(playHeadRef.current);
    playHeadRef.current += audioBuf.duration;

    playSourcesRef.current.push(src);
    src.onended = () => {
      playSourcesRef.current = playSourcesRef.current.filter((s) => s !== src);
    };
  }, []);

  const stopMic = useCallback(() => {
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
    if (micCtxRef.current) micCtxRef.current.close();
    micStreamRef.current = null;
    micCtxRef.current = null;
  }, []);

  const startMic = useCallback(async () => {
    micStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micCtxRef.current = new AudioContext({ sampleRate: IN_RATE });
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    await micCtxRef.current.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const source = micCtxRef.current.createMediaStreamSource(micStreamRef.current);
    const node = new AudioWorkletNode(micCtxRef.current, 'capture');
    node.port.onmessage = (e) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(e.data);
      }
    };
    source.connect(node);
    // Keep the graph pulling without echoing the mic to the speakers.
    node.connect(micCtxRef.current.createGain()).connect(micCtxRef.current.destination);
  }, []);

  const stop = useCallback(() => {
    stopMic();
    stopPlayback();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('idle');
  }, [stopMic, stopPlayback]);

  const start = useCallback(async () => {
    setStatus('connecting');
    try {
      const systemPrompt = await getSystemPrompt();

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/voice-ws`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onerror = () => {
        onError?.('Voice connection error');
        setStatus('error');
      };
      ws.onclose = () => {
        stopMic();
        setStatus((s) => (s === 'error' ? s : 'idle'));
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          enqueueAudio(event.data);
          return;
        }
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'ready':
            ttsRateRef.current = msg.output_sample_rate;
            ws.send(JSON.stringify({ type: 'context', system_prompt: systemPrompt }));
            break;
          case 'context_ok':
            await startMic();
            setStatus('listening');
            break;
          case 'speech_start':
            stopPlayback();
            break;
          case 'speech_end':
            setStatus('thinking');
            break;
          case 'transcript':
            onUserTranscript?.(msg.text);
            break;
          case 'response_start':
            assistantTextRef.current = '';
            onAssistantStart?.();
            break;
          case 'token':
            assistantTextRef.current += msg.text;
            onAssistantToken?.(msg.text, assistantTextRef.current);
            break;
          case 'tts_start':
            ttsRateRef.current = msg.sample_rate;
            setStatus('speaking');
            break;
          case 'tts_cancel':
            stopPlayback();
            break;
          case 'response_end':
            onAssistantEnd?.(assistantTextRef.current);
            setStatus('listening');
            break;
          case 'error':
            onError?.(msg.message);
            break;
          default:
            break;
        }
      };
    } catch (err) {
      onError?.(err.message || 'Could not start voice session');
      setStatus('error');
    }
  }, [getSystemPrompt, startMic, stopMic, stopPlayback, enqueueAudio, onUserTranscript, onAssistantStart, onAssistantToken, onAssistantEnd, onError]);

  return { status, start, stop };
}
