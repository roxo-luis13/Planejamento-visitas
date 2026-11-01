# Visitas – Planejamento de rotas (PWA para iPhone)

App para o representante organizar a carteira de clientes, decidir **quem visitar** e montar a **rota de cada dia**.
Roda no Safari do iPhone e é instalado em *Compartilhar → Adicionar à Tela de Início*. Funciona sem internet depois de aberto uma vez.

## O que já faz (versão 0.1)

| Tela | Funções |
|---|---|
| **Rota** | Dia selecionável · saída pelo ponto padrão ou pela localização atual · voltar ou não ao ponto de saída · **otimizar ordem** · km e tempo estimados · mapa numerado · navegar (Apple Mapas / Google Maps / Waze) · rota completa no Google Maps · registrar resultado da visita |
| **Carteira** | Busca · filtros por prioridade, microrregião, cidade, bairro e financeiro · ordenação · botão ＋ para pôr na rota do dia |
| **Cliente** | Endereço com nível de precisão e alertas · "Estou na loja" (grava o GPS) · ajustar no mapa · corrigir endereço · compras por marca e ano · frequência · financeiro · grupo/rede · anotações · histórico de visitas |
| **Ajustes** | Importar planilha · progresso das sugestões de endereço · ponto de partida · parâmetros da estimativa · backup/restauração · chave Google opcional |

### Prioridade de visita
`ciclo = 365 ÷ FREQ.MEDIA` · `atraso = dias desde o último faturamento − ciclo`
🔴 Atrasado (passou do ciclo) · 🟡 Perto do ciclo · 🟢 Em dia · 🟣 Reativar (mais de 18 meses sem comprar) · ⚪ Sem histórico.

### Financeiro
"Há N dias" ou "X" = pendência **do próprio cliente** (selo vermelho). "Grupo Econômico com..." = pendência **de outra loja do grupo** (selo laranja).

### Endereços (a planilha não traz rua nem número)
O app sugere um local automaticamente, nesta ordem: loja pelo nome (Google, se houver chave; senão OpenStreetMap) → rua pelo CEP (ViaCEP, só para CEP que não seja o geral da cidade) → centro do bairro → centro da cidade.
Toda sugestão aparece com ⚠️ até o Alexandre **confirmar** ("Estou na loja", "Ajustar no mapa" ou "Corrigir endereço").

### Importar uma planilha nova
Atualiza tudo o que vem da planilha e **mantém**: endereços corrigidos, localizações confirmadas, anotações, rotas e visitas.
- Cliente que saiu da planilha não é apagado; fica "fora da carteira".
- Se o CEP mudou e o local era só sugestão, a sugestão é refeita. Se o local foi confirmado, ele é mantido, mas aparece um aviso para conferir.

## Desenvolvimento

```bash
npm install
npm run dev       # abre em http://localhost:5173 (use --host para testar no iPhone na mesma rede)
npm test          # testes de leitura da planilha, mesclagem, prioridade, rota e endereços
npm run build     # gera a pasta dist/ para publicar
```

Tecnologia: React + Vite + vite-plugin-pwa · IndexedDB (Dexie): os dados ficam no aparelho · SheetJS (leitura do .xls) · Leaflet + OpenStreetMap (mapa).

## Publicar
Qualquer hospedagem estática com HTTPS serve (Vercel, Netlify, GitHub Pages). Na Vercel: importar o repositório, build `npm run build`, pasta `dist`.

> As planilhas (`*.xls`, `*.xlsx`) estão no `.gitignore` porque têm dados reais de clientes.

## Próximos passos sugeridos
- Sincronização na nuvem (Supabase) para não depender só do backup manual
- Distâncias reais por ruas (OSRM ou Google Routes) no lugar da estimativa em linha reta
- Janelas de horário dos clientes e previsão de chegada por parada
- Telefone e contato, quando a exportação passar a trazer
- Refinar as opções de resultado da visita
