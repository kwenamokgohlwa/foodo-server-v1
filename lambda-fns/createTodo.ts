import Todo from './Todo'
import * as crypto from 'crypto'
import { getDB } from './db'

async function createTodo(todo: Todo, sub: string) {
  const db = await getDB()
  if (!todo.id) todo.id = crypto.randomUUID()
  try {
    return await db.todo.create({ data: todo })
  } catch (err) {
    console.log('Postgres error: ', err)
    return null
  }
}

export default createTodo
