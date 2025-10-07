import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addAusencia, atualizarAusencia, Ausencia, listarAusencias, removerAusencia } from './lib/db';

type Props = {
  usuarioId: number;
};

export default function Ausencias({ usuarioId }: Props) {
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [editando, setEditando] = useState<Ausencia | null>(null);

  // Estado carrossel para adicionar/editar
  const hoje = new Date();

  const dias = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const formatarDia = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
  const horas = Array.from({ length: 24 }, (_, i) => i);
  const minutos = Array.from({ length: 60 }, (_, i) => i);

  const [diaInicioIndex, setDiaInicioIndex] = useState(0);
  const [horaInicioIndex, setHoraInicioIndex] = useState(0);
  const [minInicioIndex, setMinInicioIndex] = useState(0);

  const [diaFimIndex, setDiaFimIndex] = useState(0);
  const [horaFimIndex, setHoraFimIndex] = useState(23);
  const [minFimIndex, setMinFimIndex] = useState(59);

  const [motivo, setMotivo] = useState('');

  // ------------------- Carregar ausências -------------------
  const carregarAusencias = async () => {
    const lista = await listarAusencias(usuarioId);
    setAusencias(lista);
  };

  useEffect(() => {
    carregarAusencias();
  }, []);

  // ------------------- Salvar / Editar -------------------
  const salvar = async () => {
    const inicio = new Date(dias[diaInicioIndex]);
    inicio.setHours(horaInicioIndex, minInicioIndex, 0, 0);

    const fim = new Date(dias[diaFimIndex]);
    fim.setHours(horaFimIndex, minFimIndex, 0, 0);

    if (fim < inicio) {
      Alert.alert('Erro', 'A data/hora de fim não pode ser menor que a de início.');
      return;
    }

    try {
      if (editando) {
        await atualizarAusencia({
          id: editando.id!,
          usuario_id: usuarioId,
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          motivo
        });
        Alert.alert('Sucesso', 'Ausência atualizada!');
      } else {
        await addAusencia({
          usuario_id: usuarioId,
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          motivo
        });
        Alert.alert('Sucesso', 'Ausência adicionada!');
      }
      setEditando(null);
      setMotivo('');
      carregarAusencias();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível salvar a ausência.');
    }
  };

  // ------------------- Editar -------------------
  const iniciarEdicao = (a: Ausencia) => {
    setEditando(a);
    const inicio = new Date(a.inicio);
    const fim = new Date(a.fim);

    const diaIndexInicio = dias.findIndex(d => d.toDateString() === inicio.toDateString()) || 0;
    const diaIndexFim = dias.findIndex(d => d.toDateString() === fim.toDateString()) || 0;

    setDiaInicioIndex(diaIndexInicio);
    setHoraInicioIndex(inicio.getHours());
    setMinInicioIndex(inicio.getMinutes());

    setDiaFimIndex(diaIndexFim);
    setHoraFimIndex(fim.getHours());
    setMinFimIndex(fim.getMinutes());

    setMotivo(a.motivo || '');
  };

  // ------------------- Remover -------------------
  const excluir = (id: number) => {
    Alert.alert('Confirmação', 'Deseja realmente excluir esta ausência?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try {
          await removerAusencia(id);
          carregarAusencias();
        } catch (err) {
          console.error(err);
          Alert.alert('Erro', 'Não foi possível remover a ausência.');
        }
      } }
    ]);
  };

  // ------------------- Render Carrossel -------------------
  const renderCarrossel = (arr: any[], selectedIndex: number, onSelect: (i:number)=>void) => (
    <FlatList
      horizontal
      data={arr}
      keyExtractor={(_, i) => i.toString()}
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => onSelect(index)}
          style={[styles.itemCarrossel, selectedIndex === index && styles.itemSelecionado]}
        >
          <Text>{typeof item === 'number' ? item.toString().padStart(2,'0') : item}</Text>
        </Pressable>
      )}
      showsHorizontalScrollIndicator={false}
    />
  );

  const renderLinhaPeriodo = (
    label: string,
    diaIndex: number, setDiaIndex: any,
    horaIndex: number, setHoraIndex: any,
    minIndex: number, setMinIndex: any
  ) => (
    <View style={styles.linhaPeriodo}>
      <Text style={styles.label}>{label}</Text>
      {renderCarrossel(dias.map(formatarDia), diaIndex, setDiaIndex)}
      {renderCarrossel(horas, horaIndex, setHoraIndex)}
      {renderCarrossel(minutos, minIndex, setMinIndex)}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>{editando ? 'Editar Ausência' : 'Nova Ausência'}</Text>

      {renderLinhaPeriodo('Início', diaInicioIndex, setDiaInicioIndex, horaInicioIndex, setHoraInicioIndex, minInicioIndex, setMinInicioIndex)}
      {renderLinhaPeriodo('Fim', diaFimIndex, setDiaFimIndex, horaFimIndex, setHoraFimIndex, minFimIndex, setMinFimIndex)}

      <TextInput
        placeholder="Motivo (opcional)"
        value={motivo}
        onChangeText={setMotivo}
        style={[styles.input, { paddingVertical: 8 }]}
      />

      <Button title={editando ? "Atualizar" : "Salvar"} onPress={salvar} />

      <Text style={[styles.titulo, {marginTop: 24}]}>Ausências do Usuário</Text>

      <FlatList
        data={ausencias}
        keyExtractor={item => item.id!.toString()}
        renderItem={({ item }) => (
          <View style={styles.itemLista}>
            <Text>{new Date(item.inicio).toLocaleString()} → {new Date(item.fim).toLocaleString()}</Text>
            {item.motivo ? <Text>Motivo: {item.motivo}</Text> : null}
            <View style={styles.botoesItem}>
              <Button title="Editar" onPress={() => iniciarEdicao(item)} />
              <Button title="Excluir" color="red" onPress={() => excluir(item.id!)} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1 },
  titulo: { fontSize: 16, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  linhaPeriodo: { marginBottom: 16 },
  label: { fontWeight: '600', marginBottom: 4 },
  itemCarrossel: {
    padding: 10,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  itemSelecionado: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  itemLista: {
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  botoesItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
