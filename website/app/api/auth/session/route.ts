import {
  backendFetch,
  clearSessionCookie,
  errorResponse,
  readSessionToken,
} from "@/lib/auth";
import {
  DEVELOPMENT_ACCOUNT,
  developmentAccountEnabled,
} from "@/lib/development-account";

export async function GET() {
  const token = await readSessionToken();
  if (!token) {
    if (developmentAccountEnabled()) {
      return Response.json(
        { user: DEVELOPMENT_ACCOUNT, development_account: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return errorResponse(401);
  }

  try {
    const response = await backendFetch("/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 401) await clearSessionCookie();
      return errorResponse(response.status);
    }
    return Response.json(
      { user: await response.json() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse(503);
  }
}
