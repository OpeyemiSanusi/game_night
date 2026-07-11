import "server-only";

export function ok<T>(data: T, status = 200) {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}

export async function readJsonObject(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
