import { defineConfig } from "vitest/config";
const F = new URL("./fakes/", import.meta.url).pathname;
export default defineConfig({ test: { include: ["tests/*.test.ts"] }, resolve: { alias: [
 { find: "@/lib/firebaseAdmin", replacement: F + "store.ts" },
 { find: "firebase-admin/firestore", replacement: F + "store.ts" },
 { find: "@/lib/telegramNotifyServer", replacement: F + "misc.ts" },
 { find: "@/lib/webPushServer", replacement: F + "misc.ts" },
 { find: "@/lib/telegramBot", replacement: F + "misc.ts" },
 { find: "@/lib/rollypay", replacement: F + "misc.ts" },
 { find: "@/lib/mailer", replacement: F + "misc.ts" },
 { find: /^@\//, replacement: (process.env.SRC_DIR ?? "/home/claude/fresh3/src") + "/" } ] } });
