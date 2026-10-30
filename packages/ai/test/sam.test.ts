import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSamOutput, samSegment, toRegions } from "../src/sam";

afterEach(() => vi.unstubAllGlobals());

// Examples from the Meta docs ("Read Segment Anything Model segmentation output").
const IMAGE =
  "<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,101,~abc|>,1<|box;x1=260;y1=382;x2=340;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,81,~x!y~z|>,2<|box;x1=516;y1=117;x2=536;y2=150;w=537;h=561|><|mask;x=0;y=0;data=34,21,~...|>";
const VIDEO_FRAME =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>,1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>";
const WITH_CONF = "<0f>1<|box;x1=444;y1=625;x2=679;y2=850;w=1800;h=1200;c=0.9609375|><|mask;x=0;y=0;c=0.9609375;data=226,236,!abc|>";

describe("SAM 3.1 output", () => {
  it("reads every record of an image line: object id, box, source size", () => {
    const boxes = parseSamOutput(IMAGE);
    expect(boxes.map((b) => b.objectId)).toEqual([0, 1, 2]);
    expect(boxes[0]).toEqual({ frame: 0, objectId: 0, x1: 353, y1: 382, x2: 453, y2: 427, width: 537, height: 561, confidence: null });
  });

  it("is not thrown by mask payloads that contain ~, !, or other tokens", () => {
    expect(parseSamOutput(VIDEO_FRAME).map((b) => [b.objectId, b.x1])).toEqual([
      [0, 211],
      [1, 155],
    ]);
  });

  it("reads confidence by key when present, sparse ids, and frames out of order", () => {
    const boxes = parseSamOutput(`<2f>${WITH_CONF.slice(4)}\n${WITH_CONF}`);
    expect(boxes.map((b) => [b.frame, b.objectId, b.confidence])).toEqual([
      [2, 1, 0.9609375],
      [0, 1, 0.9609375],
    ]);
  });

  it("zero matches is an empty lane, not an error", () => {
    expect(parseSamOutput("")).toEqual([]);
  });

  it("normalises boxes to 0–1 regions with a score", () => {
    expect(toRegions("error_dialog", parseSamOutput(WITH_CONF))).toEqual([{ label: "error_dialog", box: [444 / 1800, 625 / 1200, 679 / 1800, 850 / 1200], score: 0.9609375 }]);
    expect(toRegions("spinner", parseSamOutput(IMAGE))[0]?.score).toBe(1);
  });

  it("sends one phrase and one image to /responses with model sam-3.1 and reads output_text", async () => {
    const fetchMock = vi.fn(async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: WITH_CONF }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    const boxes = await samSegment({ baseUrl: "https://api.meta.ai/v1", apiKey: "k", model: "sam-3.1" }, "error dialog", new Uint8Array([0xff, 0xd8, 1]));
    expect(boxes).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    const body = JSON.parse(String(init.body)) as { model: string; input: { content: { type: string; text?: string; image_url?: string }[] }[]; metadata: Record<string, string> };
    expect(body.model).toBe("sam-3.1");
    expect(body.input[0]?.content[0]).toEqual({ type: "input_text", text: "error dialog" });
    expect(body.input[0]?.content[1]?.image_url?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(body.metadata).toEqual({ mask_encoding: "one_bit", include_confidence: "true" });
  });
});
