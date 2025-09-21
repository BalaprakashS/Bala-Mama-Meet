import React, {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CreateLocalMediaOptions,
  getUserMedia,
  LocalTrack,
  TrackSource,
} from "@mux/spaces-web";

import UserContext from "./User";
import { defaultAudioConstraints } from "shared/defaults";

interface UserMediaState {
  activeCamera?: LocalTrack;
  activeMicrophone?: LocalTrack;

  userMediaError?: string;
  requestPermissionAndPopulateDevices: () => void;
  requestPermissionAndStartDevices: (
    microphoneDeviceId?: string,
    cameraDeviceId?: string
  ) => Promise<void>;

  getCamera: (deviceId: string) => Promise<LocalTrack>;
  cameraDevices: MediaDeviceInfo[];
  activeCameraId?: string;
  stopActiveCamera: () => void;
  changeActiveCamera: (deviceId: string) => Promise<void>;

  getMicrophone: (deviceId: string) => Promise<LocalTrack>;
  microphoneDevices: MediaDeviceInfo[];
  activeMicrophoneId?: string;
  muteActiveMicrophone: () => void;
  unMuteActiveMicrophone: () => void;
  changeActiveMicrophone: (deviceId: string) => Promise<void>;
  getActiveMicrophoneLevel: () => {
    avgDb: number;
    peakDb: number;
  } | null;
}

export const UserMediaContext = createContext({} as UserMediaState);
export default UserMediaContext;

const defaultCameraOption: CreateLocalMediaOptions = {
  video: {},
};

const defaultMicrophoneOption: CreateLocalMediaOptions = {
  audio: { constraints: defaultAudioConstraints },
};

const noCameraOption: CreateLocalMediaOptions = {
  video: false,
};

const noMicrophoneOption: CreateLocalMediaOptions = {
  audio: false,
};

const defaultMicrophoneCameraOptions: CreateLocalMediaOptions = {
  ...defaultCameraOption,
  ...defaultMicrophoneOption,
};

type Props = {
  children: ReactNode;
};

export const UserMediaProvider: React.FC<Props> = ({ children }) => {
  const {
    cameraDeviceId,
    setCameraDeviceId,
    microphoneDeviceId,
    setMicrophoneDeviceId,
    userWantsMicMuted,
  } = React.useContext(UserContext);

  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeMicrophone, setActiveMicrophone] = useState<LocalTrack>();
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeCamera, setActiveCamera] = useState<LocalTrack>();
  const [localAudioAnalyser, setLocalAudioAnalyser] = useState<AnalyserNode>();
  const [userMediaError, setUserMediaError] = useState<string>();

  const activeCameraId = useMemo(() => activeCamera?.deviceId, [activeCamera]);
  const activeMicrophoneId = useMemo(() => activeMicrophone?.deviceId, [activeMicrophone]);

  const setupLocalMicrophoneAnalyser = useCallback((track: LocalTrack) => {
    const stream = new MediaStream([track.track]);
    const audioCtx = new AudioContext();
    const streamSource = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    streamSource.connect(analyser);
    analyser.fftSize = 2048;
    setLocalAudioAnalyser(analyser);
  }, []);

  const loadDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;

    const availableDevices = await navigator.mediaDevices.enumerateDevices();

    setMicrophoneDevices(availableDevices.filter((d) => d.kind === "audioinput"));
    setCameraDevices(availableDevices.filter((d) => d.kind === "videoinput"));
  }, []);

  const requestPermissionAndPopulateDevices = useCallback(async () => {
    let tracks: LocalTrack[] = [];
    try {
      tracks = await getUserMedia({
        audio: { constraints: { deviceId: microphoneDeviceId } },
        video: { constraints: { deviceId: cameraDeviceId } },
      });
    } catch (e) {
      console.log("Failed to request default devices from browser.");
    }

    try {
      tracks.forEach((track) => {
        if (track.deviceId) {
          if (track.source === TrackSource.Camera) setCameraDeviceId(track.deviceId);
          else if (track.source === TrackSource.Microphone) setMicrophoneDeviceId(track.deviceId);
        }
      });
    } catch {
      console.log("Error while stopping devices.");
    }

    await loadDevices();
    tracks.forEach((track) => track.track.stop());
  }, [cameraDeviceId, loadDevices, microphoneDeviceId, setCameraDeviceId, setMicrophoneDeviceId]);

  const requestPermissionAndStartDevices = useCallback(
    async (microphoneDeviceId?: string, cameraDeviceId?: string) => {
      let options = { ...defaultMicrophoneCameraOptions };

      if (typeof microphoneDeviceId === "undefined") options.audio = false;
      else if (microphoneDeviceId !== "") {
        options.audio = {
          constraints: { deviceId: { exact: microphoneDeviceId }, ...defaultAudioConstraints },
        };
      }

      if (typeof cameraDeviceId === "undefined") options.video = false;
      else if (cameraDeviceId !== "") {
        options.video = { constraints: { deviceId: { exact: cameraDeviceId } } };
      }

      let tracks: LocalTrack[] = [];
      try {
        tracks = await getUserMedia(options);
      } catch (e: any) {
        if (["NotAllowedError", "PermissionDeniedError"].includes(e.name) || e instanceof DOMException) {
          setUserMediaError("NotAllowedError");
        } else if (["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(e.name)) {
          tracks = await getUserMedia({ audio: true, video: true });
        } else {
          setUserMediaError(e.name);
        }
      }

      tracks.forEach((track) => {
        if (track.source === TrackSource.Microphone) {
          setActiveMicrophone(track);
          setupLocalMicrophoneAnalyser(track);
          if (track.deviceId) setMicrophoneDeviceId(track.deviceId);
          if (userWantsMicMuted) track.mute();
        } else if (track.source === TrackSource.Camera) {
          setActiveCamera(track);
          if (track.deviceId) setCameraDeviceId(track.deviceId);
        }
      });

      await loadDevices();
    },
    [setupLocalMicrophoneAnalyser, setMicrophoneDeviceId, setCameraDeviceId, userWantsMicMuted, loadDevices]
  );

  const muteActiveMicrophone = useCallback(() => activeMicrophone?.mute(), [activeMicrophone]);
  const unMuteActiveMicrophone = useCallback(() => activeMicrophone?.unMute(), [activeMicrophone]);

  const getMicrophone = useCallback(
    async (deviceId: string) => {
      let options = { ...defaultMicrophoneOption, ...noCameraOption };
      if (deviceId !== "") options.audio = { constraints: { deviceId: { exact: deviceId }, ...defaultAudioConstraints } };

      let tracks: LocalTrack[] = [];
      try {
        tracks = await getUserMedia(options);
      } catch (e: any) {
        if (["NotAllowedError", "PermissionDeniedError"].includes(e.name) || e instanceof DOMException) {
          setUserMediaError("NotAllowedError");
        } else if (["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(e.name)) {
          setUserMediaError("OverconstrainedError");
        } else {
          setUserMediaError(e.name);
        }
      }

      tracks.forEach((track) => {
        if (track.source === TrackSource.Microphone) {
          setActiveMicrophone(track);
          setupLocalMicrophoneAnalyser(track);
          if (track.deviceId) setMicrophoneDeviceId(track.deviceId);
          if (userWantsMicMuted) track.mute();
        }
      });

      return tracks[0];
    },
    [setupLocalMicrophoneAnalyser, setMicrophoneDeviceId, userWantsMicMuted]
  );

  const changeActiveMicrophone = useCallback(async (deviceId: string) => {
    await getMicrophone(deviceId);
  }, [getMicrophone]);

  const getActiveMicrophoneLevel = useCallback(() => {
    if (!localAudioAnalyser) return null;

    const buffer = new Float32Array(localAudioAnalyser.fftSize);
    localAudioAnalyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sq = buffer[i] ** 2;
      sum += sq;
      if (sq > peak) peak = sq;
    }

    return {
      avgDb: 10 * Math.log10(sum / buffer.length),
      peakDb: 10 * Math.log10(peak),
    };
  }, [localAudioAnalyser]);

  const getCamera = useCallback(
    async (deviceId: string) => {
      let options = { ...defaultCameraOption, ...noMicrophoneOption };
      if (deviceId !== "") options.video = { constraints: { deviceId: { exact: deviceId } } };

      let tracks: LocalTrack[] = [];
      try {
        tracks = await getUserMedia(options);
      } catch (e: any) {
        if (["NotAllowedError", "PermissionDeniedError"].includes(e.name) || e instanceof DOMException) {
          setUserMediaError("NotAllowedError");
        } else if (["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(e.name)) {
          setUserMediaError("OverconstrainedError");
        } else {
          setUserMediaError(e.name);
        }
      }

      tracks.forEach((track) => {
        if (track.source === TrackSource.Camera) {
          setActiveCamera(track);
          if (track.deviceId) setCameraDeviceId(track.deviceId);
        }
      });

      return tracks[0];
    },
    [setCameraDeviceId]
  );

  const changeActiveCamera = useCallback(async (deviceId: string) => {
    await getCamera(deviceId);
  }, [getCamera]);

  const stopActiveCamera = useCallback(() => {
    if (activeCamera) {
      activeCamera.stop();
      setActiveCamera(undefined);
    }
  }, [activeCamera]);

  const onDeviceChange = useCallback(async () => {
    console.log("Detected device change, refreshing device list");
    await loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (userWantsMicMuted && !activeMicrophone?.muted) activeMicrophone?.mute();
    else if (!userWantsMicMuted && activeMicrophone?.muted) activeMicrophone?.unMute();
  }, [userWantsMicMuted, activeMicrophone]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
      return () => navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
    }
  }, [onDeviceChange]);

  return (
    <UserMediaContext.Provider
      value={{
        activeCamera,
        activeMicrophone,
        userMediaError,
        requestPermissionAndPopulateDevices,
        requestPermissionAndStartDevices,
        getCamera,
        cameraDevices,
        activeCameraId,
        stopActiveCamera,
        changeActiveCamera,
        getMicrophone,
        microphoneDevices,
        activeMicrophoneId,
        muteActiveMicrophone,
        unMuteActiveMicrophone,
        changeActiveMicrophone,
        getActiveMicrophoneLevel,
      }}
    >
      {children}
    </UserMediaContext.Provider>
  );
};
