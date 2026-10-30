import { seedDemoProject } from "@stage-ready/db/seed";
import { cookies } from "next/headers";
import { logger } from "@/lib/server/ai";
import { ApiError, isNavigation, navigationErrorResponse } from "@/lib/server/api";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { createGuest, guestCookie, guestToken } from "@/lib/server/guest";
import { rateLimit } from "@/lib/server/rate-limit";

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

/**
 * "Try Demo Mode": (re)creates the fictional fixture project and opens it. Signed-out visitors get a guest
 * user (signed httpOnly cookie, 24 h) first, so judges can try it in one click.
 */
export async function POST(req: Request) {
  try {
    let user = await getCurrentUser();
    if (!user) {
      if (!rateLimit(`guest:${clientIp(req)}`, 5, 60 * 60_000)) throw new ApiError(429, "rate_limited", "Too many guest demos from this network. Try again in an hour, or sign in with GitHub.");
      const guest = await createGuest(db());
      (await cookies()).set(guestCookie(guestToken(guest.id, env().AUTH_SECRET), process.env.NODE_ENV === "production"));
      user = { id: guest.id, email: "", name: "Guest", githubLogin: null, bypass: false, guest: true };
    } else if (!rateLimit(`${user.id}:/api/demo`, 5, 60_000)) {
      throw new ApiError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
    }
    const projectId = await seedDemoProject(db(), user.id);
    if (!projectId) throw new ApiError(500, "seed_failed", "The Demo Mode project could not be created.");
    // Relative Location: the dev server binds 0.0.0.0, which req.url would leak into the redirect.
    return new Response(null, { status: 303, headers: { location: `/projects/${projectId}` } });
  } catch (error) {
    if (!(error instanceof ApiError)) logger.error({ err: error }, "demo project could not be created");
    if (isNavigation(req)) return navigationErrorResponse(error, req);
    const status = error instanceof ApiError ? error.status : 500;
    return Response.json(
      { error: { code: error instanceof ApiError ? error.code : "internal", message: error instanceof ApiError ? error.message : "Something went wrong on the server.", detail: null } },
      { status },
    );
  }
}
