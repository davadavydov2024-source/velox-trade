import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fsLimit,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { Game, Product } from "@/types";

const gamesCol = collection(db, "games");
const productsCol = collection(db, "products");

export async function getGames(): Promise<Game[]> {
  const snap = await getDocs(gamesCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Game);
}

export async function getGameBySlug(slug: string): Promise<Game | null> {
  const snap = await getDocs(query(gamesCol, where("slug", "==", slug), fsLimit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Game;
}

export async function getProducts(opts?: {
  gameId?: string;
  sellerId?: string;
  rarity?: string;
  isNew?: boolean;
  sort?: "price_asc" | "price_desc" | "newest";
}): Promise<Product[]> {
  const clauses = [];
  if (opts?.gameId) clauses.push(where("gameId", "==", opts.gameId));
  if (opts?.sellerId) clauses.push(where("sellerId", "==", opts.sellerId));
  if (opts?.rarity) clauses.push(where("rarity", "==", opts.rarity));
  if (opts?.isNew) clauses.push(where("isNew", "==", true));

  // Сортируем на клиенте, а не через Firestore orderBy: комбинация where + orderBy на разных
  // полях требует отдельного составного индекса на КАЖДОЕ сочетание фильтров, что означало бы
  // создание нескольких индексов вручную в консоли Firebase. Товаров в каталоге не миллионы,
  // так что сортировка в JS обходится дёшево и работает сразу без лишней настройки.
  const snap = await getDocs(query(productsCol, ...clauses));
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product);

  if (opts?.sort === "price_asc") products.sort((a, b) => a.price - b.price);
  else if (opts?.sort === "price_desc") products.sort((a, b) => b.price - a.price);
  else products.sort((a, b) => b.createdAt - a.createdAt);

  return products;
}

export async function getProductById(id: string): Promise<Product | null> {
  const ref = doc(db, "products", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Product;
}

export async function createProduct(data: Omit<Product, "id" | "createdAt">) {
  return addDoc(productsCol, { ...data, createdAt: Date.now() });
}

export async function updateProduct(id: string, data: Partial<Product>) {
  return updateDoc(doc(db, "products", id), data);
}

export async function deleteProduct(id: string) {
  return deleteDoc(doc(db, "products", id));
}

export async function createGame(data: Omit<Game, "id">) {
  return addDoc(gamesCol, data);
}

export async function updateGame(id: string, data: Partial<Game>) {
  return updateDoc(doc(db, "games", id), data);
}

export async function deleteGame(id: string) {
  return deleteDoc(doc(db, "games", id));
}

export { serverTimestamp };
