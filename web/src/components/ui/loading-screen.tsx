import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  title?: string;
  description?: string;
  variant?: "fullscreen" | "content";
  className?: string;
}

export default function LoadingScreen({
  title = "Carregando",
  description = "Aguarde um instante enquanto preparamos os dados.",
  variant = "fullscreen",
  className,
}: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex items-center justify-center px-4 py-12",
        variant === "fullscreen" ? "min-h-screen" : "min-h-[55vh]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(circle_at_18%_20%,rgba(255,127,17,0.2),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(0,128,128,0.23),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(255,204,128,0.16),transparent_38%)]" />
      <section
        className={cn(
          "glass-panel relative w-full max-w-md overflow-hidden rounded-2xl p-8 text-center shadow-xl",
          variant === "content" && "max-w-xl",
        )}
      >
        <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
        <div className="absolute -bottom-10 -right-6 h-28 w-28 rounded-full bg-accent/20 blur-2xl" />

        <div className="relative z-10">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-primary/30 bg-primary/10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <div className="mt-5 flex items-center justify-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/85" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/65 [animation-delay:130ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/45 [animation-delay:260ms]" />
          </div>
        </div>
      </section>
    </div>
  );
}
