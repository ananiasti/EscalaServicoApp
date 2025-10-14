import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';

import type { Enfermo as DBEnfermo } from '../../lib/db';
import {
  CORES_LITURGICAS,
  Escala,
  EscalaDia,
  Evento,
  Usuario,
  adicionarDiasEscala,
  atualizarDiaEscala,
  atualizarEscalaTitulo,
  criarEscala,
  diaLabel,
  excluirDia,
  initDb,
  listarDiasDaEscala,
  listarEnfermos,
  listarEscalas,
  listarEventos,
  listarUsuarios,
  obterUltimaEscala,
  pad2,
  rangeDatasISO,
  removerEscala,
  toggleUsuarioNoDia,
} from '../../lib/db';

type DiaGerado = { dataISO: string; evento: Evento };

/* ================= helpers de data ================= */
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfToday() { const d = new Date(); return startOfDay(d); }
function toISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function isoToDate(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function formatarData(d: Date) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }
function nextISO(iso: string) { const d = isoToDate(iso); d.setDate(d.getDate() + 1); return toISO(d); }

/* ================= calendário (marks) ================= */
function buildMarked(startISO: string | null, endISO: string | null) {
  if (!startISO) return {};
  if (!endISO) {
    return { [startISO]: { startingDay: true, endingDay: true, color: '#c7d2fe', textColor: '#111' } };
  }
  const obj: Record<string, any> = {};
  let cur = startISO;
  while (cur <= endISO) {
    obj[cur] = { color: '#c7d2fe', textColor: '#111' };
    cur = nextISO(cur);
  }
  obj[startISO] = { ...obj[startISO], startingDay: true, color: '#2563eb', textColor: '#fff' };
  obj[endISO]   = { ...obj[endISO],   endingDay: true,   color: '#2563eb', textColor: '#fff' };
  return obj;
}

/* ================= Tipos “dia” unificado (evento + enfermo) ================= */
type DiaEnfermoMem = {
  id: string | number;
  escala_id: number | null;
  data: string;             // YYYY-MM-DD
  hora: string | null;
  observacao: string | null;
  enfermo_id: number | undefined;
  usuarios: Usuario[];
  __tipo: 'ENFERMO';
};
type DiaItem = (EscalaDia & { usuarios: Usuario[] }) | DiaEnfermoMem;

export default function EscalaScreen() {
  // ====== Modo de edição ======
  const [editMode, setEditMode] = useState(false);

  // período
  const [inicio, setInicio] = useState<Date>(startOfToday());
  const [fim, setFim] = useState<Date>(startOfToday());
  const [periodoModal, setPeriodoModal] = useState(false);
  const [tmpInicioISO, setTmpInicioISO] = useState<string | null>(toISO(inicio));
  const [tmpFimISO,   setTmpFimISO]   = useState<string | null>(toISO(fim));
  const [periodoSelecionado, setPeriodoSelecionado] = useState(false);

  // título (form)
  const [tituloNovo, setTituloNovo] = useState('');

  // dados base
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [enfermosLista, setEnfermosLista] = useState<DBEnfermo[]>([]);

  // filtros
  const [tipoSel, setTipoSel] = useState<string>('Todos');
  const [localSel, setLocalSel] = useState<string>('Todos');

  // escalas
  const [escalaId, setEscalaId] = useState<number | null>(null);
  const [escalaTitulo, setEscalaTitulo] = useState<string | null>(null);
  const [diasEventos, setDiasEventos] = useState<(EscalaDia & { usuarios: Usuario[] })[]>([]);
  const [diasEnfermos, setDiasEnfermos] = useState<DiaEnfermoMem[]>([]);
  const [listaEscalas, setListaEscalas] = useState<Escala[]>([]);
  const [seletorAberto, setSeletorAberto] = useState(false);

  // editar dia
  const [modalVisivel, setModalVisivel] = useState(false);
  const [diaEditando, setDiaEditando] = useState<DiaItem | null>(null);
  const [observacaoDraft, setObservacaoDraft] = useState('');
  const [corDraft, setCorDraft] = useState<EscalaDia['cor']>(null);

  // busca usuários (no modal)
  const [usuarioQuery, setUsuarioQuery] = useState('');

  // estado de exclusão (seletor)
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // botão WhatsApp
  const [shareEnabled, setShareEnabled] = useState(false);

  // ===== ausências por USUÁRIO (mapa) =====
  type AusenciaItem = { inicio: string; fim: string; motivo?: string };
  const [ausenciasMap, setAusenciasMap] = useState<Record<number, AusenciaItem[]>>({});

  /* ====== Bootstrap ====== */
  useEffect(() => {
    (async () => {
      await initDb();
      const [evs, us, enf] = await Promise.all([
        listarEventos(),
        listarUsuarios(),
        (async (): Promise<DBEnfermo[]> => { try { return await listarEnfermos(); } catch { return []; } })(),
      ]);
      setEventos(evs);
      setUsuarios(us);
      setEnfermosLista(enf);

      await recarregarEscalas();
      const ultima = await obterUltimaEscala();

      setEditMode(false);
      setTituloNovo('');
      setPeriodoSelecionado(false);

      if (ultima) {
        await abrirEscala(ultima); // mostra a última
        setShareEnabled(true);
      } else {
        setShareEnabled(false);
      }
    })();
  }, []);

  // ================= NOVO: helper para recarregar eventos + usuários + enfermos =================
  async function recarregarBase() {
    const [evs, us, enf] = await Promise.all([
      listarEventos(),
      listarUsuarios(),
      (async (): Promise<DBEnfermo[]> => { try { return await listarEnfermos(); } catch { return []; } })(),
    ]);
    setEventos(evs);
    setUsuarios(us);
    setEnfermosLista(enf);
  }

  // ================= ALTERADO: recarrega base + ausências ao focar a tela =================
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await recarregarBase();    // garante usuários/eventos/enfermos atualizados
        await carregarAusencias(); // mantém ausências coerentes
      })();
    }, [])
  );

  // ================= ALTERADO: recarrega também ao voltar para foreground =================
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void recarregarBase();
        void carregarAusencias();
      }
    });
    return () => sub.remove();
  }, []);

  // ===== Carrega ausências de todos os usuários (sempre que chamado) =====
  async function carregarAusencias() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dbAny: any = require('../../lib/db');
    if (typeof dbAny.listarAusencias !== 'function') return;

    const users = usuarios.length ? usuarios : await listarUsuarios();

    const res: Array<[number, AusenciaItem[]]> = await Promise.all(
      users.map(async (u: { id: number; }): Promise<[number, AusenciaItem[]]> => {
        try {
          const ausList = await dbAny.listarAusencias(u.id);
          const norm: AusenciaItem[] = (ausList || []).map((a: any) => ({
            inicio: String(a.inicio).slice(0, 10),
            fim: String(a.fim).slice(0, 10),
            motivo: a.motivo ?? undefined,
          }));
          return [u.id, norm];
        } catch {
          return [u.id, [] as AusenciaItem[]];
        }
      })
    );

    const map: Record<number, AusenciaItem[]> = {};
    for (const [uid, list] of res) map[uid] = Array.isArray(list) ? [...list] : [];
    setAusenciasMap(map);
  }

  function isUsuarioAusenteNoDia(userId: number, dataISO: string) {
    const lista = ausenciasMap[userId];
    if (!lista || !lista.length) return false;
    const d = dataISO.slice(0,10);
    return lista.some(a => a.inicio <= d && d <= a.fim);
  }

  async function recarregarEscalas() {
    const todas = await listarEscalas();
    setListaEscalas(todas);
  }

  async function abrirEscala(e: Escala) {
    setEscalaId(e.id);
    setEscalaTitulo(e.titulo ?? null);
    setInicio(isoToDate(e.inicio));
    setFim(isoToDate(e.fim));
    const lista = await listarDiasDaEscala(e.id);
    setDiasEventos(lista);
    await carregarDiasEnfermosDB(e.id); // carrega enfermos se houver no DB
  }

  async function selecionarEscala(e: Escala) {
    await abrirEscala(e);
    setSeletorAberto(false);
    setShareEnabled(true);
  }

  // exclusão de escala (seletor)
  function confirmarExcluirEscala(e: Escala) {
    Alert.alert('Excluir escala', 'Tem certeza que deseja excluir esta escala?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => excluirEscala(e) },
    ]);
  }
  async function excluirEscala(e: Escala) {
    setDeletingId(e.id);
    try {
      await removerEscala(e.id);
      await recarregarEscalas();

      if (escalaId === e.id) {
        setEscalaId(null);
        setEscalaTitulo(null);
        setDiasEventos([]);
        setDiasEnfermos([]);
        setSeletorAberto(false);
        setShareEnabled(false);
      }
    } catch (err: any) {
      Alert.alert('Erro ao excluir', String(err?.message || err));
    } finally {
      setDeletingId(null);
    }
  }

  // calendário
  const markedDates = useMemo(() => buildMarked(tmpInicioISO, tmpFimISO), [tmpInicioISO, tmpFimISO]);

  function onDayPress(d: DateData) {
    const sel = d.dateString; // YYYY-MM-DD
    if (!tmpInicioISO || (tmpInicioISO && tmpFimISO)) {
      setTmpInicioISO(sel);
      setTmpFimISO(null);
    } else {
      if (sel < tmpInicioISO) {
        setTmpFimISO(tmpInicioISO);
        setTmpInicioISO(sel);
      } else {
        setTmpFimISO(sel);
      }
    }
  }

  function abrirPeriodoModal() {
    setTmpInicioISO(periodoSelecionado ? toISO(inicio) : null);
    setTmpFimISO(periodoSelecionado ? toISO(fim) : null);
    setPeriodoModal(true);
    setTituloNovo('');
  }

  function aplicarPeriodo() {
    if (!tmpInicioISO || !tmpFimISO) {
      Alert.alert('Selecione início e fim', 'Toque no início e no fim do período.');
      return;
    }
    setInicio(isoToDate(tmpInicioISO));
    setFim(isoToDate(tmpFimISO));
    setPeriodoSelecionado(true);
    setPeriodoModal(false);
  }

  // Cancelar criação
  async function cancelarGeracao() {
    setEditMode(false);
    setTituloNovo('');
    setPeriodoModal(false);
    setPeriodoSelecionado(false);
    setTmpInicioISO(null);
    setTmpFimISO(null);

    await recarregarEscalas();
    const ultima = await obterUltimaEscala();
    if (ultima) {
      await abrirEscala(ultima);
      setShareEnabled(true);
    } else {
      setEscalaId(null);
      setEscalaTitulo(null);
      setDiasEventos([]);
      setDiasEnfermos([]);
      setShareEnabled(false);
    }
  }

  // Botão principal
  async function onPressGerar() {
    if (!editMode) {
      // entrar em modo de criação
      setEditMode(true);
      setShareEnabled(false);
      setPeriodoSelecionado(false);
      setTmpInicioISO(null);
      setTmpFimISO(null);

      setDiasEventos([]);
      setDiasEnfermos([]);
      setEscalaId(null);
      setEscalaTitulo(null);
      setSeletorAberto(false);
      return;
    }
    await handleGerar();
  }

  // gerar nova escala (grava no DB)
  async function handleGerar() {
    if (!periodoSelecionado) {
      Alert.alert('Período obrigatório', 'Selecione o período para gerar a escala.');
      return;
    }
    if (fim < inicio) {
      Alert.alert('Período inválido', 'A data fim não pode ser menor que a data início.');
      return;
    }
    if (eventos.length === 0 && enfermosLista.length === 0) {
      Alert.alert('Nada para gerar', 'Cadastre eventos ou enfermos.');
      return;
    }

    const eventosFiltrados = eventos.filter(e =>
      (tipoSel === 'Todos' || e.tipo === tipoSel) &&
      (localSel === 'Todos' || e.local === localSel)
    );

    const inicioISO = toISO(inicio);
    const fimISO = toISO(fim);
    const datas = rangeDatasISO(inicioISO, fimISO);

    // 1) cria escala
    const id = await criarEscala(inicioISO, fimISO);
    setEscalaId(id);

    const titulo = tituloNovo.trim();
    if (titulo) {
      try { await atualizarEscalaTitulo(id, titulo); } catch {}
    }
    setEscalaTitulo(titulo || null);

    // 2) gera DIAS de EVENTOS
    const diasGerados: DiaGerado[] = [];
    for (const dataISO of datas) {
      const dow = isoToDate(dataISO).getDay(); // 0=Dom..6=Sáb
      for (const ev of eventosFiltrados) {
        if (ev.dia_semana === dow) diasGerados.push({ dataISO, evento: ev });
      }
    }

    diasGerados.sort((a, b) =>
      a.dataISO === b.dataISO
        ? (a.evento.hora ?? '23:59').localeCompare(b.evento.hora ?? '23:59')
        : a.dataISO.localeCompare(b.dataISO)
    );

    if (diasGerados.length > 0) {
      await adicionarDiasEscala(
        id,
        diasGerados.map((dg) => ({
          data: dg.dataISO,
          cor: null,
          observacao: null,
          evento_id: dg.evento.id,
          hora: dg.evento.hora ?? null,
        }))
      );
    }

    const lista = await listarDiasDaEscala(id);
    setDiasEventos(lista);

    // 3) gera DIAS de ENFERMOS — SOMENTE DOMINGOS
    await gerarDiasEnfermosSomenteDomingo(id, datas);

    // terminou a criação
    setEditMode(false);
    setShareEnabled(true);
  }

  /* ========= ENFERMOS ========= */

  function enfermoNome(id: number | undefined) {
    return (id == null) ? 'Enfermo' : (enfermosLista.find(e => e.id === id)?.nome ?? `Enfermo #${id}`);
  }
  function enfermoTelefone(id: number | undefined) {
    const enf: any = id == null ? null : enfermosLista.find(e => e.id === id);
    // aceita tanto telefone_responsavel quanto telefone_responsável
    return enf ? (enf.telefone_responsavel ?? enf['telefone_responsável'] ?? '') : '';
  }
  function isDiaEnfermo(d: DiaItem): d is DiaEnfermoMem {
    return (d as DiaEnfermoMem).__tipo === 'ENFERMO';
  }
  function titleFor(d: DiaItem) {
    return isDiaEnfermo(d) ? `Visita • ${enfermoNome(d.enfermo_id)}` : eventoLabel((d as any).evento_id);
  }

  async function gerarDiasEnfermosSomenteDomingo(escala_id: number, datas: string[]) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dbAny: any = require('../../lib/db');

    const datasDomingo = datas.filter((d) => isoToDate(d).getDay() === 0);

    if (datasDomingo.length === 0 || enfermosLista.length === 0) {
      setDiasEnfermos([]);
      return;
    }

    if (typeof dbAny.adicionarDiasEscalaEnfermos === 'function') {
      await dbAny.adicionarDiasEscalaEnfermos(
        escala_id,
        enfermosLista.flatMap((enf) =>
          datasDomingo.map((data) => ({
            data,
            hora: null,
            observacao: null,
            enfermo_id: enf.id,
          }))
        )
      );
      await carregarDiasEnfermosDB(escala_id);
      return;
    }

    // fallback em memória (IDs string “enf-<enfermoId>-<data>”)
    const mem: DiaEnfermoMem[] = [];
    for (const enf of enfermosLista) {
      for (const data of datasDomingo) {
        mem.push({
          id: `enf-${enf.id ?? 'x'}-${data}`,
          escala_id,
          data,
          hora: null,
          observacao: null,
          enfermo_id: enf.id,
          usuarios: [],
          __tipo: 'ENFERMO',
        });
      }
    }
    setDiasEnfermos(mem);
  }

  async function carregarDiasEnfermosDB(escala_id: number) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dbAny: any = require('../../lib/db');
    if (typeof dbAny.listarDiasDaEscalaEnfermos !== 'function') { setDiasEnfermos([]); return; }
    const lista = await dbAny.listarDiasDaEscalaEnfermos(escala_id);
    const norm: DiaEnfermoMem[] = (Array.isArray(lista) ? lista : []).map((d: any) => ({
      id: d.id,
      escala_id: d.escala_id ?? escala_id,
      data: String(d.data).slice(0,10),
      hora: d.hora ?? null,
      observacao: d.observacao ?? null,
      enfermo_id: d.enfermo_id,
      usuarios: Array.isArray(d.visitantes) ? d.visitantes : (Array.isArray(d.usuarios) ? d.usuarios : []),
      __tipo: 'ENFERMO',
    }));
    // mantém só domingos
    setDiasEnfermos(norm.filter(x => isoToDate(x.data).getDay() === 0));
  }

  /* ========= FILTROS (chips) ========= */
  const tiposDisponiveis = useMemo(
    () => ['Todos', ...Array.from(new Set(eventos.map(e => e.tipo))).sort((a, b) => a.localeCompare(b))],
    [eventos]
  );
  const locaisDisponiveis = useMemo(
    () => ['Todos', ...Array.from(new Set(eventos.map(e => e.local))).sort((a, b) => a.localeCompare(b))],
    [eventos]
  );

  // -------- Ordenação base (por data e hora) dos dias de EVENTOS --------
  const diasEventosOrdenados = useMemo(() => {
    const arr = diasEventos.slice();
    arr.sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      const ha = a.hora ?? '23:59';
      const hb = b.hora ?? '23:59';
      return ha.localeCompare(hb);
    });
    return arr;
  }, [diasEventos]);

  // -------- Ordenação ENFERMOS: data → nome (serão listados após eventos) --------
  const diasEnfermosOrdenados = useMemo(() => {
    const arr = diasEnfermos.slice();
    arr.sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      const nomeA = enfermoNome(a.enfermo_id);
      const nomeB = enfermoNome(b.enfermo_id);
      return nomeA.localeCompare(nomeB, 'pt-BR');
    });
    return arr;
  }, [diasEnfermos, enfermosLista]);

  // -------- Lista UNIFICADA: 1) todos os eventos 2) depois todos os enfermos --------
  const diasUnificados: DiaItem[] = useMemo(() => {
    const eventosFiltrados = diasEventosOrdenados.filter(d => {
      const ev = eventos.find(e => e.id === d.evento_id);
      if (!ev) return false;
      const okTipo  = (tipoSel === 'Todos' || ev.tipo  === tipoSel);
      const okLocal = (localSel === 'Todos' || ev.local === localSel);
      return okTipo && okLocal;
    });
    return [...eventosFiltrados, ...diasEnfermosOrdenados];
  }, [diasEventosOrdenados, diasEnfermosOrdenados, eventos, tipoSel, localSel]);

  // helpers
  function eventoLabel(evento_id: number | null) {
    if (!evento_id) return 'Evento';
    const ev = eventos.find(e => e.id === evento_id);
    return ev ? `${ev.tipo} • ${ev.local}` : `Evento #${evento_id}`;
  }
  function corHex(key: EscalaDia['cor']) {
    if (!key) return 'transparent';
    return CORES_LITURGICAS.find(c => c.key === key)?.hex ?? 'transparent';
  }

  // ====== RELATÓRIO (texto) ======
  function buildRelatorioTexto() {
    const linhas: string[] = [];

    const filtros: string[] = [];
    if (tipoSel !== 'Todos') filtros.push(`Tipo: ${tipoSel}`);
    if (localSel !== 'Todos') filtros.push(`Local: ${localSel}`);

    linhas.push(`*Escala* • ${formatarData(inicio)} a ${formatarData(fim)}`);
    if (filtros.length) linhas.push(`(${filtros.join(' • ')})`);
    linhas.push('');

    let dataAtual: string | null = null;

    for (const item of diasUnificados as any[]) {
      const d = isoToDate(item.data);
      const dataFmt = formatarData(d);

      if (dataFmt !== dataAtual) {
        if (dataAtual) linhas.push('');
        linhas.push(`*${diaLabel(d.getDay())} ${dataFmt}*`);
        dataAtual = dataFmt;
      }

      const nomeEvento = titleFor(item as DiaItem);
      const hora = item.hora ?? '--:--';

      // Mantém formato padrão. Se quiser, dá para incluir o telefone nos enfermos aqui também.
      linhas.push(`- ${hora} — ${nomeEvento}`);
    }

    if (linhas[linhas.length - 1] !== '') linhas.push('');
    linhas.push('-----------------------'); 
    linhas.push('_Gerado pelo App MESSE_');

    return linhas.join('\n');
  }

  async function compartilharRelatorio() {
    try {
      const texto = buildRelatorioTexto();
      const url = `whatsapp://send?text=${encodeURIComponent(texto)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) { await Linking.openURL(url); return; }
      await Share.share({ message: texto });
    } catch (e: any) {
      Alert.alert('Não foi possível compartilhar', String(e?.message || e));
    }
  }

  const isDisabled = !editMode;

  // -------- lista de usuários no modal (sem ausentes **no dia em edição**) --------
  const usuariosFiltradosOrdenados = useMemo(() => {
    const q = usuarioQuery.trim().toLowerCase();
    const dataRef = diaEditando ? (diaEditando as any).data?.slice(0,10) : '';

    const poolBase = usuarios.slice();
    const pool = dataRef
      ? poolBase.filter(u => !isUsuarioAusenteNoDia(u.id, dataRef))
      : poolBase;

    const base = q
      ? pool.filter(u => u.nome.toLowerCase().includes(q))
      : pool.slice();

    const selected = new Set<number>((diaEditando?.usuarios ?? []).map(u => u.id));

    base.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0;
      const bSel = selected.has(b.id) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel; // selecionados primeiro
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    return base;
  }, [usuarios, usuarioQuery, diaEditando, ausenciasMap]);

  /* ========= Handlers de edição/remoção/atribuição ========= */
  function abrirEditarDia(d: DiaItem) {
    setDiaEditando(d);
    setCorDraft(isDiaEnfermo(d) ? null : ((d as any).cor ?? null));
    setObservacaoDraft((d as any).observacao ?? '');
    setUsuarioQuery('');
    setModalVisivel(true);
    void carregarAusencias();
  }

  async function salvarEdicaoDia() {
    if (!diaEditando) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dbAny: any = require('../../lib/db');

    if (isDiaEnfermo(diaEditando)) {
      if (typeof dbAny.atualizarDiaEscalaEnfermo === 'function') {
        try {
          await dbAny.atualizarDiaEscalaEnfermo(diaEditando.id, { observacao: observacaoDraft });
          await carregarDiasEnfermosDB(diaEditando.escala_id ?? (escalaId as number));
        } catch {}
      } else {
        setDiasEnfermos(prev =>
          prev.map(it => it.id === diaEditando.id ? { ...it, observacao: observacaoDraft } : it)
        );
      }
    } else {
      await atualizarDiaEscala((diaEditando as EscalaDia).id, {
        cor: corDraft ?? null,
        observacao: observacaoDraft,
      });
      if (escalaId) {
        const lista = await listarDiasDaEscala(escalaId);
        setDiasEventos(lista);
      }
    }

    setModalVisivel(false);
  }

  async function removerDia(item: DiaItem) {
    if (editMode) return;

    Alert.alert('Excluir', 'Deseja excluir este dia?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const dbAny: any = require('../../lib/db');

          if (isDiaEnfermo(item)) {
            if (typeof dbAny.excluirDiaEnfermo === 'function') {
              try {
                await dbAny.excluirDiaEnfermo(item.id);
                await carregarDiasEnfermosDB(item.escala_id ?? (escalaId as number));
              } catch {}
            } else {
              setDiasEnfermos(prev => prev.filter(d => d.id !== item.id));
            }
          } else {
            await excluirDia((item as EscalaDia).id);
            if (escalaId) {
              const lista = await listarDiasDaEscala(escalaId);
              setDiasEventos(lista);
            }
          }
        },
      },
    ]);
  }

  async function toggleUsuarioDia(item: DiaItem, usuario_id: number) {
    if (editMode) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dbAny: any = require('../../lib/db');

    if (isDiaEnfermo(item)) {
      if (typeof dbAny.toggleUsuarioNoDiaEnfermo === 'function') {
        try {
          await dbAny.toggleUsuarioNoDiaEnfermo(item.id, usuario_id);
          await carregarDiasEnfermosDB(item.escala_id ?? (escalaId as number));
          if (diaEditando && diaEditando.id === item.id) {
            const atualizada = diasEnfermos.find(d => d.id === item.id);
            if (atualizada) setDiaEditando(atualizada);
          }
        } catch {}
      } else {
        setDiasEnfermos(prev =>
          prev.map(d => {
            if (d.id !== item.id) return d;
            const existe = d.usuarios?.some(u => u.id === usuario_id);
            const novo = existe
              ? d.usuarios.filter(u => u.id !== usuario_id)
              : [...(d.usuarios ?? []), (usuarios.find(u => u.id === usuario_id) as Usuario)];
            return { ...d, usuarios: novo };
          })
        );
        if (diaEditando && diaEditando.id === item.id) {
          const d = diasEnfermos.find(x => x.id === item.id);
          if (d) setDiaEditando({ ...d });
        }
      }
    } else {
      await toggleUsuarioNoDia((item as EscalaDia).id, usuario_id);
      if (escalaId) {
        const lista = await listarDiasDaEscala(escalaId);
        setDiasEventos(lista);
        if (diaEditando && diaEditando.id === (item as EscalaDia).id) {
          const atualizado = lista.find((d: { id: number; }) => d.id === (item as EscalaDia).id);
          if (atualizado) setDiaEditando(atualizado as DiaItem);
        }
      }
    }
  }

  // ====== UI ======
  return (
    <View style={styles.container}>
      {/* Cabeçalho / Período */}
      <View style={styles.card}>
        <Text style={styles.h1}>Escalas</Text>

        {/* Linha do período + gerar */}
        <View style={[styles.row, { alignItems: 'center' }]}>
          <Text style={styles.label}>Período</Text>

          <Pressable
            disabled={isDisabled}
            style={[
              styles.input, styles.periodoBtn, { flex: 1.3 },
              isDisabled && styles.inputDisabled
            ]}
            onPress={abrirPeriodoModal}
          >
            <Text
              style={[styles.periodoText, isDisabled && styles.textDisabled]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
            >
              {isDisabled
                ? '—'
                : (periodoSelecionado
                    ? `${formatarData(inicio)} a ${formatarData(fim)}`
                    : 'Selecione o período')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.btnPrimary, styles.btnGerar]}
            onPress={onPressGerar}
          >
            <Text style={styles.btnPrimaryText}>
              {isDisabled ? 'Gerar' : 'Confirmar'}
            </Text>
          </Pressable>
        </View>

        {/* Cancelar (mostra só quando estou criando) */}
        {editMode && (
          <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 6 }]}>
            <Pressable
              style={[styles.btn, styles.btnDangerOutline]}
              onPress={() => { void cancelarGeracao(); }}
            >
              <Text style={[styles.btnText, { color: '#dc2626' }]}>Cancelar</Text>
            </Pressable>
          </View>
        )}

        {/* Título (opcional) */}
        <View style={[styles.row, { alignItems: 'center' }]}>
          <Text style={styles.label}>Título</Text>
          <TextInput
            style={[styles.input, isDisabled && styles.inputDisabled]}
            placeholder={isDisabled ? '—' : 'Título da escala (opcional)'}
            value={tituloNovo}
            onChangeText={setTituloNovo}
            editable={!isDisabled}
          />
        </View>

        {/* Filtros (só para eventos) */}
        <View style={{ marginTop: 8 }}>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.chipsWrap}>
            {tiposDisponiveis.map(t => (
              <Pressable
                key={t}
                onPress={() => setTipoSel(t)}
                style={[
                  styles.chip,
                  tipoSel === t && styles.chipAtivo,
                ]}
              >
                <Text style={[
                  styles.chipTexto,
                  tipoSel === t && styles.chipTextoAtivo,
                ]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Local</Text>
          <View style={styles.chipsWrap}>
            {locaisDisponiveis.map(l => (
              <Pressable
                key={l}
                onPress={() => setLocalSel(l)}
                style={[
                  styles.chip,
                  localSel === l && styles.chipAtivo,
                ]}
              >
                <Text style={[
                  styles.chipTexto,
                  localSel === l && styles.chipTextoAtivo,
                ]}>
                  {l}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ações topo */}
        <View style={styles.headerActionsTop}>
          <Pressable
            disabled={!shareEnabled || editMode} // não compartilhar durante PRÉVIA
            style={[
              styles.btnShareIcon,
              (!shareEnabled || editMode) && { backgroundColor: '#9ca3af' }
            ]}
            onPress={compartilharRelatorio}
            accessibilityLabel="Compartilhar no WhatsApp"
          >
            <FontAwesome name="whatsapp" size={18} color="#fff" />
          </Pressable>

          <Pressable
            disabled={editMode} // não abre seletor durante a geração
            style={[styles.btnSelect, editMode && { backgroundColor: '#9ca3af' }]}
            onPress={async () => { await recarregarEscalas(); setSeletorAberto(true); }}
          >
            <Text style={styles.btnSelectText}>Selecionar escalas</Text>
          </Pressable>
        </View>

        {/* descrição da escala */}
        {!!escalaId ? (
          <Text style={[styles.muted, styles.escalaInfo]} numberOfLines={1} ellipsizeMode="tail">
            {(escalaTitulo?.trim() ? escalaTitulo : `Escala #${escalaId}`)} — {`${formatarData(inicio)} a ${formatarData(fim)}`}
          </Text>
        ) : (
          <Text style={[styles.muted, styles.escalaInfo]} numberOfLines={1}>
            {editMode
              ? (periodoSelecionado ? 'Prévia do período selecionado' : 'Selecione o período para visualizar a prévia')
              : 'Nenhuma escala selecionada'}
          </Text>
        )}
      </View>

      {/* Lista UNIFICADA: eventos primeiro, depois enfermos */}
      <FlatList
        data={diasUnificados}
        keyExtractor={(item: any) =>
          String(item.id ?? `${item.data}-${isDiaEnfermo(item) ? `enf-${(item as DiaEnfermoMem).enfermo_id}` : (item as any).evento_id}`)
        }
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => {
          const d = isoToDate(item.data);
          const dow = d.getDay();

          // conta apenas operários PRESENTES
          const presentes = (item.usuarios || []).filter((u: Usuario) => !isUsuarioAusenteNoDia(u.id, item.data.slice(0,10)));
          const assignedCount = presentes.length;

          const hasColor = !isDiaEnfermo(item) && !!(item as any).cor;

          return (
            <View style={styles.item}>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  {/* ícone: X vermelho se sem operários PRESENTES; senão bolinha (verde p/ enfermo) */}
                  {assignedCount === 0 ? (
                    <View style={styles.statusBox}>
                      <MaterialIcons name="person-off" size={16} color="#dc2626" />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.colorDot,
                        {
                          backgroundColor: isDiaEnfermo(item) ? '#16a34a' : corHex((item as any).cor ?? null),
                          borderWidth: hasColor ? 1.5 : 0,
                        },
                      ]}
                    />
                  )}

                  <Text style={styles.itemTitle}>{titleFor(item)}</Text>
                </View>

                {/* Subtítulo:
                    - Eventos: dia • data • hora
                    - Enfermos: Telefone do responsável */}
                {isDiaEnfermo(item) ? (
                  <Text style={styles.itemSub}>
                    {enfermoTelefone((item as any).enfermo_id)
                      ? `Tel.: ${enfermoTelefone((item as any).enfermo_id)}`
                      : 'Tel.: —'}
                  </Text>
                ) : (
                  <Text style={styles.itemSub}>
                    {diaLabel(dow)} • {formatarData(d)}{(item as any).hora ? ` • ${(item as any).hora}` : ''}
                  </Text>
                )}

                {assignedCount > 0 && (
                  <Text style={styles.itemSub}>
                    <Text style={styles.bold}>Operários:</Text> {presentes.map((u: Usuario) => u.nome).join(', ')}
                  </Text>
                )}

                {(item as any).observacao ? (
                  <Text style={styles.itemSub}>
                    <Text style={styles.bold}>Obs:</Text> {(item as any).observacao}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <Pressable style={[styles.btn, editMode && styles.inputDisabled]} disabled={editMode} onPress={() => abrirEditarDia(item as DiaItem)}>
                  <Text style={styles.btnText}>Editar</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnDanger, editMode && { opacity: 0.5 }]} disabled={editMode} onPress={() => removerDia(item as DiaItem)}>
                  <Text style={[styles.btnText, { color: '#fff' }]}>Excluir</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#666', marginTop: 24 }}>
            {editMode
              ? (periodoSelecionado ? 'Nada cai no período com os filtros atuais.' : 'Selecione o período para visualizar a prévia.')
              : 'Sem itens para os filtros selecionados.'}
          </Text>
        }
      />

      {/* MODAL: selecionar período */}
      <Modal visible={periodoModal} transparent animationType="fade" onRequestClose={() => setPeriodoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={styles.backdrop} />
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Selecionar período</Text>
            <Calendar onDayPress={onDayPress} markedDates={markedDates} markingType="period" />
            <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 12, gap: 8 }]}>
              <Pressable style={styles.btn} onPress={() => setPeriodoModal(false)}>
                <Text style={styles.btnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={aplicarPeriodo}>
                <Text style={styles.btnPrimaryText}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: editar dia */}
      <Modal visible={modalVisivel} transparent animationType="fade" onRequestClose={() => setModalVisivel(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={styles.backdrop} />
          <View style={styles.modalCard}>
            <Text style={styles.h2}>
              {diaEditando
                ? `${titleFor(diaEditando)} • ${diaLabel(isoToDate((diaEditando as any).data).getDay())} • ${formatarData(isoToDate((diaEditando as any).data))}${(diaEditando as any).hora ? ' • ' + (diaEditando as any).hora : ''}`
                : 'Editar dia'}
            </Text>

            {/* cores (somente para EVENTOS normais) */}
            {!diaEditando || isDiaEnfermo(diaEditando) ? null : (
              <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>
                {CORES_LITURGICAS.map(c => {
                  const selected = c.key === corDraft;
                  return (
                    <Pressable
                      key={c.key ?? 'null'}
                      onPress={() => setCorDraft(c.key)}
                      style={[
                        styles.chip,
                        { backgroundColor: c.hex, borderColor: selected ? '#111' : '#999', borderWidth: selected ? 2 : 1 }
                      ]}
                    >
                      <Text style={{ fontWeight: '600' }}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* observação */}
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.label, styles.labelAuto]} numberOfLines={1}>
                Observação
              </Text>
              <TextInput
                value={observacaoDraft}
                onChangeText={setObservacaoDraft}
                style={[styles.input, { minHeight: 50 }]}
                placeholder="Digite algo (opcional)"
                multiline
              />
            </View>

            {/* busca de usuários */}
            <Text style={[styles.label, styles.labelAuto, { marginTop: 12 }]} numberOfLines={1}>
              Atribuir Operário
            </Text>
            <TextInput
              placeholder="Pesquisar Operário..."
              value={usuarioQuery}
              onChangeText={setUsuarioQuery}
              style={[styles.input, { marginBottom: 6 }]}
            />

            {/* lista de usuários (sem ausentes no dia em edição) */}
            <View style={{ maxHeight: 260, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, overflow: 'hidden' }}>
              <FlatList
                data={usuariosFiltradosOrdenados}
                keyExtractor={(u) => String(u.id)}
                renderItem={({ item: u }) => {
                  const selected = !!diaEditando?.usuarios?.find(x => x.id === u.id);
                  return (
                    <TouchableOpacity
                      onPress={() => diaEditando && toggleUsuarioDia(diaEditando as DiaItem, u.id)}
                      style={styles.userRow}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxOn]} />
                      <Text>{u.nome}</Text>
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
                showsVerticalScrollIndicator
              />
            </View>

            {/* ações */}
            <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 12, gap: 8 }]}>
              <Pressable style={styles.btn} onPress={() => setModalVisivel(false)}>
                <Text style={styles.btnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={salvarEdicaoDia}>
                <Text style={styles.btnPrimaryText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: seletor de escalas */}
      <Modal visible={seletorAberto} transparent animationType="fade" onRequestClose={() => setSeletorAberto(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={styles.backdrop} />
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.h2}>Selecionar escala</Text>

            <FlatList
              data={listaEscalas}
              keyExtractor={(e) => String(e.id)}
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingVertical: 6 }}
              showsVerticalScrollIndicator
              renderItem={({ item: e }) => (
                <View style={styles.escalaRow}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => selecionarEscala(e)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.escalaRowTitle}>{e.titulo?.trim() ? e.titulo : `Escala #${e.id}`}</Text>
                    <Text style={styles.escalaRowSub}>
                      {formatarData(isoToDate(e.inicio))} a {formatarData(isoToDate(e.fim))}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.rowAcao}>
                    <Pressable
                      style={[styles.btnMini, styles.btnMiniDanger]}
                      onPress={() => confirmarExcluirEscala(e)}
                      disabled={deletingId === e.id}
                    >
                      <Text style={[styles.btnMiniText, { color: '#fff' }]}>
                        {deletingId === e.id ? 'Excluindo…' : 'Excluir'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: '#666', paddingVertical: 8 }}>
                  Nenhuma escala salva ainda.
                </Text>
              }
            />

            <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 8 }]}>
              <Pressable
                style={styles.btn}
                onPress={() => setSeletorAberto(false)}
                disabled={deletingId !== null}
              >
                <Text style={styles.btnText}>Fechar</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ================= estilos ================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  card: { margin: 16, padding: 12, borderRadius: 12, backgroundColor: '#fafafa', gap: 10, borderWidth: 1, borderColor: '#eee' },
  h1: { fontSize: 20, fontWeight: '700' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 64, fontWeight: '600' },
  labelAuto: { width: 'auto', marginBottom: 4 },

  input: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fff' },
  inputDisabled: { backgroundColor: '#f1f1f1' },
  textDisabled: { color: '#9ca3af' },

  periodoBtn: { minHeight: 44, justifyContent: 'center' },
  periodoText: { flexShrink: 1, fontSize: 14 },

  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#f5f5f5' },
  btnText: { fontWeight: '700' },
  btnPrimary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2563eb' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnGerar: { flexShrink: 0, paddingHorizontal: 10 },

  btnDanger: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  btnDangerOutline: { backgroundColor: '#fff', borderColor: '#dc2626' },

  headerActionsTop: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  btnShareIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSelect: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#6b7280' },
  btnSelectText: { color: '#fff', fontWeight: '800' },

  muted: { color: '#666' },

  escalaInfo: {
    marginTop: 2,
    flexShrink: 1,
    maxWidth: '100%',
  },

  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorDot: { width: 12, height: 12, borderRadius: 999 },

  // Ícone de status (X vermelho quando sem operários PRESENTES)
  statusBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemTitle: { fontSize: 16, fontWeight: '800' },
  itemSub: { color: '#333', marginTop: 2 },
  itemSubMuted: { color: '#777', marginTop: 2, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8 },

  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 1 },
  modalCard: { width: '92%', borderRadius: 16, backgroundColor: '#fff', padding: 14, zIndex: 2 },

  chip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  chipAtivo: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipTexto: { fontSize: 14, color: '#333' },
  chipTextoAtivo: { color: '#fff', fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#fff' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#999' },
  checkboxOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },

  bold: { fontWeight: '700' },

  // seletor de escalas
  escalaRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center', gap: 10 },
  escalaRowTitle: { fontSize: 15, fontWeight: '700' },
  escalaRowSub: { color: '#555' },
  rowAcao: { flexDirection: 'row', gap: 6, marginLeft: 8 },

  btnMini: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
  btnMiniText: { fontWeight: '800' },
  btnMiniDanger: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
});
