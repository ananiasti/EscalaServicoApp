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
function nextISO(iso: string) { const d = isoToDate(iso); d.setDate(d.getDate() + 1); return toISO(d); }

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

  // filtros
  const [tipoSel, setTipoSel] = useState<string>('Todos');
  const [localSel, setLocalSel] = useState<string>('Todos');

  // escalas
  const [escalaId, setEscalaId] = useState<number | null>(null);
  const [escalaTitulo, setEscalaTitulo] = useState<string | null>(null);
  const [dias, setDias] = useState<(EscalaDia & { usuarios: Usuario[] })[]>([]);
  const [listaEscalas, setListaEscalas] = useState<Escala[]>([]);
  const [seletorAberto, setSeletorAberto] = useState(false);

  // editar dia
  const [modalVisivel, setModalVisivel] = useState(false);
  const [diaEditando, setDiaEditando] = useState<(EscalaDia & { usuarios: Usuario[] }) | null>(null);
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
      const [evs, us] = await Promise.all([listarEventos(), listarUsuarios()]);
      setEventos(evs);
      setUsuarios(us);

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

  // ================= NOVO: helper para recarregar eventos + usuários =================
  async function recarregarBase() {
    const [evs, us] = await Promise.all([listarEventos(), listarUsuarios()]);
    setEventos(evs);
    setUsuarios(us);
  }

  // ================= ALTERADO: recarrega base + ausências ao focar a tela =================
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await recarregarBase();    // garante usuários/eventos atualizados ao voltar do cadastro
        await carregarAusencias(); // mantém ausências coerentes com a base nova
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
      users.map(async (u): Promise<[number, AusenciaItem[]]> => {
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
    setDias(lista);
  }

  async function selecionarEscala(e: Escala) {
    await abrirEscala(e);
    setSeletorAberto(false);
    setShareEnabled(true);
  }

  // chips disponíveis
  const tiposDisponiveis = useMemo(
    () => ['Todos', ...Array.from(new Set(eventos.map(e => e.tipo))).sort((a, b) => a.localeCompare(b))],
    [eventos]
  );
  const locaisDisponiveis = useMemo(
    () => ['Todos', ...Array.from(new Set(eventos.map(e => e.local))).sort((a, b) => a.localeCompare(b))],
    [eventos]
  );

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
      setDias([]);
      setShareEnabled(false);
    }
  }

  // Botão principal
  async function onPressGerar() {
    if (!editMode) {
      // entrar em modo de criação: limpar lista real e mostrar PRÉVIA após escolher período
      setEditMode(true);
      setShareEnabled(false);
      setPeriodoSelecionado(false);
      setTmpInicioISO(null);
      setTmpFimISO(null);

      setDias([]); // limpa lista do DB da tela
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
    if (eventos.length === 0) {
      Alert.alert('Sem eventos', 'Cadastre eventos antes de gerar a escala.');
      return;
    }

    const eventosFiltrados = eventos.filter(e =>
      (tipoSel === 'Todos' || e.tipo === tipoSel) &&
      (localSel === 'Todos' || e.local === localSel)
    );
    if (eventosFiltrados.length === 0) {
      Alert.alert('Nenhum evento após filtro', 'Ajuste os filtros de Tipo/Local.');
      return;
    }

    const inicioISO = toISO(inicio);
    const fimISO = toISO(fim);

    const id = await criarEscala(inicioISO, fimISO);
    setEscalaId(id);

    const titulo = tituloNovo.trim();
    if (titulo) {
      try { await atualizarEscalaTitulo(id, titulo); } catch {}
    }
    setEscalaTitulo(titulo || null);

    const datas = rangeDatasISO(inicioISO, fimISO);
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

    if (diasGerados.length === 0) {
      Alert.alert('Nada a gerar', 'Nenhum evento cai entre as datas selecionadas.');
      return;
    }

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

    await recarregarEscalas();
    const lista = await listarDiasDaEscala(id);
    setDias(lista);

    // terminou a criação: exibe lista real
    setEditMode(false);
    setShareEnabled(true);
  }

  function abrirEditarDia(dia: EscalaDia & { usuarios: Usuario[] }) {
    if (editMode) return; // não edita durante PRÉVIA
    setDiaEditando(dia);
    setCorDraft(dia.cor ?? null);
    setObservacaoDraft(dia.observacao ?? '');
    setUsuarioQuery('');
    setModalVisivel(true);
    // carrega ausências atualizadas para esse dia
    void carregarAusencias();
  }

  async function salvarEdicaoDia() {
    if (!diaEditando) return;
    await atualizarDiaEscala(diaEditando.id, { cor: corDraft ?? null, observacao: observacaoDraft });
    const lista = await listarDiasDaEscala(diaEditando.escala_id);
    setDias(lista);
    setModalVisivel(false);
  }

  async function removerDia(item: EscalaDia) {
    if (editMode) return; // não remove durante PRÉVIA
    Alert.alert('Excluir', 'Deseja excluir este dia da escala?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await excluirDia(item.id);
          if (escalaId) {
            const lista = await listarDiasDaEscala(escalaId);
            setDias(lista);
          }
        },
      },
    ]);
  }

  async function toggleUsuario(dia_id: number, usuario_id: number) {
    if (editMode) return; // não altera durante PRÉVIA
    await toggleUsuarioNoDia(dia_id, usuario_id);
    if (escalaId) {
      const lista = await listarDiasDaEscala(escalaId);
      setDias(lista);
      if (diaEditando) {
        const atualizado = lista.find((d) => d.id === diaEditando.id) || diaEditando;
        setDiaEditando(atualizado);
      }
    }
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
        setDias([]);
        setSeletorAberto(false);
        setShareEnabled(false);
      }
    } catch (err: any) {
      Alert.alert('Erro ao excluir', String(err?.message || err));
    } finally {
      setDeletingId(null);
    }
  }

  // -------- Ordenação base (por data e hora) dos dias reais (DB) --------
  const diasOrdenados = useMemo(() => {
    const arr = dias.slice();
    arr.sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      const ha = a.hora ?? '23:59';
      const hb = b.hora ?? '23:59';
      return ha.localeCompare(hb);
    });
    return arr;
  }, [dias]);

  // -------- PRÉVIA durante geração (não salva em DB) --------
  type DiaPreview = {
    id?: number;
    data: string;
    hora: string | null;
    evento_id: number | null;
    cor: null;
    observacao: null;
    usuarios: Usuario[];
  };

  const diasPreviewVisiveis: DiaPreview[] = useMemo(() => {
    if (!editMode || !periodoSelecionado) return [];
    const eventosFiltrados = eventos.filter(e =>
      (tipoSel === 'Todos' || e.tipo === tipoSel) &&
      (localSel === 'Todos' || e.local === localSel)
    );
    if (eventosFiltrados.length === 0) return [];

    const inicioISO = toISO(inicio);
    const fimISO = toISO(fim);
    const datas = rangeDatasISO(inicioISO, fimISO);

    const arr: DiaPreview[] = [];
    for (const dataISO of datas) {
      const dow = isoToDate(dataISO).getDay();
      for (const ev of eventosFiltrados) {
        if (ev.dia_semana === dow) {
          arr.push({
            data: dataISO,
            hora: ev.hora ?? null,
            evento_id: ev.id,
            cor: null,
            observacao: null,
            usuarios: [],
          });
        }
      }
    }
    arr.sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      const ha = a.hora ?? '23:59';
      const hb = b.hora ?? '23:59';
      return ha.localeCompare(hb);
    });
    return arr;
  }, [editMode, periodoSelecionado, inicio, fim, eventos, tipoSel, localSel]);

  // -------- Lista VISÍVEL --------
  const diasVisiveis = useMemo(() => {
    const base = editMode
      ? diasPreviewVisiveis.slice()
      : diasOrdenados
          .filter(d => {
            const ev = eventos.find(e => e.id === d.evento_id);
            if (!ev) return false;
            const okTipo  = (tipoSel === 'Todos' || ev.tipo  === tipoSel);
            const okLocal = (localSel === 'Todos' || ev.local === localSel);
            return okTipo && okLocal;
          })
          .slice();

    // Ordena colocando primeiro os que têm operários PRESENTES (conta só quem não está ausente)
    base.sort((a: any, b: any) => {
      const dataA = a.data?.slice(0,10);
      const dataB = b.data?.slice(0,10);
      const ac = editMode ? 0 : ((a.usuarios || []).filter((u: Usuario) => !isUsuarioAusenteNoDia(u.id, dataA)).length);
      const bc = editMode ? 0 : ((b.usuarios || []).filter((u: Usuario) => !isUsuarioAusenteNoDia(u.id, dataB)).length);
      if (ac !== bc) return bc - ac;
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      const ha = a.hora ?? '23:59';
      const hb = b.hora ?? '23:59';
      return ha.localeCompare(hb);
    });

    return base;
  }, [editMode, diasPreviewVisiveis, diasOrdenados, eventos, tipoSel, localSel, ausenciasMap]);

  // -------- lista de usuários no modal (sem ausentes **no dia em edição**) --------
  const usuariosFiltradosOrdenados = useMemo(() => {
    const q = usuarioQuery.trim().toLowerCase();
    const dataRef = diaEditando?.data?.slice(0,10) ?? '';

    const poolBase = usuarios.slice();
    const pool = dataRef
      ? poolBase.filter(u => !isUsuarioAusenteNoDia(u.id, dataRef))
      : poolBase;

    const base = q
      ? pool.filter(u => u.nome.toLowerCase().includes(q))
      : pool.slice();

    const selected = new Set<number>(diaEditando?.usuarios?.map(u => u.id) ?? []);

    base.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0;
      const bSel = selected.has(b.id) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel; // selecionados primeiro
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    return base;
  }, [usuarios, usuarioQuery, diaEditando?.usuarios, diaEditando?.data, ausenciasMap]);

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

    for (const item of diasVisiveis as any[]) {
      const d = isoToDate(item.data);
      const dataFmt = formatarData(d);

      if (dataFmt !== dataAtual) {
        if (dataAtual) linhas.push('');
        linhas.push(`*${diaLabel(d.getDay())} ${dataFmt}*`);
        dataAtual = dataFmt;
      }

      const nomeEvento = eventoLabel(item.evento_id);
      const hora = item.hora ?? '--:--';
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

        {/* Filtros */}
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

      {/* Lista (PRÉVIA quando gerando; DB quando não) */}
      <FlatList
        data={diasVisiveis}
        keyExtractor={(item: any) => String(item.id ?? `${item.data}-${item.evento_id}`)}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => {
          const d = isoToDate(item.data);
          const dow = d.getDay();

          // conta apenas operários PRESENTES (suporta múltiplos períodos de ausência)
          const dataRef = item.data?.slice(0,10);
          const presentes = editMode
            ? [] // na prévia não há atribuídos
            : ((item as any).usuarios || []).filter((u: Usuario) => !isUsuarioAusenteNoDia(u.id, dataRef));
          const assignedCount = presentes.length;

          const hasColor = !!(item as any).cor;

          return (
            <View style={styles.item}>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  {/* ícone: X vermelho se sem operários PRESENTES; senão bolinha da cor litúrgica */}
                 {assignedCount === 0 ? (
                   <View style={styles.statusBox}>
                     <MaterialIcons name="person-off" size={16} color="#dc2626" />
                      </View>
                         ) : (
                    <View
                      style={[
                        styles.colorDot,
                        {
                          backgroundColor: corHex((item as any).cor ?? null),
                          borderWidth: hasColor ? 1.5 : 0,
                        },
                      ]}
                    />
                 )}


                  <Text style={styles.itemTitle}>{eventoLabel(item.evento_id)}</Text>
                </View>

                <Text style={styles.itemSub}>
                  {diaLabel(dow)} • {formatarData(d)}{item.hora ? ` • ${item.hora}` : ''}
                </Text>

                {!editMode && assignedCount > 0 ? (
                  <Text style={styles.itemSub}>
                    <Text style={styles.bold}>Operários:</Text> {presentes.map((u: Usuario) => u.nome).join(', ')}
                  </Text>
                ) : null}

                {!editMode && (item as any).observacao ? (
                  <Text style={styles.itemSub}>
                    <Text style={styles.bold}>Obs:</Text> {(item as any).observacao}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <Pressable style={[styles.btn, editMode && styles.inputDisabled]} disabled={editMode} onPress={() => abrirEditarDia(item as any)}>
                  <Text style={styles.btnText}>Editar</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnDanger, editMode && { opacity: 0.5 }]} disabled={editMode} onPress={() => removerDia(item as any)}>
                  <Text style={[styles.btnText, { color: '#fff' }]}>Excluir</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#666', marginTop: 24 }}>
            {editMode
              ? (periodoSelecionado ? 'Nenhum evento cai no período com os filtros atuais.' : 'Selecione o período para visualizar a prévia.')
              : 'Nenhum dia para os filtros selecionados.'}
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
                ? `${eventoLabel(diaEditando.evento_id)} • ${diaLabel(isoToDate(diaEditando.data).getDay())} • ${formatarData(isoToDate(diaEditando.data))}${diaEditando.hora ? ' • ' + diaEditando.hora : ''}`
                : 'Editar dia'}
            </Text>

            {/* cores */}
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
                      onPress={() => diaEditando && toggleUsuario(diaEditando.id, u.id)}
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
