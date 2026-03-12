import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/contexts/ToastContext";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

interface UseAudioPlayerProps {
  token?: string | null;
}

interface UseAudioPlayerReturn {
  playingId: string | number | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  togglePlay: (id: string | number, url: string) => void;
  stopAudio: () => void;
  seek: (time: number) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export function useAudioPlayer({ token }: UseAudioPlayerProps = {}): UseAudioPlayerReturn {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [playingId, setPlayingId] = useState<string | number | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const revokeBlobUrl = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    revokeBlobUrl();
    setPlayingId(null);
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current && Number.isFinite(time)) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const togglePlay = useCallback(
    (id: string | number, _url: string) => {
      if (playingId === id && audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          void audioRef.current.play();
          setIsPlaying(true);
        }
        return;
      }

      stopAudio();

      // Numeric ID → /audios/:id/stream; WhatsApp message ID → /audios/stream-url?url=
      const numId = typeof id === "number" ? id : Number(id);
      const streamUrl = Number.isFinite(numId) && numId > 0
        ? `${API_BASE}/audios/${numId}/stream`
        : `${API_BASE}/audios/stream-url?url=${encodeURIComponent(_url)}`;

      fetch(streamUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => {
          if (!res.ok) throw new Error(`stream failed: ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;

          const audio = new Audio(objectUrl);

          audio.addEventListener("timeupdate", () => {
            setCurrentTime(audio.currentTime);
            if (audio.duration && audio.duration !== Infinity) {
              setDuration(audio.duration);
            }
          });
          audio.addEventListener("loadedmetadata", () => {
            if (audio.duration !== Infinity) setDuration(audio.duration);
          });
          audio.addEventListener("durationchange", () => {
            if (audio.duration !== Infinity) setDuration(audio.duration);
          });
          audio.addEventListener("ended", () => {
            setPlayingId(null);
            setCurrentTime(0);
            setIsPlaying(false);
            revokeBlobUrl();
          });

          audioRef.current = audio;

          audio.play()
            .then(() => {
              setPlayingId(id);
              setIsPlaying(true);
            })
            .catch((err) => {
              console.error("Failed to play audio:", err);
              toast({
                title: "Falha ao reproduzir",
                description: "Nao foi possivel carregar o audio no dispositivo.",
                variant: "error"
              });
              stopAudio();
            });
        })
        .catch((err) => {
          console.error("Failed to fetch audio for playback:", err);
          toast({
            title: "Erro no audio",
            description: "Conteudo indisponivel ou formato não suportado.",
            variant: "error"
          });
          stopAudio();
        });
    },
    [playingId, isPlaying, stopAudio, token, toast]
  );

  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  return {
    playingId,
    duration,
    currentTime,
    isPlaying,
    togglePlay,
    stopAudio,
    seek,
    audioRef,
  };
}
