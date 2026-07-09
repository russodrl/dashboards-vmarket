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

    </main>
  );
}
