import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type FeedbackTone = "success" | "error";

type FeedbackItem = {
  id: number;
  title: string;
  description?: string;
  tone: FeedbackTone;
};

type FeedbackContextValue = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<FeedbackItem[]>([]);

  const dismiss = (id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const push = (tone: FeedbackTone, title: string, description?: string) => {
    const id = Date.now() + Math.floor(Math.random() * 10_000);

    setItems((current) => [...current, { id, title, description, tone }]);

    window.setTimeout(() => {
      dismiss(id);
    }, 4200);
  };

  return (
    <FeedbackContext.Provider
      value={{
        success: (title, description) => push("success", title, description),
        error: (title, description) => push("error", title, description),
      }}
    >
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rounded-[24px] border px-4 py-3 shadow-[0_24px_60px_-26px_rgba(0,0,0,0.86)] backdrop-blur-xl",
              item.tone === "success"
                ? "border-emerald-400/18 bg-emerald-400/10"
                : "border-red-400/18 bg-red-400/10",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl",
                  item.tone === "success"
                    ? "bg-emerald-400/14 text-emerald-200"
                    : "bg-red-400/14 text-red-200",
                )}
              >
                {item.tone === "success" ? (
                  <CheckCircle2 className="size-4.5" />
                ) : (
                  <CircleAlert className="size-4.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{item.title}</div>
                {item.description ? (
                  <div className="mt-1 text-sm leading-6 text-foreground/78">{item.description}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-full p-1 text-foreground/58 transition hover:bg-white/8 hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const context = useContext(FeedbackContext);
  if (context === null) {
    throw new Error("useAppFeedback must be used within FeedbackProvider.");
  }
  return context;
}
