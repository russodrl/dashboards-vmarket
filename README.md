# Dashboards VMarket

App em React/Vite com dashboards no estilo Databox para acompanhar o processo VMarket de ponta a ponta: Vendas, Onboarding, Ativação e CS/Fidelização.

## O que está implementado

- Layout `datawall` inspirado no Databox: fundo escuro/vinho, cards densos, KPIs grandes e gráficos compactos.
- Indicadores do mês vigente destacados em cada card.
- Gráfico de linha mês a mês para cada indicador.
- Tooltip no hover/foco com valor do mês e percentual de variação vs. mês anterior.
- Variação verde quando positiva e vermelha quando negativa.
- Dashboards:
  - Executivo VMarket
  - Vendas
  - Onboarding
  - Ativação
  - CS e Fidelização
- Gráficos complementares por dashboard: distribuição/bubble chart e ranking/barras.
- Regra de vínculo venda → onboarding em `src/pipedriveLinking.ts`:
  1. usa `CNPJ principal` como identificador principal;
  2. quando não achar, faz fallback pelo título removendo `(copia)`.
- Exportação de schema dos dashboards em JSON pelo botão **Schema**.
- Teste local de JSON com `{ "salesDeals": [...], "onboardingCopies": [...] }`.

## Rodar localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Formato esperado para testar vínculo

```json
{
  "salesDeals": [
    { "id": 1, "title": "ACME Ltda", "cnpj_principal": "12.345.678/0001-90", "value": 9800 }
  ],
  "onboardingCopies": [
    { "id": 11, "title": "ACME Ltda (copia)", "cnpj_principal": "12.345.678/0001-90" }
  ]
}
```

## Próximos passos recomendados

- Trocar a massa demonstrativa por API/CSV real do Pipedrive.
- Mapear IDs reais dos campos customizados do Pipedrive, especialmente `CNPJ principal`.
- Publicar via GitHub Pages, Vercel ou Supabase Hosting.
