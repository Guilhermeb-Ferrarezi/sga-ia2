import { useEffect, useRef } from "react";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import { useToast } from "@/contexts/ToastContext";

const NOTIFICATION_SOUND_URL = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1BMzFHZYeZq7O1s6ydh3BgU01OVF5reIqVm5mTi4J4b2djY2VobXN6gIWIiYuJhYF8eHZzdHd6f4OHi46PkI+Ni4mHhYKBgICAgoSHioyOj5CPjYqIhYOBf39/gIKEh4mLjY6PkI+OjIqIhoSCgYCAgICChIaIi42Oj4+PjoyKiIaEgoGAgICBg4WIiouNjo+Pj46MioiGhIKBgICAgYOFh4qMjY6Pj4+OjIqIhoSCgYCAgA==";

const playSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.3;
    void audio.play();
  } catch {
    try {
      // Fallback beep when media playback is blocked by browser policy.
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.03;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.12);
    } catch {
      /* ignore autoplay restrictions */
    }
  }
};

/**
 * Hook that listens for `notification` WS events and shows in-app
 * toast notifications + plays a sound. No browser/Windows notifications.
 */
export function useNotifications() {
  const { subscribe } = useWebSocket();
  const { toast } = useToast();
  const lastNotificationRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    return subscribe((event: WsEventPayload) => {
      if (event.type !== "notification") return;

      const phone = (event.payload.phone as string) ?? "Contato";
      const name = (event.payload.name as string | undefined)?.trim();
      const messageId = (event.payload.messageId as string | undefined)?.trim();
      const preview = (event.payload.preview as string) ?? "";
      const displayName = name || phone;

      const key = messageId || `${phone}:${preview}`;
      const now = Date.now();
      if (
        lastNotificationRef.current &&
        lastNotificationRef.current.key === key &&
        now - lastNotificationRef.current.at < 5000
      ) {
        return;
      }
      lastNotificationRef.current = { key, at: now };

      playSound();
      toast({
        title: `Nova mensagem de ${displayName}`,
        description: preview || "Mensagem recebida agora.",
      });
    });
  }, [subscribe, toast]);
}
