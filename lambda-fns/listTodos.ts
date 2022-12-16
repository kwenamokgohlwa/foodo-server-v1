import { getDB } from './db'

async function listTodos(sub: string) {
  const db = await getDB()
  try {
    return await db.todo.findMany()
  } catch (err) {
    console.log('Postgres error: ', err)
    return null
  }
}

export default listTodos
