import React, { useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { addUsuario, initDb, listarUsuarios } from '../lib/db';

type Usuario = { id: number; nome: string };

export default function Tela1() {

    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [nome, setNome] = useState('');
  
    useEffect(() => {
      (async () => {
        await initDb();
        const data = await listarUsuarios();
        setUsuarios(data);
      })();
    }, []);
  
    async function handleAdd() {
      if (!nome.trim()) return;
      await addUsuario(nome.trim());
      setNome('');
      setUsuarios(await listarUsuarios());
    }

  return (
      <View style={styles.content}>
        <Text style={styles.title}>Escala de Serviço</Text>

        <View style={styles.row}>
          <TextInput
            placeholder="Nome do usuário"
            value={nome}
            onChangeText={setNome}
            style={styles.input}
          />
          <Button title="Adicionar" onPress={handleAdd} />
        </View>

        <FlatList
          data={usuarios}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <Text>{item.id} — {item.nome}</Text>}
          style={{ alignSelf: 'stretch' }}
          contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
        />
      </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'stretch' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  footer: { padding: 16, alignItems: 'center' },
  footerText: { fontSize: 14, color: '#666' },
});

