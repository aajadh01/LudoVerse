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

// Robust STUN + Multi-transport TURN servers for cross-network / mobile cellular NAT traversal (4G/5G/WAN)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.metered.ca:80' },
    { urls: 'stun:relay.metered.ca:80' },
    {
      urls: [
        'turn:relay.metered.ca:80',
        'turn:relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:443',
        'turn:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
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
            socket.emit('media:speaking' as any, { roomId, isSpeaking: true });
            const next = new Set(prev);
            next.add(myPlayerId);
            return next;
          } else if (!isSpeaking && has) {
            socket.emit('media:speaking' as any, { roomId, isSpeaking: false });
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

  // Helper to attach or update remote audio stream
  const attachOrUpdateRemoteAudio = useCallback((targetPlayerId: string, pc: RTCPeerConnection) => {
    const audioReceiver = pc.getReceivers().find(r => r.track && r.track.kind === 'audio');
    if (!audioReceiver || !audioReceiver.track) return;

    const track = audioReceiver.track;
    let audioEl = remoteAudioElementsRef.current.get(targetPlayerId);

    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      // @ts-expect-error - playsInline is required for iOS WebKit
      audioEl.playsInline = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      remoteAudioElementsRef.current.set(targetPlayerId, audioEl);
    }

    const currentStream = audioEl.srcObject as MediaStream | null;
    const hasCurrentTrack = currentStream?.getAudioTracks().some(t => t.id === track.id);
    if (!hasCurrentTrack) {
      audioEl.srcObject = new MediaStream([track]);
    }

    audioEl.muted = false;
    audioEl.volume = 1.0;
    audioEl.play().catch(e => console.warn('[WebRTC] audio play blocked by browser policy:', e));

    track.onunmute = () => {
      audioEl!.srcObject = new MediaStream([track]);
      audioEl!.muted = false;
      audioEl!.play().catch(() => {});
    };
  }, []);

  // Helper to attach or update remote video stream
  const attachOrUpdateRemoteVideo = useCallback((targetPlayerId: string, pc: RTCPeerConnection) => {
    const videoReceiver = pc.getReceivers().find(r => r.track && r.track.kind === 'video');
    if (!videoReceiver || !videoReceiver.track) return;

    const track = videoReceiver.track;
    const update = () => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(targetPlayerId, new MediaStream([track]));
        return next;
      });
    };

    update();
    track.onunmute = () => update();
    track.onended = () => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(targetPlayerId);
        return next;
      });
    };
  }, []);

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

    // Initialize bidirectional audio/video transceivers or attach active tracks
    try {
      const audioTrack = localAudioStreamRef.current?.getAudioTracks()[0];
      if (audioTrack && localAudioStreamRef.current) {
        pc.addTrack(audioTrack, localAudioStreamRef.current);
      } else {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      const videoTrack = localVideoStreamRef.current?.getVideoTracks()[0];
      if (videoTrack && localVideoStreamRef.current) {
        pc.addTrack(videoTrack, localVideoStreamRef.current);
      } else {
        pc.addTransceiver('video', { direction: 'recvonly' });
      }
    } catch (e) {
      console.warn('[WebRTC] Transceiver setup note:', e);
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

    pc.oniceconnectionstatechange = async () => {
      if (pc?.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed with ${targetPlayerId}, attempting ICE restart...`);
        try {
          pc.restartIce();
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId,
            signal: offer,
          });
        } catch (e) {
          console.warn('[WebRTC] ICE restart offer error:', e);
        }
      }
    };

    pc.ontrack = (event) => {
      if (event.track.kind === 'audio') {
        attachOrUpdateRemoteAudio(targetPlayerId, pc!);
      }
      if (event.track.kind === 'video') {
        attachOrUpdateRemoteVideo(targetPlayerId, pc!);
      }
    };

    peersRef.current.set(targetPlayerId, pc);
    return pc;
  }, [attachOrUpdateRemoteAudio, attachOrUpdateRemoteVideo, roomId, socket]);

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

          // Synchronize incoming remote tracks immediately after remote description is applied
          attachOrUpdateRemoteAudio(senderPlayerId, pc);
          attachOrUpdateRemoteVideo(senderPlayerId, pc);

          // If we have active local tracks, attach them to existing transceivers before creating answer
          if (localAudioStreamRef.current) {
            const at = localAudioStreamRef.current.getAudioTracks()[0];
            const audioTransceiver = pc.getTransceivers().find(
              t => t.receiver.track.kind === 'audio' || t.sender.track?.kind === 'audio'
            );
            if (audioTransceiver && at) {
              audioTransceiver.direction = 'sendrecv';
              await audioTransceiver.sender.replaceTrack(at);
            }
          }

          if (localVideoStreamRef.current) {
            const vt = localVideoStreamRef.current.getVideoTracks()[0];
            const videoTransceiver = pc.getTransceivers().find(
              t => t.receiver.track.kind === 'video' || t.sender.track?.kind === 'video'
            );
            if (videoTransceiver && vt) {
              videoTransceiver.direction = 'sendrecv';
              await videoTransceiver.sender.replaceTrack(vt);
            }
          }

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

          // Synchronize incoming remote tracks after answer description is applied
          attachOrUpdateRemoteAudio(senderPlayerId, pc);
          attachOrUpdateRemoteVideo(senderPlayerId, pc);
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

      const pc = peersRef.current.get(data.playerId);
      const audioEl = remoteAudioElementsRef.current.get(data.playerId);

      if (data.micEnabled) {
        if (pc) {
          attachOrUpdateRemoteAudio(data.playerId, pc);
        }
        if (audioEl) {
          audioEl.muted = false;
          audioEl.play().catch(() => {});
        }
      } else {
        if (audioEl) {
          audioEl.muted = true; // Clean mute without wiping srcObject!
        }
      }
    };

    const onSpeaking = (data: { playerId: string; isSpeaking: boolean }) => {
      setSpeakingPlayers(prev => {
        const has = prev.has(data.playerId);
        if (data.isSpeaking && !has) {
          const next = new Set(prev);
          next.add(data.playerId);
          return next;
        } else if (!data.isSpeaking && has) {
          const next = new Set(prev);
          next.delete(data.playerId);
          return next;
        }
        return prev;
      });
    };

    socket.on('webrtc:signal', onSignal);
    socket.on('media:player_status' as any, onMediaStatus as any);
    socket.on('media:player_speaking' as any, onSpeaking as any);

    return () => {
      socket.off('webrtc:signal', onSignal);
      socket.off('media:player_status' as any, onMediaStatus as any);
      socket.off('media:player_speaking' as any, onSpeaking as any);
    };
  }, [attachOrUpdateRemoteAudio, attachOrUpdateRemoteVideo, getOrCreatePeerConnection, myPlayerId, roomId, socket]);

  // Toggle microphone (with Hardware/Browser Acoustic Echo Cancellation enabled!)
  const toggleMic = async () => {
    if (micEnabled) {
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach(t => t.stop());
        localAudioStreamRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

      // Replace audio track with null and set direction to recvonly
      peersRef.current.forEach(pc => {
        const audioTransceiver = pc.getTransceivers().find(
          t => t.receiver.track.kind === 'audio' || t.sender.track?.kind === 'audio'
        );
        if (audioTransceiver) {
          audioTransceiver.sender.replaceTrack(null);
          audioTransceiver.direction = 'recvonly';
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
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
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
        const audioTransceiver = pc.getTransceivers().find(
          t => t.receiver.track.kind === 'audio' || t.sender.track?.kind === 'audio'
        );

        if (audioTransceiver) {
          audioTransceiver.direction = 'sendrecv';
          await audioTransceiver.sender.replaceTrack(audioTrack);
        } else {
          pc.addTrack(audioTrack, stream);
        }

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: targetId,
            signal: offer,
          });
        } catch (e) {
          console.warn('[WebRTC] Mic offer creation error:', e);
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

      // Replace video track with null and set direction to recvonly
      peersRef.current.forEach(pc => {
        const videoTransceiver = pc.getTransceivers().find(
          t => t.receiver.track.kind === 'video' || t.sender.track?.kind === 'video'
        );
        if (videoTransceiver) {
          videoTransceiver.sender.replaceTrack(null);
          videoTransceiver.direction = 'recvonly';
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
        const videoTransceiver = pc.getTransceivers().find(
          t => t.receiver.track.kind === 'video' || t.sender.track?.kind === 'video'
        );

        if (videoTransceiver) {
          videoTransceiver.direction = 'sendrecv';
          await videoTransceiver.sender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, stream);
        }

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: targetId,
            signal: offer,
          });
        } catch (e) {
          console.warn('[WebRTC] Cam offer creation error:', e);
        }
      });
    } catch {
      setErrorMsg('Camera access denied or not available');
      setCameraEnabled(false);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Auto-negotiate with newly joined peers if local media is already active
  useEffect(() => {
    if (!myPlayerId) return;
    if (!cameraEnabled && !micEnabled) return;

    otherPlayerIds.forEach(async (targetId) => {
      if (targetId === myPlayerId) return;
      const pc = getOrCreatePeerConnection(targetId);

      // Re-apply local tracks to this peer
      if (localVideoStreamRef.current) {
        const vt = localVideoStreamRef.current.getVideoTracks()[0];
        const vTransceiver = pc.getTransceivers().find(
          t => t.receiver.track.kind === 'video' || t.sender.track?.kind === 'video'
        );
        if (vTransceiver && vt) {
          vTransceiver.direction = 'sendrecv';
          await vTransceiver.sender.replaceTrack(vt);
        }
      }

      if (localAudioStreamRef.current) {
        const at = localAudioStreamRef.current.getAudioTracks()[0];
        const aTransceiver = pc.getTransceivers().find(
          t => t.receiver.track.kind === 'audio' || t.sender.track?.kind === 'audio'
        );
        if (aTransceiver && at) {
          aTransceiver.direction = 'sendrecv';
          await aTransceiver.sender.replaceTrack(at);
        }
      }

      // Initiate renegotiation if polite or connection is stable
      if (pc.signalingState === 'stable') {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', {
            roomId,
            targetPlayerId: targetId,
            signal: offer,
          });
        } catch (e) {
          console.warn('[WebRTC] Peer sync offer error:', e);
        }
      }
    });
  }, [otherPlayerIds, cameraEnabled, micEnabled, myPlayerId, getOrCreatePeerConnection, roomId, socket]);

  // Auto-unlock audio playback on first user touch / click (mobile Safari & Chrome autoplay policy)
  useEffect(() => {
    const unlockAudio = () => {
      peersRef.current.forEach((pc, pId) => {
        attachOrUpdateRemoteAudio(pId, pc);
      });
      remoteAudioElementsRef.current.forEach(audioEl => {
        audioEl.muted = false;
        audioEl.play().catch(() => {});
      });
    };
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, [attachOrUpdateRemoteAudio]);

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
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
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
