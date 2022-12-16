import { getDB } from './db'

async function deleteTodo(todoId: string, sub: string) {
  const db = await getDB()
  try {
    return await db.todo.delete({ where: { id: todoId } })
  } catch (err) {
    console.log('Postgres error: ', err)
    return null
  }
}

export default deleteTodo
