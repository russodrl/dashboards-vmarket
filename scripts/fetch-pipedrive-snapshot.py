#!/usr/bin/env python3
"""Fetch aggregated, non-secret Pipedrive metrics for the static dashboard.

The generated TypeScript file intentionally contains only aggregates, not the
Pipedrive API token and not raw person/contact data.
"""
from __future__ import annotations

import json
import math
import os
import re
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "generated" / "pipedriveSnapshot.ts"
ENV_PATHS = [Path("/opt/data/.env"), Path("/opt/data/profiles/bpo-agent-vmarket/.env"), ROOT / ".env"]

MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
COLORS = ["#ff7a1a", "#ffd166", "#06d6a0", "#4cc9f0", "#ef476f", "#b5179e", "#80ed99"]
BRAZIL_TZ = ZoneInfo("America/Sao_Paulo")
# Canonical dashboard timezone rule. Pipedrive's raw API timestamps need this
# normalization to match the Brazilian reporting day/month shown by the UI.
PIPEDRIVE_TO_BRAZIL_REPORT_OFFSET = timedelta(hours=3)

PIPELINES = {
    "sales": 1,
    "onboarding": 4,
    "cs": 5,
}


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    for path in ENV_PATHS:
        if not path.exists():
            continue
        for line in path.read_text(errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key, value.strip().strip('"\''))
    return env


def api_get(path: str, token: str, **params: Any) -> dict[str, Any]:
    params["api_token"] = token
    url = "https://api.pipedrive.com/v1" + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "dashboards-vmarket-snapshot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = json.load(response)
    if not payload.get("success", True):
        raise RuntimeError(f"Pipedrive API failed for {path}: {payload!r}")
    return payload


def fetch_all(path: str, token: str, **params: Any) -> list[dict[str, Any]]:
    start = 0
    limit = 500
    out: list[dict[str, Any]] = []
    while True:
        payload = api_get(path, token, start=start, limit=limit, **params)
        out.extend(payload.get("data") or [])
        pagination = (payload.get("additional_data") or {}).get("pagination") or {}
        if not pagination.get("more_items_in_collection"):
            break
        start = int(pagination.get("next_start", start + limit))
    return out


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(value[:19] if fmt.endswith("%S") else value[:10], fmt)
            except ValueError:
                pass
    return None


def brazil_today() -> date:
    return datetime.now(BRAZIL_TZ).date()


def brazil_reporting_dt(dt: datetime | None) -> datetime | None:
    """Normalize Pipedrive API timestamps to the dashboard's Brazilian reporting time.

    All metric date/month groupings must go through this function so Pipedrive
    records near day/month boundaries are assigned exactly like the Brazilian
    reporting view used by VMarket.
    """
    if not dt:
        return None
    return dt + PIPEDRIVE_TO_BRAZIL_REPORT_OFFSET


def month_key(dt: datetime | None) -> str | None:
    dt = brazil_reporting_dt(dt)
    if not dt:
        return None
    return f"{dt.year:04d}-{dt.month:02d}"


def pipedrive_report_month_key(dt: datetime | None) -> str | None:
    # Backwards-compatible alias: all Pipedrive report grouping now uses the
    # canonical Brazilian reporting month.
    return month_key(dt)


def last_month_keys(anchor: date, n: int = 7) -> list[str]:
    y, m = anchor.year, anchor.month
    keys = []
    for offset in range(n - 1, -1, -1):
        total = y * 12 + (m - 1) - offset
        yy, mm0 = divmod(total, 12)
        keys.append(f"{yy:04d}-{mm0 + 1:02d}")
    return keys


def current_year_month_keys(anchor: date) -> list[str]:
    # Dynamic chart range: Jan through the current Brazilian reporting month.
    # In July this ends at Jul; in August it ends at Aug; etc.
    return [f"{anchor.year:04d}-{month:02d}" for month in range(1, anchor.month + 1)]


def month_label(key: str) -> str:
    y, m = key.split("-")
    return f"{MONTH_LABELS[int(m) - 1]}/{y[-2:]}"


def points(keys: list[str], values_by_month: dict[str, float]) -> list[dict[str, float | str]]:
    return [{"month": month_label(k), "value": round(float(values_by_month.get(k, 0)), 2)} for k in keys]


def money_sum(deals: list[dict[str, Any]], date_field: str, keys: list[str], key_fn=month_key) -> dict[str, float]:
    acc = defaultdict(float)
    keyset = set(keys)
    for d in deals:
        mk = key_fn(parse_dt(d.get(date_field)))
        if mk in keyset:
            try:
                acc[mk] += float(d.get("value") or 0)
            except (TypeError, ValueError):
                pass
    return acc


def count_by_month(deals: list[dict[str, Any]], date_field: str, keys: list[str], key_fn=month_key) -> dict[str, float]:
    acc = defaultdict(float)
    keyset = set(keys)
    for d in deals:
        mk = key_fn(parse_dt(d.get(date_field)))
        if mk in keyset:
            acc[mk] += 1
    return acc


def safe_ratio(num: float, den: float) -> float:
    return (num / den * 100) if den else 0.0


def numeric_field(deal: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = deal.get(key)
    if value in (None, ""):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:[,.]\d+)?", str(value))
    if not match:
        return default
    try:
        return float(match.group(0).replace(",", "."))
    except ValueError:
        return default


def sum_field_by_month(deals: list[dict[str, Any]], field_key: str, date_field: str, keys: list[str], default_per_deal: float = 0.0, key_fn=month_key) -> dict[str, float]:
    acc = defaultdict(float)
    keyset = set(keys)
    for d in deals:
        mk = key_fn(parse_dt(d.get(date_field)))
        if mk in keyset:
            acc[mk] += numeric_field(d, field_key, default_per_deal)
    return acc


def subtract_by_month(left: dict[str, float], right: dict[str, float], keys: list[str]) -> dict[str, float]:
    return {k: float(left.get(k, 0)) - float(right.get(k, 0)) for k in keys}


def is_cancelled_stage(deal: dict[str, Any], stage_by_id: dict[int, dict[str, Any]]) -> bool:
    name = stage_name(deal.get("stage_id"), stage_by_id).lower()
    return "cancelad" in name


def owner_name(deal: dict[str, Any]) -> str:
    user = deal.get("user_id")
    if isinstance(user, dict):
        return str(user.get("name") or "Sem proprietário")
    return "Sem proprietário"


def stage_order(stage_id: Any, stage_by_id: dict[int, dict[str, Any]]) -> int:
    try:
        sid = int(stage_id)
    except Exception:
        return -1
    return int(stage_by_id.get(sid, {}).get("order_nr") or -1)


def stage_name(stage_id: Any, stage_by_id: dict[int, dict[str, Any]]) -> str:
    try:
        sid = int(stage_id)
    except Exception:
        return "Sem etapa"
    return str(stage_by_id.get(sid, {}).get("name") or f"Etapa {sid}")


def current_value(indicator: dict[str, Any]) -> float:
    pts = indicator["points"]
    if not pts:
        return 0.0
    today = brazil_today()
    today_key = f"{today.year:04d}-{today.month:02d}"
    today_label = month_label(today_key)
    for point in pts:
        if point.get("month") == today_label:
            return float(point.get("value") or 0)
    return float(pts[-1]["value"] if pts else 0)


def monthly_objective(text: str) -> str:
    cleaned = text.strip().rstrip(".")
    if cleaned.lower().endswith("no mês"):
        return cleaned + "."
    return cleaned + " no mês."


def indicator(id_: str, label: str, unit: str, pts: list[dict[str, Any]], objective: str) -> dict[str, Any]:
    return {"id": id_, "label": label, "unit": unit, "value": current_value({"points": pts}), "points": pts, "objective": monthly_objective(objective)}


def breakdown_from_counter(counter: Counter[str], limit: int = 5) -> list[dict[str, Any]]:
    items = counter.most_common(limit)
    if not items:
        return [{"label": "Sem dados", "value": 0, "color": COLORS[0]}]
    return [{"label": label, "value": int(value), "color": COLORS[i % len(COLORS)]} for i, (label, value) in enumerate(items)]


def normalize_title(title: str) -> str:
    return re.sub(r"\s*\(c[oó]pia\)\s*$", "", title or "", flags=re.I).strip().lower()


def main() -> None:
    env = load_env()
    token = env.get("PIPEDRIVE_API_TOKEN")
    if not token:
        raise SystemExit("PIPEDRIVE_API_TOKEN not found")

    pipelines = fetch_all("/pipelines", token)
    stages = fetch_all("/stages", token)
    deals = fetch_all("/deals", token, status="all_not_deleted")
    won_deals = fetch_all("/deals", token, status="won")

    stage_by_id = {int(s["id"]): s for s in stages}
    pipeline_names = {int(p["id"]): p.get("name") for p in pipelines}

    # Use the Brazilian reporting timezone and the requested Jan-Aug chart range.
    anchor = brazil_today()
    keys = current_year_month_keys(anchor)
    current_key = f"{anchor.year:04d}-{anchor.month:02d}"

    sales = [d for d in deals if d.get("pipeline_id") == PIPELINES["sales"]]
    onboarding = [d for d in deals if d.get("pipeline_id") == PIPELINES["onboarding"]]
    cs = [d for d in deals if d.get("pipeline_id") == PIPELINES["cs"]]
    won_sales = [d for d in won_deals if d.get("pipeline_id") == PIPELINES["sales"]]
    cnpj_qty_key = "e0b823836d4ff5ebe397824d7f0170cd6817ec0a"
    cancelled_deals = [d for d in deals if is_cancelled_stage(d, stage_by_id)]

    # Commercial metrics.
    sales_revenue = money_sum(won_sales, "won_time", keys)
    paid_clients = count_by_month(won_sales, "won_time", keys)
    won_cnpjs = sum_field_by_month(won_sales, cnpj_qty_key, "won_time", keys, default_per_deal=1)
    new_sales_leads = count_by_month(sales, "add_time", keys)
    cancelled_revenue = money_sum(cancelled_deals, "stage_change_time", keys)
    cancelled_contracts = count_by_month(cancelled_deals, "stage_change_time", keys)
    cancelled_cnpjs = sum_field_by_month(cancelled_deals, cnpj_qty_key, "stage_change_time", keys, default_per_deal=1)
    net_revenue = subtract_by_month(sales_revenue, cancelled_revenue, keys)
    net_contracts = subtract_by_month(paid_clients, cancelled_contracts, keys)
    net_cnpjs = subtract_by_month(won_cnpjs, cancelled_cnpjs, keys)

    meetings_by_month = defaultdict(float)
    proposals_by_month = defaultdict(float)
    contract_by_month = defaultdict(float)
    qualified_leads = defaultdict(float)
    for d in sales:
        mk = month_key(parse_dt(d.get("add_time")))
        if mk not in set(keys):
            continue
        order = stage_order(d.get("stage_id"), stage_by_id)
        had_meeting = order >= 4 or d.get("status") == "won"
        cnpj_qty = numeric_field(d, cnpj_qty_key, 0)
        try:
            deal_value = float(d.get("value") or 0)
        except (TypeError, ValueError):
            deal_value = 0
        if had_meeting:
            meetings_by_month[mk] += 1
        if order >= 5 or d.get("status") == "won":
            proposals_by_month[mk] += 1
        if order >= 8 or d.get("status") == "won":
            contract_by_month[mk] += 1
        if deal_value > 50000 or cnpj_qty > 1 or had_meeting:
            qualified_leads[mk] += 1

    conversion_by_month = {k: safe_ratio(paid_clients[k], meetings_by_month[k]) for k in keys}
    new_business_conversion = {k: safe_ratio(paid_clients[k], new_sales_leads[k]) for k in keys}

    # Onboarding metrics.
    onboarding_received = count_by_month(onboarding, "add_time", keys)
    interviews_by_month = defaultdict(float)
    configs_by_month = defaultdict(float)
    onboarding_sla_by_month: dict[str, float] = {}
    sla_samples: dict[str, list[float]] = defaultdict(list)
    for d in onboarding:
        mk = month_key(parse_dt(d.get("add_time")))
        if mk not in set(keys):
            continue
        order = stage_order(d.get("stage_id"), stage_by_id)
        if order >= 3:
            interviews_by_month[mk] += 1
        if order >= 4:
            configs_by_month[mk] += 1
            add = parse_dt(d.get("add_time"))
            changed = parse_dt(d.get("stage_change_time"))
            if add and changed and changed >= add:
                sla_samples[mk].append((changed - add).total_seconds() / 86400)
    for k in keys:
        samples = sla_samples.get(k) or []
        onboarding_sla_by_month[k] = round(sum(samples) / len(samples), 1) if samples else 0

    # Activation metrics, based on onboarding stages that represent assisted purchases completed.
    activated_by_month = defaultdict(float)
    for d in onboarding:
        mk = month_key(parse_dt(d.get("stage_change_time")))
        if mk in set(keys) and stage_order(d.get("stage_id"), stage_by_id) >= 7:
            activated_by_month[mk] += 1
    # Same-month activation can exceed same-month received when older cohorts activate now.
    # Use the larger of received/activated as denominator so the KPI remains a bounded
    # progress indicator on the static dashboard.
    activation_rate = {k: safe_ratio(activated_by_month[k], max(onboarding_received[k], activated_by_month[k])) for k in keys}

    # CS metrics.
    fidelized_by_month = defaultdict(float)
    risk_or_churn_current = 0
    active_cs_current = 0
    for d in cs:
        name = stage_name(d.get("stage_id"), stage_by_id).lower()
        if d.get("status") == "open":
            active_cs_current += 1
            if any(x in name for x in ["risco", "cancel", "parou", "ñ usa", "nao usa", "não usa"]):
                risk_or_churn_current += 1
        mk = month_key(parse_dt(d.get("stage_change_time")))
        if mk in set(keys) and "fidelizado" in name:
            fidelized_by_month[mk] += 1
    churn_rate = {k: 0.0 for k in keys}
    if active_cs_current:
        churn_rate[current_key] = safe_ratio(risk_or_churn_current, active_cs_current)

    # Current mixes and rankings.
    sales_mix = Counter(stage_name(d.get("stage_id"), stage_by_id) for d in sales if d.get("status") == "open")
    onboarding_mix = Counter(stage_name(d.get("stage_id"), stage_by_id) for d in onboarding if d.get("status") == "open")
    cs_mix = Counter(stage_name(d.get("stage_id"), stage_by_id) for d in cs if d.get("status") == "open")
    overall_mix = Counter(str(pipeline_names.get(int(d.get("pipeline_id") or 0), "Sem funil")) for d in deals if d.get("status") == "open")

    current_won_sales = [d for d in won_sales if month_key(parse_dt(d.get("won_time"))) == current_key]
    seller_ranking = Counter(owner_name(d) for d in current_won_sales)
    sales_gargalos = Counter(stage_name(d.get("stage_id"), stage_by_id) for d in sales if d.get("status") == "open" and stage_order(d.get("stage_id"), stage_by_id) >= 5)

    # Link quality sales -> onboarding using CNPJ if present, fallback title (copia).
    cnpj_key = "22e8146e571b84f04631cac22a7439c3b31898fe"
    sales_by_cnpj = {str(d.get(cnpj_key)).strip(): d for d in sales if str(d.get(cnpj_key) or "").strip()}
    sales_by_title = {normalize_title(str(d.get("title") or "")): d for d in sales}
    linked_cnpj = linked_title = unlinked = 0
    for d in onboarding:
        cnpj = str(d.get(cnpj_key) or "").strip()
        title = normalize_title(str(d.get("title") or ""))
        if cnpj and cnpj in sales_by_cnpj:
            linked_cnpj += 1
        elif title and title in sales_by_title:
            linked_title += 1
        else:
            unlinked += 1

    zero_points = points(keys, {})
    dashboards = [
        {
            "id": "executivo",
            "title": "Executivo VMarket",
            "subtitle": "Leads, Vendas, Cancelamentos, Vendas Líquidas",
            "accent": "#ff7a1a",
            "indicators": [
                indicator("receita-ganha", "Negócios Ganhos - Receita Ganha", "currency", points(keys, sales_revenue), "Soma de negócios ganhos no Pipeline de Vendas pelo won_time."),
                indicator("contratos-ganhos", "Negócios Ganhos - Contratos Ganhos", "count", points(keys, paid_clients), "Quantidade de negócios ganhos no Pipeline de Vendas."),
                indicator("cnpjs-ganhos", "Negócios Ganhos - CNPJs", "count", points(keys, won_cnpjs), "Soma do campo Quantidade de CNPJs dos negócios ganhos."),
                indicator("receita-cancelada", "Negócios Cancelados - Receita Perdida", "currency", points(keys, cancelled_revenue), "Soma do valor dos negócios movidos para etapa Cancelado/Cancelados pelo stage_change_time."),
                indicator("contratos-cancelados", "Negócios Cancelados - Contratos Perdidos", "count", points(keys, cancelled_contracts), "Quantidade de negócios movidos para etapa Cancelado/Cancelados."),
                indicator("cnpjs-cancelados", "Negócios Cancelados - CNPJs", "count", points(keys, cancelled_cnpjs), "Soma do campo Quantidade de CNPJs dos negócios cancelados."),
                indicator("receita-liquida", "Vendas Líquidas - Valor", "currency", points(keys, net_revenue), "Receita ganha menos receita perdida por cancelamentos."),
                indicator("contratos-liquidos", "Vendas Líquidas - Contratos", "count", points(keys, net_contracts), "Contratos ganhos menos contratos cancelados."),
                indicator("cnpjs-liquidos", "Vendas Líquidas - CNPJs", "count", points(keys, net_cnpjs), "CNPJs ganhos menos CNPJs cancelados."),
                indicator("novos-leads", "Novos Negócios - Novos Leads", "count", points(keys, new_sales_leads), "Leads novos criados no Pipeline de Vendas."),
                indicator("leads-qualificados", "Novos Negócios - Leads Qualificados", "count", points(keys, qualified_leads), "Leads com valor acima de R$50 mil, mais de 1 CNPJ ou reunião realizada."),
                indicator("conversao-novos", "Novos Negócios - Percentual de Conversão", "percent", points(keys, new_business_conversion), "Negócios fechados divididos por novos leads do mês."),
            ],
            "mixTitle": "Distribuição atual por funil",
            "mix": breakdown_from_counter(overall_mix),
            "rankingTitle": "Gargalos atuais",
            "ranking": breakdown_from_counter(sales_gargalos + Counter({"Onboarding sem vínculo": unlinked})),
            "notes": ["Todos os cards executivos mostram evolução mensal.", "Cancelamentos usam a data stage_change_time quando o negócio está em etapa Cancelado/Cancelados.", f"Vínculo venda→onboarding: {linked_cnpj} por CNPJ, {linked_title} por título, {unlinked} sem match."],
        },
        {
            "id": "vendas",
            "title": "Vendas",
            "subtitle": "Pipeline de Vendas com métricas reais agregadas do Pipedrive.",
            "accent": "#ff7a1a",
            "indicators": [
                indicator("reunioes", "Reuniões agendadas", "count", points(keys, meetings_by_month), "Deals criados no mês que estão em Reunião Agendada ou etapa posterior."),
                indicator("propostas", "Propostas enviadas", "count", points(keys, proposals_by_month), "Deals criados no mês que estão em Enviar Proposta ou etapa posterior."),
                indicator("contratos-pagos", "Contratos pagos", "count", points(keys, paid_clients), "Deals ganhos no mês pelo won_time."),
                indicator("conversao-venda", "Conversão reunião → pago", "percent", points(keys, conversion_by_month), "Contratos pagos divididos por reuniões agendadas."),
            ],
            "mixTitle": "Pipeline comercial aberto",
            "mix": breakdown_from_counter(sales_mix),
            "rankingTitle": "Ranking por vendedor — ganhos no mês",
            "ranking": breakdown_from_counter(seller_ranking),
            "notes": ["Ganho segue o status won do Pipedrive no Pipeline de Vendas.", "Métricas de reunião/proposta são aproximações por etapa atual quando não há histórico de transição no snapshot."],
        },
        {
            "id": "onboarding",
            "title": "Onboarding",
            "subtitle": "Clientes recebidos, entrevistas e configuração inicial.",
            "accent": "#ffd166",
            "indicators": [
                indicator("deals-recebidos", "Clientes recebidos", "count", points(keys, onboarding_received), "Deals criados no funil Onboarding."),
                indicator("entrevistas", "Entrevistas realizadas", "count", points(keys, interviews_by_month), "Deals de onboarding em treinamento ou etapa posterior."),
                indicator("configs", "Configurações concluídas", "count", points(keys, configs_by_month), "Deals em Ag. 1ª Compra ou etapa posterior."),
                indicator("sla-onboarding", "SLA médio onboarding", "days", points(keys, onboarding_sla_by_month), "Média de dias entre criação e última mudança de etapa nos deals configurados."),
            ],
            "mixTitle": "Status atual do onboarding",
            "mix": breakdown_from_counter(onboarding_mix),
            "rankingTitle": "Qualidade do vínculo venda → onboarding",
            "ranking": [
                {"label": "Match por CNPJ", "value": linked_cnpj, "color": "#06d6a0"},
                {"label": "Match por título", "value": linked_title, "color": "#ffd166"},
                {"label": "Sem match", "value": unlinked, "color": "#ef476f"},
            ],
            "notes": ["Regra de vínculo: CNPJ Principal primeiro; fallback pelo título removendo '(copia)'.", "Sem match indica oportunidade de corrigir CNPJ/título nos cards."],
        },
        {
            "id": "ativacao",
            "title": "Ativação",
            "subtitle": "Compra assistida e avanço para uso real.",
            "accent": "#06d6a0",
            "indicators": [
                indicator("clientes-ativados", "Clientes ativados", "count", points(keys, activated_by_month), "Deals de onboarding que chegaram em Feita 3ª Compra ou etapa posterior."),
                indicator("gmv-assistido", "GMV assistido", "currency", zero_points, "Campo específico de GMV não identificado no snapshot do Pipedrive; pronto para mapear quando definido."),
                indicator("tempo-compra", "Tempo até 1ª compra", "days", zero_points, "Depende de evento/data específica de primeira compra no Pipedrive."),
                indicator("followups", "Follow-ups concluídos", "count", zero_points, "Depende de atividades; será conectado em uma segunda extração se desejado."),
            ],
            "mixTitle": "Etapas de compra assistida",
            "mix": breakdown_from_counter(Counter(stage_name(d.get("stage_id"), stage_by_id) for d in onboarding if d.get("status") == "open" and stage_order(d.get("stage_id"), stage_by_id) >= 4)),
            "rankingTitle": "Pendências de ativação",
            "ranking": breakdown_from_counter(Counter(stage_name(d.get("stage_id"), stage_by_id) for d in onboarding if d.get("status") == "open" and 4 <= stage_order(d.get("stage_id"), stage_by_id) < 7)),
            "notes": ["Ativação foi ligada por etapa do funil Onboarding.", "GMV, tempo de primeira compra e follow-ups precisam de campos/atividades específicos para precisão total."],
        },
        {
            "id": "cs",
            "title": "CS e Fidelização",
            "subtitle": "Carteira, fidelização e risco de churn no Pipedrive.",
            "accent": "#4cc9f0",
            "indicators": [
                indicator("fidelizados", "Clientes fidelizados", "count", points(keys, fidelized_by_month), "Deals que chegaram à etapa Fidelizado no funil CS."),
                indicator("health-score", "Health score médio", "percent", zero_points, "Campo de health score não identificado no snapshot do Pipedrive."),
                indicator("churn", "Risco/churn na carteira", "percent", points(keys, churn_rate), "Percentual atual de deals CS em etapas de risco/cancelamento."),
                indicator("reversoes", "Cancelamentos revertidos", "count", zero_points, "Depende de motivo/atividade de reversão no Pipedrive."),
            ],
            "mixTitle": "Carteira CS por etapa",
            "mix": breakdown_from_counter(cs_mix),
            "rankingTitle": "Alertas CS por etapa",
            "ranking": breakdown_from_counter(Counter(stage_name(d.get("stage_id"), stage_by_id) for d in cs if d.get("status") == "open" and any(x in stage_name(d.get("stage_id"), stage_by_id).lower() for x in ["risco", "cancel", "parou", "ñ usa", "não usa", "nao usa"]))),
            "notes": ["Fidelizado segue a etapa 'Fidelizado' no funil CS.", "Health score e reversões ficam preparados para quando os campos/atividades forem definidos."],
        },
    ]

    snapshot = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "periodLabel": f"{MONTH_LABELS[anchor.month - 1]}/{anchor.year}",
        "source": "Pipedrive API — dados agregados",
        "rawCounts": {
            "deals": len(deals),
            "salesDeals": len(sales),
            "onboardingDeals": len(onboarding),
            "csDeals": len(cs),
            "pipelines": len(pipelines),
            "stages": len(stages),
        },
        "dashboards": dashboards,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    ts = "// Auto-generated by scripts/fetch-pipedrive-snapshot.py. Do not edit manually.\n"
    ts += "import type { Dashboard } from '../data';\n\n"
    ts += f"export const pipedriveSnapshot = {json.dumps(snapshot, ensure_ascii=False, indent=2)} as const;\n\n"
    ts += "export const dashboards = pipedriveSnapshot.dashboards as unknown as Dashboard[];\n"
    OUT.write_text(ts, encoding="utf-8")
    print(f"Generated {OUT.relative_to(ROOT)}")
    print(json.dumps(snapshot["rawCounts"], ensure_ascii=False))
    for d in dashboards:
        first = d["indicators"][0]
        print(f"{d['title']}: {first['label']} = {first['value']}")


if __name__ == "__main__":
    main()
