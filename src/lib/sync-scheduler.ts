let scheduler: (() => void) | null = null;

export function registerScheduler(fn: () => void): void {
  scheduler = fn;
}

export function scheduleSync(): void {
  if (scheduler) {
    scheduler();
  }
}
