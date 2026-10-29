import postgres from "postgres";
import { demoModeProject } from "@stage-ready/shared";

const connectionString = process.env.DATABASE_URL ?? "postgres://stage:stage@localhost:5432/stageready";
const sql = postgres(connectionString);

try {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql.begin(async (tx) => {
    const [existing] = await tx`SELECT id FROM projects WHERE name = ${demoModeProject.name} ORDER BY created_at LIMIT 1`;
    const [created] = existing ? [] : await tx`
      INSERT INTO projects (name, tagline, timezone)
      VALUES (${demoModeProject.name}, ${demoModeProject.tagline}, ${demoModeProject.timezone})
      RETURNING id
    `;
    const projectId = (existing ?? created)?.id as string | undefined;
    if (!projectId) throw new Error("Demo project could not be created.");
    await tx`DELETE FROM events WHERE project_id = ${projectId}`;
    await tx`DELETE FROM winners WHERE project_id = ${projectId}`;
    await tx`DELETE FROM sessions WHERE project_id = ${projectId}`;
    await tx`DELETE FROM takes WHERE project_id = ${projectId}`;
    await tx`DELETE FROM fix_tasks WHERE project_id = ${projectId}`;
    await tx`DELETE FROM personas WHERE project_id = ${projectId}`;
    await tx`DELETE FROM step_maps WHERE project_id = ${projectId}`;
    await tx`DELETE FROM coach_notes WHERE project_id = ${projectId}`;
    await tx`INSERT INTO events (project_id, spec) VALUES (${projectId}, ${tx.json(demoModeProject.event)})`;
    for (const winner of demoModeProject.winners) await tx`INSERT INTO winners (project_id, profile, source_url) VALUES (${projectId}, ${tx.json(winner)}, ${winner.sourceUrl})`;
    const [session] = await tx`INSERT INTO sessions (project_id, mode, score, transcript) VALUES (${projectId}, 'full_pitch', 72, 'We turn noisy field reports into a clear response plan. The summary is instant, taking 9.2 seconds on this run. Signal Garden supports offline mode. We use encrypted storage. The dashboard groups reports by location. Our classifier reaches 92% accuracy. Teams can compare the latest incident with previous reports. We help responders prioritize follow-up.') RETURNING id`;
    const sessionId = session?.id as string;
    const demoClaims = [
      ["We turn noisy field reports into a clear response plan.", "feature", "verified", "Result panel visible at 00:12"],
      ["The summary is instant, taking 9.2 seconds on this run.", "performance", "contradicted", "Measured response: 9.2 seconds"],
      ["Signal Garden supports offline mode.", "feature", "not_shown", "No offline step shown in the recording"],
      ["We use encrypted storage.", "security_privacy", "unverified", "No encryption implementation evidence in fixture repository"],
      ["The dashboard groups reports by location.", "feature", "verified", "Location grouping visible at 00:41"],
      ["Our classifier reaches 92% accuracy.", "accuracy", "unverified", "No evaluation result attached"],
      ["Teams can compare the latest incident with previous reports.", "feature", "verified", "Comparison view visible at 01:03"],
      ["We help responders prioritize follow-up.", "impact", "unverified", "No measured outcome attached"],
    ] as const;
    for (const [index, [claim, type, status, evidence]] of demoClaims.entries()) await tx`INSERT INTO claims (session_id, text, type, status, timestamp_seconds, evidence) VALUES (${sessionId}, ${claim}, ${type}, ${status}, ${index * 15 + 12}, ${evidence})`;
    for (const [step, duration] of [["Generate summary", 9200], ["Load comparison", 640], ["Filter reports", 510]] as const) await tx`INSERT INTO latency_samples (session_id, step, duration_ms, sample_time) VALUES (${sessionId}, ${step}, ${duration}, now())`;
    for (const [persona, question, at] of [["Technical", "How did you evaluate the 92% accuracy figure?", 95], ["Impact and domain", "What evidence shows this changes responder outcomes?", 128], ["Product and business", "Who owns follow-up when the system is wrong?", 153]] as const) await tx`INSERT INTO judge_turns (session_id, persona, question, timestamp_seconds) VALUES (${sessionId}, ${persona}, ${question}, ${at})`;
    for (const [section, score, duration] of [["Hook", 81, 18], ["Problem", 74, 26], ["Demo", 86, 58], ["How it works", 70, 34], ["Impact", 68, 27], ["Close", 79, 17]] as const) {
      for (const offset of [0, 1]) await tx`INSERT INTO takes (project_id, section, score, duration_seconds, media_path, breakdown) VALUES (${projectId}, ${section}, ${score - offset * 6}, ${duration + offset * 3}, ${`demo/${section.toLowerCase().replaceAll(" ", "-")}-${offset + 1}.webm`}, ${tx.json({ delivery: score, coverage: score - 3, demoSuccess: 90, timeFit: 80 })})`;
    }
    await tx`INSERT INTO fix_tasks (project_id, title, evidence) VALUES (${projectId}, 'Add an evaluation result for the 92% accuracy claim', 'No evaluation file attached to the claim')`;
    await tx`INSERT INTO fix_tasks (project_id, title, evidence) VALUES (${projectId}, 'Show offline mode or remove the claim', 'Feature was not shown in the demo section')`;
    await tx`INSERT INTO personas (project_id, name, is_fictional, criteria, question_style) VALUES (${projectId}, 'Technical', true, ${tx.json(["Technical execution"])}, 'Ask for implementation and evaluation evidence'), (${projectId}, 'Impact and domain', true, ${tx.json(["Real-world impact"])}, 'Ask about users and measured outcomes'), (${projectId}, 'Product and business', true, ${tx.json(["User experience", "Originality"])}, 'Ask about adoption and workflow fit')`;
    const steps = ["Open report inbox", "Select field report", "Generate response plan", "Compare incident history", "Review follow-up checklist"].map((name, index) => ({ name, maxDurationSeconds: [10, 8, 15, 10, 8][index], fallbackStartSeconds: index * 12, fallbackEndSeconds: index * 12 + 8, expectedState: `screen-${index + 1}` }));
    await tx`INSERT INTO step_maps (project_id, steps) VALUES (${projectId}, ${tx.json(steps)})`;
    await tx`INSERT INTO coach_notes (project_id, resolved, still_open, new_items, next_plan) VALUES (${projectId}, ${tx.json(["Problem statement now names the responder"])}, ${tx.json(["Support the accuracy claim with an evaluation"])}, ${tx.json(["Offline mode was claimed but not demonstrated"])}, ${tx.json(["Show the offline flow", "Add classifier evaluation evidence", "Drill the impact question"])})`;
  });
  console.log("Demo Mode project seeded.");
} finally {
  await sql.end();
}
