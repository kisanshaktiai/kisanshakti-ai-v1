const FARMER_CODE_PATTERN = /^KIS\d+$/i;

const firstUsableName = (values: Array<string | null | undefined>) => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !FARMER_CODE_PATTERN.test(trimmed)) return trimmed.split(/\s+/u)[0];
  }
  return null;
};

export function resolveFarmerDisplayName(
  user: {
    displayName?: string | null;
    fullName?: string | null;
    farmerName?: string | null;
    name?: string | null;
  } | null | undefined,
  fallback: string,
): string {
  return firstUsableName([
    user?.displayName,
    user?.fullName,
    user?.farmerName,
    user?.name,
  ]) ?? fallback;
}