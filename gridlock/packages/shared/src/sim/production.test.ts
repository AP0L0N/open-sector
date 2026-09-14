import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog, secondsToTicks } from "../catalog.js";
import { advancePaidJob, paidForProgress, refundPaid } from "./production.js";

describe("paid production", () => {
  it("charges the full catalog cost over a complete build", () => {
    const def = catalog("dynamo");
    const job = { progressTicks: 0, totalTicks: secondsToTicks(def.buildSeconds), paid: 0 };
    const wallet = { scrap: 10_000 };
    let ticks = 0;
    while (job.progressTicks < job.totalTicks) {
      const step = advancePaidJob(wallet, job, def.cost, 1);
      assert.ok(step > 0);
      ticks++;
      assert.ok(ticks <= job.totalTicks + 1);
    }
    assert.equal(job.paid, def.cost);
    assert.equal(wallet.scrap, 10_000 - def.cost);
    assert.equal(paidForProgress(job.progressTicks, job.totalTicks, def.cost), def.cost);
  });

  it("stalls when scrap runs out and resumes after a top-up", () => {
    const job = { progressTicks: 0, totalTicks: 100, paid: 0 };
    const wallet = { scrap: 10 };
    const cost = 100;
    for (let i = 0; i < 40; i++) advancePaidJob(wallet, job, cost, 1);
    assert.equal(wallet.scrap, 0);
    assert.ok(job.progressTicks > 0);
    assert.ok(job.progressTicks < 20);
    const frozen = job.progressTicks;
    advancePaidJob(wallet, job, cost, 1);
    assert.equal(job.progressTicks, frozen);
    wallet.scrap = 50;
    advancePaidJob(wallet, job, cost, 1);
    assert.ok(job.progressTicks > frozen);
    assert.equal(job.paid, 10 + (50 - wallet.scrap));
  });

  it("lets a job start at zero scrap without moving", () => {
    const job = { progressTicks: 0, totalTicks: 80, paid: 0 };
    const wallet = { scrap: 0 };
    assert.equal(advancePaidJob(wallet, job, 100, 1), 0);
    assert.equal(job.progressTicks, 0);
    assert.equal(job.paid, 0);
  });

  it("refunds only what was paid", () => {
    const job = { progressTicks: 20, totalTicks: 80, paid: 25 };
    const wallet = { scrap: 3 };
    assert.equal(refundPaid(wallet, job), 25);
    assert.equal(wallet.scrap, 28);
    assert.equal(job.paid, 0);
  });

  it("advances free jobs without touching scrap", () => {
    const job = { progressTicks: 0, totalTicks: 10, paid: 0 };
    const wallet = { scrap: 7 };
    assert.equal(advancePaidJob(wallet, job, 0, 3), 3);
    assert.equal(wallet.scrap, 7);
    assert.equal(job.paid, 0);
    assert.equal(job.progressTicks, 3);
  });
});
