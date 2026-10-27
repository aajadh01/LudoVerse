import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from './useSocket';

export interface UseMediaChatReturn {
  micEnabled: boolean;
  cameraEnabled: boolean;
  localStream: MediaStream | null;
  localVideoStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  remoteMediaStatus: Map<string, { cameraEnabled: boolean; micEnabled: boolean }>;
  speakingPlayers: Set<string>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  errorMsg: string | null;
}

export function useMediaChat(
  roomId: string,
  myPlayerId: string | null,
  otherPlayerIds: string[] = []
): UseMediaChatReturn {
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [speakingPlayers, setSpeakingPlayers] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteMediaStatus, setRemoteMediaStatus] = useState<Map<string, { cameraEnabled: boolean; micEnabled: boolean }>>(new Map());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const socket = getSocket();

  // Monitor speaking levels of local player
  const setupAudioMonitoring = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!analyserRef.current || !myPlayerId) return;
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const isSpeaking = avg > 25;

        setSpeakingPlayers(prev => {
          const has = prev.has(myPlayerId);
          if (isSpeaking && !has) {
            const next = new Set(prev);
            next.add(myPlayerId);
            return next;
          } else if (!isSpeaking && has) {
            const next = new Set(prev);
            next.delete(myPlayerId);
            return next;
          }
          return prev;
        });

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch {
      // AudioContext optional
    }
  };

  const getOrCreatePeerConnection = useCallback((targetPlayerId: string): RTCPeerConnection => {
    let pc = peersRef.current.get(targetPlayerId);
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
      return pc;
    }

    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach(track => {
        pc!.addTrack(track, localAudioStreamRef.current!);
      });
    }
    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach(track => {
        pc!.addTrack(track, localVideoStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal', {
          roomId,
          targetPlayerId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams(prev => {
        const next = new Map(prev);
        const existing = next.get(targetPlayerId);
        if (existing) {
          if (!existing.getTracks().some(t => t.id === event.track.id)) {
            existing.addTrack(event.track);
          }
          next.set(targetPlayerId, new MediaStream(existing.getTracks()));
        } else {
          next.set(targetPlayerId, stream);
        }
        return next;
      });

      if (event.track.kind === 'audio') {
        const audio = new Audio();
        audio.srcObject = new MediaStream([event.track]);
        audio.play().catch(() => {});
      }
    };

    peersRef.current.set(targetPlayerId, pc);
    return pc;
  }, [roomId, socket]);

  // Handle incoming signaling messages and status updates
  useEffect(() => {
    const onSignal = async (data: { senderPlayerId: string; signal: any }) => {
      if (!myPlayerId || data.senderPlayerId === myPlayerId) return;

      const { senderPlayerId, signal } = data;
      const pc = getOrCreatePeerConnection(senderPlayerId);

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: senderPlayerId,
            signal: answer,
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.type === 'candidate' && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.warn('WebRTC signal handling:', err);
      }
    };

    const onMediaStatus = (data: { playerId: string; cameraEnabled: boolean; micEnabled: boolean }) => {
      setRemoteMediaStatus(prev => {
        const next = new Map(prev);
        next.set(data.playerId, { cameraEnabled: data.cameraEnabled, micEnabled: data.micEnabled });
        return next;
      });
    };

    socket.on('webrtc:signal', onSignal);
    socket.on('media:player_status' as any, onMediaStatus as any);

    return () => {
      socket.off('webrtc:signal', onSignal);
      socket.off('media:player_status' as any, onMediaStatus as any);
    };
  }, [getOrCreatePeerConnection, myPlayerId, roomId, socket]);

  // Toggle microphone
  const toggleMic = async () => {
    if (micEnabled) {
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach(t => t.stop());
        localAudioStreamRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

      if (myPlayerId) {
        setSpeakingPlayers(prev => {
          const next = new Set(prev);
          next.delete(myPlayerId);
          return next;
        });
      }

      setMicEnabled(false);
      socket.emit('media:status', { roomId, cameraEnabled, micEnabled: false });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localAudioStreamRef.current = stream;
      setLocalStream(stream);
      setMicEnabled(true);
      setErrorMsg(null);

      setupAudioMonitoring(stream);
      socket.emit('media:status', { roomId, cameraEnabled, micEnabled: true });

      // Offer to all other connected players
      otherPlayerIds.forEach(async (targetId) => {
        if (targetId === myPlayerId) return;
        const pc = getOrCreatePeerConnection(targetId);
        stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:signal', {
          roomId,
          targetPlayerId: targetId,
          signal: offer,
        });
      });
    } catch {
      setErrorMsg('Microphone access denied or not available');
      setMicEnabled(false);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Toggle Camera
  const toggleCamera = async () => {
    if (cameraEnabled) {
      if (localVideoStreamRef.current) {
        localVideoStreamRef.current.getTracks().forEach(t => t.stop());
        localVideoStreamRef.current = null;
      }
      setLocalVideoStream(null);
      setCameraEnabled(false);
      socket.emit('media:status', { roomId, cameraEnabled: false, micEnabled });

      // Remove video track from peers and notify
      otherPlayerIds.forEach(async (targetId) => {
        const pc = peersRef.current.get(targetId);
        if (pc) {
          pc.getSenders().forEach(s => {
            if (s.track?.kind === 'video') pc.removeTrack(s);
          });
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: targetId,
            signal: offer,
          });
        }
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 360 },
          height: { ideal: 270 },
          facingMode: 'user',
        },
        audio: false,
      });

      localVideoStreamRef.current = stream;
      setLocalVideoStream(stream);
      setCameraEnabled(true);
      setErrorMsg(null);
      socket.emit('media:status', { roomId, cameraEnabled: true, micEnabled });

      // Connect to all peers and send offer
      otherPlayerIds.forEach(async (targetId) => {
        if (targetId === myPlayerId) return;
        const pc = getOrCreatePeerConnection(targetId);
        stream.getVideoTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:signal', {
          roomId,
          targetPlayerId: targetId,
          signal: offer,
        });
      });
    } catch {
      setErrorMsg('Camera access denied or not available');
      setCameraEnabled(false);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  useEffect(() => {
    return () => {
      localAudioStreamRef.current?.getTracks().forEach(t => t.stop());
      localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  return {
    micEnabled,
    cameraEnabled,
    localStream,
    localVideoStream,
    remoteStreams,
    remoteMediaStatus,
    speakingPlayers,
    toggleMic,
    toggleCamera,
    errorMsg,
  };
}