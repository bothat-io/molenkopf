export const DEFAULT_DATA_DIR = ".molenkopf";

export function defaultDataDir(): string {
  if (process.env.MOLENKOPF_DATA_DIR) return process.env.MOLENKOPF_DATA_DIR;
  return DEFAULT_DATA_DIR;
}
