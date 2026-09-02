import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, TrendingDown } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  queued: "В очереди",
  processing: "В работе",
  done: "Готово",
  failed: "Ошибка",
};

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "done" ? "default" : status === "failed" ? "destructive" : "secondary";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const quota = trpc.jobs.quota.useQuery();
  const jobsList = trpc.jobs.list.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === "processing" || j.status === "queued")
        ? 4000
        : false,
  });

  const createJob = trpc.jobs.create.useMutation({
    onSuccess: (data) => {
      utils.jobs.list.invalidate();
      utils.jobs.quota.invalidate();
      navigate(`/jobs/${data.id}`);
    },
    onError: (e) => setError(e.message),
  });

  async function submit() {
    setError("");
    const jobTitle = title.trim() || `Отбор от ${new Date().toLocaleDateString("ru-RU")}`;
    if (file) {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      createJob.mutate({
        title: jobTitle,
        sourceType: "excel",
        fileBase64: btoa(bin),
      });
    } else if (text.trim()) {
      createJob.mutate({ title: jobTitle, sourceType: "text", text });
    } else {
      setError("Добавьте список позиций текстом или загрузите Excel-файл");
    }
  }

  const q = quota.data;

  return (
    <AuthLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold">
            <TrendingDown className="h-6 w-6 text-emerald-500" /> PriceHunter
          </Link>
          {q && (
            <div className="text-sm text-muted-foreground">
              Тариф: <b className="uppercase">{q.plan}</b>
              {q.plan === "free" && (
                <> · использовано {q.usedTasks} из {q.freeTasksLimit} задач</>
              )}
            </div>
          )}
        </div>

        {q?.engine === "scraper" && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            ⚠️ Поисковый движок работает в базовом режиме. Для полноценного поиска цен
            по российским B2B-площадкам задайте переменную окружения <code>KIMI_API_KEY</code>{" "}
            (ключ Kimi API с platform.moonshot.cn) в настройках сервера.
          </div>
        )}

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Новая проверка отбора</CardTitle>
            <CardDescription>
              Загрузите Excel (.xlsx/.csv) или вставьте список позиций текстом — каждая
              позиция с новой строки. Агент найдёт 2 цены оригинала + аналоги.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Название задачи (необязательно)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              rows={6}
              placeholder={"Например:\nGIGALINK SFP GL-OT-SG07LC2 1.25G MM 2xLC 850nm\nКабель витая пара UTP cat.5e 4x2x0.52\nАвтоматический выключатель IEK ВА47-29 3P 32А"}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value) setFile(null);
              }}
            />
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  if (e.target.files?.[0]) setText("");
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {file ? file.name : "Загрузить Excel"}
              </Button>
              {file && (
                <Button variant="ghost" onClick={() => setFile(null)}>
                  Убрать файл
                </Button>
              )}
              <div className="flex-1" />
              <Button onClick={submit} disabled={createJob.isPending}>
                {createJob.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Запустить проверку
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <h2 className="mb-4 text-lg font-semibold">Мои задачи</h2>
        <div className="space-y-3">
          {jobsList.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Пока нет задач — запустите первую проверку выше.
            </p>
          )}
          {jobsList.data?.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`}>
              <Card className="transition-colors hover:border-emerald-500/50">
                <CardContent className="flex items-center gap-4 py-4">
                  <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
                  <div className="flex-1">
                    <div className="font-medium">{j.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {j.itemCount} позиций · обработано {j.doneCount}
                      {j.status === "done" && j.finishedAt &&
                        ` · готово ${new Date(j.finishedAt).toLocaleString("ru-RU")}`}
                    </div>
                  </div>
                  <StatusBadge status={j.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
