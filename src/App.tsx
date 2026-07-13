import React, { useState } from 'react';
import { Activity, BarChart3, CheckCircle2, Download, TrendingDown, TrendingUp } from 'lucide-react';
import { formatValue, Indicator, MonthPoint, variation } from './data';
import { dashboards, pipedriveSnapshot } from './generated/pipedriveSnapshot';
import { exportDashboardSchema } from './pipedriveLinking';
import './styles.css';

function pct(points: MonthPoint[], index: number) {
  if (index === 0) return 0;
  const prev = points[index - 1].value;
  if (!prev) return 0;
  return ((points[index].value - prev) / prev) * 100;
}

function LineChart({ indicator }: { indicator: Indicator }) {
  const [hoverIndex, setHoverIndex] = useState(indicator.points.length - 1);
  const width = 520;
  const height = 168;
  const pad = 22;
  const values = indicator.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = indicator.points.map((point, index) => {
    const x = pad + (index * (width - pad * 2)) / (indicator.points.length - 1);
    const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
    return { ...point, x, y };
  });
  const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const hover = coords[hoverIndex];
  const delta = pct(indicator.points, hoverIndex);
  const positive = delta >= 0;

  return (
    <div className="chartWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="lineChart" role="img" aria-label={`Linha mês a mês de ${indicator.label}`}>
        {[0, 1, 2].map((row) => <line key={row} x1={pad} x2={width - pad} y1={pad + row * 52} y2={pad + row * 52} className="grid" />)}
        <polygon points={area} className="area" />
        <polyline points={line} className="line" />
        {coords.map((c, index) => (
          <g key={c.month} onMouseEnter={() => setHoverIndex(index)} onFocus={() => setHoverIndex(index)} tabIndex={0}>
            <circle cx={c.x} cy={c.y} r={index === hoverIndex ? 6 : 4} className="dot" />
            <rect x={c.x - 22} y="0" width="44" height={height} fill="transparent" />
          </g>
        ))}
        {coords.map((c) => <text key={c.month} x={c.x} y={height - 4} className="axis" textAnchor="middle">{c.month}</text>)}
        <line x1={hover.x} x2={hover.x} y1={pad} y2={height - pad} className="cursor" />
      </svg>
      <div className={`tooltip ${positive ? 'positive' : 'negative'}`} style={{ left: `${Math.min(78, Math.max(8, (hover.x / width) * 100 - 10))}%` }}>
        <strong>{hover.month}: {formatValue(hover.value, indicator.unit)}</strong>
        <span>{positive ? '+' : ''}{delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs mês anterior</span>
      </div>
    </div>
  );
}

function IndicatorCard({ indicator }: { indicator: Indicator }) {
  const delta = variation(indicator.points);
  const good = delta >= 0;
  return (
    <article className="indicatorCard">
      <div className="indicatorTop">
        <span>{indicator.label}</span>
        <small className={good ? 'good' : 'bad'}>{good ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {good ? '+' : ''}{delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small>
      </div>
      <div className="bigNumber">{formatValue(indicator.value, indicator.unit)}</div>
      <p>{indicator.objective}</p>
      <LineChart indicator={indicator} />
    </article>
  );
}

function BubbleChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <div className="bubbleChart">
      {items.map((item, index) => (
        <div key={item.label} className="bubble" style={{ background: item.color, width: 54 + (item.value / max) * 86, height: 54 + (item.value / max) * 86, transform: `translate(${(index % 3) * 18}px, ${Math.floor(index / 3) * -8}px)` }}>
          <strong>{item.value}</strong><span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function Bars({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...items.map((i) => i.value));
  return <div className="bars">{items.map((item) => <div className="barRow" key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.value / max) * 100}%`, background: item.color }} /></div><b>{item.value}</b></div>)}</div>;
}


type SourceDoc = {
  id: string;
  formula: string;
  fields: string[];
  filters: string[];
  logic: string;
};

const commonFields = ['id', 'title', 'pipeline_id', 'stage_id', 'status', 'value', 'add_time', 'won_time', 'stage_change_time', 'user_id.name'];
const cnpjField = 'CNPJ Principal — chave 22e8146e571b84f04631cac22a7439c3b31898fe';

const sourceDocs: Record<string, SourceDoc[]> = {
  executivo: [
    { id: 'receita-ganha', formula: 'Soma do valor dos negócios ganhos no mês', fields: ['pipeline_id', 'status', 'won_time', 'value'], filters: ['Pipeline de Vendas: pipeline_id = 1', 'status = won', 'mês calculado pelo won_time'], logic: 'Agrupa os deals ganhos por mês de won_time e soma value. É a receita vendida/paga porque, no processo VMarket, Financeiro marca o deal como won após confirmar pagamento.' },
    { id: 'clientes-pagos', formula: 'Quantidade de negócios ganhos no mês', fields: ['pipeline_id', 'status', 'won_time'], filters: ['Pipeline de Vendas: pipeline_id = 1', 'status = won', 'mês calculado pelo won_time'], logic: 'Conta os deals ganhos no mês. Usa a mesma fonte da receita, mas conta registros em vez de somar valor.' },
    { id: 'taxa-ativacao', formula: 'Clientes ativados ÷ maior valor entre recebidos e ativados no mês', fields: ['pipeline_id', 'add_time', 'stage_id', 'stage_change_time'], filters: ['Onboarding: pipeline_id = 4', 'ativado quando order_nr da etapa >= 7', 'recebido quando add_time cai no mês'], logic: 'Conta ativações pela data stage_change_time em etapas avançadas de compra assistida. Como clientes de meses anteriores podem ativar agora, o denominador usa max(recebidos, ativados) para manter o indicador entre 0% e 100%.' },
    { id: 'deals-abertos', formula: 'Quantidade atual de deals abertos', fields: ['status'], filters: ['status = open', 'todos os funis monitorados'], logic: 'Mostra a carteira aberta atual. Os meses anteriores ficam zerados porque esse indicador é um estoque atual, não uma série histórica extraída do Pipedrive.' },
    { id: 'mix:Distribuição atual por funil', formula: 'Contagem de deals abertos por pipeline', fields: ['pipeline_id', 'status'], filters: ['status = open', 'todos os pipelines'], logic: 'Agrupa os deals abertos pelo nome do funil, usando /pipelines para traduzir pipeline_id em nome.' },
    { id: 'ranking:Gargalos atuais', formula: 'Contagem de deals abertos em etapas comerciais avançadas + onboarding sem vínculo', fields: ['pipeline_id', 'stage_id', 'status', 'title', cnpjField], filters: ['Pipeline de Vendas: pipeline_id = 1', 'status = open', 'order_nr da etapa >= 5'], logic: 'Lista etapas comerciais abertas mais avançadas como gargalos. Também adiciona “Onboarding sem vínculo” quando um deal do onboarding não encontra venda correspondente por CNPJ nem por título normalizado.' },
  ],
  vendas: [
    { id: 'reunioes', formula: 'Deals criados no mês que chegaram à etapa de reunião ou posterior', fields: ['pipeline_id', 'add_time', 'stage_id', 'status'], filters: ['Pipeline de Vendas: pipeline_id = 1', 'mês calculado pelo add_time', 'order_nr >= 4 ou status = won'], logic: 'Como o snapshot não traz histórico completo de transições, usa a etapa atual como aproximação de que o deal passou por reunião.' },
    { id: 'propostas', formula: 'Deals criados no mês que chegaram à etapa de proposta ou posterior', fields: ['pipeline_id', 'add_time', 'stage_id', 'status'], filters: ['Pipeline de Vendas: pipeline_id = 1', 'mês calculado pelo add_time', 'order_nr >= 5 ou status = won'], logic: 'Usa a etapa atual como aproximação para propostas enviadas. Se o deal está ganho, também entra como tendo passado por proposta.' },
    { id: 'contratos-pagos', formula: 'Quantidade de deals ganhos no mês', fields: ['pipeline_id', 'status', 'won_time'], filters: ['Pipeline de Vendas: pipeline_id = 1', 'status = won', 'mês calculado pelo won_time'], logic: 'Conta contratos pagos/ganhos no mês a partir do won_time.' },
    { id: 'conversao-venda', formula: 'Contratos pagos ÷ reuniões agendadas', fields: ['won_time', 'add_time', 'stage_id', 'status'], filters: ['numerador: status = won por won_time', 'denominador: order_nr >= 4 ou won por add_time'], logic: 'Mede eficiência do funil comercial comparando o volume pago com o volume que chegou em reunião.' },
    { id: 'mix:Pipeline comercial aberto', formula: 'Contagem de deals abertos por etapa comercial', fields: ['pipeline_id', 'stage_id', 'status'], filters: ['Pipeline de Vendas: pipeline_id = 1', 'status = open'], logic: 'Agrupa os deals abertos por etapa atual do Pipeline de Vendas.' },
    { id: 'ranking:Ranking por vendedor — ganhos no mês', formula: 'Deals ganhos no mês por proprietário', fields: ['user_id.name', 'status', 'won_time', 'pipeline_id'], filters: ['Pipeline de Vendas: pipeline_id = 1', 'status = won', 'won_time no mês vigente'], logic: 'Agrupa os deals pagos do mês pelo responsável do Pipedrive.' },
  ],
  onboarding: [
    { id: 'deals-recebidos', formula: 'Deals criados no onboarding por mês', fields: ['pipeline_id', 'add_time'], filters: ['Onboarding: pipeline_id = 4', 'mês calculado pelo add_time'], logic: 'Conta os clientes que entraram no funil de onboarding.' },
    { id: 'entrevistas', formula: 'Deals de onboarding em entrevista/treinamento ou posterior', fields: ['pipeline_id', 'add_time', 'stage_id'], filters: ['Onboarding: pipeline_id = 4', 'order_nr >= 3', 'mês calculado pelo add_time'], logic: 'Usa etapa atual como aproximação para entrevista realizada.' },
    { id: 'configs', formula: 'Deals de onboarding configurados ou posteriores', fields: ['pipeline_id', 'add_time', 'stage_id'], filters: ['Onboarding: pipeline_id = 4', 'order_nr >= 4', 'mês calculado pelo add_time'], logic: 'Conta deals que avançaram até configuração/Ag. 1ª Compra ou etapa posterior.' },
    { id: 'sla-onboarding', formula: 'Média de dias entre add_time e stage_change_time', fields: ['add_time', 'stage_change_time', 'stage_id'], filters: ['Onboarding: pipeline_id = 4', 'order_nr >= 4', 'stage_change_time >= add_time'], logic: 'Para deals configurados, calcula dias entre criação do card e última mudança de etapa, depois tira média mensal.' },
    { id: 'mix:Status atual do onboarding', formula: 'Contagem de deals abertos por etapa de onboarding', fields: ['pipeline_id', 'stage_id', 'status'], filters: ['Onboarding: pipeline_id = 4', 'status = open'], logic: 'Mostra onde os clientes estão parados hoje dentro do onboarding.' },
    { id: 'ranking:Qualidade do vínculo venda → onboarding', formula: 'Match por CNPJ, fallback por título, ou sem match', fields: ['title', cnpjField, 'pipeline_id'], filters: ['compara deals do Pipeline de Vendas com deals do Onboarding'], logic: 'Primeiro tenta encontrar a venda pelo CNPJ Principal. Se não achar, normaliza o título removendo “(copia)” e compara com vendas. O restante vira “Sem match”.' },
  ],
  ativacao: [
    { id: 'clientes-ativados', formula: 'Deals de onboarding que chegaram em compra assistida avançada', fields: ['pipeline_id', 'stage_id', 'stage_change_time'], filters: ['Onboarding: pipeline_id = 4', 'order_nr >= 7', 'mês calculado pelo stage_change_time'], logic: 'Conta clientes que avançaram para Feita 3ª Compra ou etapa posterior.' },
    { id: 'gmv-assistido', formula: 'Ainda não calculado — campo de GMV não mapeado', fields: ['campo pendente no Pipedrive ou fonte transacional'], filters: ['sem campo confiável identificado no snapshot'], logic: 'Card preparado, mas permanece zerado até definirmos qual campo representa GMV assistido.' },
    { id: 'tempo-compra', formula: 'Ainda não calculado — precisa de data da primeira compra', fields: ['campo/data de primeira compra pendente'], filters: ['sem evento confiável identificado no snapshot'], logic: 'Card preparado para calcular dias entre configuração concluída e primeira compra quando a data estiver disponível.' },
    { id: 'followups', formula: 'Ainda não calculado — depende de atividades concluídas', fields: ['activities do Pipedrive, tipo/status/data'], filters: ['extração de atividades ainda não ligada'], logic: 'Card preparado para uma segunda extração usando atividades/follow-ups concluídos.' },
    { id: 'mix:Etapas de compra assistida', formula: 'Deals abertos em onboarding a partir de configuração', fields: ['pipeline_id', 'stage_id', 'status'], filters: ['Onboarding: pipeline_id = 4', 'status = open', 'order_nr >= 4'], logic: 'Agrupa clientes que já estão em etapas relacionadas à compra assistida.' },
    { id: 'ranking:Pendências de ativação', formula: 'Deals abertos entre configuração e ativação', fields: ['pipeline_id', 'stage_id', 'status'], filters: ['Onboarding: pipeline_id = 4', 'status = open', '4 <= order_nr < 7'], logic: 'Mostra clientes em etapas intermediárias que ainda não chegaram à ativação.' },
  ],
  cs: [
    { id: 'fidelizados', formula: 'Deals que chegaram à etapa Fidelizado', fields: ['pipeline_id', 'stage_id', 'stage_change_time'], filters: ['CS: pipeline_id = 5', 'nome da etapa contém “fidelizado”', 'mês calculado pelo stage_change_time'], logic: 'Conta clientes que foram movidos para a etapa Fidelizado no funil CS.' },
    { id: 'health-score', formula: 'Ainda não calculado — campo de health score não mapeado', fields: ['campo de health score pendente'], filters: ['sem campo confiável identificado no snapshot'], logic: 'Card preparado, mas fica zerado até definirmos o campo/fonte do health score.' },
    { id: 'churn', formula: 'Deals CS em risco/cancelamento ÷ deals CS abertos', fields: ['pipeline_id', 'stage_id', 'status'], filters: ['CS: pipeline_id = 5', 'status = open', 'nome da etapa contém risco/cancel/parou/não usa'], logic: 'Calcula percentual atual da carteira CS aberta que está em etapa de risco ou cancelamento.' },
    { id: 'reversoes', formula: 'Ainda não calculado — precisa de marcação de reversão', fields: ['motivo, atividade ou etapa de reversão pendente'], filters: ['sem campo confiável identificado no snapshot'], logic: 'Card preparado para medir reversões quando definirmos a origem no Pipedrive.' },
    { id: 'mix:Carteira CS por etapa', formula: 'Contagem de deals CS abertos por etapa', fields: ['pipeline_id', 'stage_id', 'status'], filters: ['CS: pipeline_id = 5', 'status = open'], logic: 'Mostra a distribuição atual da carteira de CS por etapa.' },
    { id: 'ranking:Alertas CS por etapa', formula: 'Contagem de deals CS abertos em etapas de risco/cancelamento', fields: ['pipeline_id', 'stage_id', 'status'], filters: ['CS: pipeline_id = 5', 'status = open', 'nome da etapa contém risco/cancel/parou/não usa'], logic: 'Lista as principais etapas de alerta dentro da carteira CS.' },
  ],
};

function SourceGuide({ dashboardId }: { dashboardId: string }) {
  const docs = sourceDocs[dashboardId] ?? [];
  return (
    <section className="sourceGuide">
      <div className="sourceIntro">
        <small>Transparência dos dados</small>
        <h2>Campos e lógica dos gráficos Pipedrive</h2>
        <p>Todos os gráficos abaixo usam dados agregados do snapshot seguro da API do Pipedrive. Campos-base carregados: {commonFields.join(', ')}.</p>
      </div>
      <div className="sourceGrid">
        {docs.map((doc) => (
          <article className="sourceCard" key={doc.id}>
            <span>{doc.id.includes(':') ? 'Gráfico' : 'KPI'}</span>
            <h3>{doc.id.replace('mix:', '').replace('ranking:', '')}</h3>
            <p><strong>Fórmula:</strong> {doc.formula}</p>
            <p><strong>Campos:</strong> {doc.fields.join(', ')}</p>
            <p><strong>Filtros:</strong> {doc.filters.join(' · ')}</p>
            <p><strong>Lógica:</strong> {doc.logic}</p>
          </article>
        ))}
      </div>
    </section>
  );
}


export default function App() {
  const [active, setActive] = useState(dashboards[0].id);
  const dashboard = dashboards.find((d) => d.id === active) ?? dashboards[0];
  const schema = JSON.stringify(exportDashboardSchema(dashboards), null, 2);

  function downloadSchema() {
    const blob = new Blob([schema], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dashboards-vmarket-schema.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="logo"><BarChart3 size={22} /></span><div><strong>Dashboards VMarket</strong><small>Databox-style datawall</small></div></div>
        <nav>{dashboards.map((d) => <button key={d.id} onClick={() => setActive(d.id)} className={d.id === active ? 'active' : ''}>{d.title}</button>)}</nav>
        <button className="download" onClick={downloadSchema}><Download size={16} /> Schema</button>
      </header>

      <section className="hero" style={{ '--accent': dashboard.accent } as React.CSSProperties}>
        <div><small>{pipedriveSnapshot.periodLabel} · snapshot Pipedrive</small><h1>{dashboard.title}</h1><p>{dashboard.subtitle}</p></div>
        <div className="heroBadge"><Activity size={18} /> Atualizado em {new Date(pipedriveSnapshot.generatedAt).toLocaleString('pt-BR')} · {pipedriveSnapshot.rawCounts.deals.toLocaleString('pt-BR')} deals</div>
      </section>

      <section className="grid indicators">{dashboard.indicators.map((indicator) => <IndicatorCard key={indicator.id} indicator={indicator} />)}</section>

      <section className="grid lower">
        <article className="panel"><h2>{dashboard.mixTitle}</h2><BubbleChart items={dashboard.mix} /></article>
        <article className="panel"><h2>{dashboard.rankingTitle}</h2><Bars items={dashboard.ranking} /></article>
        <article className="panel notes"><h2><CheckCircle2 size={22} /> Recomendações</h2>{dashboard.notes.map((note) => <p key={note}>{note}</p>)}</article>
      </section>

      <SourceGuide dashboardId={dashboard.id} />

    </main>
  );
}
