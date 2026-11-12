import { Composition } from "remotion";
import { Architecture } from "./Architecture";
import { FPS, HEIGHT, TOTAL, WIDTH } from "./data";

export const Root = () => (
  <Composition id="Architecture" component={Architecture} durationInFrames={TOTAL} fps={FPS} width={WIDTH} height={HEIGHT} />
);
