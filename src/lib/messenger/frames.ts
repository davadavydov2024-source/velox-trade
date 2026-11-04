/** Рамки аватарок: покупаются за ⭐, надеваются в профиль, цвет рамки выбирается из палитры. */
export type FrameDef = { id: string; name: string; price: number; defaultColor: string };

export const FRAMES: FrameDef[] = [
  { id: "crown", name: "Корона", price: 150, defaultColor: "#ffd23f" },
  { id: "night", name: "Ночь", price: 100, defaultColor: "#4dd0e1" },
  { id: "ghoul", name: "Гуль", price: 120, defaultColor: "#ff3b3b" },
  { id: "laurel", name: "Лавр", price: 80, defaultColor: "#ff9f43" },
  { id: "ocean", name: "Глубина", price: 100, defaultColor: "#4dd0e1" },
  { id: "rose", name: "Роза", price: 130, defaultColor: "#ff3b5c" },
];
export const FRAME_COLORS = ["#ffd23f", "#ff6b6b", "#4dd0e1", "#7c5cff", "#4cd964", "#ff9f43", "#ff5ca8", "#e8e8f0"];
export const frameById = (id?: string | null) => FRAMES.find((f) => f.id === id);
export type EquippedFrame = { id: string; color: string };
