import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Generates the fake media once (FFmpeg): speech-like bursts (2 s on, 2 s off) for the scripted Demo Mode STT,
 * a 10 fps screen where a button changes at 10 s and the result panel appears at 19.2 s (a 9.2 s response),
 * and a DemoGuard screen: the first step's result at 8 s, a red error dialog from 12 s to 16 s, then healthy again.
 */
export default function globalSetup() {
  const dir = join(__dirname, ".fixtures");
  mkdirSync(dir, { recursive: true });
  const wav = join(dir, "speech-bursts.wav");
  const y4m = join(dir, "demo-screen.y4m");
  const guard = join(dir, "demoguard-screen.y4m");
  if (!existsSync(wav)) {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "aevalsrc='if(lt(mod(t,4),2),0.35*sin(2*PI*220*t)*(1+0.3*sin(2*PI*3*t)),0)':s=48000:d=240", "-ac", "1", wav]);
  }
  if (!existsSync(y4m)) {
    const vf =
      "drawbox=x=20:y=20:w=100:h=20:color=gray:t=fill,drawbox=x=140:y=150:w=40:h=15:color=blue:t=fill:enable='gte(t,10)',drawbox=x=20:y=60:w=280:h=100:color=black:t=fill:enable='gte(t,19.2)'";
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=320x180:r=10:d=40", "-vf", vf, "-pix_fmt", "yuv420p", y4m]);
  }
  if (!existsSync(guard)) {
    const vf =
      "drawbox=x=20:y=20:w=100:h=20:color=gray:t=fill,drawbox=x=20:y=60:w=280:h=100:color=black:t=fill:enable='gte(t,8)',drawbox=x=100:y=60:w=120:h=60:color=red:t=fill:enable='between(t,12,16)'";
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=320x180:r=10:d=40", "-vf", vf, "-pix_fmt", "yuv420p", guard]);
  }
  // The golden-run clip the Stage window plays on fallback: 40 s of test pattern with a visible clock.
  const clip = join(dir, "golden-run.webm");
  if (!existsSync(clip)) {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=15:d=40", "-c:v", "libvpx", "-b:v", "300k", "-an", clip]);
  }
}
