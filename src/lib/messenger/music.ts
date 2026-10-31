/** «Музыка» в мессенджере: треки добавляет админ, пользователи предлагают песни заявками. */
export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl?: string;
  duration?: number; // секунды
  plays: number;
  createdAt: number;
  addedBy?: string;
};

export type MusicRequestStatus = "new" | "added" | "rejected";

export type MusicRequest = {
  id: string;
  uid: string;
  text: string;
  createdAt: number;
  status: MusicRequestStatus;
  trackId?: string;
  note?: string;
};

export const MUSIC_REQUEST_MIN = 2;
export const MUSIC_REQUEST_MAX = 120;
