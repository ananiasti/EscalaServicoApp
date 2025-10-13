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
} from '../../lib/db';

// --------- helpers de data ---------
const formatarData = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export default function Ausencias() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [query, setQuery] = useState('');
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null);
  const [ausenciasMap, setAusenciasMap] = useState<Record<number, Ausencia[]>>({});

  const [showNovoPeriodo, setShowNovoPeriodo] = useState(false);
  const [inicio, setInicio] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [fim, setFim] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [motivo, setMotivo] = useState('');
  const [selecionandoFim, setSelecionandoFim] = useState(false); // 1º toque = único dia, 2º toque = período

  // --------- init ---------
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

    const map: Record<number, Ausencia[]> = {};
    for (const u of lista) {
      const aus = await listarAusencias(u.id);
      map[u.id] = aus;
    }
    setAusenciasMap(map);
  }

  async function carregarAusencias(usuario: Usuario) {
    const lista = await listarAusencias(usuario.id);
    setAusenciasMap(prev => ({ ...prev, [usuario.id]: lista }));
  }

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? usuarios.filter(u => u.nome.toLowerCase().includes(q)) : usuarios;
  }, [usuarios, query]);

  function abrirNovoPeriodo() {
    if (!usuarioSelecionado) { Alert.alert('Selecione um Operário primeiro'); return; }
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    setInicio(new Date(hoje));
    setFim(new Date(hoje));
    setMotivo('');
    setSelecionandoFim(false);
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
    Alert.alert('Excluir ausência','Deseja excluir?',[{
      text:'Cancelar', style:'cancel'
    },{
      text:'Excluir', style:'destructive', onPress: async () => {
        await removerAusencia(a.id!);
        if (usuarioSelecionado) await carregarAusencias(usuarioSelecionado);
      }
    }]);
  }

  const getMarkedDates = () => {
    const dates: Record<string, any> = {};
    const ini = new Date(inicio); ini.setHours(0,0,0,0);
    const end = new Date(fim);    end.setHours(0,0,0,0);

    // dia único
    if (ini.getTime() === end.getTime()) {
      const k = toKey(ini);
      dates[k] = { startingDay: true, endingDay: true, color: '#2563eb', textColor: '#fff' };
      return dates;
    }

    // período
    const cur = new Date(ini);
    while (cur.getTime() <= end.getTime()) {
      const k = toKey(cur);
      if (k === toKey(ini)) {
        dates[k] = { startingDay: true, color: '#2563eb', textColor: '#fff' };
      } else if (k === toKey(end)) {
        dates[k] = { endingDay: true, color: '#22c55e', textColor: '#fff' };
      } else {
        dates[k] = { color: '#c7d2fe', textColor: '#fff' };
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  function calcularDiasAusentes(ausencias: Ausencia[]) {
    let total = 0;
    ausencias.forEach(a => {
      const ini = new Date(a.inicio); ini.setHours(0,0,0,0);
      const end = new Date(a.fim);    end.setHours(0,0,0,0);
      const diff = Math.floor((end.getTime() - ini.getTime()) / (1000*60*60*24)) + 1;
      total += Math.max(diff, 0);
    });
    return total;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Ausências</Text>

      <TextInput
        placeholder="Buscar Operário..."
        value={query}
        onChangeText={setQuery}
        style={styles.input}
        multiline={false}
        numberOfLines={1}
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
              <Text style={{ color: usuarioSelecionado?.id===item.id ? '#fff' : '#000', fontWeight:'700' }}>
                {item.nome}
              </Text>

              {ausenciasMap[item.id] && calcularDiasAusentes(ausenciasMap[item.id]) > 0 && (
                <Text style={{ color: '#ef4444', fontSize:12, marginTop:2 }}>
                  Dias ausentes: {calcularDiasAusentes(ausenciasMap[item.id])}
                </Text>
              )}
            </Pressable>

            {usuarioSelecionado?.id === item.id && (
              <View style={{ marginTop:8, padding:8, backgroundColor:'#f0f0f0', borderRadius:8 }}>
                {(ausenciasMap[item.id] || []).map(a=>(
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
                    style={{ backgroundColor:'#15803d', padding:6, borderRadius:8, marginTop:8, alignItems:'center' }}
                  >
                    <Text style={{ color:'#fff', fontWeight:'700' }}>Novo Período</Text>
                  </Pressable>
                )}

                {showNovoPeriodo && (
                  <View style={{ marginTop:12, padding:12, backgroundColor:'#fff', borderRadius:10 }}>
                    <Text style={{ fontWeight:'700', marginBottom:8 }}>Selecione o período:</Text>

                    {/* 👇 Mensagem discreta */}
                    <Text style={{ marginBottom: 6, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                      👉 Toque 1x para selecionar 1 dia, ou 2× para definir um período
                    </Text>

                    <Calendar
                      markingType="period"
                      markedDates={getMarkedDates()}
                      onDayPress={(day: DateData) => {
                        const [y, m, d] = day.dateString.split('-').map(n => parseInt(n, 10));
                        const dt = new Date(y, (m - 1), d);
                        dt.setHours(0,0,0,0);

                        if (!selecionandoFim) {
                          setInicio(dt);
                          setFim(dt);
                          setSelecionandoFim(true);
                          return;
                        }

                        if (dt < inicio) {
                          setInicio(dt);
                        } else {
                          setFim(dt);
                        }
                        setSelecionandoFim(false);
                      }}
                      style={{ marginBottom:12, height:320 }}
                    />

                    <Pressable
                      onPress={() => {
                        const hoje = new Date(); hoje.setHours(0,0,0,0);
                        setInicio(new Date(hoje));
                        setFim(new Date(hoje));
                        setSelecionandoFim(false);
                      }}
                      style={{ marginBottom:8, alignSelf:'flex-end' }}
                    >
                      <Text style={{ color:'#2563eb' }}>Limpar seleção</Text>
                    </Pressable>

                    <Text style={{ marginBottom:4 }}>Motivo</Text>
                    <TextInput
                      value={motivo}
                      onChangeText={setMotivo}
                      style={styles.input}
                      multiline={false}
                      numberOfLines={1}
                    />

                    <Pressable
                      onPress={adicionarPeriodo}
                      style={{ backgroundColor:'#2563eb', padding:12, borderRadius:10, marginTop:12, alignItems:'center' }}
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
  input:{
    borderWidth:1,
    borderColor:'#e1e1e6',
    borderRadius:10,
    paddingHorizontal:10,
    paddingVertical:6,
    marginBottom:8,
    fontSize:14,
    height:36,
  },
});
