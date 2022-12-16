import { getDB } from './db'
import Todo from './Todo'

async function updateTodo(todo: Todo, sub: string) {
  todo.owner = sub;
  const db = await getDB()
  try {
    const { id, ...rest } = todo
    return await db.todo.update({ where: { id }, data: rest })
  } catch (err) {
    console.log('Postgres error: ', err)
    return null
  }
}

export default updateTodo
