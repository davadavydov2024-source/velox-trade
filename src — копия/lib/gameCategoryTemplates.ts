/**
 * Готовые наборы категорий под конкретные Roblox-игры, из которых торгуют на площадках вроде этой.
 * Ничего не применяется автоматически — админ на /admin/games сам жмёт "Вставить шаблон" для нужной
 * игры, после чего список попадает в поле формы и его можно тут же поправить (добавить/удалить/
 * переименовать пункты) перед сохранением. Ключ — просто внутренний id шаблона, не привязан к slug
 * игры на сайте, так что один и тот же шаблон можно применить к игре с любым названием/slug.
 */
export interface GameCategoryTemplate {
  id: string;
  label: string; // как называется в списке шаблонов в админке
  categories: string[];
}

export const GAME_CATEGORY_TEMPLATES: GameCategoryTemplate[] = [
  {
    id: "mm2",
    label: "Murder Mystery 2",
    categories: ["Ножи", "Пистолеты", "Питомцы", "Наборы", "Годовые/сезонные предметы", "Прочее"],
  },
  {
    id: "blox-fruits",
    label: "Blox Fruits",
    categories: ["Фрукты (обычные)", "Фрукты (мифические)", "Мечи и оружие", "Аккаунты", "Валюта (Beli/Fragments)"],
  },
  {
    id: "adopt-me",
    label: "Adopt Me",
    categories: ["Питомцы (обычные)", "Питомцы (легендарные/NFR)", "Транспорт", "Еда и ингредиенты", "Аккаунты"],
  },
  {
    id: "ink-game",
    label: "Ink Game",
    categories: ["Скины", "Валюта (Ink)", "Аксессуары", "Пропуска/билеты"],
  },
  {
    id: "grow-a-garden",
    label: "Grow a Garden",
    categories: ["Семена", "Питомцы", "Инструменты", "Валюта", "Аккаунты"],
  },
  {
    id: "pet-simulator-99",
    label: "Pet Simulator 99",
    categories: ["Питомцы", "Яйца", "Валюта (Gems/Coins)", "Аккаунты"],
  },
  {
    id: "king-legacy",
    label: "King Legacy",
    categories: ["Фрукты", "Мечи и оружие", "Валюта", "Аккаунты"],
  },
  {
    id: "blade-ball",
    label: "Blade Ball",
    categories: ["Скины клинков", "Титулы", "Валюта", "Аккаунты"],
  },
];
