import { useCallback, useState } from "react";

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  summary: string;
  source: string;
  publishedAt?: string;
  savedAt: string;
  tags: string[];
}

interface NewsPage {
  articles: NewsArticle[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NewsQueryParams {
  q?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export function useNewsQuery(): {
  articles: NewsArticle[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  query: (params: NewsQueryParams) => void;
} {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const query = useCallback((params: NewsQueryParams) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.tag) qs.set("tag", params.tag);
    qs.set("page", String(params.page ?? 1));
    qs.set("pageSize", String(params.pageSize ?? 20));

    setLoading(true);
    void fetch(`/api/news?${qs.toString()}`)
      .then((r) => r.json() as Promise<NewsPage>)
      .then((data) => {
        setArticles(data.articles);
        setTotal(data.total);
        setPage(data.page);
      })
      .finally(() => setLoading(false));
  }, []);

  return { articles, total, page, pageSize, loading, query };
}
