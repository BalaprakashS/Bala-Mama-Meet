import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/router";
import {
  AcrScore,
  ActiveSpeaker,
  CustomEvent,
  getDisplayMedia,
  LocalParticipant,
  LocalTrack,
  RemoteParticipant,
  Space,
  SpaceEvent,
  SpaceOptionsParams,
  Track,
  TrackSource,
} from "@mux/spaces-web";

import { MAX_PARTICIPANTS_PER_PAGE } from "lib/constants";
import UserContext from "./User";
import UserMediaContext from "./UserMedia";

interface SpaceState {
  space: Space | null;
  localParticipant: LocalParticipant | null;
  remoteParticipants: RemoteParticipant[];

  joinSpace: (
    jwt: string,
    endsAt?: number,
    displayName?: string
  ) => Promise<void>;
  joinError: string | null;
  isJoined: boolean;

  connectionIds: string[];
  isBroadcasting: boolean;
  participantCount: number;
  publishCamera: (deviceId: string) => void;
  publishMicrophone: (deviceId: string) => void;
  unPublishDevice: (deviceId: string) => void;

  isLocalScreenShareSupported: boolean;
  isScreenShareActive: boolean;
  isLocalScreenShare: boolean;
  screenShareError: string | null;
  attachScreenShare: (element: HTMLVideoElement) => void;
  startScreenShare: () => void;
  stopScreenShare: () => void;
  screenShareParticipantConnectionId?: string;
  screenShareParticipantName?: string;

  spaceEndsAt: number | null;
  leaveSpace: () => void;
  submitAcrScore: (score: AcrScore) => Promise<void> | undefined;

  setDisplayName: (name: string) => Promise<LocalParticipant | undefined>;
  publishCustomEvent: (payload: string) => Promise<CustomEvent | undefined>;
}

export const SpaceContext = createContext({} as SpaceState);
export default SpaceContext;

type Props = {
  children: ReactNode;
};

export const SpaceProvider: React.FC<Props> = ({ children }) => {
  const { userWantsMicMuted, microphoneDeviceId, cameraOff, cameraDeviceId } =
    useContext(UserContext);
  const { getMicrophone, getCamera } = useContext(UserMediaContext);

  const [space, setSpace] = useState<Space | null>(null);
  const [spaceEndsAt, setSpaceEndsAt] = useState<number | null>(null);
  const [localParticipant, setLocalParticipant] =
    useState<LocalParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<
    RemoteParticipant[]
  >([]);
  const [isJoined, setIsJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const [screenShareTrack, setScreenShareTrack] = useState<Track>();
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [participantScreenSharing, setParticipantScreenSharing] = useState<
    LocalParticipant | RemoteParticipant | null
  >(null);

  const isLocalScreenShareSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof navigator?.mediaDevices?.getDisplayMedia === "function",
    []
  );

  // --- Memoized values ---
  const screenShareParticipantName = useMemo(
    () => participantScreenSharing?.displayName,
    [participantScreenSharing]
  );

  const screenShareParticipantConnectionId = useMemo(
    () => participantScreenSharing?.connectionId,
    [participantScreenSharing]
  );

  const isScreenShareActive = useMemo(() => !!screenShareTrack, [screenShareTrack]);
  const isLocalScreenShare = useMemo(
    () => participantScreenSharing instanceof LocalParticipant,
    [participantScreenSharing]
  );

  const participantCount = useMemo(
    () => (localParticipant ? 1 : 0) + remoteParticipants.length,
    [localParticipant, remoteParticipants]
  );

  const connectionIds = useMemo(
    () =>
      (localParticipant ? [localParticipant.connectionId] : []).concat(
        remoteParticipants.map((p) => p.connectionId)
      ),
    [localParticipant, remoteParticipants]
  );

  // --- Helpers ---
  const publishForLocalParticipant = useCallback(
    async (localParticipant: LocalParticipant) => {
      const tracksToPublish: Track[] = [];
      if (cameraDeviceId && !cameraOff) {
        const cameraTrack = await getCamera(cameraDeviceId);
        if (cameraTrack) tracksToPublish.push(cameraTrack);
      }
      if (microphoneDeviceId) {
        const microphoneTrack = await getMicrophone(microphoneDeviceId);
        if (microphoneTrack) tracksToPublish.push(microphoneTrack);
      }
      if (tracksToPublish.length > 0) {
        const publishedTracks = await localParticipant.publishTracks(tracksToPublish);
        const publishedMicrophone = publishedTracks.find(
          (track) => track.source === TrackSource.Microphone
        );
        if (publishedMicrophone && userWantsMicMuted) {
          publishedMicrophone.mute();
        }
      }
    },
    [
      cameraOff,
      getMicrophone,
      microphoneDeviceId,
      getCamera,
      cameraDeviceId,
      userWantsMicMuted,
    ]
  );

  const router = useRouter();

  // --- Join space ---
  const joinSpace = useCallback(
    async (jwt: string, endsAt?: number, displayName?: string) => {
      let _space: Space;
      try {
        const spaceOpts: SpaceOptionsParams = { displayName };
        if (router.isReady && typeof router.query.auto_sub_limit === "string") {
          spaceOpts.automaticParticipantLimit = parseInt(router.query.auto_sub_limit);
        }
        _space = new Space(jwt, spaceOpts);
      } catch (e: any) {
        setJoinError(e.message);
        console.error("Error creating space:", e);
        return;
      }

      if (endsAt) setSpaceEndsAt(endsAt);

      // Event handlers
      const handleBroadcastStateChange = (broadcastState: boolean) =>
        setIsBroadcasting(broadcastState);

      const handleParticipantJoined = (newParticipant: RemoteParticipant) => {
        setRemoteParticipants((old) => {
          const found = old.find(
            (p) => p.connectionId === newParticipant.connectionId
          );
          return found ? old : [...old, newParticipant];
        });
      };

      const handleParticipantLeft = (leaving: RemoteParticipant) => {
        setRemoteParticipants((old) =>
          old.filter((p) => p.connectionId !== leaving.connectionId)
        );
      };

      const handleActiveSpeakerChanged = (changes: ActiveSpeaker[]) => {
        setRemoteParticipants((old) => {
          const updated = [...old];
          changes.forEach((activeSpeaker) => {
            if (activeSpeaker.participant instanceof RemoteParticipant) {
              const idx = updated.findIndex(
                (p) => p.connectionId === activeSpeaker.participant.connectionId
              );
              if (idx >= MAX_PARTICIPANTS_PER_PAGE - 1) {
                updated.splice(idx, 1);
                updated.unshift(activeSpeaker.participant);
              }
            }
          });
          return updated;
        });
      };

      const setupScreenShare = (
        participant: LocalParticipant | RemoteParticipant,
        track: Track
      ) => {
        setScreenShareTrack(track);
        setParticipantScreenSharing(participant);
      };

      const tearDownScreenShare = () => {
        setScreenShareTrack(undefined);
        setParticipantScreenSharing(null);
      };

      const handleParticipantTrackPublished = (
        participant: LocalParticipant | RemoteParticipant,
        track: Track
      ) => {
        if (track.source === TrackSource.Screenshare && track.hasMedia()) {
          setupScreenShare(participant, track);
        }
      };

      const handleParticipantTrackSubscribed = (
        participant: LocalParticipant | RemoteParticipant,
        track: Track
      ) => {
        if (participant instanceof RemoteParticipant) {
          reorderRemoteParticipantsBySubscription(participant);
        }
        if (track.source === TrackSource.Screenshare && track.hasMedia()) {
          setupScreenShare(participant, track);
        }
      };

      const handleParticipantTrackUnpublished = (
        _participant: LocalParticipant | RemoteParticipant,
        track: Track
      ) => {
        if (track.source === TrackSource.Screenshare) tearDownScreenShare();
      };

      const handleParticipantTrackUnsubscribed = (
        participant: LocalParticipant | RemoteParticipant,
        track: Track
      ) => {
        if (participant instanceof RemoteParticipant) {
          reorderRemoteParticipantsBySubscription(participant);
        }
        if (track.source === TrackSource.Screenshare) tearDownScreenShare();
      };

      const handleParticipantDisplayNameChanged = (
        updated: LocalParticipant | RemoteParticipant
      ) => {
        if (updated instanceof RemoteParticipant) {
          setRemoteParticipants((old) => {
            const found = old.find(
              (p) => p.connectionId === updated.connectionId
            );
            if (found) found.displayName = updated.displayName;
            return [...old];
          });
        } else {
          setLocalParticipant((local) => {
            if (!local) return null;
            local.displayName = updated.displayName;
            return local;
          });
        }
      };

      const reorderRemoteParticipantsBySubscription = (
        participantWhoChanged: RemoteParticipant
      ) => {
        setRemoteParticipants((old) => {
          const updated = old.map((p) =>
            p.connectionId === participantWhoChanged.connectionId
              ? participantWhoChanged
              : p
          );
          return [
            ...updated.filter((p) => p.isSubscribed()),
            ...updated.filter((p) => !p.isSubscribed()),
          ];
        });
      };

      // Bind events
      _space.on(SpaceEvent.ParticipantJoined, handleParticipantJoined);
      _space.on(SpaceEvent.ParticipantLeft, handleParticipantLeft);
      _space.on(SpaceEvent.ActiveSpeakersChanged, handleActiveSpeakerChanged);
      _space.on(SpaceEvent.BroadcastStateChanged, handleBroadcastStateChange);
      _space.on(SpaceEvent.ParticipantTrackPublished, handleParticipantTrackPublished);
      _space.on(SpaceEvent.ParticipantTrackSubscribed, handleParticipantTrackSubscribed);
      _space.on(SpaceEvent.ParticipantTrackUnpublished, handleParticipantTrackUnpublished);
      _space.on(SpaceEvent.ParticipantTrackUnsubscribed, handleParticipantTrackUnsubscribed);
      _space.on(SpaceEvent.ParticipantDisplayNameChanged, handleParticipantDisplayNameChanged);

      setSpace(_space);

      try {
        const _localParticipant = await _space.join();
        await publishForLocalParticipant(_localParticipant);
        setLocalParticipant(_localParticipant);
        setIsBroadcasting(_space.broadcasting);
        setIsJoined(true);
      } catch (error: any) {
        setJoinError(error.message);
        console.error("Error joining space:", error);
        setIsBroadcasting(false);
        setIsJoined(false);
      }
    },
    [publishForLocalParticipant, router.isReady, router.query.auto_sub_limit]
  );

  // --- Device publishing ---
  const publishMicrophone = useCallback(
    async (deviceId: string) => {
      if (!localParticipant)
        throw new Error("Join a space before publishing a device.");
      const micTrack = await getMicrophone(deviceId);
      const publishedMic = localParticipant
        .getAudioTracks()
        .find(
          (t) => t.source === TrackSource.Microphone && t.deviceId === deviceId
        );
      if (publishedMic) throw new Error("That microphone is already published.");
      await localParticipant.publishTracks([micTrack]);
      if (userWantsMicMuted) micTrack.mute();
    },
    [localParticipant, getMicrophone, userWantsMicMuted]
  );

  const publishCamera = useCallback(
    async (deviceId: string) => {
      if (!localParticipant)
        throw new Error("Join a space before publishing a device.");
      const camTrack = await getCamera(deviceId);
      const publishedCam = localParticipant
        .getVideoTracks()
        .find(
          (t) => t.source === TrackSource.Camera && t.deviceId === deviceId
        );
      if (publishedCam) throw new Error("That camera is already published.");
      await localParticipant.publishTracks([camTrack]);
    },
    [localParticipant, getCamera]
  );

  const unPublishDevice = useCallback(
    (deviceId: string) => {
      if (!localParticipant)
        throw new Error(
          "Join a space and publish a device before un-publishing."
        );
      const published = localParticipant
        .getTracks()
        .find((track) => track.deviceId === deviceId);
      if (published) localParticipant.unpublishTracks([published]);
    },
    [localParticipant]
  );

  // --- Screen share ---
  const startScreenShare = useCallback(async () => {
    if (!localParticipant) return;
    try {
      const screenStreams = await getDisplayMedia({ video: true, audio: false });
      const screenStream = screenStreams?.find(
        (track) => track.source === "screenshare"
      );
      if (!screenStream) throw new Error("No screen share track found.");
      return localParticipant
        .publishTracks([screenStream])
        .then((tracks: LocalTrack[]) => tracks[0]);
    } catch (err: any) {
      if (err.message.includes("Permission denied")) return;
      setScreenShareError(err.message);
      console.error("Screen share error:", err);
    }
  }, [localParticipant]);

  const stopScreenShare = useCallback(async () => {
    if (!screenShareTrack || !(screenShareTrack instanceof LocalTrack)) return;
    if (localParticipant) localParticipant.unpublishTracks([screenShareTrack]);
  }, [localParticipant, screenShareTrack]);

  const attachScreenShare = useCallback(
    (element: HTMLVideoElement) => {
      screenShareTrack?.attachedElements.forEach((el) =>
        screenShareTrack.detach(el)
      );
      screenShareTrack?.attach(element);
    },
    [screenShareTrack]
  );

  // --- Misc actions ---
  const submitAcrScore = useCallback(
    (score: AcrScore) => {
      if (!space) throw new Error("You must join a space before submitting an ACR score.");
      return space.submitAcrScore(score);
    },
    [space]
  );

  const leaveSpace = useCallback(() => {
    try {
      space?.removeAllListeners();
      space?.leave();
    } finally {
      setJoinError(null);
      setRemoteParticipants([]);
      setIsBroadcasting(false);
      setLocalParticipant(null);
      setIsJoined(false);
      setSpaceEndsAt(null);
    }
  }, [space]);

  const publishCustomEvent = useCallback(
    async (payload: string) => {
      return space?.localParticipant?.publishCustomEvent(payload);
    },
    [space]
  );

  const setDisplayName = useCallback(
    async (name: string) => {
      return space?.localParticipant?.setDisplayName(name);
    },
    [space]
  );

  return (
    <SpaceContext.Provider
      value={{
        space,
        localParticipant,
        remoteParticipants,

        joinSpace,
        joinError,
        isJoined,

        connectionIds,
        isBroadcasting,
        participantCount,
        publishCamera,
        publishMicrophone,
        unPublishDevice,

        isLocalScreenShareSupported,
        isScreenShareActive,
        isLocalScreenShare,
        screenShareError,
        attachScreenShare,
        startScreenShare,
        stopScreenShare,
        screenShareParticipantConnectionId,
        screenShareParticipantName,

        leaveSpace,
        submitAcrScore,
        spaceEndsAt,

        setDisplayName,
        publishCustomEvent,
      }}
    >
      {children}
    </SpaceContext.Provider>
  );
};
