import { backendFetch, errorResponse, readSessionToken } from "@/lib/auth";

export async function GET() {
  const token = await readSessionToken();
  if (!token) return errorResponse(401);
  try {
    const response = await backendFetch("/v1/competition/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      return Response.json(body ?? { error: "Profile unavailable" }, {
        status: response.status,
      });
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(503);
  }
}
