import * as SQLite from 'expo-sqlite';

/** Conexão */
export const db = SQLite.openDatabaseSync('escala.db');

/* ⛑️ SHIM: tabela legada para evitar que algum SELECT antigo quebre */
(async () => {
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS escalas_antiga (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inicio TEXT, fim TEXT, titulo TEXT,
        usuario_id INTEGER, evento_id INTEGER,
        data TEXT, hora TEXT, cor TEXT, observacao TEXT
      );
    `);
  } catch {}
})();

/** Tipos compartilhados */
export type Usuario = { id: number; nome: string };
export type Evento  = { id: number; tipo: string; local: string; dia_semana: number; hora: string };
export type Ausencia = { id?: number; usuario_id: number; inicio: string; fim: string; motivo?: string };

// >>> ENFERMOS - tipo (com novo campo nome_responsavel e suporte a legado com acento)
export type Enfermo = {
  id?: number;
  nome: string;
  endereco: string;
  telefone_responsavel: string;
  nome_responsavel?: string;
  'nome_responsável'?: string; // legado (se existir na base do usuário)
};

export type CorLiturgicaKey = 'branco' | 'verde' | 'vermelho' | 'roxo' | 'rosea';
export type Escala = { id: number; inicio: string; fim: string; titulo?: string | null };
export type EscalaDia = {
  id: number; escala_id: number; data: string; hora: string | null;
  evento_id: number | null; cor: CorLiturgicaKey | null; observacao: string | null;
};

/** Constantes / helpers */
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export type DiaSemanaRotulo = typeof DIAS_SEMANA[number];
export const diaLabel = (n: number): DiaSemanaRotulo | string => DIAS_SEMANA[n] ?? String(n);
export const TIPOS_EVENTO = ['Missa', 'Celebração', 'Adoração', 'Casamento'] as const;
export const CORES_LITURGICAS: { key: CorLiturgicaKey; label: string; hex: string }[] = [
  { key: 'branco', label: 'Branco', hex: '#ffffff' },
  { key: 'verde', label: 'Verde', hex: '#16a34a' },
  { key: 'vermelho', label: 'Vermelho', hex: '#ef4444' },
  { key: 'roxo', label: 'Roxo', hex: '#7c3aed' },
  { key: 'rosea', label: 'Rósea', hex: '#f9a8d4' },
];
export const isHoraValida = (hhmm: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm);
export const pad2 = (n: number) => String(n).padStart(2, '0');
export function rangeDatasISO(inicioISO: string, fimISO: string) {
  const [y1,m1,d1] = inicioISO.split('-').map(Number);
  const [y2,m2,d2] = fimISO.split('-').map(Number);
  const ini = new Date(y1, m1-1, d1), fim = new Date(y2, m2-1, d2);
  const out: string[] = []; const cur = new Date(ini);
  while (cur <= fim) { out.push(`${cur.getFullYear()}-${pad2(cur.getMonth()+1)}-${pad2(cur.getDate())}`); cur.setDate(cur.getDate()+1); }
  return out;
}

/* --------- Migrações auxiliares ---------- */
async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return rows.some(r => r.name === column);
}
async function migrateEventosTituloParaTipoSeExistir() {
  if (!await hasColumn('eventos','tipo')) await db.execAsync(`ALTER TABLE eventos ADD COLUMN tipo TEXT;`);
  if (await hasColumn('eventos','titulo')) {
    await db.execAsync(`
      UPDATE eventos SET tipo = CASE
        WHEN tipo IS NULL OR TRIM(tipo)='' THEN COALESCE(titulo,'Sem tipo') ELSE tipo END;
    `);
  }
  if (!await hasColumn('eventos','local'))      await db.execAsync(`ALTER TABLE eventos ADD COLUMN local TEXT;`);
  if (!await hasColumn('eventos','dia_semana')) await db.execAsync(`ALTER TABLE eventos ADD COLUMN dia_semana INTEGER;`);
  if (!await hasColumn('eventos','hora'))       await db.execAsync(`ALTER TABLE eventos ADD COLUMN hora TEXT;`);
  await db.execAsync(`
    UPDATE eventos
    SET local = COALESCE(NULLIF(local,''),'Sem local'),
        dia_semana = COALESCE(dia_semana,0),
        hora = CASE WHEN hora IS NULL OR hora='' THEN '00:00' ELSE hora END;
  `);
}
async function migrateEscalaDiaUsuariosDiaParaDiaId() {
  const info = await db.getAllAsync<{ name: string }>('PRAGMA table_info(escala_dia_usuarios);');
  if (!info.length) return;
  if (info.some(c=>c.name==='dia_id')) return;
  const hasDia = info.some(c=>c.name==='dia');
  await db.execAsync('PRAGMA foreign_keys=OFF;'); await db.execAsync('BEGIN;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS escala_dia_usuarios_new (
      dia_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      PRIMARY KEY (dia_id, usuario_id),
      FOREIGN KEY (dia_id) REFERENCES escala_dias(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);
  if (hasDia) {
    await db.execAsync(`INSERT INTO escala_dia_usuarios_new (dia_id, usuario_id)
                        SELECT dia AS dia_id, usuario_id FROM escala_dia_usuarios;`);
  }
  await db.execAsync('DROP TABLE escala_dia_usuarios;');
  await db.execAsync('ALTER TABLE escala_dia_usuarios_new RENAME TO escala_dia_usuarios;');
  await db.execAsync('COMMIT;'); await db.execAsync('PRAGMA foreign_keys=ON;');
}

/* >>> MIGRAÇÃO: garante coluna nome_responsavel e copia da legada com acento, se existir */
async function ensureEnfermosNomeResponsavel() {
  if (!(await hasColumn('enfermos', 'nome_responsavel'))) {
    await db.execAsync(`ALTER TABLE enfermos ADD COLUMN nome_responsavel TEXT;`);
  }
  if (await hasColumn('enfermos', 'nome_responsável')) {
    await db.execAsync(`
      UPDATE enfermos
      SET nome_responsavel = COALESCE(
        NULLIF(nome_responsavel, ''),
        "nome_responsável"
      )
      WHERE ("nome_responsável" IS NOT NULL AND TRIM("nome_responsável") <> '');
    `);
  }
}

/* --------- Inicialização idempotente (sem reset) ---------- */
export async function initDb() {
  await db.execAsync(`PRAGMA journal_mode=WAL;`);
  await db.execAsync(`PRAGMA foreign_keys=ON;`);

  await db.execAsync(`
    -- defensivo
    CREATE TABLE IF NOT EXISTS escalas_antiga (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inicio TEXT, fim TEXT, titulo TEXT,
      usuario_id INTEGER, evento_id INTEGER,
      data TEXT, hora TEXT, cor TEXT, observacao TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      local TEXT,
      dia_semana INTEGER,
      hora TEXT
    );

    CREATE TABLE IF NOT EXISTS ausencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      motivo TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS escalas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      titulo TEXT
    );

    CREATE TABLE IF NOT EXISTS escala_dias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escala_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      hora TEXT,
      evento_id INTEGER,
      cor TEXT,
      observacao TEXT,
      FOREIGN KEY (escala_id) REFERENCES escalas(id) ON DELETE CASCADE,
      FOREIGN KEY (evento_id) REFERENCES eventos(id)
    );

    CREATE TABLE IF NOT EXISTS escala_dia_usuarios (
      dia_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      PRIMARY KEY (dia_id, usuario_id),
      FOREIGN KEY (dia_id) REFERENCES escala_dias(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );

    -- >>> ENFERMOS - criação da tabela (já com nome_responsavel)
    CREATE TABLE IF NOT EXISTS enfermos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      endereco TEXT NOT NULL,
      telefone_responsavel TEXT NOT NULL,
      nome_responsavel TEXT
    );
  `); // <- aqui era ']);' por engano

  // migrações brandas
  if (!(await hasColumn('escalas','titulo'))) await db.execAsync(`ALTER TABLE escalas ADD COLUMN titulo TEXT;`);
  await migrateEventosTituloParaTipoSeExistir();
  await migrateEscalaDiaUsuariosDiaParaDiaId();
  await ensureEnfermosNomeResponsavel();
}

/* --------- Usuários ---------- */
export async function addUsuario(nome: string) { await initDb(); await db.runAsync('INSERT INTO usuarios (nome) VALUES (?);', [nome]); }
export async function removerUsuario(id: number) {
  await initDb();
  await db.execAsync('BEGIN;');
  try {
    await db.runAsync('DELETE FROM escala_dia_usuarios WHERE usuario_id = ?;', [id]);
    await db.runAsync('DELETE FROM usuarios WHERE id = ?;', [id]);
    await db.execAsync('COMMIT;');
  } catch (e) { await db.execAsync('ROLLBACK;'); throw e; }
}
export async function atualizarUsuario(id: number, nome: string) { await initDb(); await db.runAsync('UPDATE usuarios SET nome = ? WHERE id = ?;', [nome, id]); }
export async function listarUsuarios(): Promise<Usuario[]> { await initDb(); return db.getAllAsync<Usuario>('SELECT id, nome FROM usuarios ORDER BY nome ASC;'); }

/* --------- Eventos ---------- */
export async function addEvento(tipo: string, local: string, dia_semana: number, hora: string) {
  await initDb();
  await db.runAsync('INSERT INTO eventos (tipo, local, dia_semana, hora) VALUES (?, ?, ?, ?);', [tipo, local, dia_semana, hora]);
}
export async function removerEvento(id: number) {
  await initDb();
  await db.execAsync('BEGIN;');
  try {
    await db.runAsync('UPDATE escala_dias SET evento_id = NULL WHERE evento_id = ?;', [id]);
    await db.runAsync('DELETE FROM eventos WHERE id = ?;', [id]);
    await db.execAsync('COMMIT;');
  } catch (e) { await db.execAsync('ROLLBACK;'); throw e; }
}
export async function atualizarEvento(id: number, tipo: string, local: string, dia_semana: number, hora: string) {
  await initDb();
  await db.runAsync('UPDATE eventos SET tipo = ?, local = ?, dia_semana = ?, hora = ? WHERE id = ?;', [tipo, local, dia_semana, hora, id]);
}
export async function listarEventos(): Promise<Evento[]> {
  await initDb();
  return db.getAllAsync<Evento>('SELECT id, tipo, local, dia_semana, hora FROM eventos ORDER BY dia_semana ASC, hora ASC, tipo ASC;');
}

/* --------- Ausências ---------- */
export async function addAusencia(a: Ausencia) {
  await initDb();
  await db.runAsync('INSERT INTO ausencias (usuario_id, inicio, fim, motivo) VALUES (?, ?, ?, ?);', [a.usuario_id, a.inicio, a.fim, a.motivo || null]);
}
export async function listarAusencias(usuario_id: number): Promise<Ausencia[]> {
  await initDb(); return db.getAllAsync<Ausencia>('SELECT * FROM ausencias WHERE usuario_id = ? ORDER BY inicio ASC;', [usuario_id]);
}
export async function atualizarAusencia(a: Ausencia) {
  if (!a.id) throw new Error('Ausência deve ter id para atualizar');
  await initDb();
  await db.runAsync('UPDATE ausencias SET inicio = ?, fim = ?, motivo = ? WHERE id = ?;', [a.inicio, a.fim, a.motivo || null, a.id]);
}
export async function removerAusencia(id: number) { await initDb(); await db.runAsync('DELETE FROM ausencias WHERE id = ?;', [id]); }

/* --------- Escalas (cabeçalho) ---------- */
export async function criarEscala(inicioISO: string, fimISO: string, titulo?: string | null): Promise<number> {
  await initDb();
  const res = await db.runAsync('INSERT INTO escalas (inicio, fim, titulo) VALUES (?, ?, ?);', [inicioISO, fimISO, titulo ?? null]);
  return Number(res.lastInsertRowId);
}
export async function listarEscalas(): Promise<Escala[]> {
  await initDb();
  return db.getAllAsync<Escala>('SELECT id, inicio, fim, titulo FROM escalas ORDER BY id DESC;');
}
export async function obterUltimaEscala(): Promise<Escala | null> {
  await initDb();
  const rows = await db.getAllAsync<Escala>('SELECT id, inicio, fim, titulo FROM escalas ORDER BY id DESC LIMIT 1;');
  return rows[0] ?? null;
}
export async function atualizarEscalaTitulo(id: number, titulo: string | null) {
  await initDb(); await db.runAsync('UPDATE escalas SET titulo = ? WHERE id = ?;', [titulo, id]);
}
export async function removerEscala(id: number) {
  await initDb(); await db.runAsync('DELETE FROM escalas WHERE id = ?;', [id]); // ON DELETE CASCADE remove filhos
}

/* --------- Escala: dias ---------- */
type NovoDia = { data: string; hora: string | null; evento_id: number | null; cor: CorLiturgicaKey | null; observacao: string | null };
export async function adicionarDiasEscala(escala_id: number, dias: NovoDia[]) {
  await initDb(); await db.execAsync('BEGIN;');
  try {
    for (const d of dias) {
      await db.runAsync(
        'INSERT INTO escala_dias (escala_id, data, hora, evento_id, cor, observacao) VALUES (?, ?, ?, ?, ?, ?);',
        [escala_id, d.data, d.hora, d.evento_id, d.cor, d.observacao]
      );
    }
    await db.execAsync('COMMIT;');
  } catch (e) { await db.execAsync('ROLLBACK;'); throw e; }
}
export async function listarDiasDaEscala(escala_id: number): Promise<(EscalaDia & { usuarios: Usuario[] })[]> {
  await initDb();
  const dias = await db.getAllAsync<EscalaDia>(
    `SELECT id, escala_id, data, hora, evento_id, cor, observacao
     FROM escala_dias
     WHERE escala_id = ?
     ORDER BY data ASC, COALESCE(hora,'23:59') ASC;`,
    [escala_id]
  );
  const rowsUsuarios = await db.getAllAsync<{ dia_id: number; id: number; nome: string }>(
    `SELECT du.dia_id, u.id, u.nome
     FROM escala_dia_usuarios du
     JOIN escala_dias d ON d.id = du.dia_id
     JOIN usuarios u ON u.id = du.usuario_id
     WHERE d.escala_id = ?
     ORDER BY u.nome ASC;`,
    [escala_id]
  );
  const map: Record<number, Usuario[]> = {};
  for (const r of rowsUsuarios) { (map[r.dia_id] ||= []).push({ id: r.id, nome: r.nome }); }
  return dias.map(d => ({ ...d, usuarios: map[d.id] ?? [] }));
}
export async function atualizarDiaEscala(dia_id: number, patch: { cor?: CorLiturgicaKey | null; observacao?: string | null }) {
  await initDb();
  const sets: string[] = []; const params: any[] = [];
  if (patch.cor !== undefined) { sets.push('cor = ?'); params.push(patch.cor); }
  if (patch.observacao !== undefined) { sets.push('observacao = ?'); params.push(patch.observacao); }
  if (!sets.length) return;
  params.push(dia_id);
  await db.runAsync(`UPDATE escala_dias SET ${sets.join(', ')} WHERE id = ?;`, params);
}
export async function excluirDia(dia_id: number) { await initDb(); await db.runAsync('DELETE FROM escala_dias WHERE id = ?;', [dia_id]); }

/* --------- Ligações dia ↔ usuário ---------- */
export async function toggleUsuarioNoDia(dia_id: number, usuario_id: number) {
  await initDb();
  const existe = await db.getAllAsync<{ c: number }>(
    'SELECT 1 as c FROM escala_dia_usuarios WHERE dia_id = ? AND usuario_id = ? LIMIT 1;',
    [dia_id, usuario_id]
  );
  if (existe.length) {
    await db.runAsync('DELETE FROM escala_dia_usuarios WHERE dia_id = ? AND usuario_id = ?;', [dia_id, usuario_id]);
  } else {
    await db.runAsync('INSERT INTO escala_dia_usuarios (dia_id, usuario_id) VALUES (?, ?);', [dia_id, usuario_id]);
  }
}

/* --------- ENFERMOS: CRUD ---------- */
export async function addEnfermo(nome: string, endereco: string, telefone: string, nomeResponsavel?: string) {
  await initDb();
  if (!nome?.trim() || !endereco?.trim() || !telefone?.trim()) {
    throw new Error('Preencha nome, endereço e telefone do responsável.');
  }
  await db.runAsync(
    'INSERT INTO enfermos (nome, endereco, telefone_responsavel, nome_responsavel) VALUES (?, ?, ?, ?);',
    [nome.trim(), endereco.trim(), telefone.trim(), nomeResponsavel?.trim() || null]
  );
}

export async function listarEnfermos(): Promise<Enfermo[]> {
  await initDb();
  // evita SELECT em coluna que pode não existir: checa antes
  const hasLegacy = await hasColumn('enfermos', 'nome_responsável');
  const sql = hasLegacy
    ? `
      SELECT
        id,
        nome,
        endereco,
        telefone_responsavel,
        COALESCE(nome_responsavel, "nome_responsável", '') AS nome_responsavel
      FROM enfermos
      ORDER BY nome ASC;`
    : `
      SELECT
        id,
        nome,
        endereco,
        telefone_responsavel,
        COALESCE(nome_responsavel, '') AS nome_responsavel
      FROM enfermos
      ORDER BY nome ASC;`;
  const rows = await db.getAllAsync<any>(sql);
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    endereco: r.endereco,
    telefone_responsavel: r.telefone_responsavel,
    nome_responsavel: r.nome_responsavel ?? undefined,
  }));
}

export async function atualizarEnfermo(id: number, nome: string, endereco: string, telefone: string, nomeResponsavel?: string) {
  await initDb();
  await db.runAsync(
    'UPDATE enfermos SET nome = ?, endereco = ?, telefone_responsavel = ?, nome_responsavel = ? WHERE id = ?;',
    [nome, endereco, telefone, nomeResponsavel?.trim() || null, id]
  );
}
export async function removerEnfermo(id: number) {
  await initDb();
  await db.runAsync('DELETE FROM enfermos WHERE id = ?;', [id]);
}
