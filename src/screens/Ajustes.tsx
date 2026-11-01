import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lerConfig, salvarConfig } from '../db';
import type { Precisao, ResumoImportacao } from '../types';
import { exportarBackup, importarArquivo, restaurarBackup } from '../lib/acoes';
import { testarChave } from '../lib/google';
import { iniciarFila, ouvirFila, pararFila, type EstadoFila } from '../lib/filaGeo';
import { formatarData } from '../lib/texto';
import { PRECISOES } from '../components/Selos';
import CartaoDrive from '../components/CartaoDrive';

export default function Ajustes() {
  const cfg = useLiveQuery(() => lerConfig(), []);
  const clientes = useLiveQuery(() => db.clientes.where('ativo').equals(1).toArray(), []) ?? [];
  const [fila, setFila] = useState<EstadoFila | null>(null);
  const [msgImp, setMsgImp] = useState('');
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);
  const [importando, setImportando] = useState(false);
  const [chave, setChave] = useState<string | null>(null);
  const [msgChave, setMsgChave] = useState('');
  const [testando, setTestando] = useState(false);
  const [msgBackup, setMsgBackup] = useState('');
  const arqPlanilha = useRef<HTMLInputElement>(null);
  const arqBackup = useRef<HTMLInputElement>(null);
  useEffect(() => ouvirFila(setFila), []);

  const porPrecisao: Record<string, number> = {};
  for (const c of clientes) {
    const k = c.local?.precisao ?? (c.geoStatus === 'falhou' ? 'falhou' : 'pendente');
    porPrecisao[k] = (porPrecisao[k] ?? 0) + 1;
  }

  async function importar(f: File) {
    setImportando(true); setMsgImp(''); setResumo(null);
    try {
      const r = await importarArquivo(f);
      setResumo(r.resumo);
      if (r.avisos.length) setMsgImp(r.avisos.slice(0, 5).join(' · '));
    } catch (e) { setMsgImp('Erro: ' + (e as Error).message); }
    finally { setImportando(false); if (arqPlanilha.current) arqPlanilha.current.value = ''; }
  }

  async function testar() {
    const k = (chave ?? '').trim();
    setTestando(true); setMsgChave('');
    try {
      const r = await testarChave(k);
      await salvarConfig({ googleKey: k });
      setMsgChave(r);
    } catch (e) {
      setMsgChave((e as Error).message);
    } finally { setTestando(false); }
  }

  async function baixarBackup() {
    const blob = await exportarBackup();
    const nome = `backup-visitas-${new Date().toISOString().slice(0, 10)}.json`;
    const arquivo = new File([blob], nome, { type: 'application/json' });
    // No iPhone, o menu de compartilhar permite salvar em Arquivos / iCloud Drive
    if (navigator.canShare?.({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: nome }); return; } catch { /* cancelado */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  if (!cfg) return null;
  if (chave === null) { setChave(cfg.googleKey); return null; }
  const ult = resumo ?? cfg.ultimaImportacao;

  return (
    <div>
      <CartaoDrive />

      <section className="cartao">
        <h2>Planilha de clientes</h2>
        <p className="nota-peq">Envie a planilha exportada (.xls ou .xlsx). O app atualiza os dados da planilha e <b>mantém</b> o que você fez:
          endereços corrigidos, localizações confirmadas, anotações e visitas. Quem sair da planilha não é apagado, fica como "fora da carteira".</p>
        <input ref={arqPlanilha} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
          onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
        <button className="btn btn-bloco" onClick={() => arqPlanilha.current?.click()} disabled={importando}>{importando ? 'Importando…' : '📥 Importar planilha'}</button>
        {msgImp && <div className="msg">{msgImp}</div>}
        {ult && (
          <div className={resumo ? 'alerta-ok' : 'nota-peq'}>
            {resumo ? '✓ Importação concluída. ' : 'Última importação: '}
            <b>{ult.arquivo}</b> ({ult.dataPlanilha ? `planilha de ${formatarData(ult.dataPlanilha)}` : 'sem data'}, importada em {formatarData(ult.em)})<br />
            {ult.total} clientes · {ult.novos} novos · {ult.atualizados} atualizados · {ult.semMudanca} sem mudança
            {ult.voltaram ? ` · ${ult.voltaram} voltaram` : ''}{ult.saiuDaCarteira ? ` · ${ult.saiuDaCarteira} saíram da carteira` : ''}
            {ult.locaisResetados ? ` · ${ult.locaisResetados} endereços sugeridos refeitos (mudou o CEP)` : ''}
          </div>
        )}
      </section>

      <section className="cartao">
        <h2>Tempo de visita e estimativa</h2>
        <div className="linha-form"><label>Minutos por visita</label>
          <input type="number" inputMode="numeric" defaultValue={cfg.minutosPorVisita} onBlur={(e) => salvarConfig({ minutosPorVisita: Math.max(0, Number(e.target.value) || 30) })} /></div>
        <p className="nota-peq">A velocidade média só é usada quando não há chave do Google (estimativa em linha reta).</p>
        <div className="linha-form"><label>Velocidade média (km/h)</label>
          <input type="number" inputMode="numeric" defaultValue={cfg.velocidadeMedia} onBlur={(e) => salvarConfig({ velocidadeMedia: Math.max(5, Number(e.target.value) || 30) })} /></div>
      </section>

      <section className="cartao">
        <h2>Instalar no iPhone</h2>
        <ol className="nota-peq">
          <li>Abra o endereço do app no <b>Safari</b>.</li>
          <li>Toque em <b>Compartilhar</b> (quadrado com seta).</li>
          <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
          <li>Use sempre pelo ícone: assim os dados ficam guardados e o app funciona sem internet.</li>
        </ol>
      </section>
      <details className="cartao avancado">
        <summary>Avançado</summary>
        <div className="sub-avancado">
          <h2>🚦 Google Maps: rotas reais com trânsito</h2>
          <p className="nota-peq">Com a chave do Google, a rota é calculada <b>pelas ruas e com o trânsito do momento</b>
            (ou o previsto para o horário de saída), com horário de chegada em cada cliente. A chave também melhora as sugestões de endereço.</p>
          <input type="password" placeholder="Cole aqui a chave da API Google" value={chave} onChange={(e) => setChave(e.target.value)} autoComplete="off" />
          <div className="botoes">
            <button className="btn" disabled={!chave.trim() || testando} onClick={testar}>{testando ? 'Testando…' : 'Salvar e testar'}</button>
            {cfg.googleKey && <button className="btn btn-sec" onClick={async () => { setChave(''); await salvarConfig({ googleKey: '' }); setMsgChave('Chave removida.'); }}>Remover</button>}
          </div>
          {msgChave && <div className={/✓/.test(msgChave) ? 'alerta-ok' : 'msg'}>{msgChave}</div>}
          <details>
            <summary>Como criar a chave (uma vez só)</summary>
            <ol className="nota-peq passos">
              <li>Entre em <b>console.cloud.google.com</b> com uma conta Google e crie um projeto (ex: "Visitas").</li>
              <li>Em <b>Faturamento</b>, vincule um cartão. O Google exige, mas tem uma cota mensal gratuita; para uma pessoa só, o uso tende a ficar baixo. Confira os preços atuais na página do Google Maps Platform.</li>
              <li>Em <b>APIs e serviços → Biblioteca</b>, ative <b>Routes API</b> e <b>Places API (New)</b>.</li>
              <li>Em <b>APIs e serviços → Credenciais</b>, clique em <b>Criar credenciais → Chave de API</b>.</li>
              <li>Edite a chave: em <b>Restrições de aplicativo</b> escolha <b>Sites</b> e adicione <code>https://roxo-luis13.github.io/*</code>. Em <b>Restrições de API</b> marque só Routes API e Places API (New).</li>
              <li>Copie a chave, cole acima e toque em <b>Salvar e testar</b>.</li>
            </ol>
            <p className="nota-peq">A chave fica guardada só neste iPhone, não vai para o GitHub.</p>
          </details>
        </div>

        <div className="sub-avancado">
          <h2>Endereços sugeridos</h2>
          <p className="nota-peq">A planilha não traz rua e número. O app procura uma sugestão (pelo nome da loja, CEP, bairro ou cidade).
            As sugestões aparecem com ⚠️ até você confirmar na visita.</p>
          <ul className="lista-precisao">
            {(Object.keys(PRECISOES) as Precisao[]).map((k) => porPrecisao[k] ? <li key={k}><span style={{ color: PRECISOES[k].cor }}>{PRECISOES[k].curto}</span><b>{porPrecisao[k]}</b></li> : null)}
            {porPrecisao.pendente ? <li><span>⏳ Aguardando busca</span><b>{porPrecisao.pendente}</b></li> : null}
            {porPrecisao.falhou ? <li><span>❓ Não encontrados</span><b>{porPrecisao.falhou}</b></li> : null}
          </ul>
          {fila?.rodando ? (
            <>
              <div className="msg">Buscando… {fila.feitos} feitos, {fila.pendentes} na fila{fila.atual ? ` (${fila.atual})` : ''}. Mantenha o app aberto.</div>
              <button className="btn btn-sec btn-bloco" onClick={pararFila}>Pausar</button>
            </>
          ) : (
            porPrecisao.pendente ? <button className="btn btn-sec btn-bloco" onClick={() => iniciarFila()}>Buscar endereços pendentes</button> : null
          )}
          {fila?.erro && <div className="msg">{fila.erro}</div>}
        </div>

        <div className="sub-avancado">
          <h2>Backup em arquivo</h2>
          <p className="nota-peq">Com o Google Drive conectado, tudo já é salvo sozinho e o Drive guarda versões anteriores.
            Use isto só se precisar de uma cópia em arquivo (por exemplo, para enviar a alguém) ou para restaurar uma cópia antiga.</p>
          <div className="botoes">
            <button className="btn" onClick={baixarBackup}>💾 Salvar backup</button>
            <button className="btn btn-sec" onClick={() => arqBackup.current?.click()}>Restaurar backup</button>
          </div>
          <input ref={arqBackup} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            if (!confirm('Restaurar substitui TODOS os dados atuais pelos do backup. Continuar?')) return;
            try { await restaurarBackup(f); setMsgBackup('Backup restaurado ✓'); } catch (err) { setMsgBackup('Erro: ' + (err as Error).message); }
          }} />
          {msgBackup && <div className="msg">{msgBackup}</div>}
        </div>
      </details>

    </div>
  );
}
