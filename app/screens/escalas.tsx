// app/screens/escala.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';

import {
  CORES_LITURGICAS,
  EscalaDia,
  Evento,
  Usuario,
  adicionarDiasEscala,
  atualizarDiaEscala,
  criarEscala,
  diaLabel,
  excluirDia,
  initDb,
  listarDiasDaEscala,
  listarEventos,
  listarUsuarios,
  pad2,
  rangeDatasISO,
  toggleUsuarioNoDia,
} from '../../lib/db';

type DiaGerado = { dataISO: string; evento: Evento };

export default function EscalaScreen() {
  // período
  const [inicio, setInicio] = useState<Date>(startOfToday());
  const [fim, setFim] = useState<Date>(startOfToday());
  const [periodoModal, setPeriodoModal] = useState(false);
  const [tmpInicioISO, setTmpInicioISO] = useState<string | null>(toISO(inicio));
  const [tmpFimISO, setTmpFimISO] = useState<string | null>(toISO(fim));

  // dados base
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // filtros
  const [tipoSel, setTipoSel] = useState<string>('Todos');
  const [localSel, setLocalSel] = useState<string>('Todos');

  // escala corrente
  const [escalaId, setEscalaId] = useState<number | null>(null);
  const [dias, setDias] = useState<(EscalaDia & { usuarios: Usuario[] })[]>([]);

  // modal de edição por dia
  const [modalVisivel, setModalVisivel] = useState(false);
  const [diaEditando, setDiaEditando] = useState<(EscalaDia & { usuarios: Usuario[] }) | null>(null);
  const [observacaoDraft, setObservacaoDraft] = useState('');
  const [corDraft, setCorDraft] = useState<EscalaDia['cor']>(null); // sem cor por padrão

  // busca de usuários no modal
  const [usuarioQuery, setUsuarioQuery] = useState('');

  useEffect(() => {
    (async () => {
      await initDb();
      const [evs, us] = await Promise.all([listarEventos(), listarUsuarios()]);
      setEventos(evs);
      setUsuarios(us);
    })();
  }, []);

  // opções de filtro (dinâmicas a partir dos eventos)
  const tiposDisponiveis = useMemo(
    () => ['Todos', ...Array.from(new Set(eventos.map(e => e.tipo))).sort((a, b) => a.localeCompare(b))],
    [eventos]
  );
  const locaisDisponiveis = useMemo(
    () => ['Todos', ...Array.from(new Set(eventos.map(e => e.local))).sort((a, b) => a.localeCompare(b))],
    [eventos]
  );

  // calendário (range)
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
    setTmpInicioISO(toISO(inicio));
    setTmpFimISO(toISO(fim));
    setPeriodoModal(true);
  }

  function aplicarPeriodo() {
    if (!tmpInicioISO || !tmpFimISO) {
      Alert.alert('Selecione início e fim', 'Toque no início e no fim do período.');
      return;
    }
    setInicio(isoToDate(tmpInicioISO));
    setFim(isoToDate(tmpFimISO));
    setPeriodoModal(false);
  }

  // geração da escala
  async function handleGerar() {
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
        cor: null,                // começa SEM cor
        observacao: null,
        evento_id: dg.evento.id,
        hora: dg.evento.hora ?? null,
      }))
    );

    const lista = await listarDiasDaEscala(id);
    setDias(lista);
  }

  function abrirEditarDia(dia: EscalaDia & { usuarios: Usuario[] }) {
    setDiaEditando(dia);
    setCorDraft(dia.cor ?? null);
    setObservacaoDraft(dia.observacao ?? '');
    setUsuarioQuery('');
    setModalVisivel(true);
  }

  async function salvarEdicaoDia() {
    if (!diaEditando) return;
    await atualizarDiaEscala(diaEditando.id, { cor: corDraft ?? null, observacao: observacaoDraft });
    const lista = await listarDiasDaEscala(diaEditando.escala_id);
    setDias(lista);
    setModalVisivel(false);
  }

  async function removerDia(item: EscalaDia) {
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

  const periodoStr = `${formatarData(inicio)} a ${formatarData(fim)}`;

  // ordenação: com informação primeiro
  const diasOrdenados = useMemo(() => {
    const hasInfo = (d: EscalaDia & { usuarios: Usuario[] }) =>
      (d.cor ? 1 : 0) + (d.usuarios.length > 0 ? 1 : 0) + (d.observacao?.trim() ? 1 : 0);

    const arr = dias.slice();
    arr.sort((a, b) => {
      const ai = hasInfo(a);
      const bi = hasInfo(b);
      if (ai !== bi) return bi - ai; // mais info primeiro
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      const ha = a.hora ?? '23:59';
      const hb = b.hora ?? '23:59';
      return ha.localeCompare(hb);
    });
    return arr;
  }, [dias]);

  // lista de usuários no modal
  const usuariosFiltradosOrdenados = useMemo(() => {
    const q = usuarioQuery.trim().toLowerCase();
    const base = q
      ? usuarios.filter(u => u.nome.toLowerCase().includes(q))
      : usuarios.slice();

    const selected = new Set<number>(diaEditando?.usuarios.map(u => u.id) ?? []);
    base.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0;
      const bSel = selected.has(b.id) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel; // selecionados primeiro
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
    return base;
  }, [usuarios, usuarioQuery, diaEditando?.usuarios]);

  // helpers
  function eventoLabel(evento_id: number | null) {
    if (!evento_id) return 'Evento';
    const ev = eventos.find(e => e.id === evento_id);
    return ev ? `${ev.tipo} • ${ev.local}` : `Evento #${evento_id}`;
  }
  function corHex(key: EscalaDia['cor']) {
    if (!key) return 'transparent'; // sem cor -> transparente
    return CORES_LITURGICAS.find(c => c.key === key)?.hex ?? 'transparent';
  }

  return (
    <View style={styles.container}>
      {/* Cabeçalho / Período */}
      <View style={styles.card}>
        <Text style={styles.h1}>Criar Escala</Text>

        <View style={[styles.row, { alignItems: 'center' }]}>
          <Text style={styles.label}>Período</Text>

          <Pressable
            style={[styles.input, styles.periodoBtn, { flex: 1.3 }]} // mais espaço para o período
            onPress={abrirPeriodoModal}
          >
            <Text style={styles.periodoText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9}>
              {periodoStr}
            </Text>
          </Pressable>

          <Pressable style={[styles.btnPrimary, styles.btnGerar]} onPress={handleGerar}>
            <Text style={styles.btnPrimaryText}>Gerar escala</Text>
          </Pressable>
        </View>

        {/* Filtros */}
        <View style={{ marginTop: 8 }}>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.chipsWrap}>
            {tiposDisponiveis.map(t => (
              <Pressable
                key={t}
                onPress={() => setTipoSel(t)}
                style={[styles.chip, tipoSel === t && styles.chipAtivo]}
              >
                <Text style={[styles.chipTexto, tipoSel === t && styles.chipTextoAtivo]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Local</Text>
          <View style={styles.chipsWrap}>
            {locaisDisponiveis.map(l => (
              <Pressable
                key={l}
                onPress={() => setLocalSel(l)}
                style={[styles.chip, localSel === l && styles.chipAtivo]}
              >
                <Text style={[styles.chipTexto, localSel === l && styles.chipTextoAtivo]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {!!escalaId && <Text style={styles.muted}>Escala #{escalaId} — {periodoStr}</Text>}
      </View>

      {/* Lista de dias da escala (info primeiro) */}
      <FlatList
        data={diasOrdenados}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => {
          const d = isoToDate(item.data);
          const dow = d.getDay();
          const hasColor = !!item.cor; // controla aro
          return (
            <View style={styles.item}>
              <View style={{ flex: 1 }}>
                {/* Título: dot de cor + nome do evento */}
                <View style={styles.titleRow}>
                  <View
                    style={[
                      styles.colorDot,
                      {
                        backgroundColor: corHex(item.cor ?? null),
                        borderWidth: hasColor ? 1.5 : 0, // sem aro quando NÃO tiver cor
                      },
                    ]}
                  />
                  <Text style={styles.itemTitle}>{eventoLabel(item.evento_id)}</Text>
                </View>

                {/* Subtítulo: DiaSem • data • hora */}
                <Text style={styles.itemSub}>
                  {diaLabel(dow)} • {formatarData(d)}{item.hora ? ` • ${item.hora}` : ''}
                </Text>

                {/* Usuários */}
                {item.usuarios.length > 0 ? (
                  <Text style={styles.itemSub}>
                    <Text style={styles.bold}>Usuários:</Text> {item.usuarios.map((u) => u.nome).join(', ')}
                  </Text>
                ) : (
                  <Text style={styles.itemSubMuted}>Nenhum usuário atribuído</Text>
                )}

                {/* Observação (abaixo dos usuários) */}
                {item.observacao ? (
                  <Text style={styles.itemSub}>
                    <Text style={styles.bold}>Obs:</Text> {item.observacao}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <Pressable style={styles.btn} onPress={() => abrirEditarDia(item)}>
                  <Text style={styles.btnText}>Editar</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => removerDia(item)}>
                  <Text style={[styles.btnText, { color: '#fff' }]}>Excluir</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#666', marginTop: 24 }}>
            Gere a escala para ver os dias aqui.
          </Text>
        }
      />

      {/* MODAL: selecionar período (calendário com range) */}
      <Modal visible={periodoModal} transparent animationType="fade" onRequestClose={() => setPeriodoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setPeriodoModal(false)} />
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

      {/* MODAL: editar dia (cor, observação, usuários) */}
      <Modal visible={modalVisivel} transparent animationType="fade" onRequestClose={() => setModalVisivel(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setModalVisivel(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.h2}>
              {diaEditando
                ? `${eventoLabel(diaEditando.evento_id)} • ${diaLabel(isoToDate(diaEditando.data).getDay())} • ${formatarData(isoToDate(diaEditando.data))}${diaEditando.hora ? ' • ' + diaEditando.hora : ''}`
                : 'Editar dia'}
            </Text>

            {/* chips de cor litúrgica */}
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
              <Text style={styles.label}>Observação</Text>
              <TextInput
                value={observacaoDraft}
                onChangeText={setObservacaoDraft}
                style={[styles.input, { minHeight: 42 }]}
                placeholder="Digite algo (opcional)"
                multiline
              />
            </View>

            {/* busca de usuários */}
            <Text style={[styles.label, { marginTop: 12 }]}>Atribuir usuários</Text>
            <TextInput
              placeholder="Pesquisar usuário..."
              value={usuarioQuery}
              onChangeText={setUsuarioQuery}
              style={[styles.input, { marginBottom: 6 }]}
            />

            {/* lista de usuários (selecionados primeiro) */}
            <View style={{ maxHeight: 260, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, overflow: 'hidden' }}>
              <FlatList
                data={usuariosFiltradosOrdenados}
                keyExtractor={(u) => String(u.id)}
                renderItem={({ item: u }) => {
                  const selected = !!diaEditando?.usuarios.find(x => x.id === u.id);
                  return (
                    <TouchableOpacity
                      onPress={() => diaEditando && toggleUsuario(diaEditando.id, u.id)}
                      style={styles.userRow}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxOn]} />
                      <Text>{u.nome}</Text>
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
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
    </View>
  );
}

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

/* ================= estilos ================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  card: { margin: 16, padding: 12, borderRadius: 12, backgroundColor: '#fafafa', gap: 10, borderWidth: 1, borderColor: '#eee' },
  h1: { fontSize: 20, fontWeight: '700' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // reduzido para dar mais espaço ao campo do período
  label: { width: 64, fontWeight: '600' },

  input: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fff' },
  periodoBtn: { minHeight: 44, justifyContent: 'center' },
  // garante que o texto do período caiba em 1 linha
  periodoText: { flexShrink: 1, fontSize: 14 },

  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#f5f5f5' },
  btnText: { fontWeight: '700' },
  btnPrimary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2563eb' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  // botão gerar com padding menor para não “roubar” espaço do período
  btnGerar: { flexShrink: 0, paddingHorizontal: 10 },

  muted: { color: '#666' },

  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // aro só aparece quando borderWidth > 0 (definido dinamicamente no render)
  colorDot: { width: 12, height: 12, borderRadius: 999, borderColor: '#000' },

  itemTitle: { fontSize: 16, fontWeight: '800' },
  itemSub: { color: '#333', marginTop: 2 },
  itemSubMuted: { color: '#777', marginTop: 2, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8 },

  // modal
  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { width: '92%', borderRadius: 16, backgroundColor: '#fff', padding: 14 },

  chip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  chipAtivo: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipTexto: { fontSize: 14, color: '#333' },
  chipTextoAtivo: { color: '#fff', fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#fff' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#999' },
  checkboxOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },

  btnDanger: { backgroundColor: '#dc2626', borderColor: '#dc2626' },

  bold: { fontWeight: '700' },
});
