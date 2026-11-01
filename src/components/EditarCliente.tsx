import { useState } from 'react';
import type { CampoCorrigivel, Cliente, Endereco } from '../types';
import { editarCliente } from '../lib/acoes';
import { buscarCep } from '../lib/geocodificar';
import { formatarCep, titulo } from '../lib/texto';
import Folha from './Folha';

/**
 * Editar o cliente: nome, contato e endereço completo.
 * O que for diferente da planilha fica marcado como correção e continua valendo nas próximas importações.
 */
export default function EditarCliente({ c, aoFechar, aoSalvar }: { c: Cliente; aoFechar: () => void; aoSalvar?: (msg: string) => void }) {
  const [fantasia, setFantasia] = useState(c.fantasia);
  const [razao, setRazao] = useState(c.razao);
  const [responsavel, setResponsavel] = useState(c.responsavel ?? '');
  const [telefone, setTelefone] = useState(c.telefone ?? '');
  const [e, setE] = useState<Endereco>({
    logradouro: c.endereco?.logradouro ?? '', numero: c.endereco?.numero ?? '', complemento: c.endereco?.complemento ?? '',
    bairro: titulo(c.bairro), cidade: titulo(c.cidade), uf: c.uf, cep: formatarCep(c.cep)
  });
  const [ocupado, setOcupado] = useState(false);
  const [msgCep, setMsgCep] = useState('');

  const corr = c.correcoes ?? {};
  // mostra o valor da planilha embaixo do campo corrigido, com "voltar ao da planilha"
  const daPlanilha = (k: CampoCorrigivel, voltar: (v: string) => void) => {
    const x = corr[k];
    if (!x) return null;
    const mostrar = k === 'cep' ? formatarCep(x.planilha) : k === 'fantasia' || k === 'razao' ? x.planilha : titulo(x.planilha);
    return <small className="campo-planilha">Na planilha: {mostrar || '—'} · <button type="button" className="btn-link" onClick={() => voltar(mostrar)}>usar o da planilha</button></small>;
  };

  async function completarCep(valor: string) {
    const so = valor.replace(/\D/g, '');
    if (so.length !== 8) return;
    setMsgCep('Buscando CEP…');
    const r = await buscarCep(so);
    if (!r) { setMsgCep('CEP não encontrado (ou sem internet).'); return; }
    setE((a) => ({
      ...a,
      logradouro: a.logradouro || r.logradouro || '',
      bairro: r.bairro || a.bairro, cidade: r.localidade || a.cidade, uf: r.uf || a.uf
    }));
    setMsgCep(r.logradouro ? '✓ Endereço do CEP preenchido. Confira e coloque o número.' : '✓ CEP da cidade (sem rua). Preencha a rua e o número.');
  }

  async function salvar() {
    setOcupado(true);
    try {
      const r = await editarCliente(c.codigo, { fantasia, razao, responsavel, telefone, endereco: e });
      aoSalvar?.(r.localizado === true ? (c.local?.precisao === 'confirmado' ? 'Dados salvos ✓ (a posição de GPS confirmada foi mantida)' : 'Dados salvos e endereço localizado no mapa ✓')
        : r.localizado === false ? 'Dados salvos ✓, mas não achei o endereço no mapa. Use "Estou na loja" ou "Ajustar no mapa".'
        : r.localizado === 'sem-internet' ? 'Dados salvos ✓. Sem internet para achar o endereço no mapa agora: use "Ajustar no mapa" ou edite de novo depois.'
        : 'Dados salvos ✓');
      aoFechar();
    } catch {
      aoSalvar?.('Dados salvos, mas sem internet para localizar o endereço agora.');
      aoFechar();
    }
  }

  const campo = (rotulo: string, valor: string, mudar: (v: string) => void, extra: Record<string, unknown> = {}, abaixo?: React.ReactNode) => (
    <div className="linha-form campo-editar">
      <label>{rotulo}</label>
      <input value={valor} onChange={(ev) => mudar(ev.target.value)} {...extra} />
      {abaixo}
    </div>
  );
  const end = (k: keyof Endereco) => (v: string) => setE((a) => ({ ...a, [k]: v }));

  return (
    <Folha aberta aoFechar={aoFechar} titulo={`Editar ${c.fantasia}`}>
      <h3 className="sub-titulo">Loja</h3>
      {campo('Nome fantasia', fantasia, setFantasia, {}, daPlanilha('fantasia', setFantasia))}
      {campo('Razão social', razao, setRazao, {}, daPlanilha('razao', setRazao))}

      <h3 className="sub-titulo">Contato</h3>
      {campo('Falar com', responsavel, setResponsavel, { placeholder: 'Nome do responsável', autoCapitalize: 'words' })}
      {campo('Telefone', telefone, setTelefone, { type: 'tel', inputMode: 'tel', placeholder: '(12) 99999-9999' })}

      <h3 className="sub-titulo">Endereço</h3>
      {campo('CEP', e.cep, (v) => { end('cep')(v); void completarCep(v); }, { inputMode: 'numeric', placeholder: '00000-000' }, <>
        {msgCep && <small className="campo-planilha">{msgCep}</small>}
        {daPlanilha('cep', end('cep'))}
      </>)}
      {campo('Rua / Av.', e.logradouro, end('logradouro'))}
      {campo('Número', e.numero, end('numero'), { inputMode: 'numeric' })}
      {campo('Complemento', e.complemento, end('complemento'), { placeholder: 'Loja, sala, shopping…' })}
      {campo('Bairro', e.bairro, end('bairro'), {}, daPlanilha('bairro', end('bairro')))}
      {campo('Cidade', e.cidade, end('cidade'), {}, daPlanilha('cidade', end('cidade')))}
      {campo('UF', e.uf, end('uf'), { maxLength: 2, autoCapitalize: 'characters' }, daPlanilha('uf', end('uf')))}

      <p className="nota-peq">O que você mudar fica salvo e <b>não é apagado</b> quando importar uma planilha nova.
        Com rua e número, o app localiza a loja no mapa e o Google Maps passa a abrir pelo endereço.</p>
      <button className="btn btn-bloco" onClick={salvar} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</button>
    </Folha>
  );
}
