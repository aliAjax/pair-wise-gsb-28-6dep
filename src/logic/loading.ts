/**
 * 装载判断层
 * 纯函数：输入车上现有订单 + 待加入订单 + 订单资料 + 核定载重，输出排序结果或退回原因。
 * 不读 localStorage、不引用 React，页面与资料怎么改都不影响这里的规则。
 *
 * 装车规则（对应现场"远点先装、近点靠门、先送的不被压"）：
 *   - 送达顺序：近点先送（距离升序，即 deliveryOrder）
 *   - 装车顺序：远点先装（距离降序，即 loadingOrder）
 *     车厢后部先装远点，靠门位置留给近点 → 开门即可卸下第一单
 *
 * 退回规则：
 *   1) 顺序冲突 —— 同送达点同距离（先后无法判定），或客户硬性要求与"近点先送"矛盾；
 *      会写清被车上哪一单挡住。
 *   2) 超重 —— 加入后总重超过核定载重；写清被哪单挡住、超出多少公斤。
 */

import type { OrderMaster } from "../data/orders.ts";
import { ORDERS_BY_ID } from "../data/orders.ts";
import { DRIVERS_BY_TRUCK } from "../data/drivers.ts";

export type RejectReason = "sequence" | "overweight" | "locked" | "unknown";

/** 被退回的结论 */
export interface RejectResult {
  ok: false;
  reason: RejectReason;
  /** 人能直接读懂的退回说明：含挡住它的订单号、超重公斤数等 */
  message: string;
  /** 挡路订单（顺序冲突点 / 靠门挡重的那一单） */
  blockedById?: string;
  /** 超重量 kg（仅超重时） */
  overloadKg?: number;
}

export interface AcceptResult {
  ok: true;
  /** 装车顺序：[0] 最先装（车厢最里、最远），末尾最后装（靠门、最先送） */
  loadingOrder: string[];
  /** 本趟总重 kg */
  totalWeightKg: number;
}

export type TryAddResult = AcceptResult | RejectResult;

export function getOrder(orderId: string): OrderMaster | undefined {
  return ORDERS_BY_ID.get(orderId);
}

export function getCapacity(truckId: string): number {
  return DRIVERS_BY_TRUCK.get(truckId)?.capacityKg ?? 0;
}

/** 送达顺序：近点先送（距离升序） */
export function deliveryOrder(orders: OrderMaster[]): OrderMaster[] {
  return [...orders].sort((a, b) => a.distanceKm - b.distanceKm);
}

/** 装车顺序：远点先装（距离降序），与送达顺序相反 */
export function loadingOrder(orders: OrderMaster[]): OrderMaster[] {
  return deliveryOrder(orders).reverse();
}

export function totalWeight(orders: OrderMaster[]): number {
  return orders.reduce((sum, order) => sum + order.weightKg, 0);
}

function reject(
  reason: RejectReason,
  message: string,
  extra?: Partial<Pick<RejectResult, "blockedById" | "overloadKg">>
): RejectResult {
  return { ok: false, reason, message, ...extra };
}

/**
 * 尝试把 orderId 加入车次。
 * @param existingIds 车上现有订单（顺序不限，函数内部按规则排序）
 * @param truckId     车次（取核定载重）
 * @param orderId     待加入订单
 * @param capacityKg  可选：显式传入核定载重（测试用）
 *
 * 注意：顺序冲突优先于超重判定 —— 顺序都排不出来时，谈重量没有意义。
 */
export function tryAddOrder(
  existingIds: string[],
  truckId: string,
  orderId: string,
  capacityOverride?: number
): TryAddResult {
  const incoming = ORDERS_BY_ID.get(orderId);
  if (!incoming) {
    return reject("unknown", `订单 ${orderId} 不存在于订单资料中，无法装车`);
  }
  if (existingIds.includes(orderId)) {
    return reject("sequence", `${orderId} 已在本车上，请勿重复装车`);
  }

  const existing = existingIds
    .map((id) => ORDERS_BY_ID.get(id))
    .filter((order): order is OrderMaster => Boolean(order));
  const merged = [...existing, incoming];

  // —— 规则 1：顺序冲突检查（对"加入后的整车"逐对检查）——
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      const a = merged[i];
      const b = merged[j];

      // 1a. 同送达点且同距离：谁先谁后无法判定
      if (
        a.destination === b.destination &&
        a.distanceKm === b.distanceKm
      ) {
        const blocker = a.id === orderId ? b : a.id === orderId ? a : a;
        return reject(
          "sequence",
          `顺序冲突：${orderId}（${incoming.destination}）与 ${blocker.id}（${blocker.destination}）为同一送达点、距离相同（${a.distanceKm}km），先送谁排不出来；被 ${blocker.id} 挡住，请人工定先后或拆车。`
        );
      }

      // 1b. 客户硬性送达要求与"近点先送"矛盾：
      //     x 要求先于 y 送达，但 x 比 y 远 —— 路上会先经过 y
      const checkPair = (x: OrderMaster, y: OrderMaster) => {
        if (x.deliverBeforeId === y.id && x.distanceKm > y.distanceKm) {
          return reject(
            "sequence",
            `顺序冲突：${x.id}（${x.destination}，${x.distanceKm}km）客户要求先于 ${y.id}（${y.destination}，${y.distanceKm}km）送达，但它更远、按近点先送会先到 ${y.id}；被 ${y.id} 挡住，请客户确认或拆车。`
          );
        }
        return undefined;
      };
      const conflict = checkPair(a, b) ?? checkPair(b, a);
      if (conflict) return conflict;
    }
  }

  // —— 规则 2：核定载重检查 ——
  const capacityKg = capacityOverride ?? getCapacity(truckId);
  const nextWeight = totalWeight(merged);
  if (nextWeight > capacityKg) {
    const overloadKg = nextWeight - capacityKg;
    // 靠门单 = 送达顺序最后装的那一单（最近点），是卸货第一道坎
    const doorOrder = deliveryOrder(existing)[0];
    const base = `${orderId} 装车后总重 ${nextWeight}kg，超过核定载重 ${capacityKg}kg，超出 ${overloadKg}kg`;
    return reject(
      "overweight",
      doorOrder
        ? `${base}；被靠门先送的 ${doorOrder.id}（${doorOrder.destination}，${doorOrder.weightKg}kg）挡在门口，需从本车腾出至少 ${overloadKg}kg。`
        : `${base}；本车为空车，单件已超核定载重 ${overloadKg}kg，无法承运。`,
      { blockedById: doorOrder?.id, overloadKg }
    );
  }

  return {
    ok: true,
    loadingOrder: loadingOrder(merged).map((order) => order.id),
    totalWeightKg: nextWeight
  };
}

/** 发车成功结论：带锁定清单快照（用于重开后逐车核对顺序与重量） */
export interface DepartureSnapshot {
  ok: true;
  truckId: string;
  driverName: string;
  loadingOrder: string[];
  totalWeightKg: number;
  departedAt: string;
  /** 顺序+重量+车次的指纹，任何一项被改动都会核对不上 */
  checksum: string;
}

/** 简易稳定指纹（FNV-1a），仅用于本地核对，不做安全用途 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildSnapshot(
  truckId: string,
  driverName: string,
  orderIds: string[],
  departedAt: string
): DepartureSnapshot | { ok: false; message: string } {
  const orders = orderIds
    .map((id) => ORDERS_BY_ID.get(id))
    .filter((order): order is OrderMaster => Boolean(order));
  if (orders.length !== orderIds.length) {
    return { ok: false, message: "存在订单资料里已删除的订单，无法锁定" };
  }
  const loading = loadingOrder(orders).map((order) => order.id);
  const totalWeightKg = totalWeight(orders);
  const checksum = fingerprint([truckId, ...loading, totalWeightKg].join("|"));
  return { ok: true, truckId, driverName, loadingOrder: loading, totalWeightKg, departedAt, checksum };
}

export type ManifestIssue =
  | { code: "missing"; orderId: string; message: string }
  | { code: "extra"; orderId: string; message: string }
  | { code: "orderChanged"; expected: string; actual: string; index: number; message: string }
  | { code: "weightMismatch"; expected: number; actual: number; message: string }
  | { code: "checksumMismatch"; expected: string; actual: string; message: string };

export interface ManifestCheck {
  ok: boolean;
  actualWeightKg: number;
  issues: ManifestIssue[];
}

/**
 * 重开后核对：用发车快照对当前车上订单逐项对账。
 * 订单资料（重量等）若被改动，同样会暴露为重量不符。
 */
export function verifyManifest(snapshot: DepartureSnapshot, currentOrderIds: string[]): ManifestCheck {
  const issues: ManifestIssue[] = [];

  const expectedSet = new Set(snapshot.loadingOrder);
  const currentSet = new Set(currentOrderIds);

  for (const id of snapshot.loadingOrder) {
    if (!currentSet.has(id)) {
      issues.push({
        code: "missing",
        orderId: id,
        message: `少货：${id} 发车时在车上，重开后不见了`
      });
    }
  }
  for (const id of currentOrderIds) {
    if (!expectedSet.has(id)) {
      issues.push({
        code: "extra",
        orderId: id,
        message: `多货：${id} 不在发车锁定清单中`
      });
    }
  }

  const actualOrders = currentOrderIds
    .map((id) => ORDERS_BY_ID.get(id))
    .filter((order): order is OrderMaster => Boolean(order));
  const actualLoading = loadingOrder(actualOrders).map((order) => order.id);
  snapshot.loadingOrder.forEach((expected, index) => {
    const actual = actualLoading[index];
    if (actual !== undefined && expected !== actual) {
      issues.push({
        code: "orderChanged",
        expected,
        actual,
        index,
        message: `第 ${index + 1} 装车位顺序变动：锁定时是 ${expected}，现在是 ${actual}`
      });
    }
  });

  const actualWeightKg = totalWeight(actualOrders);
  if (actualWeightKg !== snapshot.totalWeightKg) {
    const diff = actualWeightKg - snapshot.totalWeightKg;
    issues.push({
      code: "weightMismatch",
      expected: snapshot.totalWeightKg,
      actual: actualWeightKg,
      message: `重量对不上：锁定 ${snapshot.totalWeightKg}kg，重开核算 ${actualWeightKg}kg，相差 ${diff > 0 ? "+" : ""}${diff}kg`
    });
  }

  const currentChecksum = fingerprint(
    [snapshot.truckId, ...actualLoading, actualWeightKg].join("|")
  );
  if (currentChecksum !== snapshot.checksum) {
    issues.push({
      code: "checksumMismatch",
      expected: snapshot.checksum,
      actual: currentChecksum,
      message: `清单指纹不符：锁定 ${snapshot.checksum}，当前 ${currentChecksum}`
    });
  }

  return { ok: issues.length === 0, actualWeightKg, issues };
}
