import { handle, type Env } from './handler'

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
}
