import { route } from "@/lib/server/api";
import { loadSessionReview } from "@/lib/server/sessions";

/** Summary, ledger, latencies, heatmap, judge turns, transcript and Coach Notes for one session. */
export const GET = route<{ id: string }>(async (_req, { user, params }) => Response.json(await loadSessionReview(user.id, params.id)));
