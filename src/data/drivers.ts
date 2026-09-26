/**
 * 司机 / 车辆资料层（主数据）
 * 车与司机初始绑定；换班时车次不变、只换当前司机，顺序仍照原顺序接车。
 */

export interface DriverMaster {
  /** 车次（固定标识，发车 / 换班 / 重开核对都以它为准） */
  truckId: string;
  /** 车牌号 */
  plate: string;
  /** 当前司机姓名（换班后会在状态里更新，此处为初始值） */
  driverName: string;
  /** 车型 */
  vehicleType: string;
  /** 核定载重 kg：单趟总重不得超过 */
  capacityKg: number;
}

export const DRIVERS: DriverMaster[] = [
  { truckId: "T-01", plate: "沪D·3016", driverName: "刘师傅", vehicleType: "4.2米厢车", capacityKg: 1000 },
  { truckId: "T-02", plate: "沪D·3027", driverName: "赵师傅", vehicleType: "4.2米厢车", capacityKg: 500 },
  { truckId: "T-03", plate: "沪D·3038", driverName: "孙师傅", vehicleType: "3.3米厢车", capacityKg: 350 }
];

export const DRIVERS_BY_TRUCK: Map<string, DriverMaster> = new Map(
  DRIVERS.map((driver) => [driver.truckId, driver])
);
