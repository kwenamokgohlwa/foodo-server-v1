import Todo from './Todo'

type User = {
  id?: string
  email?: string
  name?:   string
  todos?:  [Todo]
}

export default User