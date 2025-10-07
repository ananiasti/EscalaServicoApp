import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  addEvento,
  atualizarEvento,
  diaLabel,
  DIAS_SEMANA,
  Evento,
  initDb,
  isHoraValida,
  listarEventos,
  removerEvento,
  TIPOS_EVENTO
} from '../../lib/db';

// helpers de hora
function toHHMM(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function fromHHMM(hhmm: string) {
  const d = new Date();
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10));
  if (!isNaN(h)) d.setHours(h);
  if (!isNaN(m)) d.setMinutes(m);
  d.setSeconds(0); d.setMilliseconds(0);
  return d;
}

const LOCAIS_BASE = ['Matriz', 'Sagrado', 'Aparecida'] as const;

export default function Eventos() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisivel, setModalVisivel] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);

  // formulário
  const [tipoIndex, setTipoIndex] = useState(0);
  const [draftTipo, setDraftTipo] = useState('');
  const [locais, setLocais] = useState<string[]>([...LOCAIS_BASE]);
  const [localIndex, setLocalIndex] = useState(0);
  const [draftLocal, setDraftLocal] = useState('');
  const [draftDia, setDraftDia] = useState(0);
  const [draftHora, setDraftHora] = useState('');
  const [mostrarTimePicker, setMostrarTimePicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const tipos = useMemo(() => [...TIPOS_EVENTO], []);
  const dias  = useMemo(() => [...DIAS_SEMANA], []);

  // carregar banco
  useEffect(() => {
    (async () => {
      await initDb();
      await carregar();
    })();
  }, []);

  async function carregar() {
    const data = await listarEventos();
    data.sort((a, b) =>
      a.dia_semana - b.dia_semana || a.hora.localeCompare(b.hora) || a.tipo.localeCompare(b.tipo)
    );
    setEventos(data);
  }

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? eventos.filter(e =>
          e.tipo.toLowerCase().includes(q) ||
          e.local.toLowerCase().includes(q) ||
          diaLabel(e.dia_semana).toLowerCase().includes(q) ||
          e.hora.includes(q)
        )
      : eventos;
  }, [eventos, query]);

  // animação overlay
  const slideY = useRef(new Animated.Value(300)).current;
  const animando = useRef(false);

  function abrirComAnimacao() {
    if (animando.current) return;
    setModalVisivel(true);
    slideY.setValue(300);
    animando.current = true;
    Animated.timing(slideY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => { animando.current = false; });
  }
  function fecharComAnimacao() {
    if (animando.current) return;
    animando.current = true;
    Animated.timing(slideY, {
      toValue: 300,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      animando.current = false;
      setModalVisivel(false);
      setEditando(null);
      setDraftTipo('');
      setLocais([...LOCAIS_BASE]);
      setLocalIndex(0);
      setDraftLocal('');
      setDraftDia(0);
      setDraftHora('');
      setMostrarTimePicker(false);
    });
  }

  function abrirNovo() {
    setEditando(null);
    setTipoIndex(0);
    setDraftTipo(tipos[0]);
    setLocais([...LOCAIS_BASE]);
    setLocalIndex(0);
    setDraftLocal(LOCAIS_BASE[0]);
    setDraftDia(0);
    setDraftHora('');
    abrirComAnimacao();
  }

  function abrirEditar(e: Evento) {
  setEditando(e);

  // --- Tipo ---
  const idxTipo = Math.max(
    0,
    tipos.findIndex(t => t.toLowerCase() === (e.tipo || '').toLowerCase())
  );
  setTipoIndex(idxTipo);
  setDraftTipo(e.tipo || tipos[idxTipo]);

  // --- Local ---
  // OBS: garanta que seu estado foi tipado como string[]:
  // const [locais, setLocais] = useState<string[]>([...LOCAIS_BASE]);
  // e que LOCAIS_BASE está assim:
  // const LOCAIS_BASE = ['Matriz', 'Sagrado', 'Aparecida'] as const;

  const base: string[] = [...LOCAIS_BASE];       // <- força string[] aqui
  let lista: string[] = base;

  const localNorm = (e.local ?? '').trim();
  if (
    localNorm &&
    !base.some(b => b.toLowerCase() === localNorm.toLowerCase())
  ) {
    lista = [...base, localNorm];
  }
  setLocais(lista);

  const idxLocal = localNorm
    ? Math.max(0, lista.findIndex(l => l.toLowerCase() === localNorm.toLowerCase()))
    : 0;

  setLocalIndex(idxLocal);
  setDraftLocal(lista[idxLocal] ?? base[0]);

  // --- Dia e hora ---
  setDraftDia(e.dia_semana ?? 0);
  setDraftHora(e.hora || '');
  abrirComAnimacao();
}


  // salvar/excluir
  async function salvar() {
    const tipo = draftTipo.trim();
    const localSelecionado = locais[localIndex] || '';
    const hora = draftHora.trim();

    if (!tipo || !localSelecionado) {
      Alert.alert('Campos obrigatórios', 'Preencha Tipo e Local.');
      return;
    }
    if (!isHoraValida(hora)) {
      Alert.alert('Hora inválida', 'Formato esperado: HH:MM');
      return;
    }

    setSalvando(true);
    try {
      if (editando) {
        await atualizarEvento(editando.id, tipo, localSelecionado, draftDia, hora);
      } else {
        await addEvento(tipo, localSelecionado, draftDia, hora);
      }
      await carregar();
      fecharComAnimacao();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', String(e?.message || e));
    } finally {
      setSalvando(false);
    }
  }

  // hora
  function abrirTimePicker() { setMostrarTimePicker(true); }
  function onChangeHora(e: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setMostrarTimePicker(false);
    if (date) setDraftHora(toHHMM(date));
  }

  function confirmarExcluir(e: Evento) {
  Alert.alert(
    'Excluir evento',
    `Deseja excluir "${e.tipo}" em ${e.local}?`,
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await removerEvento(e.id);
            await carregar();
          } catch (err: any) {
            Alert.alert('Erro ao excluir', String(err?.message || err));
          }
        },
      },
    ]
  );
}

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Eventos</Text>

      {/* Busca */}
      <View style={styles.row}>
        <TextInput
          placeholder="Buscar por tipo, local, dia ou hora..."
          value={query}
          onChangeText={setQuery}
          style={styles.input}
        />
        <Pressable style={[styles.btn, styles.btnLight]} onPress={() => setQuery('')}>
          <Text style={[styles.btnText, styles.btnTextDark]}>Limpar</Text>
        </Pressable>
      </View>

      {/* Barra de ações */}
      <View style={[styles.row, { marginTop: 4 }]}>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={abrirNovo}>
          <Text style={styles.btnText}>Novo</Text>
        </Pressable>
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>{filtrados.length}</Text>
          <Text style={styles.counterLabel}> itens</Text>
        </View>
      </View>

      {/* Lista */}
      <FlatList
        data={filtrados}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={filtrados.length === 0 ? styles.emptyListContainer : { paddingVertical: 8, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={carregar} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.tipo} • {item.local}</Text>
              <Text style={styles.cardSub}>{diaLabel(item.dia_semana)} • {item.hora}</Text>
            </View>
            <View style={styles.actionsCol}>
              <Pressable style={[styles.btnSm, styles.btnOutline]} onPress={() => abrirEditar(item)}>
                <Text style={[styles.btnSmText, styles.btnOutlineText]}>Editar</Text>
              </Pressable>
              <Pressable style={[styles.btnSm, styles.btnDanger]} onPress={() => confirmarExcluir(item)}>
                <Text style={styles.btnSmText}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nenhum evento</Text>
            <Text style={styles.emptySubtitle}>Use o botão “Novo”.</Text>
          </View>
        }
      />

      {/* Overlay */}
      {modalVisivel && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={fecharComAnimacao} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.View style={[styles.modal, { transform: [{ translateY: slideY }] }]}>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>
                {editando ? 'Editar evento' : 'Novo evento'}
              </Text>

              {/* Tipo (chips) */}
              <Text style={styles.label}>Tipo</Text>
              <View style={styles.chipsWrap}>
                {tipos.map((rotulo, idx) => (
                  <Pressable
                    key={rotulo}
                    onPress={() => { setTipoIndex(idx); setDraftTipo(rotulo); }}
                    style={[styles.chip, tipoIndex === idx && styles.chipAtivo]}
                  >
                    <Text style={[styles.chipTexto, tipoIndex === idx && styles.chipTextoAtivo]}>
                      {rotulo}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Local (chips) */}
              <Text style={styles.label}>Local</Text>
              <View style={styles.chipsWrap}>
                {locais.map((rotulo, idx) => (
                  <Pressable
                    key={rotulo}
                    onPress={() => { setLocalIndex(idx); setDraftLocal(rotulo); }}
                    style={[styles.chip, localIndex === idx && styles.chipAtivo]}
                  >
                    <Text style={[styles.chipTexto, localIndex === idx && styles.chipTextoAtivo]}>
                      {rotulo}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Dia da semana (chips) */}
              <Text style={styles.label}>Dia da semana</Text>
              <View style={styles.chipsWrap}>
                {dias.map((rotulo, idx) => (
                  <Pressable
                    key={rotulo}
                    onPress={() => setDraftDia(idx)}
                    style={[styles.chip, draftDia === idx && styles.chipAtivo]}
                  >
                    <Text style={[styles.chipTexto, draftDia === idx && styles.chipTextoAtivo]}>
                      {rotulo}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Hora */}
              <Text style={styles.label}>Hora</Text>
              <Pressable style={styles.input} onPress={abrirTimePicker}>
                <Text>{draftHora || 'Escolher hora'}</Text>
              </Pressable>
              {mostrarTimePicker && (
                <DateTimePicker
                  value={draftHora ? fromHHMM(draftHora) : new Date()}
                  mode="time"
                  display="spinner"
                  is24Hour
                  onChange={onChangeHora}
                />
              )}

              {/* Ações */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                <Pressable style={[styles.btn, styles.btnLight]} onPress={fecharComAnimacao}>
                  <Text style={styles.btnTextDark}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary, { marginLeft: 8 }]}
                  onPress={salvar}
                  disabled={salvando}
                >
                  <Text style={styles.btnText}>{salvando ? 'Salvando...' : 'Salvar'}</Text>
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8', padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#fff', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnTextDark: { color: '#222', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#2563eb' },
  btnLight: { backgroundColor: '#eee' },
  counterPill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: '#eaeaea', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  counterText: { fontWeight: '800' },
  counterLabel: { color: '#555' },
  emptyListContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { color: '#666' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#eee' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSub: { color: '#666' },
  actionsCol: { flexDirection: 'row', gap: 8 },
  btnSm: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnSmText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#2563eb' },
  btnOutlineText: { color: '#2563eb', fontWeight: '800' },
  btnDanger: { backgroundColor: '#ef4444' },
  modal: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },

  // chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  chipAtivo: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipTexto: {
    fontSize: 14,
    color: '#333',
  },
  chipTextoAtivo: {
    color: '#fff',
    fontWeight: '700',
  },
});
