// ===================================================================
// 装载判断层（纯函数，不依赖 React / localStorage）：
// 1. 送达顺序 = 近点先送、靠门放；远点最后送、先装压里侧（按里程降序装、升序送）
// 2. 单趟总重不得超过核定载重
// 3. 顺序冲突 = 按送达顺序逐点推算到达时间，超过订单预约送达时间
// 页面只负责把资料喂进来，判定结论全部由本模块给出。
// ===================================================================

import type { Destination, Order, RouteRules } from "../types";

export type RejectType = "overweight" | "sequence" | "locked";

export interface CheckRejection {
  type: RejectType;
  /** 退回时给用户看的完整说明：被哪单挡住 / 超出多少公斤 */
  message: string;
  overweightKg?: number;
}

export interface PlannedStop {
  order: Order;
  /** 送达顺序，从 1 开始 */
  stopNo: number;
  /** 到达时间（分钟，自 00:00 起） */
  arrivalMinutes: number;
  /** 相对预约时间迟到分钟数；未预约或准时为 0 */
  lateMinutes: number;
}

export interface CheckInput {
  /** 车上已有订单（不含待判定订单） */
  existing: Order[];
  /** 拖入的订单 */
  candidate: Order;
  /** 本趟发车时间 HH:mm */
  departTime: string;
  capacity: number;
  rules: RouteRules;
  /** 里程查询，由资料层提供（destinationId -> 目的地资料） */
  getDestination: (id: string) => Destination;
  locked?: boolean;
}

// ---------- 基础工具 ----------

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 按送达顺序排列（升序：近点在前先送）。
 * 同里程时订单号小的在前，保证顺序确定、可复核。
 * 装车顺序反过来：数组末尾（最远）的先装、压里侧。
 */
export function sortByDeliverySequence(
  orders: Order[],
  getDestination: (id: string) => Destination
): Order[] {
  return [...orders].sort((a, b) => {
    const diff = getDestination(a.destinationId).distance - getDestination(b.destinationId).distance;
    return diff !== 0 ? diff : a.orderNo.localeCompare(b.orderNo);
  });
}

/** 推算一辆车上每个停靠点的到达时间与迟到情况 */
export function planStops(
  orders: Order[],
  departTime: string,
  rules: RouteRules,
  getDestination: (id: string) => Destination
): PlannedStop[] {
  const sequence = sortByDeliverySequence(orders, getDestination);
  const stops: PlannedStop[] = [];
  // 到达第 1 点：仓库 -> 第 1 点（近点）；之后逐点向远走
  let clock = timeToMinutes(departTime);
  let prevDistance = 0;
  for (let i = 0; i < sequence.length; i++) {
    const order = sequence[i];
    const distance = getDestination(order.destinationId).distance;
    clock += ((distance - prevDistance) / rules.speedKmh) * 60;
    const due = order.dueTime ? timeToMinutes(order.dueTime) : undefined;
    const lateMinutes = due !== undefined ? Math.max(0, clock - due) : 0;
    stops.push({ order, stopNo: i + 1, arrivalMinutes: clock, lateMinutes });
    clock += rules.stopMinutes; // 卸货停留后再开往下一点
    prevDistance = distance;
  }
  return stops;
}

function dueText(order: Order): string {
  return order.dueTime ? `（预约 ${order.dueTime} 前送达）` : "";
}

/**
 * 尝试把 candidate 放入本趟，返回：
 *  - ok=true：给出放好后的完整送达计划
 *  - ok=false：给出退回原因（顺序冲突注明被哪单挡住；超重注明超出公斤数）
 */
export function checkAssignment(input: CheckInput):
  | { ok: true; stops: PlannedStop[]; totalWeight: number }
  | { ok: false; rejection: CheckRejection } {
  const { existing, candidate, departTime, capacity, rules, getDestination, locked } = input;

  if (locked) {
    return {
      ok: false,
      rejection: {
        type: "locked",
        message: "车辆已发车，顺序已锁住，不能再增减订单（换班司机照原顺序接车）。"
      }
    };
  }

  // —— 规则一：单趟总重不得超过核定载重 ——
  const existingWeight = existing.reduce((sum, o) => sum + o.weight, 0);
  const totalWeight = existingWeight + candidate.weight;
  if (totalWeight > capacity) {
    const overweightKg = totalWeight - capacity;
    return {
      ok: false,
      rejection: {
        type: "overweight",
        overweightKg,
        message: `超重 ${overweightKg} kg：本单 ${candidate.weight} kg + 车上已有 ${existingWeight} kg = ${totalWeight} kg，超过核定载重 ${capacity} kg。`
      }
    };
  }

  // —— 规则二：按送达顺序推算时间，顺序冲突（赶不上预约）退回 ——
  const all = [...existing, candidate];
  const stops = planStops(all, departTime, rules, getDestination);
  const firstLate = stops.find((s) => s.lateMinutes > 0);
  if (firstLate) {
    const candidateStop = stops.find((s) => s.order.id === candidate.id)!;
    let message: string;
    if (firstLate.stopNo === 1) {
      message = `顺序冲突：第 1 站 ${firstLate.order.orderNo} 需 ${firstLate.order.dueTime} 前送达，按发车 ${departTime} 抵达约 ${formatMinutes(
        firstLate.arrivalMinutes
      )}，晚 ${firstLate.lateMinutes} 分钟；前方没有站点可挡，建议改更早发车或换车。`;
    } else {
      const blocker = stops[firstLate.stopNo - 2]; // 紧邻前一站
      message = `顺序冲突：${firstLate.order.orderNo}${dueText(firstLate.order)}预计 ${formatMinutes(
        firstLate.arrivalMinutes
      )} 才能送到、晚 ${firstLate.lateMinutes} 分钟，被前一站 ${blocker.order.orderNo}（${
        getDestination(blocker.order.destinationId).name
      }）挡住。`;
    }
    // 若迟到的不是待判定单本身，说明是它插在前面把后面的单挡到了，需要点破
    if (firstLate.order.id !== candidate.id) {
      message += ` 待分配单 ${candidate.orderNo} 排在第 ${candidateStop.stopNo} 站，延后了后续站点。`;
    }
    return { ok: false, rejection: { type: "sequence", message } };
  }

  return { ok: true, stops, totalWeight };
}
