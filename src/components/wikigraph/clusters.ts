import type { Cluster } from "./data";
import { FALLBACK_COLOR } from "./data";

export function colorForCluster(
  clusters: Map<number, Cluster> | null | undefined,
  cl: number,
): [number, number, number] {
  return clusters?.get(cl)?.color ?? FALLBACK_COLOR;
}

export function nameForCluster(
  clusters: Map<number, Cluster> | null | undefined,
  cl: number,
): string {
  return clusters?.get(cl)?.name ?? `Cluster ${cl}`;
}
