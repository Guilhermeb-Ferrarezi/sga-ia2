import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  className?: string;
  variant?: "compact" | "full";
}

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export function AudioPlayer({
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onSeek,
  className,
  variant = "full",
}: AudioPlayerProps) {
  const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onPlayPause}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <div className="flex-1 min-w-0">
          <div 
            className="h-1.5 bg-muted rounded-full cursor-pointer overflow-hidden group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              if (duration > 0) onSeek(percent * duration);
            }}
          >
            <div
              className="h-full bg-primary transition-all group-hover:bg-primary/90"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 shrink-0"
          onClick={onPlayPause}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <div className="flex-1">
          <div
            className="h-2 bg-muted rounded-full cursor-pointer overflow-hidden group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              onSeek(percent * duration);
            }}
          >
            <div
              className="h-full bg-primary transition-all group-hover:bg-primary/90"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
