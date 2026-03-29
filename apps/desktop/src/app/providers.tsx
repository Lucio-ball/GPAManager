import { type PropsWithChildren, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppPreferencesProvider } from "@/components/shared/app-preferences";
import { FeedbackProvider } from "@/components/shared/feedback-center";

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppPreferencesProvider>
        <FeedbackProvider>{children}</FeedbackProvider>
      </AppPreferencesProvider>
    </QueryClientProvider>
  );
}
