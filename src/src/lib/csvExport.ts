/** Скачивает массив объектов как CSV-файл — без сторонних библиотек, просто ручное
 * формирование строк с экранированием кавычек и запятых. Используется на страницах
 * /admin/users, /admin/registrations и подобных списочных админках. */
export function downloadCsv(filename: string, rows: Record<string, string | number | null | undefined>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);

  function escapeCell(value: string | number | null | undefined): string {
    const str = value === null || value === undefined ? "" : String(value);
    // Экранируем, только если реально нужно — кавычки/запятые/переносы строк ломают формат CSV
    // без них.
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];
  // BOM (\uFEFF) — чтобы Excel на Windows сразу правильно определил кодировку UTF-8 для кириллицы,
  // без него русские буквы превращаются в кракозябры при открытии в Excel.
  const csv = "\uFEFF" + lines.join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
