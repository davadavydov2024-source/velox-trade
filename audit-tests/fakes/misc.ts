import { out } from "./store";
export const notifyTelegramServer = (...a: any[]) => { out.tg.push(a); };
export const sendWebPush = async (...a: any[]) => { out.push.push(a); };
export const sendTelegramMessage = async (...a: any[]) => { out.tg.push(a); return true; };
export const sendMail = async (...a: any[]) => { out.mail.push(a); };
export class RollyPayError extends Error {}
export const rollyCreatePayment = async (a: any) => { (globalThis as any).__pay = a; return { payUrl: "u", paymentId: "1" }; };
export const sendInvoice = async (...a: any[]) => { (globalThis as any).__inv = a; return true; };
