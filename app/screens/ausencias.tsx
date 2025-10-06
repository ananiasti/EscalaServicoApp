import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import {
  addAusencia,
  Ausencia,
  initDb,
  listarAusencias,
  listarUsuarios,
  removerAusencia,
  Usuario,
} from '../lib/db';

// Formatação de data dd/mm/yyyy
const formatarData = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

export default function Ausencias() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [query, setQuery] = useState('');
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);

  const [showNovoPeriodo, setShowNovoPeriodo] = useState(false);
  const [inicio, setInicio] = useState(new Date());
  const [fim, setFim] = useState(new Date());
  const [motivo, setMotivo] = useState('');

  // Inicializa DB e usuários
  useEffect(() => {
    (async () => {
      await initDb();
      await carregarUsuarios();
    })();
  }, []);

  async function carregarUsuarios() {
    const lista = await listarUsuarios();
    lista.sort((a,b) => a.nome.localeCompare(b.nome));
    setUsuarios(lista);
  }

  async function carregarAusencias(usuario: Usuario) {
    const lista = await listarAusencias(usuario.id);
    setAusencias(lista);
  }

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? usuarios.filter(u => u.nome.toLowerCase().includes(q)) : usuarios;
  }, [usuarios, query]);

  function abrirNovoPeriodo() {
    if (!usuarioSelecionado) { Alert.alert('Selecione um usuário primeiro'); return; }
    const hoje = new Date();
    const defaultInicio = new Date(hoje); defaultInicio.setHours(0,0,0,0);
    const defaultFim = new Date(hoje); defaultFim.setHours(0,0,0,0);
    setInicio(defaultInicio);
    setFim(defaultFim);
    setMotivo('');
    setShowNovoPeriodo(true);
  }

  async function adicionarPeriodo() {
    if (!usuarioSelecionado) return;

    const inicioVal = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const fimVal = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());

    if (fimVal < inicioVal) {
      Alert.alert('Erro','Fim menor que início');
      return;
    }

    try {
      await addAusencia({
        usuario_id: usuarioSelecionado.id,
        inicio: inicioVal.toISOString(),
        fim: fimVal.toISOString(),
        motivo
      });

      await carregarAusencias(usuarioSelecionado);
      setShowNovoPeriodo(false);
      Alert.alert('Sucesso', 'Período salvo no banco!');
    } catch(e) {
      console.error(e);
      Alert.alert('Erro','Não foi possível salvar o período.');
    }
  }

  async function confirmarExcluir(a: Ausencia) {
    Alert.alert('Excluir ausência','Deseja excluir?',[
      { text:'Cancelar', style:'cancel' },
      { text:'Excluir', style:'destructive', onPress: async () => {
        await removerAusencia(a.id!);
        if (usuarioSelecionado) await carregarAusencias(usuarioSelecionado);
      } }
    ]);
  }

  // Marca intervalo de datas no calendário
  const getMarkedDates = () => {
    const dates: Record<string, any> = {};
    const cur = new Date(inicio);
    while (cur <= fim) {
      const key = cur.toISOString().split('T')[0];
      if (key === inicio.toISOString().split('T')[0]) {
        dates[key] = { startingDay: true, color: '#2563eb', textColor: '#fff' };
      } else if (key === fim.toISOString().split('T')[0]) {
        dates[key] = { endingDay: true, color: '#22c55e', textColor: '#fff' };
      } else {
        dates[key] = { color: '#c7d2fe', textColor: '#fff' };
      }
      cur.setDate(cur.getDate()+1);
    }
    return dates;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Ausências</Text>

      <TextInput
        placeholder="Buscar usuário..."
        value={query}
        onChangeText={setQuery}
        style={[styles.input, { height:40, fontSize:14 }]}
      />

      <FlatList
        data={filtrados}
        keyExtractor={u => u.id.toString()}
        style={{ marginTop:8 }}
        renderItem={({item}) => (
          <View style={{ marginBottom:12 }}>
            <Pressable
              style={{
                padding:12, borderRadius:10,
                backgroundColor: usuarioSelecionado?.id===item.id ? '#2563eb' : '#fff',
                borderWidth:1, borderColor:'#eee'
              }}
              onPress={() => {
                setUsuarioSelecionado(item);
                carregarAusencias(item);
                setShowNovoPeriodo(false);
              }}
            >
              <Text style={{ color: usuarioSelecionado?.id===item.id ? '#fff' : '#000', fontWeight:'700' }}>{item.nome}</Text>
              <Text style={{ color: usuarioSelecionado?.id===item.id ? '#eee' : '#666', fontSize:12 }}>ID: {item.id}</Text>
            </Pressable>

            {usuarioSelecionado?.id === item.id && (
              <View style={{ marginTop:8, padding:8, backgroundColor:'#f0f0f0', borderRadius:8 }}>
                {ausencias.map(a=>(
                  <View key={a.id} style={{ marginBottom:4, padding:8, backgroundColor:'#fff', borderRadius:8 }}>
                    <Text>{`${formatarData(new Date(a.inicio))} → ${formatarData(new Date(a.fim))}`}</Text>
                    {a.motivo && <Text>Motivo: {a.motivo}</Text>}
                    <Pressable
                      onPress={() => confirmarExcluir(a)}
                      style={{ marginTop:4, backgroundColor:'#ef4444', padding:6, borderRadius:8, alignItems:'center' }}
                    >
                      <Text style={{ color:'#fff', fontWeight:'700' }}>Excluir</Text>
                    </Pressable>
                  </View>
                ))}

                {!showNovoPeriodo && (
                  <Pressable
                    onPress={abrirNovoPeriodo}
                    style={{ backgroundColor:'#2563eb', padding:12, borderRadius:10, marginTop:8, alignItems:'center' }}
                  >
                    <Text style={{ color:'#fff', fontWeight:'700' }}>Novo Período</Text>
                  </Pressable>
                )}

                {showNovoPeriodo && (
                  <View style={{ marginTop:12, padding:8, backgroundColor:'#fff', borderRadius:10 }}>
                    <Text style={{ fontWeight:'700', marginBottom:4 }}>Selecione as datas:</Text>

                    <Text>Início</Text>
                    <Calendar
                      onDayPress={(day: DateData) => {
                        const [y,m,d] = day.dateString.split('-');
                        const dt = new Date(inicio);
                        dt.setFullYear(parseInt(y));
                        dt.setMonth(parseInt(m)-1);
                        dt.setDate(parseInt(d));
                        dt.setHours(0,0,0,0);
                        setInicio(dt);
                        if (fim < dt) setFim(new Date(dt));
                      }}
                      markingType="period"
                      markedDates={getMarkedDates()}
                    />

                    <Text>Fim</Text>
                    <Calendar
                      onDayPress={(day: DateData) => {
                        const [y,m,d] = day.dateString.split('-');
                        const dt = new Date(fim);
                        dt.setFullYear(parseInt(y));
                        dt.setMonth(parseInt(m)-1);
                        dt.setDate(parseInt(d));
                        dt.setHours(0,0,0,0);
                        setFim(dt);
                        if (inicio > dt) setInicio(new Date(dt));
                      }}
                      markingType="period"
                      markedDates={getMarkedDates()}
                    />

                    <Text>Motivo</Text>
                    <TextInput value={motivo} onChangeText={setMotivo} style={styles.input}/>

                    <Pressable
                      onPress={adicionarPeriodo}
                      style={{ backgroundColor:'#2563eb', padding:12, borderRadius:10, marginTop:8, alignItems:'center' }}
                    >
                      <Text style={{ color:'#fff', fontWeight:'700' }}>Adicionar</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:'#f7f7f8', padding:16 },
  headerTitle:{ fontSize:20, fontWeight:'700' },
  input:{ flex:1, borderWidth:1, borderColor:'#e1e1e6', borderRadius:10, padding:10, marginBottom:8 },
});
