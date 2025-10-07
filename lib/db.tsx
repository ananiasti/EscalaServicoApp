import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('escalas.db');

/** -------------------- Tipos compartilhados -------------------- */
export type Usuario = { id: number; nome: string };
export type Evento  = { id: number; tipo: string; local: string; dia_semana: number; hora: string };
export type Ausencia = { id?: number; usuario_id: number; inicio: string; fim: string; motivo?: string };

/** -------------------- Tipos da Escala -------------------- */
export type Escala = { id: number; inicio: string; fim: string }; // YYYY-MM-DD
export type EscalaDia = {
  id: number;
  escala_id: number;
  data: string;                    // YYYY-MM-DD
  cor?: 'branco' | 'verde' | 'vermelho' | 'roxo' | 'rosea' | null;
  observacao?: string | null;
  evento_id: number | null;
  hora?: string | null;            // HH:mm
};
export type EscalaDiaUsuario = { escala_dia_id: number; usuario_id: number };

/** -------------------- Constantes/Utils -------------------- */
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export type DiaSemanaRotulo = typeof DIAS_SEMANA[number];
export const diaLabel = (n: number): DiaSemanaRotulo | string => DIAS_SEMANA[n] ?? String(n);
export const isHoraValida = (hhmm: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm);

export const TIPOS_EVENTO = ['Missa','Celebração','Adoração','Casamento'] as const;
export type TipoEvento = typeof TIPOS_EVENTO[number];
export const isTipoPadrao = (t: string) =>
  (TIPOS_EVENTO as readonly string[]).some(x => x.toLowerCase() === t.toLowerCase());

/** Cores litúrgicas (para chips) */
export const CORES_LITURGICAS: Array<{ key: EscalaDia['cor'], label: string, hex: string }> = [
  { key: 'branco',   label: 'Branco',   hex: '#ffffff' },
  { key: 'verde',    label: 'Verde',    hex: '#16a34a' }, // green-600
  { key: 'vermelho', label: 'Vermelho', hex: '#dc2626' }, // red-600
  { key: 'roxo',     label: 'Roxo',     hex: '#7c3aed' }, // violet-600
  { key: 'rosea',    label: 'Rósea',    hex: '#f472b6' }, // pink-400 aprox.
];

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const rangeDatasISO = (inicioISO: string, fimISO: string): string[] => {
  const out: string[] = [];
  const [y1, m1, d1] = inicioISO.split('-').map(Number);
  const [y2, m2, d2] = fimISO.split('-').map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end   = new Date(y2, m2 - 1, d2);
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    out.push(`${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`);
  }
  return out;
};

/** -------------------- Helpers de Migração -------------------- */
async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return rows.some(r => r.name === column);
}

/** Migração antiga dos eventos (remover título) — compatibilidade */
async function migrateEventosRemoverTituloSeExistir() {
  const temTitulo = await hasColumn('eventos', 'titulo');
  if (!temTitulo) return;

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.execAsync(`
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS eventos_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        local TEXT NOT NULL,
        dia_semana INTEGER NOT NULL,
        hora TEXT NOT NULL
      );
      INSERT INTO eventos_new (id, tipo, local, dia_semana, hora)
        SELECT id,
               COALESCE(NULLIF(tipo, ''), titulo, 'Sem tipo'),
               COALESCE(NULLIF(local, ''), 'Sem local'),
               COALESCE(dia_semana, 0),
               CASE WHEN hora IS NULL OR hora = '' THEN '00:00' ELSE hora END
        FROM eventos;
      DROP TABLE eventos;
      ALTER TABLE eventos_new RENAME TO eventos;
      COMMIT;
    `);
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

/** Migração idempotente do schema antigo de "escalas(usuario_id, evento_id)" para o modelo novo.
 *  NÃO usa 'escalas_antiga'; apaga e recria somente se detectar a coluna antiga 'usuario_id'.
 */
async function migrateEscalasParaModeloNovo() {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(escalas);');
  if (cols.length === 0) return;                 // tabela escalas ainda não existe: nada a migrar
  const temUsuarioId = cols.some(r => r.name === 'usuario_id');
  if (!temUsuarioId) return;                     // já é o modelo novo

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.execAsync('BEGIN TRANSACTION;');

    // Drop do schema antigo
    await db.execAsync('DROP TABLE IF EXISTS escalas;');

    // Novo cabeçalho
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS escalas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inicio TEXT NOT NULL,
        fim TEXT NOT NULL
      );
    `);

    // Tabelas filhas
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS escala_dias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        escala_id INTEGER NOT NULL,
        data TEXT NOT NULL,       -- YYYY-MM-DD
        cor TEXT,                 -- branco|verde|vermelho|roxo|rosea
        observacao TEXT,
        evento_id INTEGER,
        hora TEXT,                -- HH:mm
        FOREIGN KEY (escala_id) REFERENCES escalas(id) ON DELETE CASCADE
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS escala_dia_usuarios (
        escala_dia_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        PRIMARY KEY (escala_dia_id, usuario_id),
        FOREIGN KEY (escala_dia_id) REFERENCES escala_dias(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      );
    `);

    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

/** -------------------- Inicialização do Banco -------------------- */
export async function initDb() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
  `);

  // 1) migra eventos (se necessário)
  await migrateEventosRemoverTituloSeExistir();

  // 2) migra escalas do modelo antigo (se existir)
  await migrateEscalasParaModeloNovo();

  // 3) garante tabelas do modelo novo (idempotente)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS escalas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escala_dias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escala_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      cor TEXT,
      observacao TEXT,
      evento_id INTEGER,
      hora TEXT,
      FOREIGN KEY (escala_id) REFERENCES escalas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS escala_dia_usuarios (
      escala_dia_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      PRIMARY KEY (escala_dia_id, usuario_id),
      FOREIGN KEY (escala_dia_id) REFERENCES escala_dias(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);
}

/** -------------------- CRUD Usuários -------------------- */
export async function addUsuario(nome: string) {
  await initDb();
  await db.runAsync('INSERT INTO usuarios (nome) VALUES (?);', [nome]);
}
export async function removerUsuario(id: number) {
  await initDb();
  await db.runAsync('DELETE FROM usuarios WHERE id = ?;', [id]);
}
export async function atualizarUsuario(id: number, nome: string) {
  await initDb();
  await db.runAsync('UPDATE usuarios SET nome = ? WHERE id = ?;', [nome, id]);
}
export async function listarUsuarios(): Promise<Usuario[]> {
  await initDb();
  return db.getAllAsync<Usuario>('SELECT id, nome FROM usuarios ORDER BY id DESC;');
}

/** -------------------- CRUD Eventos -------------------- */
export async function addEvento(tipo: string, local: string, dia_semana: number, hora: string) {
  await initDb();
  await db.runAsync(
    'INSERT INTO eventos (tipo, local, dia_semana, hora) VALUES (?, ?, ?, ?);',
    [tipo, local, dia_semana, hora]
  );
}
export async function removerEvento(id: number) {
  await initDb();
  await db.runAsync('DELETE FROM eventos WHERE id = ?;', [id]);
}
export async function atualizarEvento(id: number, tipo: string, local: string, dia_semana: number, hora: string) {
  await initDb();
  await db.runAsync(
    'UPDATE eventos SET tipo = ?, local = ?, dia_semana = ?, hora = ? WHERE id = ?;',
    [tipo, local, dia_semana, hora, id]
  );
}
export async function listarEventos(): Promise<Evento[]> {
  await initDb();
  return db.getAllAsync<Evento>('SELECT id, tipo, local, dia_semana, hora FROM eventos ORDER BY id DESC;');
}

/** -------------------- CRUD Ausências -------------------- */
export async function addAusencia(a: Ausencia) {
  await initDb();
  await db.runAsync(
    'INSERT INTO ausencias (usuario_id, inicio, fim, motivo) VALUES (?, ?, ?, ?);',
    [a.usuario_id, a.inicio, a.fim, a.motivo || null]
  );
}
export async function listarAusencias(usuario_id: number): Promise<Ausencia[]> {
  await initDb();
  return db.getAllAsync<Ausencia>(
    'SELECT * FROM ausencias WHERE usuario_id = ? ORDER BY inicio ASC;',
    [usuario_id]
  );
}
export async function atualizarAusencia(a: Ausencia) {
  if (!a.id) throw new Error('Ausência deve ter id para atualizar');
  await initDb();
  await db.runAsync(
    'UPDATE ausencias SET inicio = ?, fim = ?, motivo = ? WHERE id = ?;',
    [a.inicio, a.fim, a.motivo || null, a.id]
  );
}
export async function removerAusencia(id: number) {
  await initDb();
  await db.runAsync('DELETE FROM ausencias WHERE id = ?;', [id]);
}

/** -------------------- Escala (novo) -------------------- */
/** Cria cabeçalho da escala e retorna o id */
export async function criarEscala(inicioISO: string, fimISO: string): Promise<number> {
  await initDb();
  const r = await db.runAsync('INSERT INTO escalas (inicio, fim) VALUES (?, ?);', [inicioISO, fimISO]);
  // @ts-ignore expo-sqlite retorna lastInsertRowId em ambientes recentes
  return (r?.lastInsertRowId ?? 0) as number;
}

/** Insere dias da escala em transação */
export async function adicionarDiasEscala(
  escala_id: number,
  dias: Omit<EscalaDia, 'id' | 'escala_id'>[]
): Promise<void> {
  await initDb();
  await db.execAsync('BEGIN');
  try {
    for (const d of dias) {
      await db.runAsync(
        `INSERT INTO escala_dias (escala_id, data, cor, observacao, evento_id, hora)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [escala_id, d.data, d.cor ?? null, d.observacao ?? null, d.evento_id ?? null, d.hora ?? null]
      );
    }
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

/** Lista dias (ordenados) com usuários atribuídos */
export async function listarDiasDaEscala(escala_id: number): Promise<(EscalaDia & { usuarios: Usuario[] })[]> {
  await initDb();
  const dias = await db.getAllAsync<EscalaDia>(
    `SELECT id, escala_id, data, cor, observacao, evento_id, hora
     FROM escala_dias
     WHERE escala_id = ?
     ORDER BY data ASC, COALESCE(hora,'23:59') ASC;`,
    [escala_id]
  );

  const out: (EscalaDia & { usuarios: Usuario[] })[] = [];
  for (const d of dias) {
    const usuarios = await db.getAllAsync<Usuario>(
      `SELECT u.id, u.nome
       FROM escala_dia_usuarios edu
       JOIN usuarios u ON u.id = edu.usuario_id
       WHERE edu.escala_dia_id = ?
       ORDER BY u.nome;`,
      [d.id]
    );
    out.push({ ...d, usuarios });
  }
  return out;
}

/** Atualiza cor e/ou observação de um dia */
export async function atualizarDiaEscala(
  dia_id: number,
  patch: Partial<Pick<EscalaDia, 'cor' | 'observacao'>>
) {
  await initDb();
  const sets: string[] = [];
  const params: any[] = [];
  if (patch.cor !== undefined)        { sets.push('cor = ?');        params.push(patch.cor); }
  if (patch.observacao !== undefined) { sets.push('observacao = ?'); params.push(patch.observacao); }
  if (!sets.length) return;
  params.push(dia_id);
  await db.runAsync(`UPDATE escala_dias SET ${sets.join(', ')} WHERE id = ?;`, params);
}

/** Exclui um dia da escala */
export async function excluirDia(dia_id: number) {
  await initDb();
  await db.runAsync('DELETE FROM escala_dias WHERE id = ?;', [dia_id]);
}

/** Toggle usuário em um dia (true=adicionado, false=removido) */
export async function toggleUsuarioNoDia(dia_id: number, usuario_id: number): Promise<boolean> {
  await initDb();
  const exists = await db.getAllAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM escala_dia_usuarios WHERE escala_dia_id = ? AND usuario_id = ?;',
    [dia_id, usuario_id]
  );
  if ((exists[0]?.c ?? 0) > 0) {
    await db.runAsync(
      'DELETE FROM escala_dia_usuarios WHERE escala_dia_id = ? AND usuario_id = ?;',
      [dia_id, usuario_id]
    );
    return false;
  } else {
    await db.runAsync(
      'INSERT INTO escala_dia_usuarios (escala_dia_id, usuario_id) VALUES (?, ?);',
      [dia_id, usuario_id]
    );
    return true;
  }
}

/** (Opcional) Lista cabeçalhos de escalas */
export async function listarEscalas(): Promise<Escala[]> {
  await initDb();
  return db.getAllAsync<Escala>('SELECT id, inicio, fim FROM escalas ORDER BY id DESC;');
}
