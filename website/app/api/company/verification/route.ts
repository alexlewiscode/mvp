import { backendFetch, errorResponse, readSessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  const token = await readSessionToken();
  if (!token) return errorResponse(401);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body)
    return Response.json({ error: "Invalid request" }, { status: 400 });
  const path =
    typeof body.code === "string"
      ? "/v1/company/verification/complete"
      : "/v1/company/verification/start";
  try {
    const response = await backendFetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    return Response.json(result ?? {}, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return errorResponse(503);
  }
}
