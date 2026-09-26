/**
 * 页面状态层
 * 只存"分配结果"：每车装了哪些单、是否发车锁定、换班记录、退回记录。
 * 订单资料与司机资料（src/data）不入库 —— 重开后用资料重新核算重量并核对指纹。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DRIVERS } from "../data/drivers";
import { ORDERS } from "../data/orders";
import {
  buildSnapshot,
  tryAddOrder,
  type DepartureSnapshot,
  type RejectReason
} from "../logic/loading";

export interface HandoverLog {
  from: string;
  to: string;
  at: string;
}

export interface TruckState {
  truckId: string;
  /** 当前司机；换班时只改这里，车次与订单顺序不动 */
  driverName: string;
  /** 车上订单（保存装车顺序：[0] 最里最先装，末尾靠门最后装） */
  orderIds: string[];
  departed: boolean;
  departedAt?: string;
  snapshot?: DepartureSnapshot;
  handovers: HandoverLog[];
}

export interface RejectRecord {
  id: string;
  at: string;
  truckId: string;
  orderId: string;
  reason: RejectReason;
  message: string;
}

/** 最近一次退回，用于待分配区订单卡片闪烁提示（不持久化） */
export interface LastReject {
  at: string;
  orderId: string;
  truckId: string;
  message: string;
}

interface DispatchState {
  trucks: Record<string, TruckState>;
  rejects: RejectRecord[];
  lastReject: LastReject | null;

  assignOrder: (truckId: string, orderId: string) => { ok: boolean; message: string };
  removeOrder: (truckId: string, orderId: string) => void;
  depart: (truckId: string) => { ok: boolean; message?: string };
  handover: (truckId: string, nextDriver: string) => void;
  clearRejects: () => void;
  resetAll: () => void;
  dismissFlash: () => void;
}

const STORAGE_KEY = "loading-dispatch-state-v1";

function emptyTrucks(): Record<string, TruckState> {
  return Object.fromEntries(
    DRIVERS.map((driver) => [
      driver.truckId,
      {
        truckId: driver.truckId,
        driverName: driver.driverName,
        orderIds: [],
        departed: false,
        handovers: []
      }
    ])
  );
}

function nowText(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

export const useDispatchStore = create<DispatchState>()(
  persist(
    (set, get) => ({
      trucks: emptyTrucks(),
      rejects: [],
      lastReject: null,

      assignOrder: (truckId, orderId) => {
        const truck = get().trucks[truckId];
        if (!truck) return { ok: false, message: "车次不存在" };

        if (truck.departed) {
          const message = `已发车，顺序已锁：${orderId} 不能再装上 ${truckId}（${truck.driverName}）`;
          const reason: RejectReason = "locked";
          set((state) => ({
            rejects: [
              { id: crypto.randomUUID(), at: nowText(), truckId, orderId, reason, message },
              ...state.rejects
            ].slice(0, 100),
            lastReject: { at: nowText(), orderId, truckId, message }
          }));
          return { ok: false, message };
        }

        const result = tryAddOrder(truck.orderIds, truckId, orderId);
        if (!result.ok) {
          set((state) => ({
            rejects: [
              {
                id: crypto.randomUUID(),
                at: nowText(),
                truckId,
                orderId,
                reason: result.reason,
                message: result.message
              },
              ...state.rejects
            ].slice(0, 100),
            lastReject: { at: nowText(), orderId, truckId, message: result.message }
          }));
          return { ok: false, message: result.message };
        }

        set((state) => ({
          trucks: {
            ...state.trucks,
            [truckId]: { ...truck, orderIds: result.loadingOrder }
          },
          lastReject: null
        }));
        return { ok: true, message: `已按送达顺序插入，当前总重 ${result.totalWeightKg}kg` };
      },

      removeOrder: (truckId, orderId) => {
        const truck = get().trucks[truckId];
        if (!truck || truck.departed) return; // 发车后顺序锁住，不可卸下
        set((state) => ({
          trucks: {
            ...state.trucks,
            [truckId]: { ...truck, orderIds: truck.orderIds.filter((id) => id !== orderId) }
          }
        }));
      },

      depart: (truckId) => {
        const truck = get().trucks[truckId];
        if (!truck) return { ok: false, message: "车次不存在" };
        if (truck.departed) return { ok: false, message: "本车已发车，顺序已锁定" };
        if (truck.orderIds.length === 0) return { ok: false, message: "空车不能发车" };

        const departedAt = nowText();
        const snapshot = buildSnapshot(truckId, truck.driverName, truck.orderIds, departedAt);
        if (!snapshot.ok) return { ok: false, message: snapshot.message };

        set((state) => ({
          trucks: {
            ...state.trucks,
            [truckId]: {
              ...truck,
              departed: true,
              departedAt,
              snapshot: snapshot as DepartureSnapshot
            }
          }
        }));
        return { ok: true };
      },

      handover: (truckId, nextDriver) => {
        const name = nextDriver.trim();
        const truck = get().trucks[truckId];
        if (!truck || !name || name === truck.driverName) return;
        set((state) => ({
          trucks: {
            ...state.trucks,
            [truckId]: {
              ...truck,
              driverName: name,
              handovers: [...truck.handovers, { from: truck.driverName, to: name, at: nowText() }]
            }
          }
        }));
      },

      clearRejects: () => set({ rejects: [] }),
      resetAll: () => set({ trucks: emptyTrucks(), rejects: [], lastReject: null }),
      dismissFlash: () => set({ lastReject: null })
    }),
    {
      name: STORAGE_KEY,
      // 只持久化分配结果；lastReject 是即时提示，重开不应闪烁
      partialize: (state) => ({ trucks: state.trucks, rejects: state.rejects })
    }
  )
);

/** 待分配订单 = 不在任何一辆车上的订单 */
export function selectPendingOrderIds(trucks: Record<string, TruckState>): string[] {
  const onTruck = new Set(Object.values(trucks).flatMap((truck) => truck.orderIds));
  return ORDERS.map((order) => order.id).filter((id) => !onTruck.has(id));
}
