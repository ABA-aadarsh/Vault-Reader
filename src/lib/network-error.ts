/**
 * Transport-level failure check. Messages differ per browser: Chrome
 * "Failed to fetch", Firefox "NetworkError…", Safari "Load failed".
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const name = (error as { name?: unknown }).name;
  if (name === "NetworkError") return true;

  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : `${(error as { message?: unknown }).message ?? ""}`;

  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network/i.test(
    message,
  );
}
