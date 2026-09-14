/** A construction or train job that drains scrap as it advances. */
export interface PaidJob {
  progressTicks: number;
  totalTicks: number;
  paid: number;
}

export function paidForProgress(progressTicks: number, totalTicks: number, cost: number): number {
  if (cost <= 0 || totalTicks <= 0) return 0;
  if (progressTicks >= totalTicks) return cost;
  return Math.floor((progressTicks / totalTicks) * cost);
}

/** Refund scrap already taken for this job. Returns the amount given back. */
export function refundPaid(wallet: { scrap: number }, job: { paid: number }): number {
  const n = Math.max(0, Math.floor(job.paid));
  wallet.scrap += n;
  job.paid = 0;
  return n;
}

/**
 * Advance `job` by up to `speed` ticks, taking scrap in lockstep with progress.
 * Stalls when the wallet cannot cover the next increment. Returns ticks applied.
 */
export function advancePaidJob(wallet: { scrap: number }, job: PaidJob, cost: number, speed: number): number {
  if (speed <= 0) return 0;
  const remaining = job.totalTicks - job.progressTicks;
  if (remaining <= 0) return 0;

  const want = Math.min(speed, remaining);
  if (cost <= 0) {
    job.progressTicks += want;
    return want;
  }

  const targetPaid = paidForProgress(job.progressTicks + want, job.totalTicks, cost);
  const wantCharge = Math.max(0, targetPaid - job.paid);
  const have = Math.max(0, Math.floor(wallet.scrap));
  const charge = Math.min(wantCharge, have);

  if (wantCharge > 0 && charge === 0) return 0;

  if (charge < wantCharge) {
    const maxPaid = job.paid + charge;
    const maxProgress = (maxPaid / cost) * job.totalTicks;
    const step = Math.min(want, Math.max(0, maxProgress - job.progressTicks));
    wallet.scrap -= charge;
    job.paid = maxPaid;
    if (step <= 0) return 0;
    job.progressTicks += step;
    return step;
  }

  wallet.scrap -= charge;
  job.paid += charge;
  job.progressTicks += want;
  return want;
}

export function jobFullyPaid(job: PaidJob, cost: number): boolean {
  return job.progressTicks >= job.totalTicks && job.paid >= cost;
}
