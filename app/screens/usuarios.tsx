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
import { addUsuario, initDb, listarUsuarios } from '../../lib/db';

// Tipagem das funções opcionais do DB para evitar chamadas erradas
type DBApi = {
  atualizarUsuario?: (id: number, nome: string) => Promise<void>;
  removerUsuario?: (id: number) => Promise<void>;
  addUsuario?: (nome: string) => Promise<void>;
  listarUsuarios?: () => Promise<Array<{ id: number; nome: string }>>;
};

let dbAny: DBApi = {};
try { dbAny = require('../lib/db') as DBApi; } catch { /* ignore */ }

type Usuario = { id: number; nome: string };

export default function Usuarios() {
  // --------- estado principal / listagem ---------
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // --------- overlay / formulário ---------
  const [modalVisivel, setModalVisivel] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [draftNome, setDraftNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const nomeRef = useRef<TextInput>(null);

  // animação do painel
  const slideY = useRef(new Animated.Value(300)).current; // parte de baixo (300px)
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
    const data = await listarUsuarios();
    data.sort((a, b) => a.nome.localeCompare(b.nome));
    setUsuarios(data);
  }

  // --------- filtro por nome ---------
  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? usuarios.filter(u => u.nome.toLowerCase().includes(q)) : usuarios;
  }, [usuarios, query]);

  // --------- abrir / fechar com animação ---------
  function abrirNovo() {
    setEditando(null);
    setDraftNome('');
    abrirComAnimacao();
  }

  function abrirEditar(u: Usuario) {
    setEditando(u);
    setDraftNome(u.nome);
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
    });
  }

  // --------- salvar / excluir ---------
  async function salvar() {
    const valor = draftNome.trim();
    if (!valor || salvando) return;
    setSalvando(true);
    try {
      if (editando) {
        if (typeof dbAny.atualizarUsuario === 'function') {
          // ✅ chama com (id, nome) — antes estava passando um objeto e quebrava
          await dbAny.atualizarUsuario(editando.id, valor);
          await carregar();
        } else {
          setUsuarios(prev => prev.map(u => (u.id === editando.id ? { ...u, nome: valor } : u)));
        }
      } else {
        await addUsuario(valor);
        await carregar();
      }
      fecharComAnimacao();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', String(e?.message || e));
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExcluir(u: Usuario) {
    Alert.alert(
      'Excluir usuário',
      `Deseja excluir "${u.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              if (typeof dbAny.removerUsuario === 'function') {
                await dbAny.removerUsuario(u.id);
                await carregar();
              } else {
                setUsuarios(prev => prev.filter(x => x.id !== u.id));
              }
            } catch (e: any) {
              Alert.alert('Erro ao excluir', String(e?.message || e));
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

  // --------- UI ---------
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Usuários</Text>

      {/* Busca */}
      <View style={styles.row}>
        <TextInput
          placeholder="Buscar por nome..."
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
             {/*  <Text style={styles.cardSub}>ID: {item.id}</Text>*/}
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
            <Text style={styles.emptyTitle}>Nenhum usuário</Text>
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
                  {editando ? 'Editar usuário' : 'Novo usuário'}
                </Text>
                <Pressable onPress={fecharComAnimacao} accessibilityRole="button" accessibilityLabel="Fechar">
                  <Text style={{ fontSize: 16 }}>✕</Text>
                </Pressable>
              </View>

              {/* Form */}
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 8 }}>Nome</Text>

                <TextInput
                  ref={nomeRef}
                  autoFocus
                  placeholder="Ex.: Maria Souza"
                  placeholderTextColor="#777"
                  value={draftNome}
                  onChangeText={setDraftNome}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={salvar}
                  style={{
                    flex: 0,
                    borderWidth: 1,
                    borderColor: '#e1e1e6',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    padding: 10,
                    color: '#111',
                    fontSize: 16,
                  }}
                  cursorColor="#2563eb"
                  selectionColor="#2563eb"
                />
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
                    opacity: salvando || !draftNome.trim() ? 0.5 : 1,
                  }}
                  disabled={salvando || !draftNome.trim()}
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

// --------- estilos ---------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8', padding: 16, gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: '700' },

  row: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'stretch' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e1e1e6', backgroundColor: '#fff', borderRadius: 10, padding: 10 },
  inputModal: { color: '#111', fontSize: 16 },

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
