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
import { addEnfermo, Enfermo, initDb, listarEnfermos } from '../../lib/db';

// Tipagem das funções opcionais do DB (evita quebrar se algo não estiver exportado)
type DBApi = {
  atualizarEnfermo?: (id: number, nome: string, endereco: string, telefone: string) => Promise<void>;
  removerEnfermo?: (id: number) => Promise<void>;
};
let dbAny: DBApi = {};
try { dbAny = require('../../lib/db') as DBApi; } catch { /* ignore */ }

/* ===== Helpers de telefone ===== */
const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');
const isValidPhone = (v: string) => {
  const d = onlyDigits(v);
  return d.length === 10 || d.length === 11; // fixo (10) ou celular (11)
};
const formatPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    // (99)9999-9999 (parcial ok)
    return d.replace(/(\d{0,2})(\d{0,4})(\d{0,4})/, (m, a, b, c) =>
      [a ? `(${a}` : '', a && a.length === 2 ? ')' : '', b, b && c ? '-' : '', c].join('')
    );
  }
  // (99)99999-9999
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1)$2-$3');
};

export default function Enfermos() {
  // --------- estado principal / listagem ---------
  const [enfermos, setEnfermos] = useState<Enfermo[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // --------- overlay / formulário ---------
  const [modalVisivel, setModalVisivel] = useState(false);
  const [editando, setEditando] = useState<Enfermo | null>(null);
  const [draftNome, setDraftNome] = useState('');
  const [draftEndereco, setDraftEndereco] = useState('');
  const [draftTelefone, setDraftTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const nomeRef = useRef<TextInput>(null);

  // animação do painel
  const slideY = useRef(new Animated.Value(300)).current;
  const animando = useRef(false);

  // foca assim que o overlay abrir (iOS-friendly)
  useEffect(() => {
    if (modalVisivel) {
      const t = setTimeout(() => nomeRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [modalVisivel]);

  // --------- carregar do banco ---------
  useEffect(() => {
    (async () => {
      await initDb();
      await carregar();
    })();
  }, []);

  async function carregar() {
    const data = await listarEnfermos();
    data.sort((a, b) => a.nome.localeCompare(b.nome));
    setEnfermos(data);
  }

  // --------- filtro por query (nome, endereço, telefone) ---------
  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enfermos;
    return enfermos.filter(e =>
      e.nome.toLowerCase().includes(q) ||
      e.endereco.toLowerCase().includes(q) ||
      (e.telefone_responsavel || '').toLowerCase().includes(q)
    );
  }, [enfermos, query]);

  // --------- abrir / fechar com animação ---------
  function abrirNovo() {
    setEditando(null);
    setDraftNome('');
    setDraftEndereco('');
    setDraftTelefone('');
    abrirComAnimacao();
  }

  function abrirEditar(e: Enfermo) {
    setEditando(e);
    setDraftNome(e.nome);
    setDraftEndereco(e.endereco);
    setDraftTelefone(formatPhone(e.telefone_responsavel)); // já preenche mascarado
    abrirComAnimacao();
  }

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
      setDraftNome('');
      setDraftEndereco('');
      setDraftTelefone('');
    });
  }

  // --------- salvar / excluir ---------
  async function salvar() {
    const nome = draftNome.trim();
    const endereco = draftEndereco.trim();
    const telefoneDigits = onlyDigits(draftTelefone);

    if (!nome || !endereco || !telefoneDigits || salvando) {
      if (!nome || !endereco || !telefoneDigits) {
        Alert.alert('Atenção', 'Preencha nome, endereço e telefone do responsável.');
      }
      return;
    }
    if (!isValidPhone(draftTelefone)) {
      Alert.alert('Telefone inválido', 'Informe um número com 10 ou 11 dígitos (DDD + número).');
      return;
    }

    setSalvando(true);
    try {
      if (editando) {
        if (typeof dbAny.atualizarEnfermo === 'function') {
          await dbAny.atualizarEnfermo(editando.id!, nome, endereco, telefoneDigits);
          await carregar();
        } else {
          // fallback local caso método não exista ainda
          setEnfermos(prev => prev.map(e =>
            e.id === editando.id ? { ...e, nome, endereco, telefone_responsavel: telefoneDigits } : e
          ));
        }
      } else {
        await addEnfermo(nome, endereco, telefoneDigits);
        await carregar();
      }
      fecharComAnimacao();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', String(e?.message || e));
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExcluir(e: Enfermo) {
    Alert.alert(
      'Excluir Enfermo',
      `Deseja excluir "${e.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              if (typeof dbAny.removerEnfermo === 'function') {
                await dbAny.removerEnfermo(e.id!);
                await carregar();
              } else {
                setEnfermos(prev => prev.filter(x => x.id !== e.id));
              }
            } catch (err: any) {
              Alert.alert('Erro ao excluir', String(err?.message || err));
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

  async function onRefresh() {
    setRefreshing(true);
    await carregar();
    setRefreshing(false);
  }

  const telefoneOk = isValidPhone(draftTelefone);

  // --------- UI ---------
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Enfermos</Text>

      {/* Busca */}
      <View style={styles.row}>
        <TextInput
          placeholder="Buscar por nome/endereço/telefone..."
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          returnKeyType="search"
          clearButtonMode="while-editing"
          cursorColor="#2563eb"
          selectionColor="#2563eb"
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
        keyboardShouldPersistTaps="handled"
        style={{ alignSelf: 'stretch' }}
        contentContainerStyle={filtrados.length === 0 ? styles.emptyListContainer : { paddingVertical: 8, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.nome}</Text>
              <Text style={styles.cardSub} numberOfLines={1}>{item.endereco}</Text>
              <Text style={styles.cardSub} numberOfLines={1}>{formatPhone(item.telefone_responsavel)}</Text>
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
            <Text style={styles.emptyTitle}>Nenhum Enfermo</Text>
            <Text style={styles.emptySubtitle}>Use o botão “Novo” para cadastrar.</Text>
          </View>
        }
      />

      {/* ========= Overlay inline animado ========= */}
      {modalVisivel && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
          {/* Backdrop clicável */}
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onPress={fecharComAnimacao}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          />

          {/* Painel animado */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={{ justifyContent: 'flex-end' }}
          >
            <Animated.View
              style={[
                {
                  backgroundColor: '#fff',
                  padding: 16,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  transform: [{ translateY: slideY }],
                },
                Platform.OS === 'ios' && ({ opacity: 0.999 } as const),
              ]}
            >
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 18, fontWeight: '800' }}>
                  {editando ? 'Editar Enfermo' : 'Novo Enfermo'}
                </Text>
                <Pressable onPress={fecharComAnimacao} accessibilityRole="button" accessibilityLabel="Fechar">
                  <Text style={{ fontSize: 16 }}>✕</Text>
                </Pressable>
              </View>

              {/* Form */}
              <View style={{ marginTop: 14, gap: 10 }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 8 }}>Nome</Text>
                  <TextInput
                    ref={nomeRef}
                    autoFocus
                    placeholder="Ex.: Maria Souza"
                    placeholderTextColor="#777"
                    value={draftNome}
                    onChangeText={setDraftNome}
                    returnKeyType="next"
                    style={styles.inputField}
                    cursorColor="#2563eb"
                    selectionColor="#2563eb"
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 8 }}>Endereço</Text>
                  <TextInput
                    placeholder="Ex.: Rua X, 123 - Bairro"
                    placeholderTextColor="#777"
                    value={draftEndereco}
                    onChangeText={setDraftEndereco}
                    returnKeyType="next"
                    style={styles.inputField}
                    cursorColor="#2563eb"
                    selectionColor="#2563eb"
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 8 }}>
                    Telefone do responsável
                  </Text>
                  <TextInput
                    placeholder="Ex.: (61)99999-9999"
                    placeholderTextColor="#777"
                    value={draftTelefone}
                    onChangeText={(t) => setDraftTelefone(formatPhone(t))} // máscara enquanto digita
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    style={[
                      styles.inputField,
                      !telefoneOk && draftTelefone ? { borderColor: '#ef4444' } : null,
                    ]}
                    cursorColor="#2563eb"
                    selectionColor="#2563eb"
                    maxLength={14} // (99)99999-9999
                    onSubmitEditing={salvar}
                  />
                  <Text style={{ marginTop: 4, fontSize: 12, color: telefoneOk || !draftTelefone ? '#666' : '#ef4444' }}>
                    {(() => {
                      const n = onlyDigits(draftTelefone).length;
                      if (!draftTelefone) return 'Digite DDD + número. Ex.: (61)99999-9999';
                      if (telefoneOk) return 'Formato válido.';
                      return `Telefone incompleto: ${n}/10–11 dígitos.`;
                    })()}
                  </Text>
                </View>
              </View>

              {/* Ações */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 }}>
                <Pressable
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f1f4', marginRight: 10 }}
                  onPress={fecharComAnimacao}
                >
                  <Text style={{ color: '#222', fontWeight: '700' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: '#2f6fed',
                    opacity: salvando || !draftNome.trim() || !draftEndereco.trim() || !telefoneOk ? 0.5 : 1,
                  }}
                  disabled={salvando || !draftNome.trim() || !draftEndereco.trim() || !telefoneOk}
                  onPress={salvar}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      )}
      {/* ========================================== */}
    </View>
  );
}

// --------- estilos (mesma linguagem visual de usuários.tsx) ---------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8', padding: 16, gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: '700' },

  row: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'stretch' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e1e1e6', backgroundColor: '#fff', borderRadius: 10, padding: 10 },
  inputModal: { color: '#111', fontSize: 16 },
  inputField: {
    borderWidth: 1,
    borderColor: '#e1e1e6',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    color: '#111',
    fontSize: 16,
  },

  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnTextDark: { color: '#222', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#2f6fed' },
  btnLight: { backgroundColor: '#f1f1f4' },

  counterPill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: '#eaeaea', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  counterText: { fontWeight: '800' },
  counterLabel: { color: '#555' },

  emptyListContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { color: '#666' },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderColor: '#eee', borderWidth: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSub: { color: '#666' },

  actionsCol: { flexDirection: 'row', gap: 8 },
  btnSm: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  btnSmText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#3b82f6' },
  btnOutlineText: { color: '#2563eb', fontWeight: '800' },
  btnDanger: { backgroundColor: '#ef4444' },
});
