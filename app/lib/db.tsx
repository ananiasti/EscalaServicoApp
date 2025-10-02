
import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('escala.db');

/** Tipos compartilhados */
export type Usuario = { id: number; nome: string };

export type Evento = {
  id: number;
  tipo: string;
  local: string;
  dia_semana: number;
  hora: string; // formato HH:MM
};

/** Constantes tipadas */
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export type DiaSemanaRotulo = typeof DIAS_SEMANA[number];
export const diaLabel = (n: number): DiaSemanaRotulo | string => DIAS_SEMANA[n] ?? String(n);

export const isHoraValida = (hhmm: string) =>
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm);

/** Tipos de evento (carrossel) compartilhados pelo app */
export const TIPOS_EVENTO = [
  'Missa',
  'Celebração',
  'Adoração',
  'Casamento',
] as const;
export type TipoEvento = typeof TIPOS_EVENTO[number];

export const isTipoPadrao = (t: string) =>
  (TIPOS_EVENTO as readonly string[]).some(x => x.toLowerCase() === t.toLowerCase());

/* -------------------- Helpers de schema/migração -------------------- */
async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return rows.some(r => r.name === column);
}

/** Remove coluna legada 'titulo' em eventos, preservando dados e FKs */
async function migrateEventosRemoverTituloSeExistir() {
  const temTitulo = await hasColumn('eventos', 'titulo');
  if (!temTitulo) return;

  console.log('⚡ Migração: recriando tabela eventos sem a coluna "titulo"...');

  await db.execAsync('PRAGMA foreign_keys = OFF;');

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
    SELECT
      id,
      COALESCE(NULLIF(tipo, ''), titulo, 'Sem tipo') AS tipo,
      COALESCE(NULLIF(local, ''), 'Sem local') AS local,
      COALESCE(dia_semana, 0) AS dia_semana,
      CASE
        WHEN hora IS NULL OR hora = '' THEN '00:00'
        ELSE hora
      END AS hora
    FROM eventos;

    DROP TABLE eventos;
    ALTER TABLE eventos_new RENAME TO eventos;

    COMMIT;
  `);

  await db.execAsync('PRAGMA foreign_keys = ON;');
}

export async function initDb() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    );

    -- Esquema "solto" para bases novas; a migração abaixo aplica NOT NULLs
    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      local TEXT,
      dia_semana INTEGER,
      hora TEXT
    );

    CREATE TABLE IF NOT EXISTS escalas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      evento_id INTEGER,
      UNIQUE(usuario_id, evento_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (evento_id) REFERENCES eventos(id)
    );
  `);

  // 🔧 Migração: remove 'titulo' legado e aplica o esquema novo
  await migrateEventosRemoverTituloSeExistir();
}

/* ------------------------- CRUD USUÁRIOS ------------------------- */
export async function addUsuario(nome: string) {
  await db.runAsync('INSERT INTO usuarios (nome) VALUES (?);', [nome]);
}
export async function removerUsuario(id: number) {
  await db.runAsync('DELETE FROM usuarios WHERE id = ?;', [id]);
}
export async function atualizarUsuario(id: number, nome: string) {
  await db.runAsync('UPDATE usuarios SET nome = ? WHERE id = ?;', [nome, id]);
}
export async function listarUsuarios(): Promise<Usuario[]> {
  return db.getAllAsync<Usuario>('SELECT id, nome FROM usuarios ORDER BY id DESC;');
}

/* ------------------------- CRUD EVENTOS ------------------------- */
export async function addEvento(tipo: string, local: string, dia_semana: number, hora: string) {
  await db.runAsync(
    'INSERT INTO eventos (tipo, local, dia_semana, hora) VALUES (?, ?, ?, ?);',
    [tipo, local, dia_semana, hora]
  );
}
export async function removerEvento(id: number) {
  await db.runAsync('DELETE FROM eventos WHERE id = ?;', [id]);
}
export async function atualizarEvento(id: number, tipo: string, local: string, dia_semana: number, hora: string) {
  await db.runAsync(
    'UPDATE eventos SET tipo = ?, local = ?, dia_semana = ?, hora = ? WHERE id = ?;',
    [tipo, local, dia_semana, hora, id]
  );
}
export async function listarEventos(): Promise<Evento[]> {
  return db.getAllAsync<Evento>('SELECT id, tipo, local, dia_semana, hora FROM eventos ORDER BY id DESC;');
}
