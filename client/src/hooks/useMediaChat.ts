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

// Robust STUN + Free OpenRelay TURN servers for cross-network / mobile cellular NAT traversal (4G/5G/WAN)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelay',
      credential: 'openrelay',
    },
  ],
  iceCandidatePoolSize: 10,
};

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
  // Queue ICE candidates that arrive before setRemoteDescription finishes
  const candidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Dedicated audio elements per remote peer to eliminate reverb / echo loops
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const socket = getSocket();

  // Monitor speaking volume of local mic
  const setupAudioMonitoring = (stream: MediaStream) => {
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
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

  // Helper to drain buffered candidates after remote description is set
  const drainCandidateQueue = async (targetId: string, pc: RTCPeerConnection) => {
    const queue = candidateQueueRef.current.get(targetId) || [];
    while (queue.length > 0) {
      const cand = queue.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('Error adding queued ICE candidate:', e);
        }
      }
    }
  };

  // Create or get RTCPeerConnection for a target player
  const getOrCreatePeerConnection = useCallback((targetPlayerId: string): RTCPeerConnection => {
    let pc = peersRef.current.get(targetPlayerId);
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
      return pc;
    }

    if (pc) {
      try { pc.close(); } catch {}
    }

    pc = new RTCPeerConnection(RTC_CONFIG);

    // Attach active local audio tracks if enabled
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getAudioTracks().forEach(track => {
        pc!.addTrack(track, localAudioStreamRef.current!);
      });
    }

    // Attach active local video tracks if enabled
    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getVideoTracks().forEach(track => {
        pc!.addTrack(track, localVideoStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:signal', {
          roomId,
          targetPlayerId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc?.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed with ${targetPlayerId}, attempting ICE restart...`);
        pc.restartIce();
      }
    };

    pc.ontrack = (event) => {
      const { track, streams } = event;
      const stream = streams[0] || new MediaStream([track]);

      if (track.kind === 'video') {
        setRemoteStreams(prev => {
          const next = new Map(prev);
          let targetStream = next.get(targetPlayerId);
          if (!targetStream) {
            targetStream = new MediaStream();
            next.set(targetPlayerId, targetStream);
          }
          // Remove old video tracks to avoid duplicates
          targetStream.getVideoTracks().forEach(t => {
            if (t.id !== track.id) targetStream!.removeTrack(t);
          });
          if (!targetStream.getTracks().some(t => t.id === track.id)) {
            targetStream.addTrack(track);
          }
          return new Map(next);
        });
      }

      if (track.kind === 'audio') {
        // Use a single dedicated HTMLAudioElement per remote player with echo control
        let audioEl = remoteAudioElementsRef.current.get(targetPlayerId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          remoteAudioElementsRef.current.set(targetPlayerId, audioEl);
        }
        audioEl.srcObject = new MediaStream([track]);
        audioEl.play().catch(e => console.warn('Audio play autoplay policy:', e));
      }
    };

    peersRef.current.set(targetPlayerId, pc);
    return pc;
  }, [roomId, socket]);

  // Handle incoming signaling messages
  useEffect(() => {
    const onSignal = async (data: { senderPlayerId: string; signal: any }) => {
      if (!myPlayerId || data.senderPlayerId === myPlayerId) return;

      const { senderPlayerId, signal } = data;
      const pc = getOrCreatePeerConnection(senderPlayerId);

      try {
        if (signal.type === 'offer') {
          // Polite peer pattern: if both sent offers, polite peer rolls back
          const isPolite = myPlayerId > senderPlayerId;
          const offerCollision = pc.signalingState !== 'stable';

          if (offerCollision && !isPolite) {
            // Impolite peer ignores colliding offer
            return;
          }

          if (offerCollision && isPolite) {
            await pc.setLocalDescription({ type: 'rollback' } as any);
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await drainCandidateQueue(senderPlayerId, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: senderPlayerId,
            signal: answer,
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await drainCandidateQueue(senderPlayerId, pc);
        } else if (signal.type === 'candidate' && signal.candidate) {
          if (!pc.remoteDescription || !pc.remoteDescription.type) {
            // Buffer candidate until remote description is applied
            if (!candidateQueueRef.current.has(senderPlayerId)) {
              candidateQueueRef.current.set(senderPlayerId, []);
            }
            candidateQueueRef.current.get(senderPlayerId)!.push(signal.candidate);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Signal handling exception:', err);
      }
    };

    const onMediaStatus = (data: { playerId: string; cameraEnabled: boolean; micEnabled: boolean }) => {
      setRemoteMediaStatus(prev => {
        const next = new Map(prev);
        next.set(data.playerId, { cameraEnabled: data.cameraEnabled, micEnabled: data.micEnabled });
        return next;
      });

      // If remote player turned off mic, pause their audio element immediately to avoid residual sound
      if (!data.micEnabled) {
        const audioEl = remoteAudioElementsRef.current.get(data.playerId);
        if (audioEl) {
          audioEl.pause();
          audioEl.srcObject = null;
        }
      }
    };

    socket.on('webrtc:signal', onSignal);
    socket.on('media:player_status' as any, onMediaStatus as any);

    return () => {
      socket.off('webrtc:signal', onSignal);
      socket.off('media:player_status' as any, onMediaStatus as any);
    };
  }, [getOrCreatePeerConnection, myPlayerId, roomId, socket]);

  // Toggle microphone (with Hardware/Browser Acoustic Echo Cancellation enabled!)
  const toggleMic = async () => {
    if (micEnabled) {
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach(t => t.stop());
        localAudioStreamRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

      // Replace audio track with null on all peers to mute instantly
      peersRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) {
          sender.replaceTrack(null);
        }
      });

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
      // Acoustic Echo Cancellation, Noise Suppression, and Auto Gain Control prevent speaker loopback!
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
        video: false,
      });

      localAudioStreamRef.current = stream;
      setLocalStream(stream);
      setMicEnabled(true);
      setErrorMsg(null);

      setupAudioMonitoring(stream);
      socket.emit('media:status', { roomId, cameraEnabled, micEnabled: true });

      const audioTrack = stream.getAudioTracks()[0];

      // Update or add track to all other connected players
      otherPlayerIds.forEach(async (targetId) => {
        if (targetId === myPlayerId) return;
        const pc = getOrCreatePeerConnection(targetId);
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');

        if (sender) {
          await sender.replaceTrack(audioTrack);
        } else {
          pc.addTrack(audioTrack, stream);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: targetId,
            signal: offer,
          });
        }
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

      // Replace video track with null on all peers to turn off video immediately
      peersRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(null);
        }
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      localVideoStreamRef.current = stream;
      setLocalVideoStream(stream);
      setCameraEnabled(true);
      setErrorMsg(null);
      socket.emit('media:status', { roomId, cameraEnabled: true, micEnabled });

      const videoTrack = stream.getVideoTracks()[0];

      // Connect to all peers and attach video track
      otherPlayerIds.forEach(async (targetId) => {
        if (targetId === myPlayerId) return;
        const pc = getOrCreatePeerConnection(targetId);
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');

        if (sender) {
          await sender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, stream);
        }

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

  // Clean up all peers, audio elements, and media tracks on unmount
  useEffect(() => {
    return () => {
      localAudioStreamRef.current?.getTracks().forEach(t => t.stop());
      localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(pc => {
        try { pc.close(); } catch {}
      });
      peersRef.current.clear();
      candidateQueueRef.current.clear();
      remoteAudioElementsRef.current.forEach(el => {
        el.pause();
        el.srcObject = null;
      });
      remoteAudioElementsRef.current.clear();
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
