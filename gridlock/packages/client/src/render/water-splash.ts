/** Heavy round: tank and artillery calibers. Matches the sim's 40mm line. */
export function isShellCaliber(caliber: number | undefined): boolean {
  return (caliber ?? 0) >= 40;
}

/**
 * Water plume size relative to a 75mm shell.
 * Bullets stay a small fraction of that plume.
 */
export function waterSplashScale(caliber: number | undefined): number {
  if (!isShellCaliber(caliber)) return 0.16;
  return Math.max(0.75, (caliber ?? 75) / 75);
}
