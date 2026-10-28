import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Participant,
  LocalVideoTrack,
  LocalAudioTrack,
  createLocalVideoTrack,
  createLocalAudioTrack,
  VideoPresets,
  TrackPublication,
} from 'livekit-client';
import { getSocket, loadSession, getOrCreateUserId } from './useSocket';

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
  _otherPlayerIds: string[] = []
): UseMediaChatReturn {
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [speakingPlayers, setSpeakingPlayers] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteMediaStatus, setRemoteMediaStatus] = useState<
    Map<string, { cameraEnabled: boolean; micEnabled: boolean }>
  >(new Map());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);

  const roomRef = useRef<Room | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const attachedAudioElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const isConnectingRef = useRef<boolean>(false);

  const socket = getSocket();

  // ─── 1. Connect to LiveKit Room via Authenticated Backend Token ────────────
  useEffect(() => {
    if (!roomId || !myPlayerId) return;

    let isCancelled = false;

    async function initLiveKit() {
      if (isConnectingRef.current || roomRef.current) return;
      isConnectingRef.current = true;

      try {
        const session = loadSession();
        const sessionToken = session?.sessionToken;
        const userId = session?.userId || getOrCreateUserId();

        console.log(`[LiveKit] Requesting access token for room "${roomId}", player "${myPlayerId}"`);

        const res = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId,
            playerId: myPlayerId,
            sessionToken,
            userId,
          }),
        });

        if (isCancelled) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 503) {
            console.info('[LiveKit] Service notice:', errData.error || 'LiveKit credentials not configured on server.');
            // Do not display an aggressive error banner during normal gameplay if LiveKit credentials aren't set yet
          } else {
            console.warn('[LiveKit] Token request failed:', res.status, errData);
          }
          isConnectingRef.current = false;
          return;
        }

        const data = (await res.json()) as { token: string; serverUrl: string };
        if (isCancelled) return;

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        // ─── Track Subscribed: remote player published camera or microphone ───
        room.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            const pid = participant.identity;
            console.log(`[LiveKit] TrackSubscribed from "${pid}": kind=${track.kind}, muted=${publication.isMuted}`);

            if (track.kind === Track.Kind.Video) {
              const stream = new MediaStream([track.mediaStreamTrack]);
              setRemoteStreams((prev) => {
                const next = new Map(prev);
                next.set(pid, stream);
                return next;
              });

              setRemoteMediaStatus((prev) => {
                const next = new Map(prev);
                const current = next.get(pid) || { cameraEnabled: false, micEnabled: false };
                next.set(pid, { ...current, cameraEnabled: !publication.isMuted });
                return next;
              });
            } else if (track.kind === Track.Kind.Audio) {
              // Attach audio element to DOM for unmuted remote playback without feedback loop
              const audioEl = track.attach();
              audioEl.autoplay = true;
              attachedAudioElementsRef.current.set(`${pid}_audio`, audioEl);

              setRemoteMediaStatus((prev) => {
                const next = new Map(prev);
                const current = next.get(pid) || { cameraEnabled: false, micEnabled: false };
                next.set(pid, { ...current, micEnabled: !publication.isMuted });
                return next;
              });
            }
          }
        );

        // ─── Track Unsubscribed: remote player turned off camera/mic ─────────
        room.on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            const pid = participant.identity;
            console.log(`[LiveKit] TrackUnsubscribed from "${pid}": kind=${track.kind}`);

            if (track.kind === Track.Kind.Video) {
              setRemoteStreams((prev) => {
                const next = new Map(prev);
                next.delete(pid);
                return next;
              });

              setRemoteMediaStatus((prev) => {
                const next = new Map(prev);
                const current = next.get(pid);
                if (current) {
                  next.set(pid, { ...current, cameraEnabled: false });
                }
                return next;
              });
            } else if (track.kind === Track.Kind.Audio) {
              track.detach();
              const existingEl = attachedAudioElementsRef.current.get(`${pid}_audio`);
              if (existingEl) {
                existingEl.remove();
                attachedAudioElementsRef.current.delete(`${pid}_audio`);
              }

              setRemoteMediaStatus((prev) => {
                const next = new Map(prev);
                const current = next.get(pid);
                if (current) {
                  next.set(pid, { ...current, micEnabled: false });
                }
                return next;
              });
            }
          }
        );

        // ─── Track Muted / Unmuted Events ────────────────────────────────────
        room.on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: Participant) => {
          const pid = participant.identity;
          setRemoteMediaStatus((prev) => {
            const next = new Map(prev);
            const current = next.get(pid) || { cameraEnabled: false, micEnabled: false };
            if (publication.kind === Track.Kind.Video) {
              next.set(pid, { ...current, cameraEnabled: false });
            } else if (publication.kind === Track.Kind.Audio) {
              next.set(pid, { ...current, micEnabled: false });
            }
            return next;
          });
        });

        room.on(RoomEvent.TrackUnmuted, (publication: TrackPublication, participant: Participant) => {
          const pid = participant.identity;
          setRemoteMediaStatus((prev) => {
            const next = new Map(prev);
            const current = next.get(pid) || { cameraEnabled: false, micEnabled: false };
            if (publication.kind === Track.Kind.Video) {
              next.set(pid, { ...current, cameraEnabled: true });
            } else if (publication.kind === Track.Kind.Audio) {
              next.set(pid, { ...current, micEnabled: true });
            }
            return next;
          });
        });

        // ─── Active Speakers: Visual Speaking Pulse Indicator ───────────────
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const speakingSet = new Set<string>();
          for (const s of speakers) {
            if (s.identity) speakingSet.add(s.identity);
          }
          if (room.localParticipant.isSpeaking && myPlayerId) {
            speakingSet.add(myPlayerId);
          }
          setSpeakingPlayers(speakingSet);
        });

        // ─── Remote Participant Left ─────────────────────────────────────────
        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          const pid = participant.identity;
          console.log(`[LiveKit] Participant disconnected: "${pid}"`);

          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(pid);
            return next;
          });

          setRemoteMediaStatus((prev) => {
            const next = new Map(prev);
            next.delete(pid);
            return next;
          });

          setSpeakingPlayers((prev) => {
            const next = new Set(prev);
            next.delete(pid);
            return next;
          });

          const existingEl = attachedAudioElementsRef.current.get(`${pid}_audio`);
          if (existingEl) {
            existingEl.remove();
            attachedAudioElementsRef.current.delete(`${pid}_audio`);
          }
        });

        // ─── Connect to LiveKit SFU ──────────────────────────────────────────
        await room.connect(data.serverUrl, data.token);
        if (isCancelled) {
          room.disconnect();
          return;
        }

        roomRef.current = room;
        console.log(`[LiveKit] Connected successfully to room "${room.name}" as "${myPlayerId}"`);

        // Check if existing participants already published active tracks
        room.remoteParticipants.forEach((participant) => {
          const pid = participant.identity;
          participant.trackPublications.forEach((pub) => {
            if (pub.isSubscribed && pub.track) {
              if (pub.track.kind === Track.Kind.Video) {
                const stream = new MediaStream([pub.track.mediaStreamTrack]);
                setRemoteStreams((prev) => new Map(prev).set(pid, stream));
                setRemoteMediaStatus((prev) => {
                  const next = new Map(prev);
                  const current = next.get(pid) || { cameraEnabled: false, micEnabled: false };
                  return next.set(pid, { ...current, cameraEnabled: !pub.isMuted });
                });
              } else if (pub.track.kind === Track.Kind.Audio) {
                const audioEl = pub.track.attach();
                audioEl.autoplay = true;
                attachedAudioElementsRef.current.set(`${pid}_audio`, audioEl);
                setRemoteMediaStatus((prev) => {
                  const next = new Map(prev);
                  const current = next.get(pid) || { cameraEnabled: false, micEnabled: false };
                  return next.set(pid, { ...current, micEnabled: !pub.isMuted });
                });
              }
            }
          });
        });
      } catch (err: any) {
        console.warn('[LiveKit] Connection error:', err?.message || err);
      } finally {
        isConnectingRef.current = false;
      }
    }

    initLiveKit();

    return () => {
      isCancelled = true;
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      attachedAudioElementsRef.current.forEach((el) => {
        try {
          el.pause();
          el.remove();
        } catch {}
      });
      attachedAudioElementsRef.current.clear();
      isConnectingRef.current = false;
    };
  }, [roomId, myPlayerId]);

  // ─── 2. Toggle Camera: Opt-in, stops hardware completely when off ───────────
  const toggleCamera = useCallback(async () => {
    setErrorMsg(null);

    if (cameraEnabled) {
      // Turn Camera OFF
      try {
        const room = roomRef.current;
        if (room && localVideoTrackRef.current) {
          await room.localParticipant.unpublishTrack(localVideoTrackRef.current);
        }
        if (localVideoTrackRef.current) {
          localVideoTrackRef.current.stop();
          localVideoTrackRef.current = null;
        }
        setLocalVideoStream(null);
        setCameraEnabled(false);

        // Notify socket for secondary room state sync
        socket.emit('media:status', {
          roomId,
          cameraEnabled: false,
          micEnabled,
        });
      } catch (err: any) {
        console.error('[LiveKit] Error disabling camera:', err);
      }
    } else {
      // Turn Camera ON
      try {
        const track = await createLocalVideoTrack({
          resolution: VideoPresets.h360,
          facingMode: 'user',
        });
        localVideoTrackRef.current = track;

        const stream = new MediaStream([track.mediaStreamTrack]);
        setLocalVideoStream(stream);

        const room = roomRef.current;
        if (room) {
          await room.localParticipant.publishTrack(track, {
            name: 'camera',
            simulcast: false,
          });
        }
        setCameraEnabled(true);

        socket.emit('media:status', {
          roomId,
          cameraEnabled: true,
          micEnabled,
        });
      } catch (err: any) {
        console.error('[LiveKit] Failed to enable camera:', err);
        const msg =
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : 'Camera could not be activated: ' + (err?.message || 'Device error');
        setErrorMsg(msg);
      }
    }
  }, [cameraEnabled, micEnabled, roomId, socket]);

  // ─── 3. Toggle Microphone: Opt-in, stops hardware completely when off ───────
  const toggleMic = useCallback(async () => {
    setErrorMsg(null);

    if (micEnabled) {
      // Turn Mic OFF
      try {
        const room = roomRef.current;
        if (room && localAudioTrackRef.current) {
          await room.localParticipant.unpublishTrack(localAudioTrackRef.current);
        }
        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current = null;
        }
        setMicEnabled(false);

        socket.emit('media:status', {
          roomId,
          cameraEnabled,
          micEnabled: false,
        });
      } catch (err: any) {
        console.error('[LiveKit] Error disabling microphone:', err);
      }
    } else {
      // Turn Mic ON
      try {
        const track = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        localAudioTrackRef.current = track;

        const room = roomRef.current;
        if (room) {
          await room.localParticipant.publishTrack(track, {
            name: 'microphone',
          });
        }
        setMicEnabled(true);

        socket.emit('media:status', {
          roomId,
          cameraEnabled,
          micEnabled: true,
        });
      } catch (err: any) {
        console.error('[LiveKit] Failed to enable microphone:', err);
        const msg =
          err?.name === 'NotAllowedError'
            ? 'Microphone permission denied. Please allow microphone access in your browser settings.'
            : 'Microphone could not be activated: ' + (err?.message || 'Device error');
        setErrorMsg(msg);
      }
    }
  }, [cameraEnabled, micEnabled, roomId, socket]);

  // ─── Cleanup on Unmount: guarantee hardware tracks are released ────────────
  useEffect(() => {
    return () => {
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current = null;
      }
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current = null;
      }
    };
  }, []);

  return {
    micEnabled,
    cameraEnabled,
    localStream: localVideoStream,
    localVideoStream,
    remoteStreams,
    remoteMediaStatus,
    speakingPlayers,
    toggleMic,
    toggleCamera,
    errorMsg,
  };
}
