/**
 * 订单资料层（主数据）
 * 只维护"订单是什么"：送达点、距仓距离、重量、客户硬性送达要求。
 * 不包含任何装车规则，也不引用页面/状态代码。
 */

export interface OrderMaster {
  /** 订单号 */
  id: string;
  /** 送达点 */
  destination: string;
  /** 距仓库公里数：数字越小越近（近点先送达、靠门放） */
  distanceKm: number;
  /** 货物重量 kg */
  weightKg: number;
  /** 客户硬性要求：本单必须先于指定订单送达；与"近点先送"矛盾时会被退回 */
  deliverBeforeId?: string;
  /** 资料备注 */
  note?: string;
}

export const ORDERS: OrderMaster[] = [
  { id: "O-1001", destination: "青浦工业区", distanceKm: 42, weightKg: 320 },
  {
    id: "O-1002",
    destination: "松江新城",
    distanceKm: 30,
    weightKg: 180,
    deliverBeforeId: "O-1001",
    note: "客户要求先于 O-1001 送达（与远点后送一致）"
  },
  { id: "O-1003", destination: "嘉定北站", distanceKm: 25, weightKg: 240 },
  { id: "O-1004", destination: "闵行开发区", distanceKm: 18, weightKg: 200 },
  { id: "O-1005", destination: "虹桥商务区", distanceKm: 12, weightKg: 150 },
  { id: "O-1006", destination: "普陀门店", distanceKm: 8, weightKg: 120 },
  { id: "O-1007", destination: "宝山仓库", distanceKm: 22, weightKg: 290 },
  { id: "O-1008", destination: "川沙站点", distanceKm: 35, weightKg: 260 },
  { id: "O-1009", destination: "南汇果园", distanceKm: 48, weightKg: 310 },
  { id: "O-1010", destination: "静安自提点", distanceKm: 6, weightKg: 90 },
  // 与 O-1003 同送达点同距离：先后无法判定，同车会被挡回
  { id: "O-1011", destination: "嘉定北站", distanceKm: 25, weightKg: 140 },
  // 远点却要求先于近点 O-1006 送达：与"近点先送"矛盾，同车会被挡回
  {
    id: "O-1012",
    destination: "金山卫",
    distanceKm: 55,
    weightKg: 200,
    deliverBeforeId: "O-1006",
    note: "客户要求先于 O-1006 送达（与距离规则冲突）"
  }
];

export const ORDERS_BY_ID: Map<string, OrderMaster> = new Map(
  ORDERS.map((order) => [order.id, order])
);
