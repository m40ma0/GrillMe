import { route } from "@/lib/server/api";
import { loadProgress } from "@/lib/server/sessions";

/** Trends per criterion, weak-spot history and the next-session plan. */
export const GET = route<{ id: string }>(async (_req, { user, params }) => Response.json(await loadProgress(user.id, params.id)));
