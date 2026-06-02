export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T>(
  url: string,
  options: { signal?: AbortSignal; label?: string } = {},
): Promise<T> {
  const res = await fetch(url, { mode: "cors", signal: options.signal });
  if (!res.ok) {
    throw new ApiError(
      `${options.label ?? url} ${res.status}`,
      res.status,
      url,
    );
  }
  return res.json() as Promise<T>;
}
