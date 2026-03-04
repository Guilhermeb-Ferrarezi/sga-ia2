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
    /* ignore autoplay restrictions */
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

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      requestPermission();
    }

    return subscribe((event: WsEventPayload) => {
      if (event.type !== "notification") return;

      const phone = (event.payload.phone as string) ?? "Contato";
      const preview = (event.payload.preview as string) ?? "";

      playSound();
      toast({
        title: `Nova mensagem de ${phone}`,
        description: preview || "Mensagem recebida agora.",
      });
      showBrowserNotification(
        `Nova mensagem de ${phone}`,
        preview,
      );
    });
  }, [subscribe, toast]);
}
