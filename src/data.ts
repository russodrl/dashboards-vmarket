export type MonthPoint = {
  month: string;
  value: number;
};

export type Indicator = {
  id: string;
  label: string;
  value: number;
  unit?: 'currency' | 'percent' | 'days' | 'count';
  points: MonthPoint[];
  objective: string;
};

export type Breakdown = {
  label: string;
  value: number;
  color: string;
};

export type Dashboard = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  indicators: Indicator[];
  mixTitle: string;
  mix: Breakdown[];
  rankingTitle: string;
  ranking: Breakdown[];
  notes: string[];
};

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul'];
const p = (values: number[]): MonthPoint[] => months.map((month, i) => ({ month, value: values[i] }));

export const dashboards: Dashboard[] = [
  {
    id: 'executivo',
    title: 'Executivo VMarket',
    subtitle: 'Visão ponta-a-ponta: venda paga, onboarding, ativação e fidelização.',
    accent: '#ff7a1a',
    indicators: [
      { id: 'receita-ganha', label: 'Receita vendida paga', unit: 'currency', value: 386200, points: p([188000, 214500, 249300, 276000, 318400, 342100, 386200]), objective: 'Financeiro confirmou pagamento e marcou venda como ganha.' },
      { id: 'clientes-pagos', label: 'Novos clientes pagos', unit: 'count', value: 42, points: p([21, 24, 28, 31, 35, 38, 42]), objective: 'Contratos pagos no mês vigente.' },
      { id: 'taxa-ativacao', label: 'Taxa de ativação', unit: 'percent', value: 73, points: p([49, 52, 58, 61, 66, 70, 73]), objective: 'Clientes que concluíram compra assistida após onboarding.' },
      { id: 'tempo-ponta', label: 'Tempo venda → ativação', unit: 'days', value: 12.4, points: p([19.8, 18.2, 16.9, 15.8, 14.2, 13.1, 12.4]), objective: 'Dias entre negócio ganho e primeira compra assistida.' },
    ],
    mixTitle: 'Distribuição por etapa atual',
    mix: [
      { label: 'Venda ganha', value: 42, color: '#ff7a1a' },
      { label: 'Onboarding', value: 31, color: '#ffd166' },
      { label: 'Ativação', value: 24, color: '#06d6a0' },
      { label: 'Fidelizado', value: 18, color: '#4cc9f0' },
      { label: 'Risco/Churn', value: 5, color: '#ef476f' },
    ],
    rankingTitle: 'Gargalos do mês',
    ranking: [
      { label: 'Aguardando entrevista', value: 13, color: '#ffd166' },
      { label: 'Sem CNPJ principal', value: 7, color: '#ef476f' },
      { label: 'Sem compra assistida', value: 11, color: '#4cc9f0' },
      { label: 'Follow-up CS pendente', value: 5, color: '#b5179e' },
    ],
    notes: ['Indicadores do mês vigente ficam em destaque como no Databox.', 'Linhas mês a mês mostram valor e variação vs. mês anterior no hover.'],
  },
  {
    id: 'vendas',
    title: 'Vendas',
    subtitle: 'SDR agenda, vendedor apresenta/fecha, Financeiro confirma pagamento.',
    accent: '#ff7a1a',
    indicators: [
      { id: 'reunioes', label: 'Reuniões agendadas', unit: 'count', value: 168, points: p([92, 106, 121, 133, 149, 158, 168]), objective: 'Volume criado pelo SDR.' },
      { id: 'propostas', label: 'Propostas enviadas', unit: 'count', value: 74, points: p([45, 48, 54, 58, 64, 71, 74]), objective: 'Deals com proposta comercial enviada.' },
      { id: 'contratos-pagos', label: 'Contratos pagos', unit: 'count', value: 42, points: p([21, 24, 28, 31, 35, 38, 42]), objective: 'Financeiro confirmou pagamento.' },
      { id: 'conversao-venda', label: 'Conversão reunião → pago', unit: 'percent', value: 25, points: p([22, 23, 23, 24, 24, 24, 25]), objective: 'Eficiência do funil comercial.' },
    ],
    mixTitle: 'Pipeline comercial',
    mix: [
      { label: 'Lead qualificado', value: 214, color: '#f77f00' },
      { label: 'Reunião marcada', value: 168, color: '#fcbf49' },
      { label: 'Proposta', value: 74, color: '#eae2b7' },
      { label: 'Contrato', value: 51, color: '#80ed99' },
      { label: 'Pago', value: 42, color: '#06d6a0' },
    ],
    rankingTitle: 'Ranking por vendedor',
    ranking: [
      { label: 'Amanda', value: 14, color: '#ff7a1a' },
      { label: 'Bruno', value: 11, color: '#ffd166' },
      { label: 'Carla', value: 9, color: '#06d6a0' },
      { label: 'Diego', value: 8, color: '#4cc9f0' },
    ],
    notes: ['Perdas devem ser agrupadas por motivo para ajustar discurso comercial.', 'Receita ganha só entra quando Financeiro confirma o pagamento.'],
  },
  {
    id: 'onboarding',
    title: 'Onboarding',
    subtitle: 'Entrevista, configuração inicial e preparação para compra assistida.',
    accent: '#ffd166',
    indicators: [
      { id: 'deals-recebidos', label: 'Clientes recebidos', unit: 'count', value: 39, points: p([18, 22, 24, 28, 31, 34, 39]), objective: 'Cópias recebidas da venda ganha.' },
      { id: 'entrevistas', label: 'Entrevistas realizadas', unit: 'count', value: 33, points: p([15, 18, 21, 22, 26, 29, 33]), objective: 'Briefing inicial concluído.' },
      { id: 'configs', label: 'Configurações concluídas', unit: 'count', value: 29, points: p([12, 15, 18, 20, 23, 25, 29]), objective: 'Conta pronta para ativação.' },
      { id: 'sla-onboarding', label: 'SLA médio onboarding', unit: 'days', value: 4.7, points: p([8.4, 7.9, 7.1, 6.4, 5.8, 5.1, 4.7]), objective: 'Tempo entre pagamento e configuração concluída.' },
    ],
    mixTitle: 'Status do onboarding',
    mix: [
      { label: 'Novo', value: 8, color: '#ffe08a' },
      { label: 'Entrevista marcada', value: 10, color: '#ffd166' },
      { label: 'Configuração', value: 13, color: '#ffb703' },
      { label: 'Pronto para ativação', value: 29, color: '#06d6a0' },
      { label: 'Bloqueado', value: 4, color: '#ef476f' },
    ],
    rankingTitle: 'Principais bloqueios',
    ranking: [
      { label: 'Cliente sem resposta', value: 9, color: '#ef476f' },
      { label: 'Dados fiscais incompletos', value: 7, color: '#ffd166' },
      { label: 'Integração pendente', value: 5, color: '#4cc9f0' },
      { label: 'CNPJ divergente', value: 3, color: '#b5179e' },
    ],
    notes: ['Link venda→onboarding usa CNPJ principal e fallback no título com “(copia)”.', 'Backlog por responsável ajuda a redistribuir entrevistas/configurações.'],
  },
  {
    id: 'ativacao',
    title: 'Ativação',
    subtitle: 'Compra assistida e primeira evidência de uso real do serviço.',
    accent: '#06d6a0',
    indicators: [
      { id: 'clientes-ativados', label: 'Clientes ativados', unit: 'count', value: 24, points: p([8, 10, 13, 16, 18, 21, 24]), objective: 'Concluíram compra assistida.' },
      { id: 'gmv-assistido', label: 'GMV assistido', unit: 'currency', value: 912000, points: p([310000, 352000, 421000, 497000, 610000, 744000, 912000]), objective: 'Valor movimentado em compras assistidas.' },
      { id: 'tempo-compra', label: 'Tempo até 1ª compra', unit: 'days', value: 7.6, points: p([14.2, 13.4, 12.1, 10.8, 9.4, 8.2, 7.6]), objective: 'Dias da configuração concluída até a compra.' },
      { id: 'followups', label: 'Follow-ups concluídos', unit: 'count', value: 86, points: p([34, 41, 48, 54, 63, 74, 86]), objective: 'Ações da equipe para guiar o cliente até comprar.' },
    ],
    mixTitle: 'Canais da primeira compra',
    mix: [
      { label: 'Compra guiada por WhatsApp', value: 13, color: '#06d6a0' },
      { label: 'Reunião assistida', value: 7, color: '#4cc9f0' },
      { label: 'Autoatendimento', value: 4, color: '#ffd166' },
      { label: 'Sem primeira compra', value: 11, color: '#ef476f' },
    ],
    rankingTitle: 'Motivos sem ativação',
    ranking: [
      { label: 'Sem produto definido', value: 5, color: '#ef476f' },
      { label: 'Preço/condição', value: 4, color: '#ffd166' },
      { label: 'Cliente indisponível', value: 4, color: '#4cc9f0' },
      { label: 'Cadastro incompleto', value: 3, color: '#b5179e' },
    ],
    notes: ['Ativação deve medir uso real, não apenas configuração.', 'O principal alerta é cliente configurado sem compra assistida.'],
  },
  {
    id: 'cs',
    title: 'CS e Fidelização',
    subtitle: 'Relacionamento, churn, reversão de cancelamento e passagem para Fidelizado.',
    accent: '#4cc9f0',
    indicators: [
      { id: 'fidelizados', label: 'Clientes fidelizados', unit: 'count', value: 18, points: p([5, 7, 9, 11, 13, 15, 18]), objective: 'Clientes após compra e follow-up completo.' },
      { id: 'health-score', label: 'Health score médio', unit: 'percent', value: 82, points: p([69, 71, 73, 76, 78, 80, 82]), objective: 'Sinal de saúde do relacionamento.' },
      { id: 'churn', label: 'Churn mensal', unit: 'percent', value: 3.1, points: p([6.8, 6.1, 5.4, 4.9, 4.2, 3.6, 3.1]), objective: 'Cancelamentos sobre base ativa.' },
      { id: 'reversoes', label: 'Cancelamentos revertidos', unit: 'count', value: 7, points: p([1, 2, 2, 3, 4, 5, 7]), objective: 'Ações de retenção bem-sucedidas.' },
    ],
    mixTitle: 'Carteira por saúde',
    mix: [
      { label: 'Saudável', value: 61, color: '#06d6a0' },
      { label: 'Atenção', value: 22, color: '#ffd166' },
      { label: 'Risco', value: 9, color: '#ef476f' },
      { label: 'Churn', value: 3, color: '#6c757d' },
    ],
    rankingTitle: 'Alertas CS',
    ranking: [
      { label: 'Sem recompra em 30 dias', value: 14, color: '#ef476f' },
      { label: 'Ticket caiu >20%', value: 9, color: '#ffd166' },
      { label: 'Sem contato recente', value: 8, color: '#4cc9f0' },
      { label: 'NPS detrator', value: 3, color: '#b5179e' },
    ],
    notes: ['Só mover para Fidelizado depois do follow-up de compra concluído.', 'CS deve receber cliente com histórico de venda, onboarding e ativação já atrelado.'],
  },
];

export function formatValue(value: number, unit: Indicator['unit'] = 'count') {
  if (unit === 'currency') return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  if (unit === 'percent') return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (unit === 'days') return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
  return value.toLocaleString('pt-BR');
}

export function variation(points: MonthPoint[]) {
  const current = points.at(-1)?.value ?? 0;
  const previous = points.at(-2)?.value ?? 0;
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}
