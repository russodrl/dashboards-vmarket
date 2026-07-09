import type { Dashboard } from './data';

export type RawDeal = Record<string, unknown> & {
  id?: string | number;
  title?: string;
  pipeline?: string;
  stage?: string;
  status?: string;
  value?: number;
  won_time?: string;
  add_time?: string;
  close_time?: string;
  owner_name?: string;
};

const CNPJ_KEYS = ['cnpj_principal', 'CNPJ principal', 'cnpj principal', 'cnpj', 'CNPJ', 'custom_cnpj_principal'];

export function normalizeCnpj(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').padStart(14, '0').slice(-14);
}

export function getMainCnpj(deal: RawDeal): string {
  for (const key of CNPJ_KEYS) {
    const raw = deal[key];
    const cnpj = normalizeCnpj(raw);
    if (cnpj && cnpj !== '00000000000000') return cnpj;
  }
  return '';
}

function canonicalTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/\(c[oó]pia\)/gi, '')
    .replace(/\bcopy\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function linkSalesToOnboarding(salesDeals: RawDeal[], onboardingCopies: RawDeal[]) {
  const byCnpj = new Map<string, RawDeal>();
  const byTitle = new Map<string, RawDeal>();

  for (const sale of salesDeals) {
    const cnpj = getMainCnpj(sale);
    if (cnpj) byCnpj.set(cnpj, sale);
    if (sale.title) byTitle.set(canonicalTitle(sale.title), sale);
  }

  return onboardingCopies.map((copy) => {
    const cnpj = getMainCnpj(copy);
    const saleByCnpj = cnpj ? byCnpj.get(cnpj) : undefined;
    const saleByTitle = copy.title ? byTitle.get(canonicalTitle(copy.title)) : undefined;
    const sale = saleByCnpj ?? saleByTitle;
    return {
      onboardingDeal: copy,
      salesDeal: sale,
      matchMethod: saleByCnpj ? 'cnpj_principal' : saleByTitle ? 'titulo_copia' : 'nao_encontrado',
    } as const;
  });
}

export function exportDashboardSchema(dashboards: Dashboard[]) {
  return dashboards.map((dashboard) => ({
    dashboard: dashboard.title,
    indicadores: dashboard.indicators.map((indicator) => ({
      id: indicator.id,
      nome: indicator.label,
      objetivo: indicator.objective,
      unidade: indicator.unit ?? 'count',
      mes_vigente: indicator.value,
      grafico_recomendado: 'linha mês a mês com tooltip de valor e variação percentual vs mês anterior',
    })),
    graficos_complementares: [dashboard.mixTitle, dashboard.rankingTitle],
  }));
}
