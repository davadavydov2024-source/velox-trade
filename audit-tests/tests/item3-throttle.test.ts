import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { t } from "../fakes/store";
import { POST as verify } from "@/app/api/auth/verify-code/route";
const guess = (code: string, ip: string) => verify(new NextRequest("http://x/api/auth/verify-code", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.c", code }) }));
const plant = () => t.seed("loginCodes", "victim", { code: "123456", createdAt: Date.now(), expiresAt: Date.now() + 3e5, attempts: 0 });
beforeEach(() => { t.reset(); t.seed("users", "victim", { email: "a@b.c" }); plant(); });
describe("item 3: attempt limit is per account; X-Forwarded-For spoofing does not bypass it", () => {
  it("50 PARALLEL wrong guesses with distinct spoofed IPs: at most 5 are evaluated", async () => {
    const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => guess(String(100000 + i), `10.0.0.${i}`)));
    const evaluated = (await Promise.all(rs.map(async (r) => (await r.clone().json()).error))).filter((e) => e === "Неверный код").length;
    console.log("parallel: evaluated as wrong =", evaluated, "blocked =", rs.filter((r) => r.status === 429).length);
    expect(evaluated).toBeLessThanOrEqual(5);
  });
  it("correct code is refused after 5 wrong ones, even from a fresh spoofed IP", async () => {
    for (let i = 0; i < 5; i++) await guess("000000", `1.1.1.${i}`);
    const r = await guess("123456", "9.9.9.9");
    expect(r.status).not.toBe(200);
  });
  it("after the code is burned, repeated re-requests cannot give unlimited guesses (account lockout)", async () => {
    let wrong = 0;
    for (let round = 0; round < 10; round++) {
      plant(); // attacker requests a fresh code each round
      for (let i = 0; i < 5; i++) { const r = await guess("000000", `7.7.${round}.${i}`); if ((await r.json()).error === "Неверный код") wrong++; }
    }
    console.log("across 10 fresh codes, guesses evaluated =", wrong);
    expect(wrong).toBeLessThanOrEqual(10);
    plant(); expect((await guess("123456", "8.8.8.8")).status).not.toBe(200);
  });
  it("legit user still logs in", async () => { expect((await guess("123456", "2.2.2.2")).status).toBe(200); });
});
import { POST as tgConfirm } from "@/app/api/auth/tg-verify/confirm/route";
describe("item 3b: tg-verify/confirm parallel guesses", () => {
  it("50 parallel wrong guesses: at most 5 evaluated", async () => {
    t.reset(); t.seed("tgVerifyRequests", "tk", { code: "123456", status: "code_sent", attempts: 0, createdAt: Date.now() });
    const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => tgConfirm(new NextRequest("http://x/c", { method: "POST", headers: { "x-forwarded-for": `3.3.3.${i}` }, body: JSON.stringify({ token: "tk", code: String(100000 + i) }) }))));
    const ev = (await Promise.all(rs.map(async (r) => (await r.json()).error))).filter((e) => e === "Неверный код").length;
    console.log("tg-verify evaluated =", ev); expect(ev).toBeLessThanOrEqual(5);
  });
});
