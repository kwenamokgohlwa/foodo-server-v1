import createTodo from './createTodo'
import listTodos from './listTodos'
import updateTodo from './updateTodo'
import deleteTodo from './deleteTodo'
import getTodoById from './getTodoById'
import Todo from './Todo'

type AppSyncEvent = {
  info: {
    fieldName: string
  },
  arguments: {
    todo: Todo
    todoId: string
  },
  identity: {
    username: string,
    sub: string,
    claims: {
      [key: string]: string[]
    }
  }
}

exports.server = async (event: AppSyncEvent, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false

  switch (event.info.fieldName) {
    case 'createTodo':
      return await createTodo(event.arguments.todo, event.identity.sub)
    case 'listTodos':
      return await listTodos(event.identity.sub)
    case 'updateTodo':
      return await updateTodo(event.arguments.todo, event.identity.sub)
    case 'deleteTodo':
      return await deleteTodo(event.arguments.todoId, event.identity.sub)
    case 'getTodoById':
      return await getTodoById(event.arguments.todoId, event.identity.sub)
    default:
      return null
  }
}
