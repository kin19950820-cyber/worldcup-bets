export function cleanEnvValue(name: string, value: string | undefined): string {
  const cleaned = value?.replace(/\uFEFF/g, "").trim();

  if (!cleaned) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return cleaned;
}
