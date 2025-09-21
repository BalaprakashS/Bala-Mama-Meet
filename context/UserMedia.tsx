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
  changeActiveCamera: (deviceId: string) => Promise<LocalTrack>;

  getMicrophone: (deviceId: string) => Promise<LocalTrack>;
  microphoneDevices: MediaDeviceInfo[];
  activeMicrophoneId?: string;
  muteActiveMicrophone: () => void;
  unMuteActiveMicrophone: () => void;
  changeActiveMicrophone: (deviceId: string) => Promise<LocalTrack>;
  getActiveMicrophoneLevel: () => {
    avgDb: number;
    peakDb: number;
  } | null;
}

export const UserMediaContext = createContext({} as UserMediaState);
export default UserMediaContext;

const defaultCameraOption: CreateLocalMediaOptions = { video: {} };
const defaultMicrophoneOption: CreateLocalMediaOptions = {
  audio: { constraints: defaultAudioConstraints },
};
const noCameraOption: CreateLocalMediaOptions = { video: false };
const noMicrophoneOption: CreateLocalMediaOptions = { audio: false };
const defaultMicrophoneCameraOptions: CreateLocalMediaOptions = {
  ...defaultCameraOption,
  ...defaultMicrophoneOption,
};

type Props = { children: ReactNode };

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
    const devices = await navigator.mediaDevices.enumerateDevices();
    setMicrophoneDevices(devices.filter((d) => d.kind === "audioinput"));
    setCameraDevices(devices.filter((d) => d.kind === "videoinput"));
  }, []);

  const requestPermissionAndPopulateDevices = useCallback(async () => {
    let tracks: LocalTrack[] = [];
    try {
      tracks = await getUserMedia({
        audio: { constraints: { deviceId: microphoneDeviceId } },
        video: { constraints: { deviceId: cameraDeviceId } },
      });
    } catch {
      console.log("Failed to request default devices");
    }

    tracks.forEach((track) => {
      if (track.deviceId) {
        if (track.source === TrackSource.Camera) setCameraDeviceId(track.deviceId);
        else if (track.source === TrackSource.Microphone) setMicrophoneDeviceId(track.deviceId);
      }
      track.track.stop();
    });

    await loadDevices();
  }, [cameraDeviceId, microphoneDeviceId, setCameraDeviceId, setMicrophoneDeviceId, loadDevices]);

  const requestPermissionAndStartDevices = useCallback(
    async (microphoneDeviceId?: string, cameraDeviceId?: string) => {
      let options: CreateLocalMediaOptions = { ...defaultMicrophoneCameraOptions };
      if (microphoneDeviceId === undefined) options.audio = false;
      else if (microphoneDeviceId !== "") options.audio = { constraints: { deviceId: { exact: microphoneDeviceId }, ...defaultAudioConstraints } };
      if (cameraDeviceId === undefined) options.video = false;
      else if (cameraDeviceId !== "") options.video = { constraints: { deviceId: { exact: cameraDeviceId } } };

      let tracks: LocalTrack[] = [];
      try { tracks = await getUserMedia(options); } 
      catch (e: any) { setUserMediaError(e.name); }

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
    [setupLocalMicrophoneAnalyser, setCameraDeviceId, setMicrophoneDeviceId, userWantsMicMuted, loadDevices]
  );

  const muteActiveMicrophone = useCallback(() => activeMicrophone?.mute(), [activeMicrophone]);
  const unMuteActiveMicrophone = useCallback(() => activeMicrophone?.unMute(), [activeMicrophone]);

  const getMicrophone = useCallback(
    async (deviceId: string) => {
      let options = { ...defaultMicrophoneOption, ...noCameraOption };
      if (deviceId !== "") options.audio = { constraints: { deviceId: { exact: deviceId }, ...defaultAudioConstraints } };

      let tracks: LocalTrack[] = [];
      try { tracks = await getUserMedia(options); } 
      catch (e: any) { setUserMediaError(e.name); }

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

  const changeActiveMicrophone = useCallback(async (deviceId: string) => getMicrophone(deviceId), [getMicrophone]);

  const getActiveMicrophoneLevel = useCallback(() => {
    if (!localAudioAnalyser) return null;
    const buffer = new Float32Array(localAudioAnalyser.fftSize);
    localAudioAnalyser.getFloatTimeDomainData(buffer);
    const sum = buffer.reduce((acc, val) => acc + val ** 2, 0);
    const peak = Math.max(...buffer.map((v) => v ** 2));
    return { avgDb: 10 * Math.log10(sum / buffer.length), peakDb: 10 * Math.log10(peak) };
  }, [localAudioAnalyser]);

  const getCamera = useCallback(
    async (deviceId: string) => {
      let options = { ...defaultCameraOption, ...noMicrophoneOption };
      if (deviceId !== "") options.video = { constraints: { deviceId: { exact: deviceId } } };

      let tracks: LocalTrack[] = [];
      try { tracks = await getUserMedia(options); } 
      catch (e: any) { setUserMediaError(e.name); }

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

  const changeActiveCamera = useCallback(async (deviceId: string) => getCamera(deviceId), [getCamera]);

  const stopActiveCamera = useCallback(() => {
    if (activeCamera) { activeCamera.stop(); setActiveCamera(undefined); }
  }, [activeCamera]);

  const onDeviceChange = useCallback(async () => { await loadDevices(); }, [loadDevices]);

  useEffect(() => { if (userWantsMicMuted && !activeMicrophone?.muted) activeMicrophone?.mute(); else if (!userWantsMicMuted && activeMicrophone?.muted) activeMicrophone?.unMute(); }, [userWantsMicMuted, activeMicrophone]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
      return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
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
