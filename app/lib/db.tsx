// app/lib/db.ts
import * as SQLite from 'expo-sqlite';

// Abre/cria o arquivo escala.db (API nova do expo-sqlite)
export const db = SQLite.openDatabaseSync('escala.db');

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

// inserir usuário
export async function addUsuario(nome: string): Promise<void> {
  await db.runAsync('INSERT INTO usuarios (nome) VALUES (?);', [nome]);
}

// remover usuário (⚠️ agora por ID!)
export async function removerUsuario(id: number): Promise<void> {
  await db.runAsync('DELETE FROM usuarios WHERE id = ?;', [id]);
}

// alterar usuário (nome por ID)
export async function atualizarUsuario(id: number, nome: string): Promise<void> {
  await db.runAsync('UPDATE usuarios SET nome = ? WHERE id = ?;', [nome, id]);
}

// listar usuários
export async function listarUsuarios(): Promise<Array<{ id: number; nome: string }>> {
  const rows = await db.getAllAsync<{ id: number; nome: string }>(
    'SELECT id, nome FROM usuarios ORDER BY id DESC;'
  );
  return rows;
}
