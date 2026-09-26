// ===================================================================
// 资料层：订单资料、司机车辆资料、装载判断参数都在这里集中维护。
// 页面（components/*）与装载判断（logic/loading.ts）都不写死这些值。
// 修改目的地距离、司机、核定载重、路线规则只需改本文件。
// ===================================================================

import type { Destination, Driver, Order, RouteRules, VehicleMaster } from "../types";

export const STORAGE_KEY = "hxwlfront-14-dispatch-v1";

// ---------- 路线与装载判断参数 ----------

export const routeRules: RouteRules = {
  defaultDepartTime: "08:00",
  speedKmh: 40,
  stopMinutes: 15
};

// ---------- 目的地资料：里程以仓库为起点（km） ----------

export const destinations: Destination[] = [
  { id: "pd", name: "浦东", distance: 22 },
  { id: "jd", name: "嘉定", distance: 30 },
  { id: "qp", name: "青浦", distance: 42 },
  { id: "sj", name: "松江", distance: 55 },
  { id: "fx", name: "奉贤", distance: 68 }
];

// ---------- 司机资料（换班在页面上操作，这里只维护花名册） ----------

export const drivers: Driver[] = [
  { id: "liu", name: "刘师傅" },
  { id: "zhao", name: "赵师傅" },
  { id: "sun", name: "孙师傅" }
];

// ---------- 车辆资料：核定载重 kg ----------

export const vehicles: VehicleMaster[] = [
  { id: "v-a", plate: "沪A·2016", defaultDriverId: "liu", capacity: 1000 },
  { id: "v-b", plate: "沪B·3388", defaultDriverId: "zhao", capacity: 800 },
  { id: "v-c", plate: "沪C·5721", defaultDriverId: "sun", capacity: 600 }
];

// ---------- 种子订单（首次打开时载入，之后以 localStorage 为准） ----------

const now = Date.now();

export const seedOrders: Order[] = [
  // —— 一辆已发车：演示顺序锁住、换班照原顺序接车 ——
  {
    id: "seed-d1",
    orderNo: "ORD-9011",
    destinationId: "fx",
    weight: 180,
    status: "departed",
    vehicleId: "v-c",
    createdAt: new Date(now - 3600_000).toISOString()
  },
  {
    id: "seed-d2",
    orderNo: "ORD-9017",
    destinationId: "qp",
    weight: 150,
    status: "departed",
    vehicleId: "v-c",
    createdAt: new Date(now - 3600_000).toISOString()
  },
  {
    id: "seed-d3",
    orderNo: "ORD-9024",
    destinationId: "pd",
    weight: 120,
    status: "departed",
    vehicleId: "v-c",
    createdAt: new Date(now - 3600_000).toISOString()
  },

  // —— 待分配：可直接拖入司机卡片 ——
  {
    id: "seed-1",
    orderNo: "ORD-9012",
    destinationId: "fx",
    weight: 260,
    status: "pending",
    note: "先装最里侧",
    createdAt: new Date(now - 3000_000).toISOString()
  },
  {
    id: "seed-2",
    orderNo: "ORD-9031",
    destinationId: "jd",
    weight: 140,
    status: "pending",
    note: "待排班",
    createdAt: new Date(now - 2400_000).toISOString()
  },
  {
    id: "seed-3",
    orderNo: "ORD-9038",
    destinationId: "qp",
    weight: 210,
    status: "pending",
    createdAt: new Date(now - 1800_000).toISOString()
  },
  {
    id: "seed-4",
    orderNo: "ORD-9045",
    destinationId: "pd",
    weight: 90,
    dueTime: "08:10",
    note: "客户要求开门即达",
    status: "pending",
    createdAt: new Date(now - 1200_000).toISOString()
  },
  {
    id: "seed-5",
    orderNo: "ORD-9052",
    destinationId: "sj",
    weight: 330,
    status: "pending",
    createdAt: new Date(now - 900_000).toISOString()
  },
  {
    id: "seed-6",
    orderNo: "ORD-9060",
    destinationId: "jd",
    weight: 170,
    status: "pending",
    createdAt: new Date(now - 600_000).toISOString()
  }
];

/** 种子车辆运行时状态：沪C 已发车并锁定，其余待发 */
export function buildSeedRuntime() {
  const runtime: Record<string, import("../types").VehicleRuntime> = {};
  for (const v of vehicles) {
    runtime[v.id] = { driverId: v.defaultDriverId, departTime: routeRules.defaultDepartTime };
  }
  const departedIds = seedOrders.filter((o) => o.status === "departed").map((o) => o.id);
  runtime["v-c"] = {
    driverId: "sun",
    departTime: routeRules.defaultDepartTime,
    lock: {
      departedAt: "07:55",
      orderIds: departedIds,
      totalWeight: seedOrders.filter((o) => o.vehicleId === "v-c").reduce((s, o) => s + o.weight, 0),
      capacity: vehicles.find((v) => v.id === "v-c")!.capacity
    }
  };
  return runtime;
}

// ---------- 资料查询小工具（页面与判断层统一从这里取里程/名称） ----------

export const destinationMap = new Map(destinations.map((d) => [d.id, d]));
export const driverMap = new Map(drivers.map((d) => [d.id, d]));
export const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
