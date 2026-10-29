import "server-only";
import { AiError } from "@stage-ready/ai";
import { ConfigError } from "@stage-ready/config";
import { z, type ZodTypeAny } from "zod";
import { getCurrentUser, type CurrentUser } from "./auth";
import { logger } from "./ai";
import { rateLimit } from "./rate-limit";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Project") => new ApiError(404, "not_found", `${what} not found.`);

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: { code: error.code, message: error.message, detail: error.detail ?? null } }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: { code: "invalid_request", message: error.issues[0]?.message ?? "Invalid request.", detail: error.issues } }, { status: 400 });
  if (error instanceof AiError)
    return Response.json({ error: { code: `model_${error.code}`, message: error.message, detail: error.detail ?? null } }, { status: error.code === "not_configured" ? 500 : 502 });
  if (error instanceof ConfigError) return Response.json({ error: { code: "config_invalid", message: error.message, detail: null } }, { status: 500 });
  logger.error({ err: error }, "unhandled API error");
  return Response.json({ error: { code: "internal", message: "Something went wrong on the server. Check the web server log.", detail: null } }, { status: 500 });
}

type RouteContext<P> = { params: Promise<P> };

/** Route handler wrapper: auth, typed errors, optional rate limit. */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: (req: Request, ctx: { user: CurrentUser; params: P }) => Promise<Response>,
  options: { rateLimit?: { limit: number; windowMs: number } } = {},
) {
  return async (req: Request, context: RouteContext<P>) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
      if (options.rateLimit && !rateLimit(`${user.id}:${new URL(req.url).pathname}`, options.rateLimit.limit, options.rateLimit.windowMs)) {
        throw new ApiError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
      }
      return await handler(req, { user, params: await context.params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function body<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be JSON.");
  }
  return schema.parse(raw);
}

export const uuidParam = (value: string, what = "Project") => {
  if (!z.string().uuid().safeParse(value).success) throw notFound(what);
  return value;
};
