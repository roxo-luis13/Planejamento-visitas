import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lerConfig, salvarConfig } from '../db';
import type { Precisao, ResumoImportacao } from '../types';
import { exportarBackup, importarArquivo, obterGps, restaurarBackup } from '../lib/acoes';
import { buscarLugar } from '../lib/geocodificar';
import { iniciarFila, ouvirFila, pararFila, type EstadoFila } from '../lib/filaGeo';
import { formatarData } from '../lib/texto';
import { PRECISOES } from '../components/Selos';

export default function Ajustes() {
  const cfg = useLiveQuery(() => lerConfig(), []);
  const clientes = useLiveQuery(() => db.clientes.where('ativo').equals(1).toArray(), []) ?? [];
  const [fila, setFila] = useState<EstadoFila | null>(null);
  const [msgImp, setMsgImp] = useState('');
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);
  const [importando, setImportando] = useState(false);
  const [buscaPartida, setBuscaPartida] = useState('');
  const [msgPartida, setMsgPartida] = useState('');
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

  async function partidaPorTexto() {
    setMsgPartida('Buscando…');
    try {
      const r = await buscarLugar(buscaPartida);
      if (!r) { setMsgPartida('Não encontrei. Tente incluir cidade e UF.'); return; }
      await salvarConfig({ partidaPadrao: { lat: r.lat, lng: r.lng, rotulo: buscaPartida } });
      setMsgPartida(`Salvo: ${r.rotulo}`);
    } catch { setMsgPartida('Sem internet agora.'); }
  }
  async function partidaPorGps() {
    setMsgPartida('Obtendo localização…');
    try {
      const g = await obterGps();
      await salvarConfig({ partidaPadrao: { lat: g.lat, lng: g.lng, rotulo: 'Local salvo pelo GPS' } });
      setMsgPartida('Salvo ✓');
    } catch (e) { setMsgPartida((e as Error).message); }
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
  const ult = resumo ?? cfg.ultimaImportacao;

  return (
    <div>
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
        <details>
          <summary>Melhorar as sugestões com Google (opcional)</summary>
          <p className="nota-peq">Com uma chave da API Google Places, o app encontra muito mais lojas pelo nome. O Google cobra por uso acima da cota gratuita.</p>
          <input type="password" placeholder="Chave da API Google" defaultValue={cfg.googleKey} onBlur={(e) => salvarConfig({ googleKey: e.target.value.trim() })} />
        </details>
      </section>

      <section className="cartao">
        <h2>Ponto de partida padrão</h2>
        <p className="nota-peq">Atual: <b>{cfg.partidaPadrao?.rotulo ?? 'não definido'}</b>. Em cada dia você pode escolher este ponto ou a sua localização atual.</p>
        <input placeholder="Ex: Rua X, 100, Taubaté - SP" value={buscaPartida} onChange={(e) => setBuscaPartida(e.target.value)} />
        <div className="botoes">
          <button className="btn" onClick={partidaPorTexto} disabled={!buscaPartida.trim()}>Salvar endereço</button>
          <button className="btn btn-sec" onClick={partidaPorGps}>📍 Usar onde estou</button>
        </div>
        {msgPartida && <div className="msg">{msgPartida}</div>}
      </section>

      <section className="cartao">
        <h2>Estimativas da rota</h2>
        <div className="linha-form"><label>Minutos por visita</label>
          <input type="number" inputMode="numeric" defaultValue={cfg.minutosPorVisita} onBlur={(e) => salvarConfig({ minutosPorVisita: Math.max(0, Number(e.target.value) || 30) })} /></div>
        <div className="linha-form"><label>Velocidade média (km/h)</label>
          <input type="number" inputMode="numeric" defaultValue={cfg.velocidadeMedia} onBlur={(e) => salvarConfig({ velocidadeMedia: Math.max(5, Number(e.target.value) || 30) })} /></div>
      </section>

      <section className="cartao">
        <h2>Backup</h2>
        <p className="nota-peq">Os dados ficam guardados neste iPhone. Faça um backup de vez em quando (salve em Arquivos ou iCloud Drive).</p>
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
    </div>
  );
}
