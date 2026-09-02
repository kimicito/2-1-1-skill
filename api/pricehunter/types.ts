/** Результат по одной позиции по формуле 2+1+1 (price-comparison skill v7.4) */

export interface PriceOffer {
  price: number | null; // null = «Цена не указана»
  url: string;
  supplier: string; // домен
  title: string;
  notFound?: boolean; // «Не найдена за отведённое время»
}

export interface MatrixRow {
  param: string;
  original: string;
  analog: string;
  deviation: "match" | "minor" | "critical" | "unknown";
  note: string;
}

export interface AnalogBlock {
  kind: "other_brand" | "same_brand";
  title: string; // модель аналога
  brand: string;
  offer: PriceOffer | null; // null = «—»
  sources: string[];
  matrix: MatrixRow[];
}

export interface EvalIssue {
  level: "fail" | "warn";
  message: string;
}

export interface ItemResult {
  num: number;
  name: string;
  price1: PriceOffer | null;
  price2: PriceOffer | null;
  analogOther: AnalogBlock | null;
  analogSame: AnalogBlock | null;
  recommendation: "approve" | "test" | "reject" | "none";
  comment: string;
  date: string; // YYYY-MM-DD
  issues: EvalIssue[];
}

export interface JobSummary {
  totalItems: number;
  withTwoPrices: number;
  withAnalogs: number;
  potentialSavingsPct: number | null;
  potentialSavingsRub: number | null;
  fails: number;
  warns: number;
}
