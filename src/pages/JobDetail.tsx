import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

interface ItemResultLite {
  price1?: { price: number | null; url: string; supplier: string } | null;
  price2?: { price: number | null; url: string; supplier: string } | null;
  analogOther?: { offer?: { price: number | null; supplier: string } | null } | null;
  recommendation?: string;
  comment?: string;
  issues?: { level: string; message: string }[];
}

const REC_LABEL: Record<string, string> = {
  approve: "Согласовать",
  test: "Требует теста",
  reject: "НЕ согласовывать",
  none: "Без замены",
};

function fmtPrice(o?: { price: number | null } | null) {
  if (!o) return "—";
  return o.price === null ? "цена не указана" : `${o.price.toLocaleString("ru-RU")} ₽`;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const job = trpc.jobs.byId.useQuery(
    { id: jobId },
    {
      refetchInterval: (q) =>
        q.state.data?.status === "processing" || q.state.data?.status === "queued"
          ? 4000
          : false,
    },
  );

  const download = trpc.jobs.download.useQuery(
    { id: jobId },
    { enabled: false },
  );

  async function handleDownload() {
    const res = await download.refetch();
    if (!res.data) return;
    const bin = atob(res.data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (job.isLoading)
    return (
      <AuthLayout>
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AuthLayout>
    );
  if (!job.data)
    return (
      <AuthLayout>
        <div className="py-24 text-center">Задача не найдена</div>
      </AuthLayout>
    );

  const j = job.data;
  const progress = j.itemCount ? Math.round((j.doneCount / j.itemCount) * 100) : 0;
  const summary = j.summary ? JSON.parse(j.summary) : null;

  return (
    <AuthLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Button asChild variant="ghost" className="mb-4">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" /> К задачам
          </Link>
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{j.title}</CardTitle>
              {j.status === "done" && j.hasFile && (
                <Button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-500">
                  <Download className="mr-2 h-4 w-4" /> Скачать Excel
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(j.status === "processing" || j.status === "queued") && (
              <>
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground">
                  Обработано {j.doneCount} из {j.itemCount} позиций ({progress}%). Поиск цен
                  и аналогов занимает время — страница обновляется автоматически.
                </p>
              </>
            )}
            {j.status === "failed" && (
              <p className="text-sm text-destructive">Ошибка: {j.error}</p>
            )}
            {summary && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold">{summary.totalItems}</div>
                  <div className="text-xs text-muted-foreground">позиций</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold">{summary.withTwoPrices}</div>
                  <div className="text-xs text-muted-foreground">с двумя ценами</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold">{summary.withAnalogs}</div>
                  <div className="text-xs text-muted-foreground">с аналогами</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-emerald-500">
                    {summary.potentialSavingsRub
                      ? `${summary.potentialSavingsRub.toLocaleString("ru-RU")} ₽`
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">потенциальная экономия</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <h2 className="mb-3 text-lg font-semibold">Позиции</h2>
        <div className="space-y-2">
          {j.items.map((it) => {
            const r: ItemResultLite | null = it.result ? JSON.parse(it.result) : null;
            return (
              <Card key={it.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {it.num}. {it.name.split("\n")[0]}
                      </div>
                      {r && (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Цена 1: {fmtPrice(r.price1)}</span>
                          <span>Цена 2: {fmtPrice(r.price2)}</span>
                          <span>
                            Аналог:{" "}
                            {r.analogOther?.offer ? fmtPrice(r.analogOther.offer) : "—"}
                          </span>
                          {r.comment && (
                            <span className="basis-full italic">{r.comment}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r?.recommendation && (
                        <Badge
                          variant={
                            r.recommendation === "approve"
                              ? "default"
                              : r.recommendation === "reject"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {REC_LABEL[r.recommendation]}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {it.status === "done"
                          ? "Готово"
                          : it.status === "processing"
                            ? "В работе…"
                            : it.status === "failed"
                              ? "Ошибка"
                              : "Ожидает"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AuthLayout>
  );
}
