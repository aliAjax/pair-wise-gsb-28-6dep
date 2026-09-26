// 通用领域模型：订单、司机、车辆、目的地、路线规则

export type OrderStatus = "pending" | "assigned" | "departed" | "completed";

export interface Order {
  id: string;
  orderNo: string;
  /** 指向资料层目的地 id（距离以资料层为准，不在订单里重复维护） */
  destinationId: string;
  /** 重量 kg */
  weight: number;
  /** 预约送达截止时间 HH:mm，不填表示无时间要求 */
  dueTime?: string;
  note?: string;
  status: OrderStatus;
  /** 已分配/在途时所在车辆 */
  vehicleId?: string;
  /** 最近一次被退回的原因（超重公斤数 / 被哪单挡住），重新入车成功后清除 */
  rejectReason?: string;
  createdAt: string;
}

export interface Destination {
  id: string;
  name: string;
  /** 距仓库里程 km，用于排序与行驶时间推算 */
  distance: number;
}

export interface Driver {
  id: string;
  name: string;
}

export interface VehicleMaster {
  id: string;
  plate: string;
  /** 默认司机 id，换班后以运行时状态为准 */
  defaultDriverId: string;
  /** 核定载重 kg */
  capacity: number;
}

export interface RouteRules {
  /** 计划发车时间 HH:mm */
  defaultDepartTime: string;
  /** 平均行驶时速 km/h */
  speedKmh: number;
  /** 每站卸货停留分钟 */
  stopMinutes: number;
}

/** 车辆的运行时状态（资料层的车牌/载重改了不影响已锁定的趟次） */
export interface VehicleRuntime {
  driverId: string;
  /** 本趟计划发车时间，发车前可调 */
  departTime: string;
  /** 发车后形成的快照，顺序与重量就此锁住 */
  lock?: TripLock;
}

export interface TripLock {
  /** 实际发车时间 HH:mm */
  departedAt: string;
  /** 锁定时的送达顺序（订单 id 列表） */
  orderIds: string[];
  /** 锁定时的单趟总重 kg */
  totalWeight: number;
  /** 锁定时的核定载重 kg，留底供重开后核对 */
  capacity: number;
}

export interface RejectionEntry {
  id: string;
  at: string;
  orderId: string;
  orderNo: string;
  vehicleId: string;
  plate: string;
  reason: string;
}
