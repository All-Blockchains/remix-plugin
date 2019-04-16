import { ModuleProfile, Api, API } from '../../src'

export interface RemixResolve extends Api {
  name: 'remix-resolve'
  events: {}
  methods: {
    resolve(filePath: string, customHandlers?: Handler[]): Promise<Imported>
  }
}

export const RemixResolveProfile: ModuleProfile<RemixResolve> = {
  name: 'remix-resolve',
  methods: ['resolve']
}


export interface Imported {
  content: string
  cleanURL: string
  type: string
}

interface PreviouslyHandledImports {
  [filePath: string]: Imported
}

interface Handler {
  type: string
  match(url: string): RegExpExecArray
  handle(match: RegExpExecArray): Promise<string> | string
}

export class RemixResolveApi implements API<RemixResolve> {
  public readonly name = 'remix-resolve'

  private previouslyHandled: PreviouslyHandledImports
  constructor() {
    this.previouslyHandled = {}
  }
  /**
  * Handle an import statement based on github
  * @params root The root of the github import statement
  * @params filePath path of the file in github
  */
  handleGithubCall(root: string, filePath: string) {
    return ''
  }
  /**
  * Handle an import statement based on http
  * @params url The url of the import statement
  * @params cleanURL
  */
  handleHttp(url: string, cleanURL: string) {
    return ''
  }
  /**
  * Handle an import statement based on https
  * @params url The url of the import statement
  * @params cleanURL
  */
  handleHttps(url: string, cleanURL: string) {
    return ''
  }
  handleSwarm(url: string, cleanURL: string) {
    return ''
  }
  /**
  * Handle an import statement based on IPFS
  * @params url The url of the IPFS import statement
  */
  async handleIPFS(url: string) {
    return ''
  }
  handleLocal(root: string, filePath: string) {
    return ''
  }
  getHandlers(): Handler[] {
    return [
      {
        type: 'github',
        match: (url) => /^(https?:\/\/)?(www.)?github.com\/([^/]*\/[^/]*)\/(.*)/.exec(url),
        handle: (match) => this.handleGithubCall(match[3], match[4])
      },
      {
        type: 'http',
        match: (url) => /^(http?:\/\/?(.*))$/.exec(url),
        handle: (match) => this.handleHttp(match[1], match[2])
      },
      {
        type: 'https',
        match: (url) => /^(https?:\/\/?(.*))$/.exec(url),
        handle: (match) => this.handleHttps(match[1], match[2])
      },
      {
        type: 'swarm',
        match: (url) => /^(bzz-raw?:\/\/?(.*))$/.exec(url),
        handle: (match) => this.handleSwarm(match[1], match[2])
      },
      {
        type: 'ipfs',
        match: (url) => /^(ipfs:\/\/?.+)/.exec(url),
        handle: (match) => this.handleIPFS(match[1])
      }
    ]
  }

  public async resolve(filePath: string, customHandlers?: Handler[]): Promise<Imported> {
    let imported: Imported = this.previouslyHandled[filePath]
    if (imported) {
      return imported
    }
    const builtinHandlers: Handler[] = this.getHandlers()
    const handlers: Handler[] = customHandlers ? [...builtinHandlers, ...customHandlers] : [...builtinHandlers]
    const matchedHandler = handlers.filter(localHandler => localHandler.match(filePath))
    const handler: Handler = matchedHandler[0]
    const match = handler.match(filePath)
    const content: string = await handler.handle(match)
    imported = {
      content,
      cleanURL: filePath,
      type: handler.type
    }
    this.previouslyHandled[filePath] = imported
    return imported
  }
}