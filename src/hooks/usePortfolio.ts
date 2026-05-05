import { useCallback, useEffect, useState } from "react";
import type { ApiResponse, PortfolioAdvice, PortfolioHolding } from "../types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.ok) throw new Error(json.error || "请求失败");
  return json.data as T;
}

export interface PortfolioForm {
  goodId: string;
  name: string;
  averageCost: string;
  quantity: string;
  buyDate: string;
  note: string;
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createEmptyForm(): PortfolioForm {
  return {
    goodId: "",
    name: "",
    averageCost: "",
    quantity: "",
    buyDate: todayInputValue(),
    note: "",
  };
}

export interface UsePortfolioOptions {
  configured: boolean;
  /** True only when user is on the portfolio tab — gates auto-load + advice refresh. */
  active: boolean;
  onMessage: (message: string | null) => void;
  onError: (message: string) => void;
}

export interface UsePortfolioResult {
  portfolio: PortfolioHolding[];
  portfolioAdvice: PortfolioAdvice[];
  portfolioLoading: boolean;
  portfolioAdviceLoading: boolean;
  portfolioForm: PortfolioForm;
  setPortfolioForm: React.Dispatch<React.SetStateAction<PortfolioForm>>;
  savePortfolio: (defaults?: { goodId?: string; name?: string }) => Promise<void>;
  deletePortfolio: (holdingId: string) => Promise<void>;
  refreshPortfolio: () => Promise<void>;
  refreshPortfolioAdvice: () => Promise<void>;
}

export function usePortfolio({
  configured,
  active,
  onMessage,
  onError,
}: UsePortfolioOptions): UsePortfolioResult {
  const [portfolio, setPortfolio] = useState<PortfolioHolding[]>([]);
  const [portfolioAdvice, setPortfolioAdvice] = useState<PortfolioAdvice[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioAdviceLoading, setPortfolioAdviceLoading] = useState(false);
  const [portfolioForm, setPortfolioForm] = useState<PortfolioForm>(() => createEmptyForm());

  const refreshPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const next = await requestJson<PortfolioHolding[]>("/api/portfolio");
      setPortfolio(next);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  const refreshPortfolioAdvice = useCallback(async () => {
    setPortfolioAdviceLoading(true);
    try {
      const next = await requestJson<PortfolioAdvice[]>("/api/portfolio/advice");
      setPortfolioAdvice(next);
    } finally {
      setPortfolioAdviceLoading(false);
    }
  }, []);

  // Auto-load when user opens the portfolio tab.
  useEffect(() => {
    if (!active) return;
    void refreshPortfolio();
    if (configured) void refreshPortfolioAdvice();
  }, [active, configured, refreshPortfolio, refreshPortfolioAdvice]);

  const savePortfolio = useCallback(
    async (defaults?: { goodId?: string; name?: string }) => {
      if (!portfolioForm.goodId.trim() || !portfolioForm.name.trim()) {
        onError("请先填写饰品 ID 和名称");
        return;
      }
      if (!portfolioForm.averageCost.trim() || !portfolioForm.quantity.trim()) {
        onError("请先填写买入成本和持仓数量");
        return;
      }
      if (!portfolioForm.buyDate.trim()) {
        onError("请先选择买入日期");
        return;
      }

      onMessage(null);

      try {
        await requestJson<PortfolioHolding[]>("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goodId: portfolioForm.goodId.trim(),
            name: portfolioForm.name.trim(),
            averageCost: Number(portfolioForm.averageCost),
            quantity: Number(portfolioForm.quantity),
            buyDate: portfolioForm.buyDate.trim(),
            note: portfolioForm.note.trim() || undefined,
          }),
        });

        setPortfolioForm({
          ...createEmptyForm(),
          goodId: defaults?.goodId ?? "",
          name: defaults?.name ?? "",
        });
        await refreshPortfolio();
        if (configured) await refreshPortfolioAdvice();
        onMessage("持仓登记已保存");
      } catch (caughtError) {
        onError(
          caughtError instanceof Error ? caughtError.message : "保存持仓失败",
        );
      }
    },
    [portfolioForm, configured, refreshPortfolio, refreshPortfolioAdvice, onError, onMessage],
  );

  const deletePortfolio = useCallback(
    async (holdingId: string) => {
      try {
        await requestJson<PortfolioHolding[]>(`/api/portfolio/${holdingId}`, {
          method: "DELETE",
        });
        await refreshPortfolio();
        if (configured) await refreshPortfolioAdvice();
      } catch (caughtError) {
        onError(
          caughtError instanceof Error ? caughtError.message : "删除持仓失败",
        );
      }
    },
    [configured, refreshPortfolio, refreshPortfolioAdvice, onError],
  );

  return {
    portfolio,
    portfolioAdvice,
    portfolioLoading,
    portfolioAdviceLoading,
    portfolioForm,
    setPortfolioForm,
    savePortfolio,
    deletePortfolio,
    refreshPortfolio,
    refreshPortfolioAdvice,
  };
}
