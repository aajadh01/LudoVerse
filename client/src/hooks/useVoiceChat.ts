import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from './useSocket';

export interface PeerConnection {
  playerId: string;
  pc: RTCPeerConnection;
}

export function useVoiceChat(roomId: string, myPlayerId: string | null) {
  const [micEnabled, setMicEnabled] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [speakingPlayers, setSpeakingPlayers] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
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
        const isSpeaking = avg > 25; // threshold

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
      // AudioContext analysis optional
    }
  };

  const createPeerConnection = useCallback((targetPlayerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add local audio tracks if we have any
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal', {
          roomId,
          targetPlayerId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    // Incoming remote audio track
    pc.ontrack = (event) => {
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play().catch(() => {});
    };

    peersRef.current.set(targetPlayerId, pc);
    return pc;
  }, [roomId, socket]);

  // Handle incoming signaling messages
  useEffect(() => {
    const onSignal = async (data: { senderPlayerId: string; signal: any }) => {
      if (!myPlayerId || data.senderPlayerId === myPlayerId) return;

      const { senderPlayerId, signal } = data;
      let pc = peersRef.current.get(senderPlayerId);

      try {
        if (signal.type === 'offer') {
          if (!pc) pc = createPeerConnection(senderPlayerId);
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: senderPlayerId,
            signal: answer,
          });
        } else if (signal.type === 'answer') {
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          }
        } else if (signal.type === 'candidate') {
          if (pc && signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        }
      } catch {
        // Signaling tolerance
      }
    };

    socket.on('webrtc:signal', onSignal);
    return () => {
      socket.off('webrtc:signal', onSignal);
    };
  }, [createPeerConnection, myPlayerId, roomId, socket]);

  // Toggle microphone
  const toggleMic = async () => {
    if (micEnabled) {
      // Disable
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
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
      return;
    }

    // Enable: request permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setHasMicPermission(true);
      setMicEnabled(true);
      setErrorMsg(null);

      setupAudioMonitoring(stream);

      // Offer to all current peers
      peersRef.current.forEach(async (pc, targetPlayerId) => {
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:signal', {
          roomId,
          targetPlayerId,
          signal: offer,
        });
      });
    } catch {
      setErrorMsg('Microphone access denied or not available');
      setMicEnabled(false);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  return {
    micEnabled,
    hasMicPermission,
    speakingPlayers,
    toggleMic,
    errorMsg,
  };
}
