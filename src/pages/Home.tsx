import { Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  TrendingDown,
  ShieldCheck,
  Search,
  FileSpreadsheet,
  MousePointerClick,
  Scale,
  Megaphone,
  ArrowRight,
} from "lucide-react";

const steps = [
  {
    icon: FileSpreadsheet,
    title: "Загрузите перечень",
    text: "Excel-файл или просто текст — список материалов и оборудования из вашей заявки или отбора.",
  },
  {
    icon: Search,
    title: "Агент ищет цены",
    text: "По каждой позиции ищем 2 цены оригинала у разных поставщиков, аналог другой марки и аналог той же марки — по формуле 2+1+1.",
  },
  {
    icon: MousePointerClick,
    title: "Получите Excel с доказательствами",
    text: "Каждая цена — кликабельная ссылка на товар. Матрицы сравнения аналогов и встроенная проверка качества на 25 правил.",
  },
];

const audiences = [
  {
    icon: Scale,
    title: "Аудит и контрольно-ревизионные службы",
    text: "Проверяйте отборы и закупочные цены на завышение. Кликабельные ссылки на источники — готовая доказательная база для служебных расследований и рекламаций.",
  },
  {
    icon: ShieldCheck,
    title: "Службы безопасности",
    text: "Выявляйте аффилированных поставщиков через аномальный разброс цен. Eval-проверки автоматически флагают отклонения >3x и подозрительные позиции.",
  },
  {
    icon: Megaphone,
    title: "Маркетинг и тендерные отделы",
    text: "Конкурентная разведка цен на материалы и оборудование. Матрицы аналогов с отклонениями параметров — обоснование для замены позиций в спецификациях.",
  },
];

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-xl font-bold">
          <TrendingDown className="h-6 w-6 text-emerald-400" />
          PriceHunter
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Button asChild>
              <Link to="/dashboard">Личный кабинет</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="border-slate-600 text-slate-100">
              <Link to="/login">Войти</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="py-16 text-center md:py-24">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm text-emerald-300">
            Формула 2+1+1 · проверка отборов · снижение закупочных цен
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl">
            Закупки без переплат.
            <span className="block bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Экономия, которую видно в цифрах.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Загрузите перечень материалов — получите Excel со сравнением цен поставщиков,
            аналогами дешевле и ссылками на каждый источник. Компании экономят миллионы,
            проверяя отборы и заменяя завышенные позиции на идентичные аналоги.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              <Link to={isAuthenticated ? "/dashboard" : "/login"}>
                Проверить отбор бесплатно <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <span className="text-sm text-slate-500">3 задачи бесплатно · до 10 позиций каждая</span>
          </div>
        </section>

        {/* Как это работает */}
        <section className="py-12">
          <h2 className="mb-10 text-center text-3xl font-bold">Как это работает</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <s.icon className="mb-4 h-8 w-8 text-emerald-400" />
                <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
                <p className="text-sm text-slate-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Для контрольных служб */}
        <section className="py-12">
          <h2 className="mb-3 text-center text-3xl font-bold">Для контрольных служб</h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-slate-400">
            Инструмент, который окупается с первой проверки: выявленное завышение хотя бы
            по одной крупной позиции покрывает год использования.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {audiences.map((a, i) => (
              <div key={i} className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/40 p-6">
                <a.icon className="mb-4 h-8 w-8 text-cyan-400" />
                <h3 className="mb-2 text-lg font-semibold">{a.title}</h3>
                <p className="text-sm text-slate-400">{a.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Тарифы */}
        <section className="py-12">
          <h2 className="mb-10 text-center text-3xl font-bold">Тарифы</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { name: "Free", price: "0 ₽", feats: ["3 задачи", "До 10 позиций в задаче", "Excel с кликабельными ценами", "Eval-проверка качества"] },
              { name: "Pro", price: "По запросу", feats: ["Без лимита задач", "До 100 позиций в задаче", "Матрицы сравнения аналогов", "Приоритетная очередь"], hl: true },
              { name: "Business", price: "По запросу", feats: ["Всё из Pro", "Настройка под категории ТМЦ", "Интеграция с ERP/1С", "SLA и поддержка"] },
            ].map((t, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-6 ${t.hl ? "border-emerald-500/50 bg-emerald-500/5" : "border-slate-800 bg-slate-900/60"}`}
              >
                <h3 className="text-xl font-bold">{t.name}</h3>
                <div className="my-3 text-3xl font-extrabold text-emerald-400">{t.price}</div>
                <ul className="space-y-2 text-sm text-slate-300">
                  {t.feats.map((f, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="text-emerald-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
          PriceHunter — снижение закупочных цен через проверку отборов и аналоги. © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
