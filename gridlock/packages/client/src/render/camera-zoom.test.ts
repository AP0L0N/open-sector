import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  clampMapZoom,
  mapZoomAfterWheel,
  zoomCamAt,
} from "./camera-zoom.js";

const near = (a: number, b: number, eps = 1e-9): void => {
  assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
};

describe("clampMapZoom", () => {
  it("keeps the default and clips the range", () => {
    assert.equal(clampMapZoom(1), 1);
    assert.equal(clampMapZoom(MAP_ZOOM_MIN), MAP_ZOOM_MIN);
    assert.equal(clampMapZoom(MAP_ZOOM_MAX), MAP_ZOOM_MAX);
    assert.equal(clampMapZoom(0.1), MAP_ZOOM_MIN);
    assert.equal(clampMapZoom(8), MAP_ZOOM_MAX);
    assert.equal(clampMapZoom(Number.NaN), 1);
  });
});

describe("zoomCamAt", () => {
  it("keeps the iso point under the cursor", () => {
    const camX = 40;
    const camY = 80;
    const zoom = 1;
    const px = 200;
    const py = 120;
    const isoX = camX + px / zoom;
    const isoY = camY + py / zoom;
    const next = zoomCamAt(camX, camY, zoom, 1.25, px, py);
    near(next.camX + px / next.zoom, isoX);
    near(next.camY + py / next.zoom, isoY);
    near(next.zoom, 1.25);
  });

  it("roundtrips zoom in then out at the same cursor", () => {
    const a = zoomCamAt(10, 20, 1, 1.2, 200, 100);
    const b = zoomCamAt(a.camX, a.camY, a.zoom, 1, 200, 100);
    near(b.camX, 10);
    near(b.camY, 20);
    near(b.zoom, 1);
  });

  it("is a no-op at the clamp", () => {
    const stuck = zoomCamAt(0, 0, MAP_ZOOM_MAX, MAP_ZOOM_MAX * 2, 50, 50);
    assert.equal(stuck.zoom, MAP_ZOOM_MAX);
    assert.equal(stuck.camX, 0);
    assert.equal(stuck.camY, 0);
  });
});

describe("mapZoomAfterWheel", () => {
  it("zooms in on scroll up and out on scroll down", () => {
    assert.ok(mapZoomAfterWheel(1, -100) > 1);
    assert.ok(mapZoomAfterWheel(1, 100) < 1);
  });

  it("treats a line-mode notch like a pixel wheel tick", () => {
    const pixel = mapZoomAfterWheel(1, 100, 0);
    const lines = mapZoomAfterWheel(1, 2.5, 1);
    near(pixel, lines, 1e-9);
  });

  it("stops at the min and max", () => {
    assert.equal(mapZoomAfterWheel(MAP_ZOOM_MAX, -800), MAP_ZOOM_MAX);
    assert.equal(mapZoomAfterWheel(MAP_ZOOM_MIN, 800), MAP_ZOOM_MIN);
  });
});
