import { getDB } from './db'

async function getTodoById(todoId: string, sub: string) {
  const db = await getDB()

  try {
    return await db.todo.findUnique({ where: { id: todoId } })
  } catch (err) {
    console.log('Postgres error: ', err)
    return null
  }
}

export default getTodoById
