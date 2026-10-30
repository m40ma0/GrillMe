import { describe, expect, it } from "vitest";
import { UserFacingError } from "../src/lib/context";
import { type RenderStatus, VisionNotFound, renderStatus } from "../src/lib/vision";

const status = (over: Partial<RenderStatus> = {}): RenderStatus => ({ id: "job1", status: "running", progress: 0.4, step: "Encoding", error: null, durationMs: null, loudnessLufs: null, ...over });
const storage = (value: unknown) => ({ getJson: async <T>() => value as T });

describe("render status across service instances", () => {
  it("asks the service first", async () => {
    const vision = { renderStatus: async () => status({ progress: 0.7 }) };
    expect((await renderStatus(vision, storage(null), "job1", "k")).progress).toBe(0.7);
  });

  it("reads the status the job mirrored to storage when another instance answers 404", async () => {
    const vision = {
      renderStatus: async (): Promise<RenderStatus> => {
        throw new VisionNotFound("The vision service returned 404.");
      },
    };
    expect(await renderStatus(vision, storage(status({ status: "done", progress: 1 })), "job1", "k")).toMatchObject({ status: "done", progress: 1 });
  });

  it("fails clearly when there is no mirrored status, or it belongs to another job", async () => {
    const vision = {
      renderStatus: async (): Promise<RenderStatus> => {
        throw new VisionNotFound("404");
      },
    };
    await expect(renderStatus(vision, storage(null), "job1", "k")).rejects.toThrow(/lost track/);
    await expect(renderStatus(vision, storage(status({ id: "other" })), "job1", "k")).rejects.toThrow(UserFacingError);
  });

  it("does not hide other errors", async () => {
    const vision = {
      renderStatus: async (): Promise<RenderStatus> => {
        throw new UserFacingError("The vision service returned 500.");
      },
    };
    await expect(renderStatus(vision, storage(status()), "job1", "k")).rejects.toThrow(/500/);
  });
});
