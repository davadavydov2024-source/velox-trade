"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Sheet, Switch } from "./ui";

export interface PollDraft {
  question: string;
  options: string[];
  multiple: boolean;
  anonymous: boolean;
  quiz?: { correct: number; explanation?: string };
}

/** Создание опроса / викторины (лимиты как на сервере: вопрос до 255, 2–10 вариантов до 100 символов). */
export function PollCreateSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (p: PollDraft) => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [anonymous, setAnonymous] = useState(true);
  const [multiple, setMultiple] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState("");

  const filled = options.map((o) => o.trim());
  const valid = question.trim().length > 0 && filled.filter(Boolean).length >= 2 && (!quiz || !!filled[correct]);

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setAnonymous(true);
    setMultiple(false);
    setQuiz(false);
    setCorrect(0);
    setExplanation("");
  };
  const submit = () => {
    if (!valid) return;
    // пустые варианты выбрасываем и пересчитываем индекс правильного ответа
    const keep = filled.map((t, i) => ({ t, i })).filter((x) => x.t);
    const newCorrect = Math.max(0, keep.findIndex((x) => x.i === correct));
    onCreate({
      question: question.trim(),
      options: keep.map((x) => x.t),
      multiple: !quiz && multiple,
      anonymous,
      ...(quiz ? { quiz: { correct: newCorrect, explanation: explanation.trim() || undefined } } : {}),
    });
    reset();
    onClose();
  };
  const setOpt = (i: number, v: string) => setOptions((l) => l.map((x, j) => (j === i ? v : x)));
  const removeOpt = (i: number) => {
    setOptions((l) => l.filter((_, j) => j !== i));
    setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
  };

  return (
    <Sheet open={open} onClose={onClose} title="Новый опрос" full>
      <div className="mx-scroll flex-1 min-h-0 px-4 pb-6 space-y-4">
        <div className="mx-card">
          <input className="w-full px-4 py-3 bg-transparent outline-none text-[16px]" placeholder="Вопрос" maxLength={255} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>

        <div>
          <p className="mx-muted text-[13px] px-2 pb-1.5">Варианты ответа{quiz ? " (отметь правильный)" : ""}</p>
          <div className="mx-card">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2 pr-2" style={i > 0 ? { borderTop: "1px solid var(--mx-line)" } : undefined}>
                {quiz && (
                  <button type="button" onClick={() => setCorrect(i)} aria-label="Правильный ответ" className="ml-3 w-5 h-5 rounded-full border-2 shrink-0" style={{ borderColor: correct === i ? "var(--mx-accent)" : "var(--mx-muted)", background: correct === i ? "var(--mx-accent)" : "transparent" }} />
                )}
                <input className="flex-1 min-w-0 px-4 py-3 bg-transparent outline-none text-[16px]" placeholder={`Вариант ${i + 1}`} maxLength={100} value={o} onChange={(e) => setOpt(i, e.target.value)} />
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOpt(i)} className="p-1.5 mx-muted" aria-label="Убрать вариант"><X size={18} /></button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button type="button" onClick={() => setOptions((l) => [...l, ""])} className="flex items-center gap-2 px-3 py-3 text-[15px] font-medium" style={{ color: "var(--mx-accent)" }}>
              <Plus size={18} /> Добавить вариант
            </button>
          )}
        </div>

        <div className="mx-card">
          <label className="flex items-center justify-between px-4 py-3">
            <span>Анонимное голосование</span>
            <Switch on={anonymous} onChange={setAnonymous} />
          </label>
          <label className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--mx-line)", opacity: quiz ? 0.4 : 1 }}>
            <span>Несколько ответов</span>
            <Switch on={multiple && !quiz} onChange={setMultiple} disabled={quiz} />
          </label>
          <label className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--mx-line)" }}>
            <span>Режим викторины</span>
            <Switch on={quiz} onChange={setQuiz} />
          </label>
        </div>

        {quiz && (
          <div className="mx-card">
            <input className="w-full px-4 py-3 bg-transparent outline-none text-[16px]" placeholder="Пояснение к ответу (необязательно)" maxLength={200} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          </div>
        )}

        <button className="mx-btn w-full" onClick={submit} disabled={!valid}>Отправить</button>
      </div>
    </Sheet>
  );
}
