// app/lib/db.ts
import * as SQLite from 'expo-sqlite';

// Cria/abre o arquivo escala.db
export const db = SQLite.openDatabaseSync('escala.db');

// Cria as tabelas (rode uma vez na inicialização do app)
export async function initDb() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      data TEXT NOT NULL,
      capacidade INTEGER DEFAULT 5
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
}

// ---- Operações de exemplo ----

// inserir usuário
export async function addUsuario(nome: string): Promise<void> {
  await db.runAsync('INSERT INTO usuarios (nome) VALUES (?)', [nome]);
}

// listar usuários
export async function listarUsuarios(): Promise<Array<{ id: number; nome: string }>> {
  const rows = await db.getAllAsync<{ id: number; nome: string }>(
    'SELECT id, nome FROM usuarios ORDER BY id DESC'
  );
  return rows;
}
