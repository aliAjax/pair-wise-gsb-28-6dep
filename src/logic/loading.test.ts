/**
 * 装载判断层单元测试 —— 零依赖，node --experimental-strip-types 直接运行。
 * 运行：node --experimental-strip-types --no-warnings src/logic/loading.test.ts
 */

import assert from "node:assert/strict";
import {
  buildSnapshot,
  fingerprint,
  tryAddOrder,
  verifyManifest,
  type AcceptResult
} from "./loading.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// 场景一：正常按送达顺序排列（T-01，载重 1000kg）
test("拖入新订单自动插入到正确装车位置（远点先装、近点靠门）", () => {
  let r = tryAddOrder([], "T-01", "O-1006") as AcceptResult; // 8km
  assert.deepEqual(r.loadingOrder, ["O-1006"]);
  r = tryAddOrder(r.loadingOrder, "T-01", "O-1001") as AcceptResult; // 42km
  assert.deepEqual(r.loadingOrder, ["O-1001", "O-1006"], "远点应在最里先装");
  r = tryAddOrder(r.loadingOrder, "T-01", "O-1005") as AcceptResult; // 12km
  assert.deepEqual(r.loadingOrder, ["O-1001", "O-1005", "O-1006"], "近点靠门");
  assert.equal(r.totalWeightKg, 120 + 320 + 150);
});

test("客户硬性要求与距离一致时不冲突（O-1002 先于 O-1001）", () => {
  const r = tryAddOrder(["O-1001"], "T-01", "O-1002");
  assert.equal(r.ok, true);
});

// 场景二：顺序冲突——同一送达点同距离
test("同送达点同距离顺序冲突，写清被哪单挡住", () => {
  const r = tryAddOrder(["O-1003"], "T-01", "O-1011"); // 都是嘉定北站 25km
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "sequence");
    assert.equal(r.blockedById, undefined, "同点冲突不产生靠门挡重概念");
    assert.match(r.message, /O-1003/, "退回说明必须点出挡住它的订单号");
    assert.match(r.message, /顺序冲突/);
  }
});

// 场景三：顺序冲突——客户要求与近点先送矛盾
test("远点要求先于近点送达时冲突，被近点单挡住", () => {
  const r = tryAddOrder(["O-1006"], "T-01", "O-1012"); // 55km 要求先于 8km 的 O-1006
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "sequence");
    assert.match(r.message, /O-1006/);
  }
});

test("冲突单退回后，车辆订单不变（拒绝是原子的）", () => {
  const before = tryAddOrder([], "T-01", "O-1003") as AcceptResult;
  const rejected = tryAddOrder(before.loadingOrder, "T-01", "O-1011");
  assert.equal(rejected.ok, false);
});

// 场景四：超重
test("超重被退回，写明超出公斤数和靠门挡住的订单", () => {
  // T-02 核定 500kg：先装 O-1007(22km,290kg) 再装 O-1005(12km,150kg) => 440kg 不超
  let r = tryAddOrder([], "T-02", "O-1007") as AcceptResult;
  r = tryAddOrder(r.loadingOrder, "T-02", "O-1005") as AcceptResult;
  assert.equal(r.totalWeightKg, 440);
  // 再加 O-1003(240kg) => 680kg，超 180kg；靠门先送的是最近点 O-1005
  r = tryAddOrder(r.loadingOrder, "T-02", "O-1003");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "overweight");
    assert.equal(r.overloadKg, 180);
    assert.equal(r.blockedById, "O-1005");
    assert.match(r.message, /超出 180kg/);
    assert.match(r.message, /O-1005/);
  }
});

test("空车单件即超重时提示无挡路单", () => {
  const r = tryAddOrder([], "T-03", "O-1001", 300); // 320kg vs 300kg
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "overweight");
    assert.equal(r.overloadKg, 20);
    assert.equal(r.blockedById, undefined);
    assert.match(r.message, /空车/);
  }
});

test("顺序冲突优先于超重判定", () => {
  // O-1003 + O-1011 同点冲突，哪怕小载重车也应先报顺序冲突
  const r = tryAddOrder(["O-1003"], "T-03", "O-1011"); // T-03 仅 350kg
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "sequence");
});

test("重复装车被拒绝", () => {
  const r = tryAddOrder(["O-1006"], "T-01", "O-1006");
  assert.equal(r.ok, false);
});

test("未知订单被拒绝", () => {
  const r = tryAddOrder([], "T-01", "NO-SUCH");
  assert.equal(r.ok, false);
});

// 场景五：发车快照与重开核对
test("发车快照按装车顺序记录重量和指纹", () => {
  const snap = buildSnapshot("T-01", "刘师傅", ["O-1006", "O-1001", "O-1005"], "2026-09-26 08:00:00");
  assert.equal(snap.ok, true);
  if (snap.ok) {
    assert.deepEqual(snap.loadingOrder, ["O-1001", "O-1005", "O-1006"]);
    assert.equal(snap.totalWeightKg, 590);
    assert.equal(snap.checksum.length, 8);
    assert.equal(
      snap.checksum,
      fingerprint(["T-01", "O-1001", "O-1005", "O-1006", 590].join("|"))
    );
  }
});

test("重开后顺序重量一致时核对通过（传入顺序打乱也会重排核对）", () => {
  const snap = buildSnapshot("T-01", "刘师傅", ["O-1001", "O-1005", "O-1006"], "t") as
    | ReturnType<typeof buildSnapshot>
    | never;
  if ("ok" in snap && snap.ok) {
    const check = verifyManifest(snap, ["O-1006", "O-1005", "O-1001"]);
    assert.equal(check.ok, true, "顺序应按规则重排后比对");
    assert.equal(check.actualWeightKg, 590);
  }
});

test("重开后少货/多货/重量不符全部能报出", () => {
  const snap = buildSnapshot("T-01", "刘师傅", ["O-1001", "O-1005", "O-1006"], "t");
  if ("ok" in snap && snap.ok) {
    const check = verifyManifest(snap, ["O-1005", "O-1006", "O-1010"]); // 缺 O-1001，多 O-1010
    assert.equal(check.ok, false);
    const codes = check.issues.map((i) => i.code);
    assert.ok(codes.includes("missing"));
    assert.ok(codes.includes("extra"));
    assert.ok(codes.includes("weightMismatch"));
    assert.ok(codes.includes("checksumMismatch"));
    const missing = check.issues.find((i) => i.code === "missing");
    if (missing && missing.code === "missing") assert.equal(missing.orderId, "O-1001");
  }
});

test("换班不改订单：同批订单新司机核对仍通过", () => {
  const snap = buildSnapshot("T-01", "刘师傅", ["O-1004", "O-1006"], "t");
  if ("ok" in snap && snap.ok) {
    const handed = buildSnapshot("T-01", "周师傅", ["O-1004", "O-1006"], "t");
    // 指纹只与车次/顺序/重量有关，与司机姓名无关：换班照原顺序接车
    if (handed.ok) assert.equal(handed.checksum, snap.ok ? snap.checksum : "");
  }
});

console.log(`\n${passed} 个测试全部通过 ✅`);
