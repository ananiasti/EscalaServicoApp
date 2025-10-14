import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  View
} from 'react-native';
import { addEnfermo, atualizarEnfermo, Enfermo, initDb, listarEnfermos, removerEnfermo } from '../../lib/db';

export default function EnfermosScreen() {
  const [lista, setLista] = useState<Enfermo[]>([]);
  const [q, setQ] = useState('');

  // modal de cadastro/edição
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Enfermo | null>(null);

  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nomeResp, setNomeResp] = useState('');

  useEffect(() => {
    (async () => {
      await initDb();
      await recarregar();
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      recarregar();
    }, [])
  );

  async function recarregar() {
    const rows = await listarEnfermos();
    setLista(rows);
  }

  function abrirNovo() {
    setEditando(null);
    setNome('');
    setEndereco('');
    setTelefone('');
    setNomeResp('');
    setModalAberto(true);
  }

  function abrirEditar(item: Enfermo) {
    setEditando(item);
    setNome(item.nome ?? '');
    setEndereco(item.endereco ?? '');
    setTelefone(item.telefone_responsavel ?? '');
    setNomeResp(item.nome_responsavel ?? (item as any)['nome_responsável'] ?? '');
    setModalAberto(true);
  }

  async function salvar() {
    try {
      if (!nome.trim() || !endereco.trim() || !telefone.trim()) {
        Alert.alert('Campos obrigatórios', 'Informe nome, endereço e telefone do responsável.');
        return;
      }
      if (editando?.id) {
        await atualizarEnfermo(editando.id, nome.trim(), endereco.trim(), telefone.trim(), nomeResp.trim() || undefined);
      } else {
        await addEnfermo(nome.trim(), endereco.trim(), telefone.trim(), nomeResp.trim() || undefined);
      }
      setModalAberto(false);
      await recarregar();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', String(e?.message || e));
    }
  }

  function confirmarExcluir(item: Enfermo) {
    Alert.alert('Excluir enfermo', `Excluir ${item.nome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => excluir(item) },
    ]);
  }

  async function excluir(item: Enfermo) {
    try {
      if (!item.id) return;
      await removerEnfermo(item.id);
      await recarregar();
    } catch (e: any) {
      Alert.alert('Erro ao excluir', String(e?.message || e));
    }
  }

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return lista;
    return lista.filter((e) =>
      [e.nome, e.endereco, e.telefone_responsavel, e.nome_responsavel, (e as any)['nome_responsável']]
        .map(v => String(v ?? '').toLowerCase())
        .some(txt => txt.includes(s))
    );
  }, [q, lista]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.h1}>Enfermos</Text>

        <View style={[styles.row, { alignItems: 'center' }]}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por nome, telefone, responsável..."
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable style={[styles.btnPrimary]} onPress={abrirNovo}>
            <Text style={styles.btnPrimaryText}>Novo</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.nome}</Text>
              <Text style={styles.itemSub}>Endereço: {item.endereco || '—'}</Text>
              <Text style={styles.itemSub}>Telefone resp.: {item.telefone_responsavel || '—'}</Text>
              <Text style={styles.itemSub}>Nome do responsável: {item.nome_responsavel ?? (item as any)['nome_responsável'] ?? '—'}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.btn} onPress={() => abrirEditar(item)}>
                <Text style={styles.btnText}>Editar</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => confirmarExcluir(item)}>
                <Text style={[styles.btnText, { color: '#fff' }]}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#666', marginTop: 24 }}>
            Nenhum enfermo cadastrado.
          </Text>
        }
      />

      <Modal visible={modalAberto} transparent animationType="fade" onRequestClose={() => setModalAberto(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={styles.backdrop} />
          <View style={styles.modalCard}>
            <Text style={styles.h2}>{editando ? 'Editar enfermo' : 'Novo enfermo'}</Text>

            <Text style={styles.label}>Nome</Text>
            <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Nome do enfermo" />

            <Text style={styles.label}>Endereço</Text>
            <TextInput style={styles.input} value={endereco} onChangeText={setEndereco} placeholder="Endereço" />

            <Text style={styles.label}>Telefone do responsável</Text>
            <TextInput style={styles.input} value={telefone} onChangeText={setTelefone} placeholder="(00) 00000-0000" keyboardType="phone-pad" />

            <Text style={styles.label}>Nome do responsável (opcional)</Text>
            <TextInput style={styles.input} value={nomeResp} onChangeText={setNomeResp} placeholder="Ex.: João da Silva" />

            <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 12, gap: 8 }]}>
              <Pressable style={styles.btn} onPress={() => setModalAberto(false)}>
                <Text style={styles.btnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={salvar}>
                <Text style={styles.btnPrimaryText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  card: { margin: 16, padding: 12, borderRadius: 12, backgroundColor: '#fafafa', gap: 10, borderWidth: 1, borderColor: '#eee' },
  h1: { fontSize: 20, fontWeight: '700' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '600', marginTop: 6 },

  input: { padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fff' },

  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#f5f5f5' },
  btnText: { fontWeight: '700' },
  btnPrimary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2563eb' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },

  // 🔧 adicionado para corrigir o erro
  btnDanger: { backgroundColor: '#dc2626', borderColor: '#dc2626' },

  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  itemTitle: { fontSize: 16, fontWeight: '800' },
  itemSub: { color: '#333', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },

  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 1 },
  modalCard: { width: '92%', borderRadius: 16, backgroundColor: '#fff', padding: 14, zIndex: 2 },
});
