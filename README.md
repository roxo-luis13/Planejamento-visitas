# Visitas – Planejamento de rotas (PWA para iPhone)

App para o representante organizar a carteira de clientes, decidir **quem visitar** e montar a **rota de cada dia**.
Roda no Safari do iPhone e é instalado em *Compartilhar → Adicionar à Tela de Início*. Funciona sem internet depois de aberto uma vez.

## O que já faz (versão 0.1)

| Tela | Funções |
|---|---|
| **Rota** | 📍 Cheguei e **registro da visita** · dia selecionável · **saída escolhida aqui** (localização atual, locais salvos como Casa/Escritório, ou busca de endereço; ★ = padrão dos próximos dias) · horário de saída · voltar ou não à saída · **otimizar com trânsito (Google)** · km reais, tempo com trânsito e horário de chegada em cada cliente · traçado pelas ruas no mapa · navegar (Apple Mapas / Google Maps / Waze) · registrar resultado da visita |
| **Carteira** | Busca · **filtros com várias opções**: microrregiões, cidades, bairros e **marcas** (com busca digitando; bairro escolhido junto com a cidade; as marcas vêm das colunas da planilha, então marca nova entra sozinha ao importar), níveis de prioridade e situação financeira (sem pendência / do cliente / do grupo) · dentro de um filtro vale qualquer opção marcada, entre filtros vale todas · "Limpar filtros" · ordenação · botão ＋ para pôr na rota do dia · barra fixa com os selecionados (ver, desmarcar um a um ou todos) e filtro "Só selecionados" |
| **Cliente** | Endereço com nível de precisão e alertas · "Estou na loja" (grava o GPS) · ajustar no mapa · corrigir endereço · compras por marca e ano · frequência · financeiro · grupo/rede · anotações · histórico de visitas |
| **Ajustes** | Google Drive e lembretes na Agenda · importar planilha · progresso das sugestões de endereço · tempo por visita · backup/restauração |

### Registro da visita (nada é obrigatório)
Na Rota, **📍 Cheguei** marca a chegada; **Registrar visita** abre o formulário (também dá para registrar pela ficha do cliente,
para visitas fora da rota):
- **Resultado:** Pedido feito · Sem pedido (com motivo) · Não atendido (com motivo) · Reagendado. Sem escolher, fica "Visita registrada".
- **Pedido:** peças por marca, valor (R$) e nº do pedido.
- **Com quem falou** (sugere o contato da última visita) e **assuntos tratados**.
- **Próximo retorno** (+7/+15/+30 dias ou o ciclo de compra do cliente), que pode entrar direto na rota daquele dia.
- Observação; horário de chegada/saída; distância do GPS até a loja (se a localização estiver liberada), com opção de gravar como local da loja.

Motivos e assuntos são **listas fixas**, para poderem ser somados nos relatórios.

### Chegada pelo GPS e lembretes de retorno
- **Detectar chegada** (cartão na Rota de hoje, botão Ativar): com o app **aberto na tela**, quem fica a menos de ~120 m de um
  cliente da rota por 1 minuto ganha o "Cheguei" automático; ao se afastar ~250 m, o app guarda a saída e pergunta se quer
  registrar a visita (e manda notificação, se permitida). Ao abrir o app perto de um cliente, pergunta "Você está na loja X?".
  Só usa clientes com localização confiável (não usa o centro do bairro/cidade). Limitação do iPhone: apps da web não usam o GPS em segundo plano.
- Chegou e não registrou: aviso na Rota (depois que saiu, em outro dia ou após 1h30).
- **Lembretes de retorno** (Ajustes → 📅 Lembretes de retorno): cada retorno combinado vira um evento na **Agenda Google**,
  às 08:00 do dia, com avisos 2 dias antes e na hora. O app cria, corrige e apaga os eventos sozinho (depois de cada
  sincronização com o Drive); IDs fixos por cliente+data evitam duplicar entre aparelhos. Permissão extra: `calendar.events`.
  No Google Cloud: ativar a **Google Calendar API** e incluir o escopo `.../auth/calendar.events` na tela de permissão OAuth.

### Relatórios
Aba **📊 Relatórios**, com filtro de período (este mês, mês passado, últimos 30/90 dias, tudo):
- Números do período: visitas, clientes e dias em campo, pedidos e taxa de pedido (sobre as visitas atendidas), peças,
  valor e ticket médio, tempo médio na loja e % da carteira visitada.
- Resultado das visitas, peças por marca, motivos de não comprar / não ser atendido, assuntos e desempenho por cidade.
- **Retornos combinados** vencidos e dos próximos 14 dias, e **clientes atrasados/perto do ciclo sem visita** no período (toque abre a ficha).
- **Exportar para Excel:** uma linha por visita, com cliente, cidade, microrregião, grupo,
  resultado, motivo, contato, assuntos, peças por marca, total, valor, nº do pedido, retorno, observação, duração e distância.

### Prioridade de visita
`ciclo = 365 ÷ FREQ.MEDIA` · `atraso = dias desde o último faturamento − ciclo`
🔴 Atrasado (passou do ciclo) · 🟡 Perto do ciclo · 🟢 Em dia · 🟣 Reativar (mais de 18 meses sem comprar) · ⚪ Sem histórico.

### Financeiro
"Há N dias" ou "X" = pendência **do próprio cliente** (selo vermelho). "Grupo Econômico com..." = pendência **de outra loja do grupo** (selo laranja).

### Rota real com trânsito (Google Routes API)
**Desligado por enquanto** (sem custo: o app usa estimativa em linha reta e o botão "Abrir no Google Maps" mostra o trânsito).
A chave não é colocada pelo app: quando for ativar, ela vai em `CHAVE_MAPS` no `src/config.ts`, **depois** de travar as cotas
diárias no Google Cloud (Routes API e Places API (New): 150/dia cada) e criar o alerta de orçamento. O app ainda limita cada
aparelho a 70 chamadas/dia de cada tipo. Com a chave, "Otimizar com trânsito" pede ao Google a **melhor ordem pelas ruas, considerando o
trânsito** do horário de saída (agora, ou o previsto se a saída for no futuro). O app mostra km, tempo dirigindo, minutos perdidos no
trânsito, horário de chegada em cada cliente e fim previsto. "Atualizar trânsito" recalcula os tempos mantendo a ordem.
Com visitas já registradas, o cálculo parte da última visita, no horário atual. Sem chave, o app usa uma estimativa em linha reta.
Restrinja a chave ao site do app e às APIs Routes e Places (New).

### Google Drive: dados na conta do Alexandre
Em **Ajustes → Entrar com Google**, os dados (clientes, endereços confirmados, anotações, rotas, visitas, locais de saída
e configurações) passam a ser guardados no **Google Drive** dele, no arquivo `App Visitas/visitas-dados.json`.
Em outro aparelho, basta entrar com a mesma conta.
- O app continua funcionando sem internet. Quando há alteração, ela vai para o Drive **1 minuto depois** (as alterações desse minuto vão juntas); sem alterações, o app confere o Drive **a cada 2 horas** (ao abrir, ao voltar para ele ou durante o uso). Enquanto não envia, a nuvem mostra ☁️•. **Ajustes → Sincronizar agora** envia na hora.
- Ao abrir, o app junta o que está no aparelho com o que está no Drive: **vence a alteração mais recente de cada registro**
  (no cliente, os dados da planilha e os do Alexandre — endereço, localização, anotações — são juntados separadamente).
- Permissão `drive.file`: o app só enxerga os arquivos que ele mesmo criou.
- O Google pede para renovar o acesso a cada ~1 hora; o app tenta renovar sozinho ao abrir (se houver algo a enviar ou a sincronização estiver vencida) e, se precisar, mostra "Toque para reconectar".

#### Ativar o login com Google (feito uma vez)
No Google Cloud (mesmo projeto do Maps):
1. *APIs e serviços → Biblioteca*: ative a **Google Drive API**.
2. *Tela de permissão OAuth*: tipo **Externo**, nome do app, e-mail de suporte; escopos `drive.file`, `openid`, `email`.
   Enquanto estiver em "Teste", adicione o e-mail do Alexandre em **Usuários de teste** (ou publique o app).
3. *Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web*:
   - **Origens JavaScript autorizadas**: `https://roxo-luis13.github.io`
   - **URIs de redirecionamento autorizados**: `https://roxo-luis13.github.io/Planejamento-visitas/`
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) para `ID_CLIENTE` em `src/config.ts`.
   Esse ID não é secreto.

### Editar cliente
Botão ✏️ em cada cliente da Carteira e **✏️ Editar** na ficha: nome fantasia, razão social, com quem falar, telefone
(com atalhos para ligar e WhatsApp na ficha) e endereço completo (CEP preenche a rua pelos Correios).
Nome, bairro, cidade, UF e CEP diferentes da planilha viram **correções**: continuam valendo nas próximas importações
(e somem sozinhas se a planilha passar a trazer o mesmo valor); embaixo do campo aparece o valor da planilha, para desfazer.
O que foi digitado é salvo mesmo sem internet; com rua e número, o app localiza a loja no mapa.

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
O app é publicado no GitHub Pages (veja abaixo). Qualquer outra hospedagem estática com HTTPS também serve (build `npm run build`, pasta `dist`).

> As planilhas (`*.xls`, `*.xlsx`) estão no `.gitignore` porque têm dados reais de clientes.

## Próximos passos sugeridos
- Sincronização na nuvem (Supabase) para não depender só do backup manual
- Distâncias reais por ruas (OSRM ou Google Routes) no lugar da estimativa em linha reta
- Janelas de horário dos clientes e previsão de chegada por parada
- Telefone e contato, quando a exportação passar a trazer
- Refinar as opções de resultado da visita

### Publicação automática
Cada envio para o ramo `main` roda os testes e publica no GitHub Pages
(`.github/workflows/publicar.yml`). Endereço: https://roxo-luis13.github.io/Planejamento-visitas/
