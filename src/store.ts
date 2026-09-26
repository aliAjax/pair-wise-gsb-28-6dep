// ===================================================================
// 状态层：待分配 / 已分配 / 在途订单、车辆运行时状态、退回记录。
// 资料（司机、车辆载重、目的地里程、路线规则）不进状态，归 data/master.ts。
// 全部状态落 localStorage，重开浏览器后每车的顺序、重量仍可核对；
// 已发车车辆保存的是发车瞬间的顺序与重量快照（lock），不随后续改动变化。
// ===================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Order, RejectionEntry, VehicleRuntime } from "./types";
import {
  STORAGE_KEY,
  buildSeedRuntime,
  destinationMap,
  driverMap,
  routeRules,
  seedOrders,
  vehicleMap,
  vehicles
} from "./data/master";
import { checkAssignment, type CheckRejection } from "./logic/loading";

export interface NewOrderInput {
  orderNo: string;
  destinationId: string;
  weight: number;
  dueTime?: string;
  note?: string;
}

interface BoardState {
  orders: Order[];
  runtime: Record<string, VehicleRuntime>;
  rejections: RejectionEntry[];

  assignOrder: (orderId: string, vehicleId: string) => CheckRejection | null;
  unassignOrder: (orderId: string) => void;
  depart: (vehicleId: string) => void;
  finishTrip: (vehicleId: string) => void;
  changeDriver: (vehicleId: string, driverId: string) => void;
  setDepartTime: (vehicleId: string, hhmm: string) => void;
  addOrder: (input: NewOrderInput) => void;
  deleteOrder: (orderId: string) => void;
  clearRejections: () => void;
}

const MAX_REJECTIONS = 30;

function pushRejection(
  list: RejectionEntry[],
  entry: Omit<RejectionEntry, "id" | "at">
): RejectionEntry[] {
  return [
    { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() },
    ...list
  ].slice(0, MAX_REJECTIONS);
}

export const useBoard = create<BoardState>()(
  persist(
    (set, get) => ({
      orders: seedOrders,
      runtime: buildSeedRuntime(),
      rejections: [],

      // 拖入司机卡片：交给装载判断层，成功才上车，失败退回待分配并记录原因
      assignOrder: (orderId, vehicleId) => {
        const { orders, runtime } = get();
        const candidate = orders.find((o) => o.id === orderId);
        if (!candidate) return null;
        const rt = runtime[vehicleId];
        const master = vehicleMap.get(vehicleId)!;
        const existing = orders.filter((o) => o.vehicleId === vehicleId && o.status === "assigned");

        const result = checkAssignment({
          existing,
          candidate,
          departTime: rt.departTime,
          capacity: master.capacity,
          rules: routeRules,
          getDestination: (id) => destinationMap.get(id)!,
          locked: Boolean(rt.lock)
        });

        if (!result.ok) {
          // 已发车车辆直接拒收：订单留在原处（原车或待分配区），不动数据
          if (result.rejection.type === "locked") {
            return result.rejection;
          }
          // 顺序冲突/超重：退回待分配区，原在本车的摘掉并写清原因
          set({
            orders: orders.map((o) =>
              o.id === candidate.id
                ? {
                    ...o,
                    status: "pending",
                    vehicleId: undefined,
                    rejectReason: result.rejection.message
                  }
                : o
            ),
            rejections: pushRejection(get().rejections, {
              orderId: candidate.id,
              orderNo: candidate.orderNo,
              vehicleId,
              plate: master.plate,
              reason: result.rejection.message
            })
          });
          return result.rejection;
        }

        set({
          orders: orders.map((o) =>
            o.id === candidate.id
              ? { ...o, status: "assigned", vehicleId, rejectReason: undefined }
              : o
          )
        });
        return null;
      },

      // 从车上拖回待分配区（未发车时允许）
      unassignOrder: (orderId) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (!order || order.status !== "assigned") return;
        set({
          orders: get().orders.map((o) =>
            o.id === orderId ? { ...o, status: "pending", vehicleId: undefined } : o
          )
        });
      },

      // 发车：顺序与重量锁住成快照，换班司机照此接车
      depart: (vehicleId) => {
        const { orders, runtime } = get();
        const rt = runtime[vehicleId];
        if (rt.lock) return;
        const onboard = orders.filter((o) => o.vehicleId === vehicleId && o.status === "assigned");
        if (onboard.length === 0) return;
        const lock = {
          departedAt: rt.departTime,
          orderIds: onboard.map((o) => o.id),
          totalWeight: onboard.reduce((s, o) => s + o.weight, 0),
          capacity: vehicleMap.get(vehicleId)!.capacity
        };
        set({
          orders: orders.map((o) =>
            o.vehicleId === vehicleId && o.status === "assigned"
              ? { ...o, status: "departed" }
              : o
          ),
          runtime: { ...runtime, [vehicleId]: { ...rt, lock } }
        });
      },

      // 回场结单：本趟订单完成、车辆解锁可排下一趟
      finishTrip: (vehicleId) => {
        const { orders, runtime } = get();
        const rt = runtime[vehicleId];
        if (!rt.lock) return;
        const lockedIds = new Set(rt.lock.orderIds);
        set({
          orders: orders.map((o) =>
            lockedIds.has(o.id)
              ? { ...o, status: "completed", vehicleId: undefined }
              : o
          ),
          runtime: {
            ...runtime,
            [vehicleId]: { driverId: rt.driverId, departTime: routeRules.defaultDepartTime }
          }
        });
      },

      // 换班：已发车也能换，顺序快照不动
      changeDriver: (vehicleId, driverId) => {
        const rt = get().runtime[vehicleId];
        set({ runtime: { ...get().runtime, [vehicleId]: { ...rt, driverId } } });
      },

      setDepartTime: (vehicleId, hhmm) => {
        const rt = get().runtime[vehicleId];
        if (rt.lock) return;
        set({ runtime: { ...get().runtime, [vehicleId]: { ...rt, departTime: hhmm } } });
      },

      addOrder: (input) => {
        const order: Order = {
          id: crypto.randomUUID(),
          orderNo: input.orderNo,
          destinationId: input.destinationId,
          weight: input.weight,
          dueTime: input.dueTime || undefined,
          note: input.note || undefined,
          status: "pending",
          createdAt: new Date().toISOString()
        };
        set({ orders: [order, ...get().orders] });
      },

      deleteOrder: (orderId) => {
        const order = get().orders.find((o) => o.id === orderId);
        if (!order || (order.status !== "pending" && order.status !== "completed")) return;
        set({ orders: get().orders.filter((o) => o.id !== orderId) });
      },

      clearRejections: () => set({ rejections: [] })
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // 资料层新增车辆时，保证持久化数据里也有对应的运行时槽位
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<BoardState>) } as BoardState;
        const runtime = { ...merged.runtime };
        for (const v of vehicles) {
          if (!runtime[v.id]) {
            runtime[v.id] = { driverId: v.defaultDriverId, departTime: routeRules.defaultDepartTime };
          }
        }
        return { ...merged, runtime };
      }
    }
  )
);

// ---------- 给页面用的派生工具 ----------

export function driverName(id: string): string {
  return driverMap.get(id)?.name ?? "未排班";
}
