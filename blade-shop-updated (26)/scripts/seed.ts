/**
 * Запуск: npm run seed
 * Заполняет Firestore коллекцию "games" (категории игр для навигации).
 * Товары намеренно НЕ создаются автоматически — добавляй их через Админ-панель → Товары,
 * чтобы каталог не содержал демо-данных.
 */
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { MOCK_GAMES } from "../src/lib/mockData";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

async function seed() {
  console.log("Заполняю games...");
  for (const game of MOCK_GAMES) {
    await setDoc(doc(db, "games", game.id), game);
  }

  console.log("Готово! Категории игр созданы. Товары добавляй через /admin → Товары.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Ошибка сидирования:", err);
  process.exit(1);
});
