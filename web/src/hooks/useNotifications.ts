import { useEffect, useRef } from "react";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import { useToast } from "@/contexts/ToastContext";

const NOTIFICATION_SOUND_URL = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1BMzFHZYeZq7O1s6ydh3BgU01OVF5reIqVm5mTi4J4b2djY2VobXN6gIWIiYuJhYF8eHZzdHd6f4OHi46PkI+Ni4mHhYKBgICAgoSHioyOj5CPjYqIhYOBf39/gIKEh4mLjY6PkI+OjIqIhoSCgYCAgICChIaIi42Oj4+PjoyKiIaEgoGAgICBg4WIiouNjo+Pj46MioiGhIKBgICAgYOFh4qMjY6Pj4+OjIqIhoSCgYCAgA==";

/** Request browser notification permission early */
const requestPermission = () => {
  if ("Notification" in window && Notification.permission === "default") {
    void Notification.requestPermission();
  }
};

const showBrowserNotification = (title: string, body: string) => {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico" });
    } catch {
      /* ignore — service worker required in some browsers */
    }
  }
};

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
 * Hook that listens for `notification` WS events and shows browser
 * notifications + plays a sound. Should be rendered once at dashboard level.
 */
export function useNotifications() {
  const { subscribe } = useWebSocket();
  const { toast } = useToast();
  const initialized = useRef(false);
  const lastNotificationRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      requestPermission();
    }

    return subscribe((event: WsEventPayload) => {
      const isNotification = event.type === "notification";
      const isInboundMessageEvent =
        event.type === "message:new" && (event.payload.role as string) === "user";
      if (!isNotification && !isInboundMessageEvent) return;

      const phone = (event.payload.phone as string) ?? "Contato";
      const name = (event.payload.name as string | undefined)?.trim();
      const preview =
        isNotification
          ? ((event.payload.preview as string) ?? "")
          : ((event.payload.content as string) ?? "");
      const displayName = name || phone;

      const key = `${displayName}:${preview}`;
      const now = Date.now();
      if (
        lastNotificationRef.current &&
        lastNotificationRef.current.key === key &&
        now - lastNotificationRef.current.at < 1200
      ) {
        return;
      }
      lastNotificationRef.current = { key, at: now };

      playSound();
      toast({
        title: `Nova mensagem de ${displayName}`,
        description: preview || "Mensagem recebida agora.",
      });
      showBrowserNotification(
        `Nova mensagem de ${displayName}`,
        preview,
      );
    });
  }, [subscribe, toast]);
}
